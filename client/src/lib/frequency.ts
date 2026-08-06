import type { Frequency } from '../types'

export const FREQUENCIES: Frequency[] = [
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'yearly',
  'oneoff',
]

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'כל חודש',
  bimonthly: 'כל חודשיים',
  quarterly: 'כל שלושה חודשים',
  semiannual: 'כל חצי שנה',
  yearly: 'פעם בשנה',
  oneoff: 'חד-פעמי',
}

export const FREQUENCY_SHORT: Record<Frequency, string> = {
  monthly: 'חודשי',
  bimonthly: 'דו-חודשי',
  quarterly: 'רבעוני',
  semiannual: 'חצי-שנתי',
  yearly: 'שנתי',
  oneoff: 'חד-פעמי',
}

/** כמה חודשים עוברים בין חיוב לחיוב */
export const MONTHS_PER_PERIOD: Record<Frequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  oneoff: 1,
}

/**
 * העלות החודשית האמיתית של חיוב.
 * חשבון חשמל של 700 ₪ שמגיע כל חודשיים שווה 350 ₪ בחודש,
 * וזה המספר שצריך להשוות מולו כשקובעים תקציב חודשי.
 */
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  if (frequency === 'oneoff') return 0
  return amount / MONTHS_PER_PERIOD[frequency]
}

/** העלות השנתית של חיוב חוזר */
export function yearlyEquivalent(amount: number, frequency: Frequency): number {
  if (frequency === 'oneoff') return amount
  return (amount * 12) / MONTHS_PER_PERIOD[frequency]
}

/** '2026-08' + כל חודשיים => '2026-10' */
export function nextChargeMonth(lastMonth: string, frequency: Frequency): string | null {
  if (frequency === 'oneoff') return null
  const [y, m] = lastMonth.split('-').map(Number)
  if (!y || !m) return null
  const total = y * 12 + (m - 1) + MONTHS_PER_PERIOD[frequency]
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** האם צפוי חיוב מבית העסק הזה בחודש הנתון */
export function isExpectedIn(lastMonth: string, frequency: Frequency, month: string): boolean {
  if (frequency === 'oneoff') return false
  const diff = monthDiff(lastMonth, month)
  if (diff <= 0) return false
  return diff % MONTHS_PER_PERIOD[frequency] === 0
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}
