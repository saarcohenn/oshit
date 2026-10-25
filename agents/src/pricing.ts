import type Anthropic from '@anthropic-ai/sdk'

/**
 * מחירון — כדי שהעלות של כל ריצה תיספר כאן ולא תנוחש במסך.
 *
 * דולר למיליון טוקנים. כתיבה למטמון: ‏1.25× למטמון של 5 דקות, ‏2× לשעה.
 * חיפוש ברשת: 10$ לאלף. זו הערכה לפי מחירון רשמי — החשבון האמיתי ב-Console,
 * ותקרת ההוצאה שם נשארת הבלם האחרון.
 */

interface Price {
  input: number
  output: number
  cacheRead: number
}

const PER_MTOK: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

/** Haiku 5.5 מתומחר מחדש מעל 100 אלף טוקני קלט בבקשה */
const HAIKU_LONG = { threshold: 100_000, price: { input: 0.5, output: 2.5, cacheRead: 0.05 } }

export const WEB_SEARCH_USD = 0.01

/**
 * מודל לא מוכר — למשל מודל חלופי שהשרת עבר אליו אחרי סירוב — מתומחר כמו
 * Opus 5.5. עדיף להעריך מלמעלה מאשר לרשום אפס.
 */
function priceFor(model: string, promptTokens: number): Price {
  if (model.startsWith('claude-haiku-5-5') && promptTokens > HAIKU_LONG.threshold) return HAIKU_LONG.price
  const key = Object.keys(PER_MTOK).find((k) => model.startsWith(k))
  return PER_MTOK[key ?? 'claude-opus-5-5']
}

export interface UsageTotals {
  /** כל הקלט, כולל מטמון — מה שהמסך מציג כ"טוקנים נכנסים" */
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  searches: number
  costUsd: number
  model: string
}

export const emptyUsage = (model: string): UsageTotals => ({
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  searches: 0,
  costUsd: 0,
  model,
})

/** מוסיף תשובה אחת לסיכום הריצה. כל תשובה מתומחרת לפי המודל שענה בפועל */
export function addUsage(total: UsageTotals, model: string, u: Anthropic.Beta.BetaUsage): void {
  const plain = u.input_tokens
  const read = u.cache_read_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const write5m = write - write1h
  const searches = u.server_tool_use?.web_search_requests ?? 0

  const p = priceFor(model, plain + read + write)
  const usd =
    (plain * p.input + write5m * p.input * 1.25 + write1h * p.input * 2 + read * p.cacheRead + u.output_tokens * p.output) /
      1_000_000 +
    searches * WEB_SEARCH_USD

  total.input += plain + read + write
  total.output += u.output_tokens
  total.cacheWrite += write
  total.cacheRead += read
  total.searches += searches
  total.costUsd += usd
  total.model = model
}

/** עיגול לאגורת-דולר עשירית — מספיק לסכום חודשי, ולא מציג רעש של נקודה צפה */
export const roundUsd = (usd: number) => Math.round(usd * 10_000) / 10_000
