import type { Transaction } from '../types'
import { transactionMonth } from './analytics'
import { addMonths } from './plan'

export type MonthStatus = 'full' | 'partial' | 'missing'

export interface MonthCoverage {
  month: string
  status: MonthStatus
  count: number
  total: number
}

export interface Coverage {
  /** כל החודשים בטווח, כולל אלה שאין בהם נתונים */
  months: MonthCoverage[]
  earliest: string | null
  latest: string | null
  missing: string[]
  partial: string[]
}

/**
 * בודק אילו חודשים באמת מכוסים בנתונים.
 * קובץ של חודש אחד גורר איתו כמה עסקאות בודדות מחודשים קודמים
 * (עסקאות חו"ל שחויבו מיידית), ולכן חודש עם מעט מאוד עסקאות מסומן כחלקי
 * ולא כחודש מלא — אחרת נראה כאילו יש היסטוריה שאין.
 */
export function monthCoverage(transactions: Transaction[]): Coverage {
  if (!transactions.length) {
    return { months: [], earliest: null, latest: null, missing: [], partial: [] }
  }

  const stats = new Map<string, { count: number; total: number }>()
  for (const t of transactions) {
    const m = transactionMonth(t)
    const entry = stats.get(m) ?? { count: 0, total: 0 }
    entry.count++
    entry.total += t.amount
    stats.set(m, entry)
  }

  const present = [...stats.keys()].sort()
  const earliest = present[0]
  const latest = present[present.length - 1]
  const maxCount = Math.max(...[...stats.values()].map((s) => s.count))

  const months: MonthCoverage[] = []
  for (let m = earliest; m <= latest; m = addMonths(m, 1)) {
    const entry = stats.get(m)
    if (!entry) {
      months.push({ month: m, status: 'missing', count: 0, total: 0 })
    } else {
      months.push({
        month: m,
        status: entry.count < maxCount * 0.3 ? 'partial' : 'full',
        count: entry.count,
        total: entry.total,
      })
    }
  }

  return {
    months,
    earliest,
    latest,
    missing: months.filter((m) => m.status === 'missing').map((m) => m.month),
    partial: months.filter((m) => m.status === 'partial').map((m) => m.month),
  }
}

/** רשימת החודשים מ-from עד to ועד בכלל */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}
