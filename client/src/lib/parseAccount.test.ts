import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseAccountXlsx } from './parseAccount'
import { countsAsExpense, countsAsIncome } from '../types'

/*
 * הנתונים כאן מומצאים במכוון. דפי בנק אמיתיים אינם נכנסים למאגר, וגם לא
 * לבדיקות — הקבצים האלה נבנים בזיכרון ומתארים רק את המבנה של הפורמט.
 */

function toBuffer(rows: unknown[][], sheetName = 'עובר ושב'): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const HEAD = ['תאריך', 'יום ערך', 'תיאור התנועה', '₪ זכות/חובה ', '₪ יתרה ', 'אסמכתה', 'עמלה', 'ערוץ ביצוע']

/** קובץ עו"ש: כמה שורות כותרת חופשית, ואז הטבלה */
function accountFile(rows: unknown[][]): ArrayBuffer {
  return toBuffer([
    ['עובר ושב'],
    ['חשבון: 0000000 | ישראל ישראלי'],
    ['תנועות אחרונות'],
    HEAD,
    ...rows,
  ])
}

const row = (date: string, desc: string, amount: number, ref: string, balance: number | string = 1000) =>
  [date, date, desc, amount, balance, ref, 'ערוץ ישיר', 'אינטרנט']

const parse = (buf: ArrayBuffer, own: string[] = []) =>
  parseAccountXlsx(buf, 'account.xlsx', { ownAccountPatterns: own })

describe('זיהוי הפורמט', () => {
  it('מזהה קובץ עו"ש לפי הכותרת ולא לפי שם הקובץ', () => {
    const r = parse(accountFile([row('10/09/2026', 'הראל בטוח חיוב', -85.08, '2950')]))
    expect(r.format).toBe('account')
    expect(r.movements).toHaveLength(1)
  })

  it('קובץ שאינו מוכר מחזיר אפס תנועות ולא זורק', () => {
    const r = parse(toBuffer([['משהו אחר'], ['א', 'ב']]))
    expect(r.format).toBe('unknown')
    expect(r.movements).toHaveLength(0)
  })
})

describe('התחשבנות כרטיס אשראי', () => {
  /*
   * הבדיקה המרכזית של הקובץ הזה. "חיוב לכרטיס" הוא הכסף שכבר נספר
   * כעסקאות פרטניות מקובץ הכרטיס, וספירה שלו כהוצאה מכפילה כל שקל.
   */
  it('חיוב לכרטיס אינו נספר כהוצאה', () => {
    const r = parse(accountFile([row('09/09/2026', 'חיוב לכרטיס ויזה 9687', -8285.07, '2955')]))
    const m = r.movements[0]
    expect(m.kind).toBe('card_settlement')
    expect(countsAsExpense(m)).toBe(false)
  })

  it('הוצאה רגילה באותו קובץ כן נספרת', () => {
    const r = parse(accountFile([
      row('09/09/2026', 'חיוב לכרטיס ויזה 9687', -8285.07, '2955'),
      row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950'),
    ]))
    const expenses = r.movements.filter(countsAsExpense)
    expect(expenses).toHaveLength(1)
    expect(expenses[0].description).toBe('הראל בטוח חיוב')
    // סך ההוצאות הוא 85.08 בלבד, ולא 8,370.15
    expect(expenses.reduce((s, m) => s + Math.abs(m.amount), 0)).toBeCloseTo(85.08)
  })
})

describe('סיווג תנועות', () => {
  it('משכורת מסווגת כהכנסה', () => {
    const r = parse(accountFile([row('07/09/2026', 'ידיעות טכנ משכורת', 19422.83, '2952')]))
    expect(r.movements[0].kind).toBe('salary')
    expect(countsAsIncome(r.movements[0])).toBe(true)
  })

  it('הפקדה לברוקר היא השקעה ואינה הוצאה', () => {
    const r = parse(accountFile([row('01/09/2026', 'הע. למיטב טרייד בע בסניף 31-046', -5500, '2940')]))
    expect(r.movements[0].kind).toBe('investment')
    expect(countsAsExpense(r.movements[0])).toBe(false)
  })

  it('קנייה ומכירה של ניירות ערך מסווגות כהשקעה', () => {
    const r = parse(accountFile([
      row('01/08/2026', 'קניית ני"ע קסם אקטיב כספית שק', -10000, '2900'),
      row('01/07/2026', 'מכירת ני"ע קסם אקטיב כספית שק', 10000, '2899'),
    ]))
    expect(r.movements.map((m) => m.kind)).toEqual(['investment', 'investment'])
    expect(r.movements.filter(countsAsExpense)).toHaveLength(0)
    expect(r.movements.filter(countsAsIncome)).toHaveLength(0)
  })

  it('עמלה מסווגת כהוצאה', () => {
    const r = parse(accountFile([row('03/09/2026', 'עמלת הקצאת אשראי מט"י-יחיד', -12.5, '2948')]))
    expect(r.movements[0].kind).toBe('fee')
    expect(countsAsExpense(r.movements[0])).toBe(true)
  })

  it('משיכת מזומן נספרת כהוצאה', () => {
    const r = parse(accountFile([row('04/06/2026', 'משיכת מזומן ללא כרטיס', -400, '2800')]))
    expect(r.movements[0].kind).toBe('cash')
    expect(countsAsExpense(r.movements[0])).toBe(true)
  })

  /*
   * "העברה" לבדה אינה מספיקה: הקובץ מכיל גם העברות מצד שלישי שהן הכנסה
   * אמיתית. לכן העברה פנימית מזוהה רק מול שמות שהמשתמש הגדיר.
   */
  it('העברה פנימית מזוהה רק כשהיא תואמת חשבון של המשתמש', () => {
    const file = accountFile([row('07/09/2026', 'העברה מישראל ישראלי חשבון 14-317 העברה לח.נוסף', 1250, '2953')])
    expect(parse(file).movements[0].kind).toBe('income')
    expect(parse(file, ['ישראל ישראלי']).movements[0].kind).toBe('transfer')
  })

  it('העברה מצד שלישי נשארת הכנסה גם כשהוגדרו חשבונות', () => {
    const r = parse(
      accountFile([row('05/09/2026', 'העברה ממעסיק כלשהו חשבון 20-657 אימונים אוגוסט', 4170, '2949')]),
      ['ישראל ישראלי'],
    )
    expect(r.movements[0].kind).toBe('income')
    expect(countsAsIncome(r.movements[0])).toBe(true)
  })

  it('תנועה שאינה מוכרת מסווגת לפי הסימן', () => {
    const r = parse(accountFile([
      row('30/08/2026', 'מענק כלשהו', 1778, '2947'),
      row('30/08/2026', 'משהו חדש לגמרי', -50, '2946'),
    ]))
    expect(r.movements.map((m) => m.kind)).toEqual(['income', 'expense'])
  })
})

describe('תנועות עתידיות', () => {
  it('המקטע העתידי מסומן pending ואינו נספר', () => {
    const r = parse(toBuffer([
      ['עובר ושב'],
      HEAD,
      row('09/09/2026', 'חיוב לכרטיס ויזה 2906', -14157.55, '2956'),
      row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950'),
      ['תנועות עתידיות'],
      ['תאריך', 'יום ערך', 'תיאור התנועה', '₪ זכות/חובה ב ', '₪ יתרה משוערת ', 'הערות'],
      ['12/09/2026', '09/10/2026', 'חיוב לכרטיס ויזה 9687', -1207.9, 15509.97, ''],
    ]))
    expect(r.movements).toHaveLength(3)
    expect(r.movements.map((m) => m.pending)).toEqual([false, false, true])
    // הכסף העתידי עוד לא יצא, ולכן אינו הוצאה — גם אם סוגו היה נספר
    expect(r.movements.filter(countsAsExpense)).toHaveLength(1)
  })

  it('יתרה ריקה בשורה האחרונה אינה מפילה את הקריאה', () => {
    const r = parse(toBuffer([
      HEAD,
      ['12/09/2026', '09/10/2026', 'חיוב לכרטיס ויזה 2906', -786.37, '', ''],
    ]))
    expect(r.movements).toHaveLength(1)
    expect(r.movements[0].balance).toBeNull()
  })
})

describe('קריאת ערכים', () => {
  /*
   * עמודת "עמלה" בקובץ מכילה את סוג הערוץ ("ערוץ ישיר") ולא סכום.
   * קריאה שלה כמספר הייתה מחזירה אפס בשקט.
   */
  it('עמודת "עמלה" אינה נקראת כסכום', () => {
    const r = parse(accountFile([row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950')]))
    expect(r.movements[0].amount).toBeCloseTo(-85.08)
    expect(r.movements[0].channel).toBe('אינטרנט')
  })

  it('אסמכתה מרופדת ברווחים מנורמלת', () => {
    const r = parse(accountFile([row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950      ')]))
    expect(r.movements[0].reference).toBe('2950')
  })

  it('יום ערך נקרא בנפרד מהתאריך', () => {
    const r = parse(accountFile([
      ['10/09/2026', '13/09/2026', 'העברה לכהן רוית', -960, 17504.24, '2957/99219', 'ערוץ ישיר', 'אינטרנט'],
    ]))
    expect(r.movements[0].date).toBe('2026-09-10')
    expect(r.movements[0].valueDate).toBe('2026-09-13')
  })

  it('שורות בלי תאריך או בלי סכום מדולגות ונספרות', () => {
    const r = parse(accountFile([
      row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950'),
      ['', '', 'סך הכל', '', '', '', '', ''],
    ]))
    expect(r.movements).toHaveLength(1)
    expect(r.skipped).toBe(1)
  })
})

describe('זהות', () => {
  it('ייבוא חוזר של אותו קובץ אינו מכפיל תנועות', () => {
    const rows = [
      row('09/09/2026', 'חיוב לכרטיס ויזה 9687', -8285.07, '2955'),
      row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950'),
    ]
    const a = parse(accountFile(rows)).movements.map((m) => m.id)
    const b = parse(accountFile(rows)).movements.map((m) => m.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(2)
  })

  it('תנועות זהות בסכום ובתיאור נפרדות לפי האסמכתה', () => {
    const r = parse(accountFile([
      row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2950'),
      row('05/09/2026', 'הראל בטוח חיוב', -85.08, '2951'),
    ]))
    expect(r.movements).toHaveLength(2)
    expect(r.movements[0].id).not.toBe(r.movements[1].id)
  })
})
