import { readFileSync } from 'node:fs'

/**
 * הגדרות השירות — מהסביבה ומקובץ התיק.
 *
 * הסודות (מפתח Anthropic, טוקן השירות) מגיעים רק מהסביבה, מקובץ ה-.env
 * שבשרת. התיק — שמות הנכסים, הסטופים והכללים של סער — מגיע מקובץ JSON
 * שמותקן לקונטיינר, ולא מהמאגר: המאגר ציבורי, והתיק לא.
 */

export interface Holding {
  name: string
  /** סמל ב-Yahoo, למשל INTC או TEVA.TA. ‏null — אין מקור מחירים, והפער מוצג ולא מוסתר */
  symbol: string | null
  /** מטבע הסטופ. כשהוא שונה ממטבע הסדרה, הסטופ לא מושווה — טבע בדולר מול סטופ בשקלים */
  currency: string
  stop?: number
  stopLimit?: number
  note?: string
}

/** נכס שסער עוקב אחריו ועוד לא מחזיק. הרשימה שלו — הסוכן סורק אותה, לא מרחיב אותה */
export interface WatchItem {
  name: string
  symbol: string
  note?: string
}

export interface Portfolio {
  benchmark: { name: string; symbol: string }
  holdings: Holding[]
  watchlist: WatchItem[]
  /** הכללים של סער כטקסט חופשי. הסוכן משווה אליהם — הוא לא מנסח אותם */
  rules: string
}

export interface Config {
  anthropicKey: string | null
  oshitUrl: string
  token: string
  household: string
  portfolioFile: string
  dataDir: string
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = ['OSHIT_URL', 'AGENTS_TOKEN', 'HOUSEHOLD_ID'].filter((k) => !env[k])
  if (missing.length) throw new Error(`חסרים משתני סביבה: ${missing.join(', ')}`)
  return {
    anthropicKey: env.ANTHROPIC_API_KEY || null,
    oshitUrl: env.OSHIT_URL!.replace(/\/+$/, ''),
    token: env.AGENTS_TOKEN!,
    household: env.HOUSEHOLD_ID!,
    portfolioFile: env.PORTFOLIO_FILE || '/config/portfolio.json',
    dataDir: env.DATA_DIR || '/data',
  }
}

/** קורא את קובץ התיק בכל ריצה, כדי שעדכון סטופ לא ידרוש הפעלה מחדש */
export function readPortfolio(file: string): Portfolio {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Portfolio>
  if (!raw.benchmark?.symbol || !Array.isArray(raw.holdings)) {
    throw new Error(`קובץ התיק ${file} חסר benchmark או holdings`)
  }
  const watchlist = Array.isArray(raw.watchlist) ? raw.watchlist.filter((w) => w?.name && w?.symbol) : []
  return { benchmark: raw.benchmark, holdings: raw.holdings, watchlist, rules: String(raw.rules ?? '') }
}
