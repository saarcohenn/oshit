import type { AgentTool } from '../claude.js'
import type { Holding, Portfolio, WatchItem } from '../defs.js'
import { snapshot, type PriceSeries, type Snapshot } from '../indicators.js'
import { fetchDaily, fetchMany } from '../prices.js'

/**
 * כלי השוק — מחירים, ממוצעים, ATR ומרחק מהסטופים, מול הכללים של סער.
 *
 * כל המספרים מחושבים כאן. המודל מקבל תמונת מצב מוכנה, עם דגלים עובדתיים
 * ("מתחת לממוצע 200", "פחות מ-ATR אחד מהסטופ"), ומפרש אותה מול הכללים.
 */

/** סטופ שקרוב מזה מסומן — באחוזים או ביחידות ATR, מה שקורה קודם */
const NEAR_STOP_PCT = 3
const NEAR_STOP_ATR = 1

export interface HoldingSnapshot extends Snapshot {
  currency: string
  flags: string[]
}

export function flagsFor(s: Snapshot): string[] {
  const flags: string[] = []
  if (s.pctFromMa200 != null && s.pctFromMa200 < 0) flags.push('מתחת לממוצע 200')
  if (s.ma50AboveMa200 === false) flags.push('ממוצע 50 מתחת לממוצע 200')
  if (s.ma200 == null) flags.push('אין מספיק היסטוריה לממוצע 200')
  if (s.stop) {
    if (s.close <= s.stop.price) flags.push('הסגירה האחרונה בסטופ או מתחתיו')
    else if (s.stop.distancePct < NEAR_STOP_PCT || (s.stop.distanceAtr != null && s.stop.distanceAtr < NEAR_STOP_ATR)) {
      flags.push('קרוב לסטופ')
    }
  }
  return flags
}

/**
 * תמונת מצב של נכס בתיק. סטופ במטבע אחר מהסדרה לא מושווה — 110 ₪ מול
 * מחיר בדולרים היה נראה "רחוק מאוד מהסטופ", וזו בדיוק הטעות השקטה שאסור לה לקרות.
 */
export function holdingSnapshot(h: Holding, series: PriceSeries): HoldingSnapshot {
  const comparable = h.stop != null && series.currency === h.currency
  const s = snapshot(h.symbol!, h.name, series.bars, comparable ? h.stop : undefined)
  const flags = flagsFor(s)
  if (h.stop != null && !comparable) {
    flags.push(`הסטופ ב-${h.currency} והמחיר ב-${series.currency || 'מטבע לא ידוע'} — הסטופ לא נבדק`)
  }
  return { ...s, currency: series.currency, flags }
}

export interface ScreenRow {
  name: string
  symbol: string
  currency: string
  close: number
  pctFromMa200: number | null
  aboveMa200: boolean | null
  ma50AboveMa200: boolean | null
  /** שני התנאים הטכניים של הנכס עצמו מתקיימים */
  trendOk: boolean
  note?: string
}

/**
 * סריקת רשימת המעקב — רק העובדות הטכניות, ממוינות.
 *
 * מעל ממוצע 200, ממוצע 50 מעל 200, ומיון לפי המרחק מעל ממוצע 200 — אלה
 * התנאים הטכניים שבכללים של סער. מצב מדד הייחוס ומועד הדוח הקרוב לא נבדקים
 * כאן: הראשון מגיע בנפרד, והשני הוא עבודה של סוכן המחקר.
 */
export function screen(items: WatchItem[], series: PromiseSettledResult<PriceSeries>[]) {
  const rows: ScreenRow[] = []
  const errors: { name: string; symbol: string; error: string }[] = []
  items.forEach((w, i) => {
    const r = series[i]
    if (r.status === 'rejected') {
      errors.push({ name: w.name, symbol: w.symbol, error: (r.reason as Error).message })
      return
    }
    const s = snapshot(w.symbol, w.name, r.value.bars)
    const aboveMa200 = s.pctFromMa200 == null ? null : s.pctFromMa200 > 0
    rows.push({
      name: w.name,
      symbol: w.symbol,
      currency: r.value.currency,
      close: s.close,
      pctFromMa200: s.pctFromMa200,
      aboveMa200,
      ma50AboveMa200: s.ma50AboveMa200,
      trendOk: aboveMa200 === true && s.ma50AboveMa200 === true,
      ...(w.note ? { note: w.note } : {}),
    })
  })
  const byDistance = (a: ScreenRow, b: ScreenRow) => (b.pctFromMa200 ?? -Infinity) - (a.pctFromMa200 ?? -Infinity)
  return {
    passing: rows.filter((r) => r.trendOk).sort(byDistance),
    notPassing: rows.filter((r) => !r.trendOk).sort(byDistance),
    errors,
  }
}

export function marketSnapshotTool(portfolio: Portfolio): AgentTool {
  return {
    name: 'get_market_snapshot',
    description:
      'מחזיר תמונת מצב של מדד הייחוס ושל כל נכס בתיק: סגירה אחרונה, ממוצע 50, ממוצע 200, ATR(14), אחוז מעל או מתחת לממוצע 200, מרחק מהסטופ באחוזים וביחידות ATR, ודגלים עובדתיים. נכסים בלי מקור מחירים מופיעים ב-unavailable.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    label: 'מושך מחירים ומחשב ממוצעים',
    labelEn: 'Fetching prices and computing averages',
    run: async () => {
      const benchmark = await fetchDaily(portfolio.benchmark.symbol).then((series) => {
        const s = snapshot(portfolio.benchmark.symbol, portfolio.benchmark.name, series.bars)
        return { ...s, flags: flagsFor(s) }
      })
      const priced = portfolio.holdings.filter((h) => h.symbol)
      const results = await fetchMany(priced.map((h) => h.symbol!))
      return {
        benchmark,
        holdings: results.map((r, i) =>
          r.status === 'fulfilled'
            ? {
                ...holdingSnapshot(priced[i], r.value),
                stopLimit: priced[i].stopLimit ?? null,
                ...(priced[i].note ? { note: priced[i].note } : {}),
              }
            : { name: priced[i].name, symbol: priced[i].symbol, error: (r.reason as Error).message },
        ),
        unavailable: portfolio.holdings
          .filter((h) => !h.symbol)
          .map((h) => ({
            name: h.name,
            stop: h.stop ?? null,
            reason: h.note || 'אין מקור מחירים לנכס הזה — הסטופ שלו לא נבדק',
          })),
      }
    },
  }
}

export function screenWatchlistTool(portfolio: Portfolio): AgentTool {
  return {
    name: 'screen_watchlist',
    description:
      'סורק את רשימת המעקב של סער: לכל נכס — סגירה, אחוז מעל או מתחת לממוצע 200, והאם ממוצע 50 מעל 200. passing הם הנכסים שעומדים בשני התנאים הטכניים, ממוינים מהרחוק ביותר מעל ממוצע 200. מצב מדד הייחוס נמצא ב-get_market_snapshot. מועד דוח קרוב לא נבדק.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    label: 'סורק את רשימת המעקב',
    labelEn: 'Screening the watchlist',
    run: async () =>
      portfolio.watchlist.length
        ? screen(portfolio.watchlist, await fetchMany(portfolio.watchlist.map((w) => w.symbol)))
        : { passing: [], notPassing: [], errors: [], note: 'רשימת המעקב ריקה' },
  }
}

export function holdingsTool(portfolio: Portfolio): AgentTool {
  return {
    name: 'get_holdings',
    description: 'רשימת הנכסים שבתיק וברשימת המעקב: שם וסמל בלבד.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    label: 'קורא את רשימת הנכסים',
    labelEn: 'Reading the holdings list',
    run: async () => ({
      benchmark: portfolio.benchmark.name,
      holdings: portfolio.holdings.map((h) => ({ name: h.name, symbol: h.symbol })),
      watchlist: portfolio.watchlist.map((w) => ({ name: w.name, symbol: w.symbol })),
    }),
  }
}
