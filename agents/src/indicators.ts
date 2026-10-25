/**
 * מדדים טכניים — מחושבים בקוד ולא במודל.
 *
 * ממוצע נע, ATR ומרחק מסטופ הם המספרים שעליהם נשענים הכללים של סער. מודל
 * שפה שמחשב אותם בעצמו עלול לטעות בספרה, ואף אחד לא ישים לב. כאן הם
 * מחושבים פעם אחת, דטרמיניסטית, והמודל מקבל אותם מוכנים ורק מפרש.
 */

export interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface PriceSeries {
  /** מטבע המחירים בסדרה. אגורות (ILA) כבר הומרו לשקלים */
  currency: string
  bars: Bar[]
}

/** תשובת ה-chart של Yahoo — רק השדות שבשימוש */
interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; gmtoffset?: number }
      timestamp?: number[]
      indicators?: { quote?: Array<Partial<Record<'open' | 'high' | 'low' | 'close', (number | null)[]>>> }
    }> | null
    error?: { description?: string } | null
  }
}

/**
 * מפענח את תשובת ה-chart של Yahoo לסדרה יומית.
 *
 * - יום עם שדה חסר נזרק. ‏null או אפס היו מושכים את הממוצעים למטה בשקט.
 * - בורסת ת"א מצטטת מניות באגורות (ILA), והסטופים בקובץ התיק בשקלים — אז
 *   הסדרה מומרת לשקלים כאן, ולא בכל מקום שמשווה אליה.
 * - תשובה בלי סדרה נכשלת במפורש, עם ההסבר של Yahoo כשיש.
 */
export function parseYahooChart(json: unknown, symbol: string): PriceSeries {
  const chart = (json as YahooChart | null)?.chart
  const result = chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  if (!result?.timestamp || !quote) {
    throw new Error(`${symbol}: ${chart?.error?.description ?? 'תשובה לא צפויה ממקור המחירים'}`)
  }
  const agorot = result.meta?.currency === 'ILA'
  // חלוקה ב-100 ולא כפל ב-0.01: ‏11300 * 0.01 הוא 113.00000000000001
  const divisor = agorot ? 100 : 1
  // התאריך לפי שעון הבורסה, לא UTC — אחרת סגירה בטוקיו נרשמת ליום הקודם
  const offsetMs = (result.meta?.gmtoffset ?? 0) * 1000

  const byDate = new Map<string, Bar>()
  result.timestamp.forEach((t, i) => {
    const values = [quote.open?.[i], quote.high?.[i], quote.low?.[i], quote.close?.[i]]
    if (!values.every((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)) return
    const [open, high, low, close] = values.map((v) => v / divisor)
    const date = new Date(t * 1000 + offsetMs).toISOString().slice(0, 10)
    // בזמן מסחר Yahoo מוסיף לפעמים נר חי באותו תאריך — האחרון מנצח
    byDate.set(date, { date, open, high, low, close })
  })
  return {
    currency: agorot ? 'ILS' : (result.meta?.currency ?? ''),
    bars: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** ממוצע נע פשוט של n הסגירות האחרונות. בלי מספיק נתונים — null, לא ממוצע חלקי */
export function sma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null
  const slice = bars.slice(-n)
  return slice.reduce((s, b) => s + b.close, 0) / n
}

/**
 * ‏ATR של Wilder: ממוצע מוחלק של הטווח האמיתי.
 * טווח אמיתי = הגדול מבין גבוה-נמוך, |גבוה-סגירה קודמת|, |נמוך-סגירה קודמת|.
 */
export function atr(bars: Bar[], n = 14): number | null {
  if (bars.length < n + 1) return null
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i]
    const prevClose = bars[i - 1].close
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
  }
  let value = tr.slice(0, n).reduce((s, x) => s + x, 0) / n
  for (const x of tr.slice(n)) value = (value * (n - 1) + x) / n
  return value
}

const pct = (a: number, b: number) => ((a - b) / b) * 100
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

export interface Snapshot {
  symbol: string
  name: string
  date: string
  close: number
  ma50: number | null
  ma200: number | null
  atr14: number | null
  /** כמה אחוזים הסגירה מעל (חיובי) או מתחת לממוצע ה-200 */
  pctFromMa200: number | null
  /** הממוצע ה-50 מעל ה-200 — אחד מתנאי הכניסה בכללים */
  ma50AboveMa200: boolean | null
  stop?: { price: number; distancePct: number; distanceAtr: number | null }
}

/** תמונת מצב של נכס אחד. בלי מספיק היסטוריה המדדים נשארים null — לא מנוחשים */
export function snapshot(symbol: string, name: string, bars: Bar[], stopPrice?: number): Snapshot {
  if (!bars.length) throw new Error(`${symbol}: אין נתונים`)
  const last = bars[bars.length - 1]
  const ma50 = sma(bars, 50)
  const ma200 = sma(bars, 200)
  const a = atr(bars, 14)
  return {
    symbol,
    name,
    date: last.date,
    close: r2(last.close)!,
    ma50: r2(ma50),
    ma200: r2(ma200),
    atr14: r2(a),
    pctFromMa200: ma200 == null ? null : r2(pct(last.close, ma200)),
    ma50AboveMa200: ma50 == null || ma200 == null ? null : ma50 > ma200,
    ...(stopPrice
      ? {
          stop: {
            price: stopPrice,
            distancePct: r2(pct(last.close, stopPrice))!,
            distanceAtr: a ? r2((last.close - stopPrice) / a) : null,
          },
        }
      : {}),
  }
}
