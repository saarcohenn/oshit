import type { CategoryId, Frequency, Necessity, Transaction } from '../types'
import type { CategoryIndex } from './categories'
import { monthlyEquivalent, yearlyEquivalent } from './frequency'
import { monthKey, txCount } from './format'

export interface CategoryTotal {
  category: CategoryId
  total: number
  count: number
}

export interface MerchantTotal {
  merchantKey: string
  merchant: string
  total: number
  count: number
  category: CategoryId
  necessity: Necessity
}

export interface MonthSummary {
  month: string
  total: number
  byNecessity: Record<Necessity, number>
  byCategory: CategoryTotal[]
  count: number
}

/** העסקאות משויכות לחודש לפי תאריך החיוב — זה הכסף שיוצא מהחשבון בפועל */
export function transactionMonth(t: Transaction): string {
  return monthKey(t.chargeDate || t.date)
}

export function availableMonths(transactions: Transaction[]): string[] {
  const set = new Set(transactions.map(transactionMonth))
  return [...set].sort().reverse()
}

/**
 * קובץ של חודש אחד מכיל גם כמה עסקאות בודדות מחודשים קודמים
 * (עסקאות חו"ל שחויבו מיידית). חודש כזה אינו מייצג הוצאה חודשית מלאה,
 * והשוואה אליו תיתן תמונה מעוותת — לכן הוא מסומן כחלקי.
 */
export function partialMonths(transactions: Transaction[]): Set<string> {
  const counts = new Map<string, number>()
  for (const t of transactions) {
    const m = transactionMonth(t)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const max = Math.max(...counts.values(), 0)
  const partial = new Set<string>()
  for (const [month, count] of counts) {
    if (count < max * 0.3) partial.add(month)
  }
  return partial
}

export function summarize(transactions: Transaction[], month?: string): MonthSummary {
  const rows = month ? transactions.filter((t) => transactionMonth(t) === month) : transactions

  const byNecessity: Record<Necessity, number> = { mandatory: 0, semi: 0, optional: 0 }
  const catMap = new Map<CategoryId, CategoryTotal>()
  let total = 0

  for (const t of rows) {
    total += t.amount
    byNecessity[t.necessity] += t.amount
    const entry = catMap.get(t.category) ?? { category: t.category, total: 0, count: 0 }
    entry.total += t.amount
    entry.count++
    catMap.set(t.category, entry)
  }

  return {
    month: month ?? 'all',
    total,
    byNecessity,
    byCategory: [...catMap.values()].sort((a, b) => b.total - a.total),
    count: rows.length,
  }
}

export function monthlySeries(transactions: Transaction[]): MonthSummary[] {
  return availableMonths(transactions)
    .map((m) => summarize(transactions, m))
    .reverse()
}

export function topMerchants(transactions: Transaction[], month?: string, limit = 10): MerchantTotal[] {
  const rows = month ? transactions.filter((t) => transactionMonth(t) === month) : transactions
  const map = new Map<string, MerchantTotal>()
  for (const t of rows) {
    const entry = map.get(t.merchantKey) ?? {
      merchantKey: t.merchantKey,
      merchant: t.merchant,
      total: 0,
      count: 0,
      category: t.category,
      necessity: t.necessity,
    }
    entry.total += t.amount
    entry.count++
    map.set(t.merchantKey, entry)
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

export interface Recurring {
  merchantKey: string
  merchant: string
  category: CategoryId
  necessity: Necessity
  /** חודשים שבהם החיוב הופיע */
  months: string[]
  /** ממוצע החיוב, לפי מחזור החיוב ולא לפי חודש */
  average: number
  lastAmount: number
  lastMonth: string
  /** תדירות החיוב כפי שסומנה, ברירת מחדל חודשי */
  frequency: Frequency
  /** העלות החודשית האמיתית — חיוב דו-חודשי נחלק לשניים */
  monthlyCost: number
  /** עלות שנתית משוערת */
  yearly: number
  /** true כשהסכום כמעט זהה בכל מחזור — סימן מובהק למנוי או הוראת קבע */
  stable: boolean
}

/**
 * מזהה חיובים חוזרים: בית עסק שחויב לפחות בשני חודשים שונים.
 * חיוב "יציב" (סטייה של עד 15% מהממוצע) הוא כמעט תמיד מנוי או הוראת קבע,
 * ולכן הוא המועמד הראשון לבדיקה כשרוצים לקצץ בהוצאות.
 */
export function findRecurring(
  transactions: Transaction[],
  frequencies: Record<string, Frequency> = {},
  minMonths = 2,
): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const list = groups.get(t.merchantKey) ?? []
    list.push(t)
    groups.set(t.merchantKey, list)
  }

  const result: Recurring[] = []
  for (const [merchantKey, list] of groups) {
    const monthTotals = new Map<string, number>()
    for (const t of list) {
      const m = transactionMonth(t)
      monthTotals.set(m, (monthTotals.get(m) ?? 0) + t.amount)
    }
    const frequency = frequencies[merchantKey] ?? 'monthly'
    // חיוב שאינו חודשי מופיע בפחות חודשים מעצם טבעו, ולכן די בהופעה אחת
    // כדי להכיר בו כחיוב חוזר אחרי שהמשתמש סימן את התדירות שלו
    const required = frequency === 'monthly' ? minMonths : 1
    if (monthTotals.size < required) continue

    const months = [...monthTotals.keys()].sort()
    const amounts = months.map((m) => monthTotals.get(m)!)
    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - average)))
    const latest = list.slice().sort((a, b) => b.chargeDate.localeCompare(a.chargeDate))[0]
    const lastMonth = months[months.length - 1]

    result.push({
      merchantKey,
      merchant: latest.merchant,
      category: latest.category,
      necessity: latest.necessity,
      months,
      average,
      lastAmount: monthTotals.get(lastMonth)!,
      lastMonth,
      frequency,
      monthlyCost: monthlyEquivalent(average, frequency),
      yearly: yearlyEquivalent(average, frequency),
      // חיוב שסומן כלא-חודשי ונראה פעם אחת בלבד נחשב יציב — המשתמש הצהיר שהוא קבוע
      stable:
        average > 0 && (amounts.length === 1 ? frequency !== 'monthly' : maxDeviation / average <= 0.15),
    })
  }

  return result.sort((a, b) => b.yearly - a.yearly)
}

export interface Commitment {
  merchant: string
  category: CategoryId
  /** תשלום חודשי */
  monthly: number
  paid: number
  total: number
  remaining: number
  remainingAmount: number
  lastChargeMonth: string
}

/** התחייבויות עתידיות מעסקאות בתשלומים — כמה כסף כבר "תפוס" בחודשים הבאים */
export function openCommitments(transactions: Transaction[]): Commitment[] {
  const map = new Map<string, Commitment>()

  for (const t of transactions) {
    if (!t.installment) continue
    const key = `${t.merchantKey}|${t.installment.total}|${t.amount.toFixed(2)}`
    const existing = map.get(key)
    // נשמר רק התשלום המאוחר ביותר של אותה עסקה, ממנו נגזרת היתרה
    if (existing && existing.paid >= t.installment.current) continue
    const remaining = Math.max(0, t.installment.total - t.installment.current)
    map.set(key, {
      merchant: t.merchant,
      category: t.category,
      monthly: t.amount,
      paid: t.installment.current,
      total: t.installment.total,
      remaining,
      remainingAmount: remaining * t.amount,
      lastChargeMonth: transactionMonth(t),
    })
  }

  return [...map.values()]
    .filter((c) => c.remaining > 0)
    .sort((a, b) => b.remainingAmount - a.remainingAmount)
}

export interface SavingIdea {
  title: string
  detail: string
  monthlySaving: number
  yearlySaving: number
  severity: 'high' | 'medium' | 'low'
}

/**
 * בונה רשימת הצעות חיסכון מוחשיות מתוך הנתונים בפועל.
 * העיקרון: לא לגעת בהוצאות חובה, ולהצביע על הוצאות מותרות חוזרות
 * שבהן קיצוץ קטן מצטבר לסכום משמעותי בשנה.
 */
export function savingIdeas(
  transactions: Transaction[],
  month: string,
  cats: CategoryIndex,
): SavingIdea[] {
  const ideas: SavingIdea[] = []
  const recurring = findRecurring(transactions)
  const summary = summarize(transactions, month)

  // מנויים יציבים שאינם חובה — הקיצוץ הכי קל שיש
  const cancellable = recurring.filter((r) => r.stable && r.necessity === 'optional')
  for (const r of cancellable.slice(0, 6)) {
    ideas.push({
      title: `ביטול או הקפאה של "${r.merchant}"`,
      detail: `חיוב קבוע של כ-${Math.round(r.average)} ₪ בחודש, חוזר ב-${r.months.length} חודשים שיובאו. אם לא השתמשתם לאחרונה — זה חיסכון מיידי.`,
      monthlySaving: r.average,
      yearlySaving: r.yearly,
      severity: r.yearly > 1200 ? 'high' : 'medium',
    })
  }

  // קיצוץ של 25% בקטגוריות המותרות הגדולות
  const optionalCats = summary.byCategory
    .filter((c) => cats.byId(c.category).necessity === 'optional' && c.total > 300)
    .slice(0, 4)
  for (const c of optionalCats) {
    const saving = c.total * 0.25
    ideas.push({
      title: `לצמצם ב-25% את "${cats.byId(c.category).name}"`,
      detail: `הוצאתם ${Math.round(c.total)} ₪ ב-${txCount(c.count)} החודש. הורדה לרבע פחות משאירה ${Math.round(saving)} ₪ בחשבון.`,
      monthlySaving: saving,
      yearlySaving: saving * 12,
      severity: c.total > 1500 ? 'high' : 'medium',
    })
  }

  // עסקאות קטנות שמצטברות — הדליפה השקטה
  const rows = transactions.filter((t) => transactionMonth(t) === month)
  const small = rows.filter((t) => t.amount <= 60 && t.necessity !== 'mandatory')
  if (small.length >= 8) {
    const total = small.reduce((sum, t) => sum + t.amount, 0)
    ideas.push({
      title: 'הוצאות קטנות שמצטברות',
      detail: `${txCount(small.length)} של עד 60 ₪ הסתכמו ב-${Math.round(total)} ₪ החודש. חצי מהן זה כבר סכום שמרגישים.`,
      monthlySaving: total / 2,
      yearlySaving: (total / 2) * 12,
      severity: total > 800 ? 'high' : 'low',
    })
  }

  return ideas.sort((a, b) => b.yearlySaving - a.yearlySaving)
}
