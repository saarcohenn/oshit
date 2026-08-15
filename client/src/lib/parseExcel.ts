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

/**
 * כותרות הקובץ של כאל ("פירוט עסקאות וזיכויים").
 * הכותרות שם מכילות שבירת שורה בתוך התא, ולכן ההשוואה נעשית אחרי נרמול רווחים.
 */
const CAL_COL = {
  date: 'תאריך עסקה',
  merchant: 'שם בית עסק',
  amount: 'סכום בש"ח',
  amountUsd: 'סכום בדולר',
  chargeDate: 'מועד חיוב',
  kind: 'סוג עסקה',
  wallet: 'מזהה כרטיס בארנק דיגילטי',
  notes: 'הערות',
} as const

type Row = (string | number | Date | null)[]

/** כותרת בקובץ של כאל מכילה שבירת שורה; נרמול רווחים מאפשר השוואה אחת לשני הפורמטים */
const normalizeHeader = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

function isBankHeaderRow(row: Row): boolean {
  const cells = row.map(normalizeHeader)
  return cells.includes(COL.card) && cells.includes(COL.merchant) && cells.includes(COL.amount)
}

function isCalHeaderRow(row: Row): boolean {
  const cells = row.map(normalizeHeader)
  return cells.includes(CAL_COL.merchant) && cells.includes(CAL_COL.amount)
}

/**
 * ממיר תאריך בפורמט dd/mm/yyyy או dd/mm/yy, אובייקט Date או מספר סידורי של אקסל ל-ISO.
 * כאל כותבת שנה דו-ספרתית ("14/8/26"), ולכן שנה קצרה נפתחת סביב ציר 2000.
 */
function toIso(value: unknown): string {
  if (value == null || value === '') return ''
  // SheetJS גוזר תאריך ממספר סידורי ומחזיר לעיתים 23:59:20 של היום הקודם.
  // toISOString על ערך כזה מזיז את העסקה יום אחורה, ועסקה של ה-1 בחודש נופלת
  // לחודש הקודם. לכן מעגלים לחצות הקרובה לפי השעון המקומי ולא לפי UTC.
  if (value instanceof Date) {
    const wall = value.getTime() - value.getTimezoneOffset() * 60_000
    const day = new Date(Math.round(wall / 86_400_000) * 86_400_000)
    return day.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`
  }
  const text = String(value).trim()
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/)
  if (dmy) {
    const [, d, m, rawYear] = dmy
    const year = rawYear.length === 4 ? rawYear : String(Number(rawYear) + (Number(rawYear) >= 70 ? 1900 : 2000))
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return ''
}

/** מוסיף חודשים לתאריך ISO ומקצר יום שאינו קיים בחודש היעד (31 בינואר + חודש = 28/29 בפברואר) */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const base = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(d, lastDay))
  return base.toISOString().slice(0, 10)
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

const FX_SYMBOL: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '₪': 'ILS' }

/**
 * עמודת ההערות של כאל נושאת שני נתונים שאין להם עמודה משלהם:
 * מספר התשלומים ("עסקה ב-10 תשלומים") והסכום במטבע המקורי
 * ("סכום העסקה הוא 20.0 $"). המטבע מגיע כסימן או כקוד בן שלוש אותיות.
 */
function parseCalNotes(notes: string): {
  installmentTotal: number | null
  originalAmount: number | null
  currency: string | null
} {
  const text = notes.replace(/\s+/g, ' ').trim()
  const installments = text.match(/עסקה ב-(\d{1,3}) תשלומים/)
  const fx = text.match(/סכום העסקה הוא ([\d.,]+) ?([A-Z]{3}|[$€£₪])/)
  return {
    installmentTotal: installments ? Number(installments[1]) : null,
    originalAmount: fx ? toNumber(fx[1]) : null,
    currency: fx ? (FX_SYMBOL[fx[2]] ?? fx[2]) : null,
  }
}

/**
 * שורת הכותרת של כאל נושאת את זהות הכרטיס:
 * "פירוט עסקאות ל... לכרטיס ויזה 9687".
 * זה המקום היחיד בקובץ שבו הכרטיס מופיע, והוא מה שמפריד בין הקובץ של בן זוג אחד לשני.
 */
function parseCalCard(rows: Row[]): string {
  for (const row of rows.slice(0, 5)) {
    const text = String(row?.[0] ?? '').replace(/\s+/g, ' ').trim()
    const match = text.match(/לכרטיס\s+(.+?)\s*$/)
    if (match) return match[1]
  }
  return ''
}

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
  /** הפורמט שזוהה — מוצג במסך הייבוא כדי שברור מה נקרא */
  format: 'bank' | 'cal' | 'unknown'
}

/**
 * קורא קובץ אקסל של פירוט כרטיסי אשראי.
 *
 * שני פורמטים נתמכים: הקובץ של הבנק (כמה טבלאות ברצף, לכל אחת כותרת משלה)
 * והקובץ של כאל (טבלה אחת, כותרת אחת, זהות הכרטיס בשורת הכותרת העליונה).
 * הזיהוי נעשה לפי שורת הכותרת ולא לפי שם הקובץ, כי המשתמש משנה שמות קבצים.
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
  let format: ParseResult['format'] = 'unknown'
  // שתי עסקאות זהות לחלוטין באותו יום הן אפשרות אמיתית (שתי קניות באותו סכום),
  // ולכן מונה החזרות מבדיל ביניהן מבלי לפגוע בזיהוי כפילויות בין קבצים
  const occurrences = new Map<string, number>()

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: true, defval: null })
    const calCard = parseCalCard(rows)

    let header: string[] | null = null
    let sheetFormat: 'bank' | 'cal' | null = null

    for (const row of rows) {
      if (!row || row.every((c) => c == null || String(c).trim() === '')) continue

      if (isBankHeaderRow(row)) {
        header = row.map(normalizeHeader)
        sheetFormat = 'bank'
        format = 'bank'
        continue
      }
      if (isCalHeaderRow(row)) {
        header = row.map(normalizeHeader)
        sheetFormat = 'cal'
        format = 'cal'
        continue
      }
      if (!header || !sheetFormat) continue

      const get = (col: string): unknown => {
        const idx = header!.indexOf(col)
        return idx === -1 ? null : row[idx]
      }

      const merchant = String(get(sheetFormat === 'cal' ? CAL_COL.merchant : COL.merchant) ?? '').trim()
      if (!merchant) {
        skipped++
        continue
      }

      // בקובץ של הבנק הכרטיס יושב בכל שורה; בקובץ של כאל הוא נאמר פעם אחת למעלה
      const card = sheetFormat === 'cal' ? calCard || fileName : String(get(COL.card) ?? '').trim()
      if (!card) {
        skipped++
        continue
      }

      const date = toIso(get(sheetFormat === 'cal' ? CAL_COL.date : COL.date))
      if (!date) {
        skipped++
        continue
      }

      const notes = sheetFormat === 'cal' ? String(get(CAL_COL.notes) ?? '') : ''
      const parsedNotes = parseCalNotes(notes)

      const amount = toNumber(get(sheetFormat === 'cal' ? CAL_COL.amount : COL.amount))
      // עסקה במטבע זר בחיוב מיידי מגיעה מכאל בלי סכום בשקלים כלל —
      // שער ההמרה אינו בקובץ, והמצאת סכום גרועה מדילוג עליו
      if (amount === 0) {
        skipped++
        continue
      }

      const merchantKey = normalizeMerchant(merchant)
      const category = guessCategory(merchant, categories)
      const kind = String(get(sheetFormat === 'cal' ? CAL_COL.kind : COL.kind) ?? '').trim()

      let originalAmount: number
      let currency: string
      let installment: Installment | null
      let chargeDate: string

      if (sheetFormat === 'cal') {
        originalAmount = parsedNotes.originalAmount ?? amount
        currency = parsedNotes.currency ?? 'ILS'
        chargeDate = toIso(get(CAL_COL.chargeDate))
        installment = null
      } else {
        originalAmount = toNumber(get(COL.originalAmount))
        currency = String(get(COL.currency) ?? 'ILS').trim() || 'ILS'
        chargeDate = toIso(get(COL.chargeDate))
        installment = parseInstallment(get(COL.details))
      }

      const identity = [
        card,
        merchantKey,
        date,
        currency,
        currency === 'ILS' ? amount : originalAmount,
        installment ? installment.current : '',
      ].join('|')
      const seen = occurrences.get(identity) ?? 0
      occurrences.set(identity, seen + 1)

      if (sheetFormat === 'cal' && parsedNotes.installmentTotal) {
        // כאל מדפיסה שורה זהה לכל תשלום שכבר חויב, בלי מספר תשלום ובלי מועד חיוב.
        // מונה החזרות הוא לכן מספר התשלום, והחיוב מתפרס חודש לכל תשלום —
        // אחרת כל עשרת התשלומים היו נופלים על חודש הרכישה ומנפחים אותו פי עשרה.
        installment = { current: seen + 1, total: parsedNotes.installmentTotal }
        if (!chargeDate) chargeDate = addMonths(date, seen)
      }

      transactions.push({
        id: makeId([identity, seen]),
        card,
        merchant: merchant.replace(/\s+/g, ' ').trim(),
        merchantKey,
        date,
        chargeDate: chargeDate || date,
        amount,
        originalAmount: originalAmount || amount,
        currency,
        kind,
        installment,
        category,
        necessity: cats.byId(category).necessity,
        source: fileName,
      })
    }
  }

  return { transactions, skipped, format }
}
