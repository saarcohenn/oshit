import type { Schedule } from './schedule.js'

/**
 * הצורות שמגיעות מ-Osh.it: הגדרות הסוכנים, הזיכרון, התיק וקישור הטלגרם.
 * המקור והולידציה בשרת (server/src/agentDefs.ts); כאן — רק מה שהשירות קורא.
 */

export type ToolId =
  | 'get_market_snapshot'
  | 'screen_watchlist'
  | 'get_holdings'
  | 'get_spending_summary'
  | 'get_flagged_items'
  | 'get_reconciliation'
  | 'web_search'
  | 'read_agent_reports'
  | 'update_memory'

export type Model = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'

export interface AgentDef {
  id: string
  name: string
  nameEn: string
  instructions: string
  tools: ToolId[]
  schedule: Schedule | null
  model: Model
  effort: 'low' | 'medium' | 'high'
  maxIterations: number
  maxSearches: number
  notify: 'alerts' | 'all' | 'none'
  enabled: boolean
}

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

export interface ServicePayload {
  defs: AgentDef[]
  memory: Record<string, string>
  portfolio: Portfolio | null
  telegram: { chatId: number; lang: 'he' | 'en' } | null
}
