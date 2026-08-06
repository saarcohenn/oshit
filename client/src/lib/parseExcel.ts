import * as XLSX from 'xlsx'
import type { Category, Installment, Transaction } from '../types'
import { buildCategoryIndex, guessCategory } from './categories'
import { normalizeMerchant } from './merchant'

/** כותרות העמודות בקובץ "כרטיסי אשראי" של הבנק */
const COL = {
  card: 'כרטיס',
  merchant: 'בית עסק',
  date: 'תאריך עסקה',
  originalAmount: 'סכום העסקה',
  kind: 'סוג העסקה',
  details: 'פירוט',
  chargeDate: 'תאריך החיוב',
  amount: 'סכום החיוב',
  currency: 'מטבע העסקה',
} as const

type Row = (string | number | Date | null)[]

function isHeaderRow(row: Row): boolean {
  const cells = row.map((c) => String(c ?? '').trim())
  return cells.includes(COL.card) && cells.includes(COL.merchant) && cells.includes(COL.amount)
}

/** ממיר תאריך בפורמט dd/mm/yyyy, אובייקט Date או מספר סידורי של אקסל ל-ISO */
function toIso(value: unknown): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`
  }
  const text = String(value).trim()
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return ''
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** "3/10" => { current: 3, total: 10 } */
function parseInstallment(details: unknown): Installment | null {
  const match = String(details ?? '').trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)
  if (!match) return null
  const current = Number(match[1])
  const total = Number(match[2])
  if (!total || total < 2) return null
  return { current, total }
}


/**
 * מזהה דטרמיניסטי לזיהוי כפילויות בין קבצים.
 *
 * תאריך החיוב במכוון אינו חלק מהמזהה: עסקה שטרם חויבה מופיעה בקובץ של החודש הזה
 * ללא תאריך חיוב, ובקובץ של החודש הבא עם תאריך חיוב — זו אותה עסקה.
 * מאותה סיבה עסקה במטבע זר מזוהה לפי הסכום המקורי, כי סכום החיוב בשקלים
 * הוא הערכה שמשתנה עד למועד החיוב בפועל.
 * מספר התשלום כן נכלל, אחרת כל התשלומים של אותה עסקה היו נראים זהים.
 */
function makeId(parts: (string | number)[]): string {
  const raw = parts.join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  return `t${(hash >>> 0).toString(36)}_${Math.abs(hash % 9973)}`
}

export interface ParseResult {
  transactions: Transaction[]
  /** עסקאות שנקראו אך נזרקו (סכום 0, שורות סיכום) */
  skipped: number
}

/**
 * קורא קובץ אקסל של פירוט כרטיסי אשראי.
 * הקובץ מכיל כמה טבלאות ברצף (חיוב קרוב / חיוב מיידי / עסקאות שחויבו),
 * כל אחת עם שורת כותרת משלה, ולכן הסריקה מזהה כותרות תוך כדי מעבר על השורות.
 */
export function parseCreditCardXlsx(
  buffer: ArrayBuffer,
  fileName: string,
  categories: Category[],
): ParseResult {
  const cats = buildCategoryIndex(categories)
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const transactions: Transaction[] = []
  let skipped = 0
  // שתי עסקאות זהות לחלוטין באותו יום הן אפשרות אמיתית (שתי קניות באותו סכום),
  // ולכן מונה החזרות מבדיל ביניהן מבלי לפגוע בזיהוי כפילויות בין קבצים
  const occurrences = new Map<string, number>()

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: true, defval: null })

    let header: string[] | null = null

    for (const row of rows) {
      if (!row || row.every((c) => c == null || String(c).trim() === '')) continue

      if (isHeaderRow(row)) {
        header = row.map((c) => String(c ?? '').trim())
        continue
      }
      if (!header) continue

      const get = (col: string): unknown => {
        const idx = header!.indexOf(col)
        return idx === -1 ? null : row[idx]
      }

      const merchant = String(get(COL.merchant) ?? '').trim()
      const card = String(get(COL.card) ?? '').trim()
      // שורות סיכום ותתי-כותרות אין בהן כרטיס ובית עסק גם יחד
      if (!merchant || !card) {
        skipped++
        continue
      }

      const date = toIso(get(COL.date))
      if (!date) {
        skipped++
        continue
      }

      const amount = toNumber(get(COL.amount))
      const originalAmount = toNumber(get(COL.originalAmount))
      // חיוב 0 מופיע כשהעסקה מיוחסת לכרטיס משנה ואינה נגבית בפועל
      const effectiveAmount = amount || 0
      if (effectiveAmount === 0) {
        skipped++
        continue
      }

      const chargeDate = toIso(get(COL.chargeDate)) || date
      const merchantKey = normalizeMerchant(merchant)
      const category = guessCategory(merchant, categories)
      const installment = parseInstallment(get(COL.details))
      const currency = String(get(COL.currency) ?? 'ILS').trim() || 'ILS'

      const identity = [
        card,
        merchantKey,
        date,
        currency,
        currency === 'ILS' ? effectiveAmount : originalAmount,
        installment ? installment.current : '',
      ].join('|')
      const seen = occurrences.get(identity) ?? 0
      occurrences.set(identity, seen + 1)

      transactions.push({
        id: makeId([identity, seen]),
        card,
        merchant: merchant.replace(/\s+/g, ' ').trim(),
        merchantKey,
        date,
        chargeDate,
        amount: effectiveAmount,
        originalAmount: originalAmount || effectiveAmount,
        currency,
        kind: String(get(COL.kind) ?? '').trim(),
        installment,
        category,
        necessity: cats.byId(category).necessity,
        source: fileName,
      })
    }
  }

  return { transactions, skipped }
}
