import * as XLSX from 'xlsx'
import type { AppState } from '../types'
import { getLang, tr } from './i18n'

/**
 * עסקאות ותנועות עו"ש לקובץ Excel — לרואה חשבון, או לגיליון משלכם.
 *
 * נטען בייבוא דינמי בלבד, כדי ש-xlsx לא ייכנס לחבילה הראשית. כל תא נכתב
 * כמחרוזת או מספר ולא כנוסחה, ולכן בית עסק ששמו מתחיל ב-"=" לא יורץ כנוסחה.
 */
export function exportHouseholdExcel(state: AppState, householdName: string) {
  const categoryName = new Map(state.categories.map((c) => [c.id, c.name]))

  const transactions = [...state.transactions]
    .sort((a, b) => b.chargeDate.localeCompare(a.chargeDate))
    .map((t) => ({
      [tr('תאריך')]: t.date,
      [tr('תאריך חיוב')]: t.chargeDate,
      [tr('בית עסק')]: t.merchant,
      [tr('סכום')]: t.amount,
      [tr('מטבע')]: t.currency,
      [tr('קטגוריה')]: categoryName.get(t.category) ?? t.category,
      [tr('כרטיס')]: t.card,
      [tr('תשלום')]: t.installment ? `${t.installment.current}/${t.installment.total}` : '',
    }))

  const movements = [...state.accountMovements]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => ({
      [tr('תאריך')]: m.date,
      [tr('תיאור')]: m.description,
      [tr('סכום')]: m.amount,
      [tr('יתרה')]: m.balance ?? '',
      [tr('אסמכתה')]: m.reference,
    }))

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(transactions), tr('עסקאות').slice(0, 31))
  if (movements.length) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(movements), tr('עובר ושב').slice(0, 31))
  }
  // גיליון מימין לשמאל כשהממשק בעברית — כך Excel פותח אותו כמו שהוא נראה כאן
  if (getLang() === 'he') book.Workbook = { Views: [{ RTL: true }] }

  const safeName = householdName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'oshit'
  XLSX.writeFile(book, `${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
