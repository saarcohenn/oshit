import { getLang, tr } from './i18n'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** ספרות מקובצות לפי השפה הפעילה. השקל נשאר השקל בשתי השפות */
const locale = () => (getLang() === 'he' ? 'he-IL' : 'en-IL')

const months = () => (getLang() === 'he' ? HEBREW_MONTHS : ENGLISH_MONTHS)

/** ₪1,234 — ללא אגורות, כי בתצוגת תקציב הן רק רעש */
export function ils(n: number): string {
  return '₪' + Math.round(n).toLocaleString(locale())
}

/** ₪1,234.56 — לשורות עסקה בודדות */
export function ilsExact(n: number): string {
  return '₪' + n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** '2026-08' => 'אוגוסט 2026' / 'August 2026' */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const idx = Number(month) - 1
  const names = months()
  if (Number.isNaN(idx) || !names[idx]) return key
  return `${names[idx]} ${year}`
}

/** '2026-08' => 'אוג׳ 26' / 'Aug 26' — לתוויות בגרפים */
export function monthLabelShort(key: string): string {
  const [year, month] = key.split('-')
  const idx = Number(month) - 1
  const names = months()
  if (Number.isNaN(idx) || !names[idx]) return key
  const short = names[idx].slice(0, 3)
  return getLang() === 'he' ? `${short}׳ ${year.slice(2)}` : `${short} ${year.slice(2)}`
}

/** '2026-08-10' => '2026-08' */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** '2026-08-10' => '10.08.26' */
export function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}.${m}.${y.slice(2)}`
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

/** 1 => 'עסקה אחת' / 'one transaction', 5 => '5 עסקאות' / '5 transactions' */
export function txCount(n: number): string {
  if (getLang() === 'he') {
    return n === 1 ? 'עסקה אחת' : `${n.toLocaleString('he-IL')} עסקאות`
  }
  return n === 1 ? 'one transaction' : `${n.toLocaleString('en-IL')} transactions`
}

/**
 * ריבוי. בעברית נאמר "קטגוריה אחת" ובאנגלית "one category", ולכן שתי הצורות
 * מגיעות מהקורא ולא נגזרות כאן: אין דרך לגזור ריבוי אנגלי משם עברי.
 */
export function plural(n: number, singular: string, pluralForm: string): string {
  const one = getLang() === 'he' ? `${tr(singular)} אחת` : `one ${tr(singular)}`
  return n === 1 ? one : `${n.toLocaleString(locale())} ${tr(pluralForm)}`
}
