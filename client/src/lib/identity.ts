/**
 * זהות של עסקה.
 *
 * שני מקורות מתארים את אותן עסקאות — קובץ הבנק וקובץ כאל — והמזהה חייב
 * לצאת זהה משניהם, אחרת אותה קנייה נספרת פעמיים.
 *
 * לכן המזהה נגזר רק ממה ששני המקורות מסכימים עליו: איזה כרטיס, איזה יום,
 * כמה, ובאיזה מטבע. **שם בית העסק אינו חלק מהזהות** — הבנק מקצר אותו
 * ל-14 תווים וכאל לא, וזה בדיוק השדה שגורם לאותה עסקה להיראות כשתיים.
 * נמדד מול הנתונים האמיתיים: 49 מתוך 73 עסקאות (68%) היו נספרות פעמיים.
 *
 * השם הוא תצוגה, לא זהות. הוא נשמר כתכונה ומשתדרג כשמגיע מקור טוב יותר.
 */

/**
 * ארבע הספרות האחרונות של הכרטיס.
 *
 * הבנק כותב "ויזה 9687" וכאל כותבת את אותו כרטיס בשורת הכותרת. מנפיק
 * שלישי ינסח אחרת, ולכן נשמרות הספרות בלבד — הן מה שבאמת מזהה את הכרטיס.
 */
export function cardLast4(card: string): string {
  const digits = String(card ?? '').replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(-4)
  // כרטיס בלי ספרות כלל (למשל "תשלום ידני") — השם עצמו הוא המפתח
  return String(card ?? '').trim().toLowerCase()
}

export interface IdentityParts {
  card: string
  date: string
  currency: string
  /** סכום החיוב בשקלים, או הסכום המקורי כשהעסקה אינה בשקלים */
  amount: number
  originalAmount: number
}

/**
 * המפתח שלפיו נספרות חזרות. עסקאות זהות לחלוטין באותו יום הן מציאות
 * (שתי קניות באותו סכום, או עשרה תשלומים של אותה עסקה), ולכן הן מובחנות
 * לפי סדר ההופעה — סדר שיוצא זהה משני המקורות.
 */
export function identityKey(t: IdentityParts): string {
  const amount = t.currency === 'ILS' ? t.amount : t.originalAmount
  return [cardLast4(t.card), t.date, t.currency, amount].join('|')
}

/** גיבוב 32 סיביות. מספיק לזיהוי בתוך משק בית אחד, ויציב בין הרצות */
function hash(raw: string): string {
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = (h << 5) - h + raw.charCodeAt(i)
    h |= 0
  }
  return `t${(h >>> 0).toString(36)}_${Math.abs(h % 9973)}`
}

/** המזהה הסופי: מפתח הזהות ומספר החזרה בתוכו */
export function makeTransactionId(t: IdentityParts, occurrence: number): string {
  return hash(`${identityKey(t)}|${occurrence}`)
}

/**
 * סופר חזרות על פני אוסף עסקאות ומחזיר מזהה לכל אחת.
 * הסדר קובע, ולכן המונה נשמר בין קריאות — הקורא אחראי להאכיל את העסקאות
 * באותו סדר שבו הן מופיעות בקובץ.
 */
export class OccurrenceCounter {
  private seen = new Map<string, number>()

  next(t: IdentityParts): { id: string; occurrence: number } {
    const key = identityKey(t)
    const occurrence = this.seen.get(key) ?? 0
    this.seen.set(key, occurrence + 1)
    return { id: makeTransactionId(t, occurrence), occurrence }
  }
}

/** מאיפה הגיעה עסקה. נצברת ואינה נדרסת, כדי שאפשר יהיה לדעת מה נראה איפה */
export interface Sighting {
  file: string
  format: string
  importedAt: string
}

/** מאחד רשימות מקורות בלי כפילויות, לפי קובץ */
export function mergeSightings(existing: Sighting[] = [], incoming: Sighting[] = []): Sighting[] {
  const byFile = new Map(existing.map((s) => [s.file, s]))
  for (const s of incoming) if (!byFile.has(s.file)) byFile.set(s.file, s)
  return [...byFile.values()]
}

/**
 * השם הטוב יותר מבין שני מקורות.
 *
 * הבנק מקצר ל-14 תווים, ולכן כשמגיע מקור עם שם ארוך יותר הוא כמעט תמיד
 * השם המלא של אותו בית עסק. זה מייתר חלק מהכינויים הידניים.
 */
export function betterMerchantName(a: string, b: string): string {
  const x = (a ?? '').trim()
  const y = (b ?? '').trim()
  if (!x) return y
  if (!y) return x
  return y.length > x.length ? y : x
}
