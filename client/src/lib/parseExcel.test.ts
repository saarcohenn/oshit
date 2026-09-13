import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCreditCardXlsx } from './parseExcel'
import { cardLast4, makeTransactionId } from './identity'
import type { Category } from '../types'

/*
 * הנתונים כאן מומצאים במכוון. דפי בנק אמיתיים אינם נכנסים למאגר, וגם לא
 * לבדיקות — הקבצים האלה נבנים בזיכרון ומתארים רק את המבנה של הפורמט.
 */

const CATS: Category[] = [
  {
    id: 'misc',
    name: 'שונות',
    emoji: '🧾',
    color: '#888888',
    necessity: 'optional',
    keywords: [],
    sortOrder: 99,
    isFallback: true,
  },
]

function toBuffer(rows: unknown[][], sheetName = 'Sheet1'): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

/** קובץ בסגנון הבנק: כותרת בכל טבלה, כרטיס בכל שורה */
function bankFile(rows: unknown[][]): ArrayBuffer {
  return toBuffer([
    ['כרטיס', 'בית עסק', 'תאריך עסקה', 'סכום העסקה', 'מטבע העסקה', 'סוג העסקה', 'פירוט', 'תאריך החיוב', 'סכום החיוב'],
    ...rows,
  ])
}

/** קובץ בסגנון כאל: שורת כותרת עליונה עם זהות הכרטיס, ואז טבלה אחת */
function calFile(rows: unknown[][], card = 'ויזה 9687'): ArrayBuffer {
  return toBuffer([
    [`פירוט עסקאות לישראל ישראלי לחשבון דיסקונט 123456 לכרטיס ${card}`],
    ['תאריך\r\nעסקה', 'שם בית עסק', 'סכום\r\nבש"ח', 'סכום\r\nבדולר', 'מועד\r\nחיוב', 'סוג\r\nעסקה', 'מזהה כרטיס\r\nבארנק דיגילטי', 'הנחה', 'הערות'],
    ...rows,
  ])
}

const parse = (buf: ArrayBuffer, name = 'test.xlsx') => parseCreditCardXlsx(buf, name, CATS)

describe('cardLast4', () => {
  it('מוציא ארבע ספרות מכל ניסוח של מנפיק', () => {
    expect(cardLast4('ויזה 9687')).toBe('9687')
    expect(cardLast4('Visa 9687')).toBe('9687')
    expect(cardLast4('כרטיס אשראי 1234-5678-9012-9687')).toBe('9687')
  })

  it('נשען על השם כשאין ספרות כלל', () => {
    expect(cardLast4('תשלום ידני')).toBe('תשלום ידני')
  })
})

describe('זהות בין מקורות', () => {
  it('אותה קנייה מקובץ הבנק ומקובץ כאל מקבלת מזהה זהה', () => {
    // הבנק מקצר את שם בית העסק ל-14 תווים; כאל נותנת את השם המלא.
    // זה בדיוק ההבדל שגרם לספירה כפולה כששם בית העסק היה חלק מהזהות.
    const bank = parse(
      bankFile([['ויזה 9687', 'klook travel t', '21/07/2026', 378.81, 'ILS', 'רגילה', '', '10/08/2026', 378.81]]),
      'bank.xlsx',
    )
    const cal = parse(
      calFile([['21/7/26', 'Klook Travel Tech Ltd', '₪ 378.81', '', '10/8/26', 'רגילה', '', '', '']]),
      'cal.xlsx',
    )

    expect(bank.transactions).toHaveLength(1)
    expect(cal.transactions).toHaveLength(1)
    expect(cal.transactions[0].id).toBe(bank.transactions[0].id)
    // השם עצמו כן שונה — הוא תכונה, לא זהות
    expect(bank.transactions[0].merchant).not.toBe(cal.transactions[0].merchant)
  })

  it('קניות שונות באותו יום נשארות נפרדות', () => {
    const r = parse(
      calFile([
        ['02/8/26', 'PAYBOX', '₪ 50.00', '', '10/8/26', 'רגילה', '', '', ''],
        ['02/8/26', 'PAYBOX', '₪ 50.00', '', '10/8/26', 'רגילה', '', '', ''],
        ['02/8/26', 'PAYBOX', '₪ 50.00', '', '10/8/26', 'רגילה', '', '', ''],
      ]),
    )
    expect(r.transactions).toHaveLength(3)
    expect(new Set(r.transactions.map((t) => t.id)).size).toBe(3)
  })

  it('כרטיסים שונים אינם מתמזגים', () => {
    const mine = parse(calFile([['02/8/26', 'חנות', '₪ 50.00', '', '', 'רגילה', '', '', '']], 'ויזה 9687'))
    const spouse = parse(calFile([['02/8/26', 'חנות', '₪ 50.00', '', '', 'רגילה', '', '', '']], 'ויזה 2906'))
    expect(mine.transactions[0].id).not.toBe(spouse.transactions[0].id)
  })
})

describe('תשלומים', () => {
  it('כאל: שורות זהות נפרסות לתשלומים ולחודשים עוקבים', () => {
    const r = parse(
      calFile([
        ['03/6/26', 'ליברה ביטוח', '₪ 196.20', '', '', 'תשלומים', '', '', 'עסקה ב-10 תשלומים'],
        ['03/6/26', 'ליברה ביטוח', '₪ 196.20', '', '', 'תשלומים', '', '', 'עסקה ב-10 תשלומים'],
        ['03/6/26', 'ליברה ביטוח', '₪ 196.20', '', '', 'תשלומים', '', '', 'עסקה ב-10 תשלומים'],
      ]),
    )
    expect(r.transactions.map((t) => t.installment?.current)).toEqual([1, 2, 3])
    expect(r.transactions.map((t) => t.installment?.total)).toEqual([10, 10, 10])
    // בלי הפריסה כל שלושת התשלומים היו נופלים על חודש הרכישה
    expect(r.transactions.map((t) => t.chargeDate)).toEqual(['2026-06-03', '2026-07-03', '2026-08-03'])
  })

  it('תשלום מהבנק ומאותו תשלום בכאל מקבלים מזהה זהה', () => {
    // הבנק כותב "3/10" בעמודת הפירוט; כאל מדפיסה שלוש שורות זהות
    const bank = parse(
      bankFile([['ויזה 9687', 'ליברה ביטוח', '03/06/2026', 196.2, 'ILS', 'תשלומים', '3/10', '10/08/2026', 196.2]]),
      'bank.xlsx',
    )
    const cal = parse(
      calFile([
        ['03/6/26', 'ליברה ביטוח', '₪ 196.20', '', '', 'תשלומים', '', '', 'עסקה ב-10 תשלומים'],
        ['03/6/26', 'ליברה ביטוח', '₪ 196.20', '', '', 'תשלומים', '', '', 'עסקה ב-10 תשלומים'],
        ['03/6/26', 'ליברה ביטוח', '₪ 196.20', '', '', 'תשלומים', '', '', 'עסקה ב-10 תשלומים'],
      ]),
      'cal.xlsx',
    )
    expect(bank.transactions[0].id).toBe(cal.transactions[2].id)
  })

  it('תשלומים עוקבים משני קבצי בנק אינם נבלעים זה בזה', () => {
    // הרגרסיה שהחלפת הזהות עלולה הייתה להכניס: אותו תאריך, אותו סכום,
    // שני קבצים חודשיים — ובלי מספר התשלום שניהם היו מקבלים אותו מזהה
    const aug = parse(
      bankFile([['ויזה 9687', 'ליברה ביטוח', '03/06/2026', 196.2, 'ILS', 'תשלומים', '3/10', '10/08/2026', 196.2]]),
      'aug.xlsx',
    )
    const sep = parse(
      bankFile([['ויזה 9687', 'ליברה ביטוח', '03/06/2026', 196.2, 'ILS', 'תשלומים', '4/10', '10/09/2026', 196.2]]),
      'sep.xlsx',
    )
    expect(aug.transactions[0].id).not.toBe(sep.transactions[0].id)
  })
})

describe('קריאת ערכים', () => {
  it('שנה דו-ספרתית של כאל נפתחת נכון', () => {
    const r = parse(calFile([['14/8/26', 'חנות', '₪ 99.90', '', '10/9/26', 'רגילה', '', '', '']]))
    expect(r.transactions[0].date).toBe('2026-08-14')
    expect(r.transactions[0].chargeDate).toBe('2026-09-10')
  })

  it('תאריך שנקרא כתא Date אינו נופל יום אחורה', () => {
    // SheetJS גוזר תאריך ממספר סידורי ומחזיר לעיתים 23:59:20 של היום הקודם.
    // עסקה של ה-1 בחודש הייתה נופלת לחודש הקודם.
    const r = parse(
      bankFile([['ויזה 9687', 'חנות', new Date(2026, 7, 1), 10, 'ILS', 'רגילה', '', new Date(2026, 8, 10), 10]]),
    )
    expect(r.transactions[0].date).toBe('2026-08-01')
  })

  it('זיכוי נשמר כסכום שלילי', () => {
    const r = parse(calFile([['26/3/26', 'שלגוגו', '-₪ 10.00', '', '10/4/26', 'זיכוי', '', '', '']]))
    expect(r.transactions[0].amount).toBe(-10)
  })

  it('מטבע זר נקרא מתוך ההערה', () => {
    const r = parse(
      calFile([
        ['21/7/26', 'TOYOTA RENT A CAR', '₪ 1,671.65', '', '24/7/26', 'רגילה', '', '', 'סכום העסקה הוא 87065.0 JPY'],
      ]),
    )
    expect(r.transactions[0].currency).toBe('JPY')
    expect(r.transactions[0].originalAmount).toBe(87065)
    expect(r.transactions[0].amount).toBe(1671.65)
  })

  it('שורות בסכום אפס מדולגות ונספרות', () => {
    const r = parse(
      calFile([
        ['12/8/26', 'דמי כרטיס', '₪ 0.00', '', '10/9/26', 'דמי חבר', '', '', ''],
        ['12/8/26', 'חנות', '₪ 43.00', '', '10/9/26', 'רגילה', '', '', ''],
      ]),
    )
    expect(r.transactions).toHaveLength(1)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
  })
})

describe('זיהוי פורמט', () => {
  it('מזהה את הפורמט לפי תוכן ולא לפי שם הקובץ', () => {
    expect(parse(calFile([['14/8/26', 'x', '₪ 1.00', '', '', 'רגילה', '', '', '']]), 'whatever.xlsx').format).toBe('cal')
    expect(parse(bankFile([['ויזה 1', 'x', '14/08/2026', 1, 'ILS', 'רגילה', '', '14/08/2026', 1]]), 'x.xlsx').format).toBe('bank')
  })

  it('קובץ שאינו מוכר מחזיר אפס עסקאות ולא זורק', () => {
    const r = parse(toBuffer([['שלום', 'עולם'], [1, 2]]))
    expect(r.transactions).toHaveLength(0)
    expect(r.format).toBe('unknown')
  })
})

describe('makeTransactionId', () => {
  it('יציב בין הרצות', () => {
    const parts = { card: 'ויזה 9687', date: '2026-08-01', currency: 'ILS', amount: 10, originalAmount: 10 }
    expect(makeTransactionId(parts, 0)).toBe(makeTransactionId(parts, 0))
    expect(makeTransactionId(parts, 0)).not.toBe(makeTransactionId(parts, 1))
  })

  it('מטבע זר מזוהה לפי הסכום המקורי, שאינו משתנה עד לחיוב', () => {
    const a = { card: 'ויזה 9687', date: '2026-08-01', currency: 'USD', amount: 62.4, originalAmount: 20 }
    const b = { card: 'ויזה 9687', date: '2026-08-01', currency: 'USD', amount: 65.1, originalAmount: 20 }
    expect(makeTransactionId(a, 0)).toBe(makeTransactionId(b, 0))
  })
})
