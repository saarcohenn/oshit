import type { Config } from './config.js'
import type { Portfolio, ServicePayload } from './defs.js'
import type { UsageTotals } from './pricing.js'

/**
 * הלקוח של Osh.it — הערוץ היחיד שבו השירות מדבר עם האפליקציה.
 *
 * הסוכנים עצמם לא קוראים לכאן. המעטפת שולחת אירועים על מה שהם עושים,
 * וכלי הקריאה מושכים את ההקשר. אין כאן אף נתיב שכותב לנתונים הפיננסיים.
 */

/** מזהה קצר של סוכן — הרשימה במסד של Osh.it, לא כאן */
export type AgentId = string
export type EventType = 'start' | 'thinking' | 'tool_call' | 'finding' | 'alert' | 'memory' | 'done' | 'error'

export interface EventFields {
  text?: string
  /** אותו טקסט באנגלית, למסך שמוצג באנגלית */
  textEn?: string | null
  tool?: string
  data?: unknown
  usage?: UsageTotals
}

export interface Budget {
  /** ‏null — לא הוגדר תקציב */
  budgetUsd: number | null
  spentUsd: number
  monthStart: string
}

export interface RunRequest {
  id: string
  agent: AgentId
  /** run — "הרץ עכשיו"; check_symbols — בדיקת הסמלים בתיק */
  kind: 'run' | 'check_symbols'
  requestedAt: string
}

/** חייב להתאים ל-LIMITS.text בשרת — טקסט ארוך יותר נדחה שם בשלמותו */
const MAX_TEXT = 2000

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s)

export class Oshit {
  constructor(private readonly config: Pick<Config, 'oshitUrl' | 'token' | 'household'>) {}

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${this.config.oshitUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Osh.it ${method} ${path.split('?')[0]}: HTTP ${res.status}`)
    return res
  }

  /**
   * שולח אירוע. כשל לא זורק: ריצה של סוכן לא אמורה ליפול כי המסך לא קיבל
   * עדכון ביניים. אירוע הסיום הוא היחיד שחשוב שיגיע, והוא מנסה שוב פעם אחת.
   */
  async event(runId: string, agent: AgentId, type: EventType, fields: EventFields = {}): Promise<void> {
    const body = {
      household: this.config.household,
      runId,
      agent,
      type,
      ...fields,
      ...(fields.text != null ? { text: clip(fields.text) } : {}),
      ...(fields.textEn != null ? { textEn: clip(fields.textEn) } : { textEn: undefined }),
    }
    const attempts = type === 'done' || type === 'error' ? 2 : 1
    for (let i = 0; i < attempts; i++) {
      try {
        await this.call('POST', '/api/agents/events', body)
        return
      } catch (err) {
        if (i === attempts - 1) console.error(`[${agent}] אירוע ${type} לא נשלח:`, (err as Error).message)
      }
    }
  }

  async context<T>(): Promise<T> {
    const res = await this.call('GET', `/api/agents/context?household=${encodeURIComponent(this.config.household)}`)
    return (await res.json()) as T
  }

  private get q() {
    return `household=${encodeURIComponent(this.config.household)}`
  }

  private post(path: string, body: Record<string, unknown>) {
    return this.call('POST', path, { household: this.config.household, ...body })
  }

  /** ההגדרות, הזיכרון, התיק והטלגרם — נמשך בכל סבב */
  async payload(): Promise<ServicePayload> {
    return (await (await this.call('GET', `/api/agents/defs?${this.q}`)).json()) as ServicePayload
  }

  async saveMemory(agent: AgentId, runId: string, notes: string, reason: string, reasonEn: string): Promise<void> {
    await this.post('/api/agents/memory', { agent, runId, notes, reason, reasonEn })
  }

  async reports(except: AgentId): Promise<unknown> {
    return (await this.call('GET', `/api/agents/reports?${this.q}&agent=${encodeURIComponent(except)}`)).json()
  }

  async importPortfolio(portfolio: Portfolio): Promise<{ imported: boolean }> {
    return (await (await this.post('/api/agents/portfolio/import', { portfolio })).json()) as { imported: boolean }
  }

  async symbols(results: Array<{ symbol: string; ok: boolean; currency?: string; error?: string }>): Promise<void> {
    await this.post('/api/agents/symbols', { results })
  }

  async telegramStatus(botUsername: string | null): Promise<void> {
    await this.post('/api/agents/telegram/status', { botUsername })
  }

  /** ‏null — הקוד לא תקף; ההודעה בבוט לא קושרה לשום דבר */
  async telegramLink(code: string, chatId: number, name: string): Promise<{ lang: 'he' | 'en' } | null> {
    try {
      return (await (await this.post('/api/agents/telegram/link', { code, chatId, name })).json()) as { lang: 'he' | 'en' }
    } catch {
      return null
    }
  }

  async budget(): Promise<Budget> {
    const res = await this.call('GET', `/api/agents/budget?household=${encodeURIComponent(this.config.household)}`)
    return (await res.json()) as Budget
  }

  async requests(): Promise<RunRequest[]> {
    const res = await this.call('GET', `/api/agents/requests?household=${encodeURIComponent(this.config.household)}`)
    return (await res.json()) as RunRequest[]
  }

  async ack(id: string): Promise<void> {
    await this.call('POST', `/api/agents/requests/${encodeURIComponent(id)}/ack`, { household: this.config.household })
  }
}
