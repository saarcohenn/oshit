import * as XLSX from 'xlsx'
import type { Category, Installment, Transaction } from '../types'
import { buildCategoryIndex, guessCategory } from './categories'
import { normalizeMerchant } from './merchant'
import { OccurrenceCounter, makeTransactionId, type Sighting } from './identity'

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
  // ארבע ספרות נבדקות ראשונות: החלופה הדו-ספרתית הייתה בולעת את שתי הספרות
  // הראשונות של שנה מלאה, ו-"21/07/2026" הפך ל-2020
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/)
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

/**
 * סימני מטבע כפי שהבנק כותב אותם בתוך הסכום: "₪500.00", "$784.49",
 * "€27.35", "JP120,560.00". הבדיקה לפי סדר, כי סימן אחד בלבד מופיע בשורה.
 */
const MONEY_PREFIX: Array<[string, string]> = [
  ['₪', 'ILS'],
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['JP', 'JPY'],
]

/**
 * מפריד סכום למספר ולמטבע.
 *
 * הערך הגולמי נושא את המספר, והטקסט המעוצב נושא את הסימן — לכן שניהם
 * נדרשים. מטבע שלא זוהה מוחזר כ-null, כדי שהקורא יוכל ליפול למקור אחר.
 */
function parseMoney(value: unknown, formatted = ''): { value: number; currency: string | null } {
  const text = String(value ?? '').trim()
  const display = String(formatted ?? '').trim()
  const source = display || text
  const hit = MONEY_PREFIX.find(([symbol]) => source.includes(symbol))
  const numeric = typeof value === 'number' ? value : toNumber(text || display)
  return { value: numeric, currency: hit ? hit[1] : null }
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
  const occurrences = new OccurrenceCounter()
  const importedAt = new Date().toISOString()

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: true, defval: null })
    /*
     * אותו גיליון גם כטקסט מעוצב.
     *
     * בקובץ של הבנק עמודת "מטבע העסקה" ריקה בכל השורות, והמטבע מקודד
     * בעיצוב התא ולא בערכו: הערך הגולמי של "$784.49" הוא המספר 784.49
     * בלבד. הקריאה המעוצבת היא המקום היחיד שבו הסימן שורד.
     */
    const textRows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: false, defval: '' })
    const calCard = parseCalCard(rows)

    let header: string[] | null = null
    let sheetFormat: 'bank' | 'cal' | null = null

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const textRow = textRows[r] ?? []
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
      /** אותו תא כפי שהוא מוצג — נחוץ רק כדי לקרוא את סימן המטבע */
      const getText = (col: string): string => {
        const idx = header!.indexOf(col)
        return idx === -1 ? '' : String(textRow[idx] ?? '')
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

      const merchantKey = normalizeMerchant(merchant)
      const category = guessCategory(merchant, categories)
      const kind = String(get(sheetFormat === 'cal' ? CAL_COL.kind : COL.kind) ?? '').trim()

      let amount: number
      let originalAmount: number
      let currency: string
      let installment: Installment | null
      let chargeDate: string

      if (sheetFormat === 'cal') {
        amount = toNumber(get(CAL_COL.amount))
        originalAmount = parsedNotes.originalAmount ?? amount
        currency = parsedNotes.currency ?? 'ILS'
        chargeDate = toIso(get(CAL_COL.chargeDate))
        installment = null
      } else {
        /*
         * בקובץ של הבנק המטבע אינו בעמודה משלו — עמודת "מטבע העסקה" ריקה
         * בכל השורות, והסימן יושב בתוך הסכום עצמו: ‎₪500.00 לצד ‎$784.49.
         * בלי לקרוא אותו משם, חיוב של 784 דולר נרשם כ-784 שקלים.
         */
        const charge = parseMoney(get(COL.amount), getText(COL.amount))
        const original = parseMoney(get(COL.originalAmount), getText(COL.originalAmount))

        /*
         * הוראת קבע שטרם חויבה מגיעה בלי סכום חיוב ובלי תאריך חיוב, אבל
         * סכום העסקה שלה כן ידוע. עד עכשיו היא נזרקה בשקט — בקובץ הזה
         * תשעה חיובים קבועים (פרי טיוי, מים, קרן מכבי) פשוט לא נכנסו.
         */
        const posted = charge.value !== 0
        amount = posted ? charge.value : original.value
        originalAmount = original.value || amount
        // המטבע מתאר את הסכום שנרשם. עדיפות למטבע של סכום העסקה, שהוא מה
        // ששני המקורות מסכימים עליו ולכן מייצב את הזהות בין קבצים
        currency =
          original.currency ||
          charge.currency ||
          String(get(COL.currency) ?? '').trim() ||
          'ILS'
        chargeDate = toIso(get(COL.chargeDate))
        installment = parseInstallment(get(COL.details))
      }

      // חיוב אפס מופיע כשהעסקה מיוחסת לכרטיס משנה ואינה נגבית בפועל,
      // וכן כשעסקה במטבע זר בחיוב מיידי מגיעה בלי סכום כלל
      if (!amount) {
        skipped++
        continue
      }

      /*
       * הזהות נגזרת מהכרטיס, התאריך, המטבע והסכום בלבד — לא משם בית העסק.
       * הבנק מקצר שמות ל-14 תווים וכאל לא, וכל עוד השם היה חלק מהזהות אותה
       * קנייה קיבלה שני מזהים שונים משני המקורות ונספרה פעמיים.
       */
      const parts = {
        card,
        date,
        currency,
        amount,
        originalAmount: originalAmount || amount,
      }

      /*
       * מה שמבדיל בין שורות זהות באותה קבוצה.
       *
       * שני המקורות מתארים תשלומים אחרת: הבנק כותב "3/10" במפורש, וכאל
       * מדפיסה שורה זהה לכל תשלום שכבר חויב — בלי מספר ובלי מועד חיוב.
       * לכן מספר התשלום הוא המדד המשותף: אצל כאל הוא מיקום השורה בקבוצה,
       * ואצל הבנק הוא נקרא מהעמודה. בלי האיחוד הזה תשלום 4 שהגיע בקובץ של
       * החודש הבא היה מקבל את המזהה של תשלום 3 ונבלע כאילו כבר קיים.
       */
      let index: number
      if (sheetFormat === 'cal' && parsedNotes.installmentTotal) {
        index = occurrences.next(parts).occurrence
        installment = { current: index + 1, total: parsedNotes.installmentTotal }
        // החיוב מתפרס חודש לכל תשלום, אחרת כל עשרת התשלומים נופלים על חודש
        // הרכישה ומנפחים אותו פי עשרה
        if (!chargeDate) chargeDate = addMonths(date, index)
      } else if (installment) {
        index = installment.current - 1
      } else {
        index = occurrences.next(parts).occurrence
      }

      const id = makeTransactionId(parts, index)

      transactions.push({
        id,
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
        sightings: [{ file: fileName, format: sheetFormat, importedAt } satisfies Sighting],
      })
    }
  }

  return { transactions, skipped, format }
}
