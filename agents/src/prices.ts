import { parseYahooChart, type PriceSeries } from './indicators.js'

/**
 * סדרות מחירים יומיות מ-Yahoo.
 *
 * stooq, המקור הקודם, עבר לבדיקת דפדפן שחוסמת סקריפטים. Yahoo מכסה גם את
 * בורסת ת"א (TEVA.TA, ‏TA35.TA), שב-stooq לא הייתה. זה ממשק לא רשמי ובלי
 * מפתח, ולכן הוא מבודד בקובץ הזה: אם ייסגר, מחליפים מקור כאן בלבד.
 *
 * מה שיוצא מכאן הוא רק סמל. שנתיים הן כ-500 ימי מסחר — מספיק לממוצע 200.
 */

/** מזדהים בשם אמיתי, לא מתחפשים לדפדפן */
const USER_AGENT = 'oshit-agents (+https://github.com/saarcohenn/oshit)'
/** בקשות במקביל. רשימת מעקב ארוכה בבת אחת עלולה להיחסם */
const CONCURRENCY = 4

export async function fetchDaily(symbol: string): Promise<PriceSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
  let json: unknown
  try {
    // גם 404 מגיע עם JSON שמסביר — "symbol may be delisted"
    json = await res.json()
  } catch {
    throw new Error(`${symbol}: HTTP ${res.status}`)
  }
  const series = parseYahooChart(json, symbol)
  if (!series.bars.length) throw new Error(`${symbol}: אין נתונים`)
  return series
}

/** כמה סמלים, עד CONCURRENCY בכל רגע. כשל של סמל אחד לא מפיל את האחרים */
export async function fetchMany(symbols: string[]): Promise<PromiseSettledResult<PriceSeries>[]> {
  const results: PromiseSettledResult<PriceSeries>[] = new Array(symbols.length)
  let next = 0
  const worker = async () => {
    while (next < symbols.length) {
      const i = next++
      results[i] = await fetchDaily(symbols[i]).then(
        (value) => ({ status: 'fulfilled', value }) as const,
        (reason: unknown) => ({ status: 'rejected', reason }) as const,
      )
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker))
  return results
}
