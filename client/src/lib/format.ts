const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/** ₪1,234 — ללא אגורות, כי בתצוגת תקציב הן רק רעש */
export function ils(n: number): string {
  return '₪' + Math.round(n).toLocaleString('he-IL')
}

/** ₪1,234.56 — לשורות עסקה בודדות */
export function ilsExact(n: number): string {
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** '2026-08' => 'אוגוסט 2026' */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const idx = Number(month) - 1
  if (Number.isNaN(idx) || !HEBREW_MONTHS[idx]) return key
  return `${HEBREW_MONTHS[idx]} ${year}`
}

/** '2026-08' => 'אוג׳ 26' — לתוויות בגרפים */
export function monthLabelShort(key: string): string {
  const [year, month] = key.split('-')
  const idx = Number(month) - 1
  if (Number.isNaN(idx) || !HEBREW_MONTHS[idx]) return key
  return `${HEBREW_MONTHS[idx].slice(0, 3)}׳ ${year.slice(2)}`
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

/** 1 => 'עסקה אחת', 5 => '5 עסקאות' */
export function txCount(n: number): string {
  return n === 1 ? 'עסקה אחת' : `${n.toLocaleString('he-IL')} עסקאות`
}

/** 1 => 'קטגוריה אחת', 3 => '3 קטגוריות' */
export function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? `${singular} אחת` : `${n.toLocaleString('he-IL')} ${pluralForm}`
}
