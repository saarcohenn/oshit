/**
 * ההקשר שסוכן ההוצאות מקבל — סיכומים בלבד.
 *
 * סער החליט שמנתוני ההוצאות יוצאים ל-Anthropic סכומים לפי קטגוריה וחודש,
 * ופריטים חריגים בלבד. כל מה שיוצא מכאן מגיע למודל, ולכן הפונקציה הזו היא
 * הגבול עצמו: אין כאן מזהי עסקאות, אין מחרוזות כרטיס מלאות, ושם של בית עסק
 * מופיע רק אם הפריט סומן כחריג. יש לזה בדיקה שמוודאת בדיוק את זה.
 *
 * הכול כאן טהור — בלי מסד — כדי שאפשר יהיה לבדוק את הגבול על נתונים מומצאים.
 *
 * החישובים משכפלים את הלקוח בכוונה, כדי שהסוכן ידווח את אותם מספרים שהמסך
 * מציג: חודש לפי cycleMonth (client/src/lib/cycle.ts), עסקה אחרי כללי בית
 * העסק (App.tsx), וסיווג תנועות עו"ש לפי countsAsExpense (client/src/types.ts).
 * שינוי שם מחייב שינוי גם כאן.
 */

interface Tx {
  id: string
  card: string
  merchant: string
  merchantKey: string
  date: string
  chargeDate: string
  amount: number
  category: string
  oneOff?: boolean
}

interface Movement {
  date: string
  description: string
  amount: number
  kind: string
  pending: boolean
  oneOff?: boolean
}

interface Rule {
  merchantKey: string
  category?: string
}

export interface ContextState {
  settings: { cycleStartDay: number }
  categories: unknown[]
  transactions: unknown[]
  budgets: unknown[]
  merchantRules: unknown[]
  accountMovements: unknown[]
}

/** כמה חודשים אחורה. מספיק לראות מגמה, לא מספיק לשחזר את ההיסטוריה */
const WINDOW_MONTHS = 6
/** תקרת הפריטים החריגים. זה הערוץ היחיד שבו שם בית עסק יוצא — ולכן הוא חסום */
const MAX_FLAGGED = 15
/** חיוב בודד שגדול מפי-כמה מהחציון של הקטגוריה שלו */
const LARGE_FACTOR = 3
const LARGE_MIN_ILS = 1000
/** בית עסק חדש נחשב חריג רק מעל הסכום הזה — אחרת כל קפה חדש היה מסומן */
const NEW_MERCHANT_MIN_ILS = 300
/** מרווח הימים בין תאריך החיוב בקובץ הכרטיס לבין תאריך החיוב בעו"ש */
const SETTLEMENT_WINDOW_DAYS = 5
const ROUND_TOLERANCE_ILS = 1

const NEUTRAL_KINDS = ['card_settlement', 'transfer', 'investment']

const round = (n: number) => Math.round(n * 100) / 100

/** כמו cycleMonth בלקוח, אבל עם יום ההתחלה כפרמטר ולא כמצב מודול */
export function cycleMonth(isoDate: string, cycleStartDay: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m) return isoDate.slice(0, 7)
  if (cycleStartDay <= 1 || (d ?? 1) >= cycleStartDay) return `${y}-${String(m).padStart(2, '0')}`
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  return `${prev.y}-${String(prev.m).padStart(2, '0')}`
}

/** ארבע הספרות האחרונות — כמו cardLast4 ב-client/src/lib/identity.ts */
export function cardLast4(card: string): string {
  const digits = String(card ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

function countsAsExpense(m: Movement): boolean {
  return !m.pending && m.amount < 0 && !NEUTRAL_KINDS.includes(m.kind)
}

function countsAsIncome(m: Movement): boolean {
  return !m.pending && m.amount > 0 && !NEUTRAL_KINDS.includes(m.kind)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

export interface SpendingContext {
  version: number
  cycleStartDay: number
  /** החודש האחרון שיש בו נתונים — לא בהכרח החודש הנוכחי */
  latestMonth: string | null
  months: Array<{
    month: string
    cardTotal: number
    oneOffTotal: number
    byCategory: Array<{ category: string; total: number; count: number; budget: number | null }>
    account: { expense: number; income: number; oneOff: number }
  }>
  budgets: Array<{ category: string; spent: number; budget: number; pct: number }>
  flagged: Array<{ date: string; merchant: string; amount: number; category: string; reason: 'large' | 'new_merchant' }>
  reconciliation: Array<{
    card: string
    date: string
    settled: number
    cardTotal: number
    diff: number
    status: 'matched' | 'mismatch' | 'no_card_data'
  }>
}

export function buildSpendingContext(state: ContextState, version: number): SpendingContext {
  const cycleStartDay = state.settings?.cycleStartDay || 1
  const names = new Map(
    (state.categories as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  )
  const categoryName = (id: string) => names.get(id) ?? id
  const rules = new Map((state.merchantRules as Rule[]).map((r) => [r.merchantKey, r]))

  // העסקה כפי שהמשתמש רואה אותה — אחרי שיוך ידני של בית העסק
  const txs = (state.transactions as Tx[]).map((t) => {
    const rule = rules.get(t.merchantKey)
    return rule?.category ? { ...t, category: rule.category } : t
  })
  const monthOf = (t: Tx) => cycleMonth(t.chargeDate || t.date, cycleStartDay)
  const movements = state.accountMovements as Movement[]

  const allMonths = [
    ...new Set([
      ...txs.map(monthOf),
      ...movements.filter((m) => !m.pending).map((m) => cycleMonth(m.date, cycleStartDay)),
    ]),
  ].sort()
  const window = allMonths.slice(-WINDOW_MONTHS)
  const latestMonth = window[window.length - 1] ?? null
  const budgetOf = new Map(
    (state.budgets as Array<{ category: string; limit: number }>).map((b) => [b.category, b.limit]),
  )

  const months = window.map((month) => {
    const rows = txs.filter((t) => monthOf(t) === month)
    const byCat = new Map<string, { total: number; count: number }>()
    let cardTotal = 0
    let oneOffTotal = 0
    for (const t of rows) {
      cardTotal += t.amount
      if (t.oneOff) oneOffTotal += t.amount
      const entry = byCat.get(t.category) ?? { total: 0, count: 0 }
      entry.total += t.amount
      entry.count++
      byCat.set(t.category, entry)
    }
    const mv = movements.filter((m) => cycleMonth(m.date, cycleStartDay) === month)
    return {
      month,
      cardTotal: round(cardTotal),
      oneOffTotal: round(oneOffTotal),
      byCategory: [...byCat.entries()]
        .map(([category, v]) => ({
          category: categoryName(category),
          total: round(v.total),
          count: v.count,
          budget: budgetOf.get(category) ?? null,
        }))
        .sort((a, b) => b.total - a.total),
      account: {
        expense: round(mv.filter(countsAsExpense).reduce((s, m) => s + Math.abs(m.amount), 0)),
        income: round(mv.filter(countsAsIncome).reduce((s, m) => s + m.amount, 0)),
        oneOff: round(mv.filter((m) => m.oneOff && !m.pending).reduce((s, m) => s + Math.abs(m.amount), 0)),
      },
    }
  })

  // תקציבים — רק לחודש האחרון, שם יש עוד מה לעשות עם המידע
  const latest = months[months.length - 1]
  const budgets = latest
    ? [...budgetOf.entries()]
        .map(([category, budget]) => {
          const spent = latest.byCategory.find((c) => c.category === categoryName(category))?.total ?? 0
          return { category: categoryName(category), spent, budget, pct: budget > 0 ? round((spent / budget) * 100) : 0 }
        })
        .filter((b) => b.budget > 0 && b.pct >= 90)
        .sort((a, b) => b.pct - a.pct)
    : []

  /*
   * פריטים חריגים — רק מהחודשיים האחרונים, ורק לפי כללים קבועים.
   * המודל לא מחליט מה חריג: הוא מקבל רשימה מוכנה ומפרש אותה.
   */
  const recentMonths = new Set(window.slice(-2))
  const firstSeen = new Map<string, string>()
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!firstSeen.has(t.merchantKey)) firstSeen.set(t.merchantKey, monthOf(t))
  }
  const byCategoryAmounts = new Map<string, number[]>()
  for (const t of txs) {
    if (!window.includes(monthOf(t)) || t.amount <= 0) continue
    const list = byCategoryAmounts.get(t.category) ?? []
    list.push(t.amount)
    byCategoryAmounts.set(t.category, list)
  }
  const flaggedAll: SpendingContext['flagged'] = []
  for (const t of txs) {
    if (!recentMonths.has(monthOf(t)) || t.oneOff || t.amount <= 0) continue
    const threshold = Math.max(LARGE_MIN_ILS, LARGE_FACTOR * median(byCategoryAmounts.get(t.category) ?? []))
    const reason =
      t.amount >= threshold
        ? 'large'
        : firstSeen.get(t.merchantKey) === monthOf(t) && window.indexOf(monthOf(t)) > 0 && t.amount >= NEW_MERCHANT_MIN_ILS
          ? 'new_merchant'
          : null
    if (reason) {
      flaggedAll.push({
        date: t.date,
        merchant: t.merchant,
        amount: round(t.amount),
        category: categoryName(t.category),
        reason,
      })
    }
  }
  const flagged = flaggedAll.sort((a, b) => b.amount - a.amount).slice(0, MAX_FLAGGED)

  /*
   * התאמה: "חיוב לכרטיס 9687" בעו"ש מול סכום עסקאות אותו כרטיס סביב אותו
   * תאריך. אם אין עסקאות כרטיס מיובאות לתקופה, זה לא אי-התאמה — זה קובץ
   * כרטיס שעוד לא יובא, וזה מה שהסוכן צריך לומר.
   */
  const reconciliation = movements
    .filter((m) => m.kind === 'card_settlement' && !m.pending && window.includes(cycleMonth(m.date, cycleStartDay)))
    .map((m) => {
      const card = (m.description.match(/(\d{4})\s*$/) ?? [])[1] ?? ''
      const matching = txs.filter(
        (t) => card && cardLast4(t.card) === card && daysBetween(t.chargeDate || t.date, m.date) <= SETTLEMENT_WINDOW_DAYS,
      )
      const cardTotal = round(matching.reduce((s, t) => s + t.amount, 0))
      const settled = round(Math.abs(m.amount))
      const diff = round(settled - cardTotal)
      const status: 'matched' | 'mismatch' | 'no_card_data' = !matching.length
        ? 'no_card_data'
        : Math.abs(diff) <= ROUND_TOLERANCE_ILS
          ? 'matched'
          : 'mismatch'
      return { card, date: m.date, settled, cardTotal, diff, status }
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  return { version, cycleStartDay, latestMonth, months, budgets, flagged, reconciliation }
}
