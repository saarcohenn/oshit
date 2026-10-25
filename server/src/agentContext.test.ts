import { describe, expect, it } from 'vitest'
import { buildSpendingContext, cycleMonth, type ContextState } from './agentContext.js'

/*
 * נתונים מומצאים. "חנות שקטה" היא בית עסק שקונים בו סכומים קטנים כל חודש —
 * בדיוק מה שאסור שייצא למודל, ולכן היא העוגן של בדיקת הפרטיות.
 */

let seq = 0
const tx = (merchantKey: string, merchant: string, chargeDate: string, amount: number, category: string, card = 'ויזה 9687') => ({
  id: `tx_secret_${++seq}`,
  card,
  merchant,
  merchantKey,
  date: chargeDate,
  chargeDate,
  amount,
  category,
})

const mv = (date: string, description: string, amount: number, kind: string, pending = false) => ({
  date,
  description,
  amount,
  kind,
  pending,
})

function state(overrides: Partial<ContextState> = {}): ContextState {
  const transactions = [
    // שלושה חודשים של שגרה
    ...['2026-07-10', '2026-08-10', '2026-09-10'].flatMap((d) => [
      tx('super', 'סופר שכונתי', d, 600, 'food'),
      tx('super', 'סופר שכונתי', d, 550, 'food'),
      tx('quietshop', 'חנות שקטה', d, 40, 'misc'),
      tx('cafe', 'קפה פינתי', d, 300, 'restaurants'),
    ]),
    // פיצה ממוינת ב"שונות" אצל הבנק — כלל בית העסק מעביר אותה למסעדות.
    // מכירים אותה מיולי, ולכן היא לא "בית עסק חדש" ולא אמורה לצאת למודל
    tx('pizza', 'פיצה', '2026-07-10', 100, 'misc'),
    tx('pizza', 'פיצה', '2026-09-10', 900, 'misc'),
    // חריג: חיוב גדול
    tx('electronics', 'חנות מחשבים', '2026-09-10', 4500, 'misc'),
    // חריג: בית עסק חדש בחודש האחרון
    tx('newgym', 'חדר כושר חדש', '2026-09-10', 450, 'misc'),
  ]
  const cardTotalSep = transactions
    .filter((t) => t.chargeDate === '2026-09-10')
    .reduce((s, t) => s + t.amount, 0)

  return {
    settings: { cycleStartDay: 1 },
    categories: [
      { id: 'food', name: 'מזון' },
      { id: 'restaurants', name: 'מסעדות' },
      { id: 'misc', name: 'שונות' },
    ],
    transactions,
    budgets: [
      { category: 'restaurants', limit: 1000 },
      { category: 'food', limit: 5000 },
    ],
    merchantRules: [{ merchantKey: 'pizza', category: 'restaurants' }],
    accountMovements: [
      // החיוב בעו"ש יום לפני תאריך החיוב בקובץ הכרטיס — כמו במציאות
      mv('2026-09-09', 'חיוב לכרטיס ויזה 9687', -cardTotalSep, 'card_settlement'),
      mv('2026-09-09', 'חיוב לכרטיס ויזה 2906', -1200, 'card_settlement'),
      mv('2026-09-07', 'משכורת', 19000, 'salary'),
      mv('2026-09-01', 'הע. למיטב טרייד', -5500, 'investment'),
      mv('2026-09-05', 'ביטוח', -85, 'expense'),
      mv('2026-09-12', 'חיוב לכרטיס ויזה 9687', -999, 'card_settlement', true),
    ],
    ...overrides,
  }
}

describe('חודש לפי מחזור', () => {
  it('יום התחלה 1 הוא חודש קלנדרי', () => {
    expect(cycleMonth('2026-09-05', 1)).toBe('2026-09')
  })

  it('יום התחלה 10 מעביר את תחילת החודש למחזור הקודם, כמו בלקוח', () => {
    expect(cycleMonth('2026-09-05', 10)).toBe('2026-08')
    expect(cycleMonth('2026-09-12', 10)).toBe('2026-09')
    expect(cycleMonth('2026-01-03', 10)).toBe('2025-12')
  })
})

describe('סיכומים', () => {
  it('מחזיר חודשים בסדר עולה ומזהה את האחרון', () => {
    const ctx = buildSpendingContext(state(), 7)
    expect(ctx.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(ctx.latestMonth).toBe('2026-09')
    expect(ctx.version).toBe(7)
  })

  it('מחיל את כלל בית העסק — כמו המסך', () => {
    const sep = buildSpendingContext(state(), 1).months.at(-1)!
    expect(sep.byCategory.find((c) => c.category === 'מסעדות')?.total).toBe(1200)
  })

  it('מעו"ש: התחשבנות כרטיס והשקעה אינן הוצאה, עתידי אינו נספר', () => {
    const sep = buildSpendingContext(state(), 1).months.at(-1)!
    expect(sep.account.expense).toBe(85)
    expect(sep.account.income).toBe(19000)
  })

  it('מסמן קטגוריה שעברה את התקציב', () => {
    const { budgets } = buildSpendingContext(state(), 1)
    expect(budgets).toEqual([{ category: 'מסעדות', spent: 1200, budget: 1000, pct: 120 }])
  })
})

describe('פריטים חריגים', () => {
  it('מסמן חיוב גדול ובית עסק חדש', () => {
    const { flagged } = buildSpendingContext(state(), 1)
    expect(flagged.map((f) => [f.merchant, f.reason])).toEqual([
      ['חנות מחשבים', 'large'],
      ['חדר כושר חדש', 'new_merchant'],
    ])
  })

  it('חיוב שסומן חד-פעמי אינו חריג — המשתמש כבר יודע עליו', () => {
    const s = state()
    ;(s.transactions as Array<{ merchantKey: string; oneOff?: boolean }>).find((t) => t.merchantKey === 'electronics')!.oneOff = true
    expect(buildSpendingContext(s, 1).flagged.map((f) => f.merchant)).not.toContain('חנות מחשבים')
  })

  it('לא יותר מ-15 פריטים, גם כשיש יותר', () => {
    const many = Array.from({ length: 40 }, (_, i) => tx(`big${i}`, `גדול ${i}`, '2026-09-10', 5000 + i, 'misc'))
    const s = state()
    s.transactions = [...(s.transactions as unknown[]), ...many]
    expect(buildSpendingContext(s, 1).flagged).toHaveLength(15)
  })
})

describe('התאמת חיובי כרטיס', () => {
  it('חיוב שתואם את סכום עסקאות הכרטיס, גם בהפרש של יום', () => {
    const r = buildSpendingContext(state(), 1).reconciliation.find((x) => x.card === '9687')!
    expect(r.status).toBe('matched')
    expect(r.diff).toBe(0)
  })

  it('כרטיס בלי עסקאות מיובאות אינו "אי-התאמה" — הוא קובץ שחסר', () => {
    const r = buildSpendingContext(state(), 1).reconciliation.find((x) => x.card === '2906')!
    expect(r.status).toBe('no_card_data')
  })

  it('מזהה פער אמיתי', () => {
    const s = state()
    ;(s.accountMovements as Array<{ description: string; amount: number; pending: boolean }>).find(
      (m) => m.description.endsWith('9687') && !m.pending,
    )!.amount = -9999
    const r = buildSpendingContext(s, 1).reconciliation.find((x) => x.card === '9687')!
    expect(r.status).toBe('mismatch')
  })

  it('חיוב עתידי אינו נכלל בהתאמה', () => {
    const recs = buildSpendingContext(state(), 1).reconciliation
    expect(recs.filter((r) => r.card === '9687')).toHaveLength(1)
  })
})

/*
 * הבדיקה החשובה בקובץ. סער החליט שרק סיכומים יוצאים ל-Anthropic. אם שם
 * של בית עסק שלא סומן, מזהה של עסקה, או מחרוזת כרטיס מלאה מופיעים בפלט —
 * הגבול נפרץ, גם אם כל שאר הבדיקות עוברות.
 */
describe('גבול הפרטיות', () => {
  const json = JSON.stringify(buildSpendingContext(state(), 1))

  it('בית עסק שלא סומן כחריג אינו מופיע בשום מקום', () => {
    for (const name of ['חנות שקטה', 'סופר שכונתי', 'קפה פינתי', 'פיצה']) {
      expect(json).not.toContain(name)
    }
  })

  it('אין מזהי עסקאות', () => {
    expect(json).not.toMatch(/tx_secret_/)
  })

  it('אין מחרוזת כרטיס מלאה — רק ארבע ספרות', () => {
    expect(json).not.toContain('ויזה')
    expect(json).toContain('"9687"')
  })

  it('אין שדה של רשימת עסקאות', () => {
    expect(json).not.toMatch(/"transactions"|"merchantKey"|"id"/)
  })
})
