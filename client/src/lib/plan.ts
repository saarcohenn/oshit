import type { Goal, Income, PlannedChange, Transaction } from '../types'
import { transactionMonth } from './analytics'

/** הכנסה צפויה בחודש נתון: כל הקבועות + החד-פעמיות שמשויכות לאותו חודש */
export function activeInMonth(i: Income, month: string): boolean {
  if (i.kind !== 'recurring') return i.month === month
  // הכנסה קבועה חלה מהחודש שהוגדר ואילך. בלי גבולות היא חלה תמיד,
  // וזו ההתנהגות שהייתה קודם — נשמרת כברירת מחדל לנתונים ישנים
  if (i.fromMonth && month < i.fromMonth) return false
  if (i.toMonth && month > i.toMonth) return false
  return true
}

export function incomeForMonth(incomes: Income[], month: string): number {
  return incomes.reduce((sum, i) => (activeInMonth(i, month) ? sum + i.amount : sum), 0)
}

/** סדרת ההכנסה לאורך חודשים — הבסיס לגרף */
export function incomeSeries(incomes: Income[], months: string[]) {
  return months.map((month) => ({ month, total: incomeForMonth(incomes, month) }))
}

export function recurringIncome(incomes: Income[]): number {
  return incomes.filter((i) => i.kind === 'recurring').reduce((s, i) => s + i.amount, 0)
}

/**
 * החודש שאליו היעד מכוון, בין אם נקבע לו תאריך מדויק ובין אם רק חודש.
 * כל חישוב שמסתכל על "מתי" חייב לעבור דרך כאן — אחרת יעד עם תאריך מדויק
 * ייראה כאילו אין לו מועד בכלל.
 */
export function goalDueMonth(goal: Goal): string | undefined {
  return goal.targetDate ? goal.targetDate.slice(0, 7) : goal.targetMonth
}

export interface GoalProgress {
  goal: Goal
  /** תשלומים שאותרו בעסקאות בפועל דרך הקטגוריה המקושרת או שיוך ידני */
  paidFromTransactions: number
  /** סך ששולם — אוטומטי + ידני */
  paid: number
  remaining: number
  percent: number
  /** מספר החודשים שנותרו עד חודש היעד, כולל החודש הנוכחי */
  monthsLeft: number | null
  /** כמה צריך להפריש כל חודש כדי להגיע ליעד בזמן */
  monthlyNeeded: number | null
  overdue: boolean
}

/**
 * מחשב התקדמות ליעד.
 * תשלומים נספרים משני מקורות: עסקאות ששויכו ליעד ידנית, ועסקאות בקטגוריה המקושרת.
 * שיוך ידני גובר — עסקה ששויכה ליעד אחר לא תיספר כאן גם אם הקטגוריה מתאימה.
 */
export function goalProgress(
  goal: Goal,
  transactions: Transaction[],
  goalIdByTx: Record<string, string | undefined>,
  currentMonth: string,
): GoalProgress {
  const related = transactionsForGoal(goal, transactions, goalIdByTx)
  const paidFromTransactions = related.reduce((s, t) => s + t.amount, 0)

  const paid = paidFromTransactions + goal.paidManual
  // יעד שסומן כהושלם אינו דורש עוד הפרשה, גם אם על הנייר נותרה יתרה —
  // לרוב סימן שההפרש שולם ממקור שאינו מנוהל כאן
  const remaining = goal.done ? 0 : Math.max(0, goal.targetAmount - paid)
  const percent = goal.targetAmount > 0 ? Math.min(100, Math.round((paid / goal.targetAmount) * 100)) : 0

  let monthsLeft: number | null = null
  let overdue = false
  const due = goalDueMonth(goal)
  if (due && !goal.done) {
    monthsLeft = monthsBetween(currentMonth, due)
    if (monthsLeft < 0) {
      overdue = true
      monthsLeft = 0
    }
  }

  const monthlyNeeded =
    monthsLeft === null ? null : monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining

  return { goal, paidFromTransactions, paid, remaining, percent, monthsLeft, monthlyNeeded, overdue }
}

/**
 * העסקאות שנספרות ליעד.
 * שני מקורות: עסקה ששויכה ליעד ידנית, ועסקה בקטגוריה המקושרת שלא שויכה לשום יעד אחר.
 * לכן הוצאות ירח דבש יכולות להגיע מקטגוריות שונות — טיסה, מלון, וגם עסקה
 * שסווגה כ"מסעדות" אבל שויכה ידנית ליעד.
 */
export function transactionsForGoal(
  goal: Goal,
  transactions: Transaction[],
  goalIdByTx: Record<string, string | undefined>,
): Transaction[] {
  return transactions.filter((t) => {
    const assigned = goalIdByTx[t.id]
    if (assigned) return assigned === goal.id
    return !!goal.linkedCategory && t.category === goal.linkedCategory
  })
}

/** מספר החודשים מ-from עד to ועד בכלל. אותו חודש => 1 */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  if (!fy || !ty) return 0
  return (ty - fy) * 12 + (tm - fm) + 1
}

export function addMonths(month: string, count: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + count
  const year = Math.floor(total / 12)
  const monthIdx = total % 12
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`
}

/** ההפרש החודשי שהשינוי המתוכנן ייצור. חיובי = חיסכון */
export function changeSaving(change: PlannedChange): number {
  return change.currentMonthly - change.futureMonthly
}

/** ההוצאה החודשית מהשינויים המתוכננים, כפי שהיא בחודש מסוים */
export function plannedChangeCost(changes: PlannedChange[], month: string): number {
  return changes.reduce(
    (sum, c) => sum + (month >= c.fromMonth ? c.futureMonthly : c.currentMonthly),
    0,
  )
}

export interface MonthlyPicture {
  income: number
  expenses: number
  /** מה שנשאר בסוף החודש לפני הפרשה ליעדים */
  net: number
  /** סך ההפרשה החודשית הדרושה לכל היעדים */
  goalsMonthly: number
  /** מה שנשאר אחרי ההפרשה ליעדים */
  free: number
  savingRate: number
}

export function monthlyPicture(
  incomes: Income[],
  transactions: Transaction[],
  goalsMonthly: number,
  month: string,
): MonthlyPicture {
  const income = incomeForMonth(incomes, month)
  const expenses = transactions
    .filter((t) => transactionMonth(t) === month)
    .reduce((s, t) => s + t.amount, 0)
  const net = income - expenses
  return {
    income,
    expenses,
    net,
    goalsMonthly,
    free: net - goalsMonthly,
    savingRate: income > 0 ? Math.round((net / income) * 100) : 0,
  }
}
