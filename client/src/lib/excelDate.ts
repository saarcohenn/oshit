import * as XLSX from 'xlsx'

/**
 * ממיר תאריך בפורמט dd/mm/yyyy או dd/mm/yy, אובייקט Date או מספר סידורי של אקסל ל-ISO.
 * כאל כותבת שנה דו-ספרתית ("14/8/26"), ולכן שנה קצרה נפתחת סביב ציר 2000.
 *
 * משותף לפרסר כרטיסי האשראי ולפרסר העו"ש: תאריך שגוי ביום אחד מזיז עסקה
 * בין חודשים, ולכן הלוגיקה הזו חיה במקום אחד בלבד.
 */
export function toIso(value: unknown): string {
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
