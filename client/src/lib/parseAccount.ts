import * as XLSX from 'xlsx'
import type { AccountMovement, MovementKind } from '../types'
import { toIso } from './excelDate'

type Cell = string | number | Date | null
type Row = Cell[]

/** כותרות בקובץ העו"ש נושאות רווחים מיותרים וסימן ₪, ולכן ההשוואה נעשית אחרי נרמול */
const norm = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').replace(/₪/g, '').trim()

/**
 * איתור עמודות לפי הכותרת.
 *
 * למקטע התנועות שבוצעו ולמקטע העתידי יש כותרות שונות במקצת
 * ("₪ זכות/חובה" מול "₪ זכות/חובה ב", "₪ יתרה" מול "₪ יתרה משוערת"),
 * ולכן ההתאמה היא לפי הכלה ולא לפי שוויון.
 */
const COLUMNS = {
  date: (h: string) => h === 'תאריך',
  valueDate: (h: string) => h === 'יום ערך',
  description: (h: string) => h === 'תיאור התנועה',
  amount: (h: string) => h.includes('זכות/חובה'),
  balance: (h: string) => h.includes('יתרה'),
  reference: (h: string) => h === 'אסמכתה',
  channel: (h: string) => h === 'ערוץ ביצוע',
} as const

type ColumnMap = Partial<Record<keyof typeof COLUMNS, number>>

function mapColumns(row: Row): ColumnMap | null {
  const cells = row.map(norm)
  const map: ColumnMap = {}
  for (const [key, matches] of Object.entries(COLUMNS)) {
    const idx = cells.findIndex((c) => c && matches(c))
    if (idx !== -1) map[key as keyof typeof COLUMNS] = idx
  }
  // תיאור וסכום הם המינימום שבלעדיו אין תנועה
  return map.description != null && map.amount != null ? map : null
}

/**
 * סיווג התנועה לפי התיאור.
 *
 * הסדר מחייב — הבדיקה הראשונה שמתאימה מנצחת. שלושת הסוגים שבראש הרשימה
 * הם אלה שאסור שייספרו כהוצאה, ולכן הם נבדקים לפני כל השאר.
 */
function classify(description: string, amount: number, ownAccountPatterns: string[]): MovementKind {
  const text = description.trim()

  // התחשבנות הכרטיס. אותו כסף כבר קיים כעסקאות פרטניות מקובץ הכרטיס.
  if (/^חיוב לכרטיס/.test(text)) return 'card_settlement'

  // הפקדה לברוקר או פעילות בניירות ערך — הגדלת הון, לא הוצאה
  if (/ני"ע|נייר ערך|מיטב טרייד|אקסלנס|פסגות/.test(text)) return 'investment'

  if (/משכורת|שכר עבודה/.test(text)) return 'salary'

  /*
   * העברה בין חשבונות של אותו משק בית.
   *
   * "העברה" לבדה אינה מספיקה: הקובץ מכיל גם העברות מצד שלישי שהן הכנסה
   * אמיתית (תשלום עבור עבודה) וגם העברות לאנשים אחרים. ההבחנה דורשת
   * לדעת מי "אנחנו", וזה נתון של המשתמש — ולכן הוא מוזרם מבחוץ ואינו
   * מקובע בקוד. בלי הגדרה כזו ההעברה נופלת לסיווג לפי הסימן.
   */
  if (/^הע(\.|ברה)/.test(text) && ownAccountPatterns.some((p) => p && text.includes(p))) return 'transfer'

  if (/^עמלת|עמלות|ניכוי מס|תשלום מס במקור|ריבית/.test(text)) return 'fee'

  if (/משיכת מזומן|מכספומט|הפקדת מזומן/.test(text)) return 'cash'

  if (/שיק/.test(text)) return 'cheque'

  return amount < 0 ? 'expense' : 'income'
}

/** גיבוב 32 סיביות, יציב בין הרצות. המקבילה שלו לעסקאות נמצאת ב-identity.ts */
function hash(raw: string): string {
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = (h << 5) - h + raw.charCodeAt(i)
    h |= 0
  }
  return `m${(h >>> 0).toString(36)}`
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

export interface AccountParseResult {
  movements: AccountMovement[]
  /** שורות שנקראו אך נזרקו: שורות סיכום, שורות בלי תאריך או בלי סכום */
  skipped: number
  format: 'account' | 'unknown'
}

export interface AccountParseOptions {
  /**
   * שמות או מספרי חשבון ששייכים למשק הבית. העברה שמכילה אחד מהם מסווגת
   * כהעברה פנימית ואינה נספרת כהכנסה או כהוצאה.
   */
  ownAccountPatterns?: string[]
}

/**
 * קורא קובץ "עובר ושב" של הבנק.
 *
 * לקובץ שני מקטעים: תנועות שבוצעו, ואחריהן "תנועות עתידיות" עם כותרת
 * משלהן ועם יתרה משוערת. השני מסומן pending ואינו נספר, כי הכסף עוד לא יצא.
 *
 * עמודת "עמלה" בקובץ אינה מכילה עמלה אלא את סוג הערוץ ("ערוץ ישיר"),
 * ולכן היא אינה נקראת כלל.
 */
export function parseAccountXlsx(
  buffer: ArrayBuffer,
  fileName: string,
  options: AccountParseOptions = {},
): AccountParseResult {
  const ownAccountPatterns = options.ownAccountPatterns ?? []
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const movements: AccountMovement[] = []
  const importedAt = new Date().toISOString()
  let skipped = 0
  let format: AccountParseResult['format'] = 'unknown'
  const seen = new Set<string>()

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
    })

    let columns: ColumnMap | null = null
    let pending = false

    for (const row of rows) {
      if (!row || row.every((c) => c == null || String(c).trim() === '')) continue

      // שורת המעבר למקטע העתידי. הכותרת שאחריה תחליף את מיפוי העמודות.
      if (norm(row[0]) === 'תנועות עתידיות') {
        pending = true
        columns = null
        continue
      }

      const header = mapColumns(row)
      if (header) {
        columns = header
        format = 'account'
        continue
      }
      if (!columns) continue

      const at = (key: keyof typeof COLUMNS): Cell => {
        const idx = columns![key]
        return idx == null ? null : (row[idx] ?? null)
      }

      const date = toIso(at('date'))
      const amount = toNumber(at('amount'))
      const description = String(at('description') ?? '').trim()
      // שורת סיכום או שורת המשך: בלי תאריך, סכום ותיאור אין תנועה
      if (!date || amount == null || !description) {
        skipped++
        continue
      }

      const reference = String(at('reference') ?? '').trim()
      const id = hash([date, reference, amount, description].join('|'))
      // אותה אסמכתה פעמיים היא ייבוא חוזר של אותו קובץ, לא תנועה חדשה
      if (seen.has(id)) {
        skipped++
        continue
      }
      seen.add(id)

      movements.push({
        id,
        date,
        valueDate: toIso(at('valueDate')) || date,
        description,
        amount,
        balance: toNumber(at('balance')),
        reference,
        channel: String(at('channel') ?? '').trim(),
        kind: classify(description, amount, ownAccountPatterns),
        pending,
        importedAt,
        sourceFile: fileName,
      })
    }
  }

  return { movements, skipped, format }
}
