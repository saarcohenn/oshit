import { createHash, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { db, uid } from './db.js'
import { broadcastAgent } from './events.js'
import { readState, readVersion } from './state.js'
import { buildSpendingContext } from './agentContext.js'
import {
  BUILTIN_IDS,
  agentExists,
  allAgentMemory,
  completeTelegramLink,
  ensureBuiltins,
  getPortfolio,
  importPortfolio,
  latestReports,
  listAgentDefs,
  saveAgentMemory,
  saveSymbolCheck,
  telegramLink,
} from './agentDefs.js'

/**
 * צינור האירועים של סוכני Claude.
 *
 * הסוכנים רצים בקונטיינר נפרד (oshit-agents) ומדווחים לכאן על כל צעד:
 * התחלה, חשיבה, קריאה לכלי, ממצא, סיום. כאן האירוע נשמר ומשודר דרך
 * ה-SSE הקיים למסך "סוכנים".
 *
 * המפתח של Anthropic לא נמצא בתהליך הזה. השירות מזדהה כאן בטוקן משותף
 * (AGENTS_TOKEN), והאפליקציה עצמה לעולם לא פונה למודל.
 */

/**
 * סוכן מזוהה במזהה קצר. הרשימה עצמה במסד (agentDefs.ts) — סער מוסיף סוכנים
 * מהמסך — ולכן כאן נבדקת רק הצורה, וקיום הסוכן נבדק בנתיב מול המסד.
 */
export type AgentId = string
export const AGENT_SLUG = /^[a-z][a-z0-9-]{1,30}$/
/** הסוכנים של ההדגמה — תמיד קיימים, כי הם נזרעים בכל משק בית */
const DEMO_AGENTS = BUILTIN_IDS

/** memory — הסוכן עדכן את הזיכרון של עצמו. מוצג ביומן, כדי ששינוי לא יעבור בשקט */
export const EVENT_TYPES = ['start', 'thinking', 'tool_call', 'finding', 'alert', 'memory', 'done', 'error'] as const
export type AgentEventType = (typeof EVENT_TYPES)[number]

const TERMINAL: AgentEventType[] = ['done', 'error']

/**
 * שמירה: ריצה נמחקת רק כשהיא גם מעבר ל-200 האחרונות של הסוכן וגם ישנה מ-90
 * יום — מה שמשאיר יותר. בלי זה "הורדת היומן המלא" הייתה מחזירה מעט מאוד.
 */
const KEEP_RUNS = 200
const KEEP_DAYS = 90

const LIMITS = { text: 2000, tool: 64, data: 8000 } as const

export interface AgentUsage {
  input: number
  output: number
  cacheWrite?: number
  cacheRead?: number
  searches?: number
  /** מחושב בשירות הסוכנים לפי המודל שענה בפועל */
  costUsd?: number
  model?: string
}

export interface AgentEventInput {
  runId: string
  agent: AgentId
  type: AgentEventType
  text?: string
  /** אותו טקסט באנגלית — המסך באנגלית מציג אותו, ובלעדיו את העברית */
  textEn?: string
  tool?: string
  data?: unknown
  usage?: AgentUsage
}

export interface AgentEvent extends Omit<AgentEventInput, 'usage'> {
  at: string
  demo?: boolean
}

/* ---------------- זיהוי השירות ---------------- */

/** הטוקן מוגדר רק בפריסה שבה שירות הסוכנים קיים. בלעדיו הנתיבים כבויים */
export function agentsConfigured(): boolean {
  return Boolean(process.env.AGENTS_TOKEN)
}

/**
 * השוואה בזמן קבוע.
 *
 * ההשוואה נעשית על גיבוב ולא על המחרוזות עצמן, כי timingSafeEqual דורש
 * אורך זהה — והשוואת אורך לפני כן הייתה מדליפה בעצמה את אורך הטוקן.
 */
export function tokenMatches(authorization: string | undefined): boolean {
  const expected = process.env.AGENTS_TOKEN
  if (!expected) return false
  const presented = String(authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!presented) return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/* ---------------- ולידציה ---------------- */

type Validation = { ok: true; event: AgentEventInput } | { ok: false; error: string }

/**
 * בדיקת אירוע שמגיע מבחוץ.
 *
 * השירות שלנו, אבל הגוף עדיין קלט: הוא מוצג בממשק ונשמר במסד. סוג מתוך
 * רשימה סגורה ואורכים חסומים — טקסט של סוכן שסיכם דף אינטרנט עלול להכיל
 * כל דבר.
 */
export function validateAgentEvent(body: unknown): Validation {
  const b = (body ?? {}) as Record<string, unknown>
  const runId = String(b.runId ?? '')
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return { ok: false, error: 'runId לא תקין' }
  if (!AGENT_SLUG.test(String(b.agent ?? ''))) return { ok: false, error: 'סוכן לא מוכר' }
  if (!EVENT_TYPES.includes(b.type as AgentEventType)) return { ok: false, error: 'סוג אירוע לא מוכר' }

  const event: AgentEventInput = { runId, agent: b.agent as AgentId, type: b.type as AgentEventType }

  if (b.text != null) {
    const text = String(b.text)
    if (text.length > LIMITS.text) return { ok: false, error: 'טקסט ארוך מדי' }
    event.text = text
  }
  if (b.textEn != null) {
    const textEn = String(b.textEn)
    if (textEn.length > LIMITS.text) return { ok: false, error: 'טקסט ארוך מדי' }
    event.textEn = textEn
  }
  if (b.tool != null) {
    const tool = String(b.tool)
    if (tool.length > LIMITS.tool) return { ok: false, error: 'שם כלי ארוך מדי' }
    event.tool = tool
  }
  if (b.data !== undefined) {
    const serialized = JSON.stringify(b.data)
    if (serialized === undefined || serialized.length > LIMITS.data) {
      return { ok: false, error: 'נתונים גדולים מדי' }
    }
    event.data = b.data
  }
  if (b.usage != null) {
    const u = b.usage as Record<string, unknown>
    const input = Number(u.input)
    const output = Number(u.output)
    if (!Number.isInteger(input) || !Number.isInteger(output) || input < 0 || output < 0) {
      return { ok: false, error: 'usage לא תקין' }
    }
    const usage: AgentUsage = { input, output }
    for (const key of ['cacheWrite', 'cacheRead', 'searches'] as const) {
      if (u[key] == null) continue
      const n = Number(u[key])
      if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'usage לא תקין' }
      usage[key] = n
    }
    if (u.costUsd != null) {
      const cost = Number(u.costUsd)
      // ריצה אחת של 100$ היא באג או התקפה — לא משהו שנרשם לתקציב בשקט
      if (!Number.isFinite(cost) || cost < 0 || cost > 100) return { ok: false, error: 'עלות לא תקינה' }
      usage.costUsd = cost
    }
    if (u.model != null) {
      const model = String(u.model)
      if (!/^[a-z0-9.-]{1,64}$/.test(model)) return { ok: false, error: 'מודל לא תקין' }
      usage.model = model
    }
    event.usage = usage
  }
  return { ok: true, event }
}

/* ---------------- שמירה ושידור ---------------- */

const householdExists = (id: string) =>
  Boolean(db.prepare('SELECT 1 FROM households WHERE id = ?').get(id))

/** מוחק ריצות שגם מעבר לתקרה וגם ישנות, יחד עם האירועים שלהן */
function prune(householdId: string, agent: AgentId) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString()
  const stale = db
    .prepare(
      `SELECT id FROM (
         SELECT id, started_at FROM agent_runs WHERE household_id = ? AND agent = ?
         ORDER BY started_at DESC LIMIT -1 OFFSET ?
       ) WHERE started_at < ?`,
    )
    .all(householdId, agent, KEEP_RUNS, cutoff) as Array<{ id: string }>
  if (!stale.length) return
  const delEvents = db.prepare('DELETE FROM agent_events WHERE household_id = ? AND run_id = ?')
  const delRun = db.prepare('DELETE FROM agent_runs WHERE household_id = ? AND id = ?')
  db.transaction(() => {
    for (const { id } of stale) {
      delEvents.run(householdId, id)
      delRun.run(householdId, id)
    }
  })()
}

/**
 * שומר אירוע ומשדר אותו.
 *
 * אירוע שמגיע לריצה שאין לה עדיין "start" פותח אותה בעצמו: אם אירוע
 * ההתחלה אבד בדרך, עדיף להציג ריצה בלי תחילה מאשר לזרוק את כל הצעדים.
 */
export function recordAgentEvent(householdId: string, input: AgentEventInput, demo = false): AgentEvent {
  const at = new Date().toISOString()
  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO agent_runs (id, household_id, agent, status, started_at, demo)
       VALUES (?, ?, ?, 'running', ?, ?)`,
    ).run(input.runId, householdId, input.agent, at, demo ? 1 : 0)

    db.prepare(
      `INSERT INTO agent_events (household_id, run_id, agent, type, at, text, text_en, tool, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      householdId,
      input.runId,
      input.agent,
      input.type,
      at,
      input.text ?? null,
      input.textEn ?? null,
      input.tool ?? null,
      input.data === undefined ? null : JSON.stringify(input.data),
    )

    if (TERMINAL.includes(input.type)) {
      db.prepare(
        `UPDATE agent_runs SET status = ?, finished_at = ?, summary = ?, summary_en = ?,
           input_tokens = ?, output_tokens = ?, cost_usd = ?, model = ?, searches = ?
         WHERE household_id = ? AND id = ?`,
      ).run(
        input.type,
        at,
        input.text ?? null,
        input.textEn ?? null,
        input.usage?.input ?? null,
        input.usage?.output ?? null,
        input.usage?.costUsd ?? null,
        input.usage?.model ?? null,
        input.usage?.searches ?? null,
        householdId,
        input.runId,
      )
    }
  })()

  if (TERMINAL.includes(input.type)) prune(householdId, input.agent)

  const { usage: _usage, ...rest } = input
  const event: AgentEvent = { ...rest, at, ...(demo ? { demo: true } : {}) }
  broadcastAgent(householdId, event)
  return event
}

/* ---------------- קריאה למסך ---------------- */

type Row = Record<string, any>

/** הריצות האחרונות, כל אחת עם הצעדים שלה, לטעינה הראשונה של המסך */
export function listAgentRuns(householdId: string, limit = 30) {
  const runs = db
    .prepare(
      `SELECT id, agent, status, started_at AS startedAt, finished_at AS finishedAt, summary,
              summary_en AS summaryEn, input_tokens AS inputTokens, output_tokens AS outputTokens,
              cost_usd AS costUsd, model, searches, demo
       FROM agent_runs WHERE household_id = ? ORDER BY started_at DESC LIMIT ?`,
    )
    .all(householdId, limit) as Row[]
  if (!runs.length) return []

  const placeholders = runs.map(() => '?').join(',')
  const events = db
    .prepare(
      `SELECT run_id AS runId, agent, type, at, text, text_en AS textEn, tool, data FROM agent_events
       WHERE household_id = ? AND run_id IN (${placeholders}) ORDER BY seq ASC`,
    )
    .all(householdId, ...runs.map((r) => r.id)) as Row[]

  const byRun = new Map<string, Row[]>()
  for (const e of events) {
    const list = byRun.get(e.runId) ?? []
    list.push(eventOf(e))
    byRun.set(e.runId, list)
  }

  return runs.map((r) => ({
    id: r.id,
    agent: r.agent,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt ?? null,
    summary: r.summary ?? null,
    summaryEn: r.summaryEn ?? null,
    inputTokens: r.inputTokens ?? null,
    outputTokens: r.outputTokens ?? null,
    costUsd: r.costUsd ?? null,
    model: r.model ?? null,
    searches: r.searches ?? null,
    demo: !!r.demo,
    events: byRun.get(r.id) ?? [],
  }))
}

function eventOf(e: Row) {
  return {
    runId: e.runId,
    agent: e.agent,
    type: e.type,
    at: e.at,
    ...(e.text ? { text: e.text } : {}),
    ...(e.textEn ? { textEn: e.textEn } : {}),
    ...(e.tool ? { tool: e.tool } : {}),
    ...(e.data ? { data: safeParse(e.data) } : {}),
    ...(e.demo ? { demo: true } : {}),
  }
}

/* ---------------- היומן ---------------- */

export const LOG_LIMITS = [50, 250, 1000] as const

/** הצעדים האחרונים, מהחדש לישן, בכל הריצות. הגודל אחד משלושה בלבד */
export function agentLog(householdId: string, limit: number) {
  const n = (LOG_LIMITS as readonly number[]).includes(limit) ? limit : LOG_LIMITS[0]
  const rows = db
    .prepare(
      `SELECT e.run_id AS runId, e.agent, e.type, e.at, e.text, e.text_en AS textEn, e.tool, e.data, r.demo
       FROM agent_events e
       LEFT JOIN agent_runs r ON r.household_id = e.household_id AND r.id = e.run_id
       WHERE e.household_id = ? ORDER BY e.seq DESC LIMIT ?`,
    )
    .all(householdId, n) as Row[]
  return rows.map(eventOf)
}

/** ירידות שורה בתוך טקסט של סוכן מקופלות, כדי ששורה ביומן תישאר צעד אחד */
const oneLine = (s: unknown) => String(s ?? '').replace(/\s*\r?\n\s*/g, ' ⏎ ')

/**
 * היומן המלא כקובץ טקסט, מהישן לחדש — כך קוראים יומן.
 * שורה לכל צעד, שדות מופרדים בטאב: זמן, סוכן, סוג, כלי, טקסט, עלות, הדגמה, ריצה.
 */
export function agentLogText(householdId: string, lang: 'he' | 'en'): string {
  const rows = db
    .prepare(
      `SELECT e.run_id AS runId, e.agent, e.type, e.at, e.text, e.text_en AS textEn, e.tool, r.demo,
              r.cost_usd AS costUsd
       FROM agent_events e
       LEFT JOIN agent_runs r ON r.household_id = e.household_id AND r.id = e.run_id
       WHERE e.household_id = ? ORDER BY e.seq ASC`,
    )
    .all(householdId) as Row[]
  return rows
    .map((e) => {
      const text = lang === 'en' ? (e.textEn ?? e.text) : e.text
      const terminal = e.type === 'done' || e.type === 'error'
      const cost = terminal && e.costUsd != null ? `$${Number(e.costUsd).toFixed(4)}` : ''
      return [e.at, e.agent, e.type, e.tool ?? '', oneLine(text), cost, e.demo ? 'demo' : '', e.runId].join('\t')
    })
    .map((line) => `${line}\n`)
    .join('')
}

/* ---------------- תקציב ---------------- */

const BUDGET_KEY = 'budget_usd'
const ZONE = 'Asia/Jerusalem'

const partsOf = (date: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', ...options })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>

/**
 * תחילת החודש הנוכחי לפי שעון ישראל, כרגע ב-UTC.
 *
 * ריצה של 00:30 ב-1 לחודש שייכת לחודש החדש, גם אם ב-UTC זה עוד הקודם.
 * ההיסט נמדד ב-Intl ברגע עצמו, כך ששעון קיץ וחורף נכנסים לבד.
 */
export function monthStart(now = new Date()): string {
  const { year, month } = partsOf(now, { year: 'numeric', month: '2-digit' })
  const midnightUtc = Date.UTC(year, month - 1, 1)
  const local = partsOf(new Date(midnightUtc), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - midnightUtc
  return new Date(midnightUtc - offset).toISOString()
}

/** תקציב חודשי בדולרים, או null לביטול */
export function setAgentBudget(householdId: string, budgetUsd: number | null) {
  if (budgetUsd == null) {
    db.prepare('DELETE FROM agent_settings WHERE household_id = ? AND key = ?').run(householdId, BUDGET_KEY)
    return
  }
  db.prepare(
    `INSERT INTO agent_settings (household_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(household_id, key) DO UPDATE SET value = excluded.value`,
  ).run(householdId, BUDGET_KEY, String(budgetUsd))
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * כמה הוצא החודש, מול התקציב.
 *
 * ריצות שקדמו לרישום העלות מוערכות לפי הטוקנים במחיר Opus 5.5 — עדיף הערכה
 * מאשר להעלים אותן. הדגמות לא נספרות: הן לא קוראות למודל.
 */
export function agentBudget(householdId: string, now = new Date()) {
  const start = monthStart(now)
  const row = db
    .prepare('SELECT value FROM agent_settings WHERE household_id = ? AND key = ?')
    .get(householdId, BUDGET_KEY) as { value: string } | undefined
  const cost = `COALESCE(cost_usd, (COALESCE(input_tokens, 0) * 4.0 + COALESCE(output_tokens, 0) * 20.0) / 1000000)`
  const breakdown = (column: 'agent' | 'model') =>
    (
      db
        .prepare(
          `SELECT COALESCE(${column}, 'claude-opus-5-5') AS key, SUM(${cost}) AS usd, COUNT(*) AS runs
           FROM agent_runs WHERE household_id = ? AND demo = 0 AND started_at >= ?
           GROUP BY key ORDER BY usd DESC`,
        )
        .all(householdId, start) as Array<{ key: string; usd: number; runs: number }>
    ).map((r) => ({ key: r.key, usd: round4(r.usd), runs: r.runs }))
  const byAgent = breakdown('agent')
  return {
    budgetUsd: row ? Number(row.value) : null,
    spentUsd: round4(byAgent.reduce((s, r) => s + r.usd, 0)),
    monthStart: start,
    byAgent: byAgent.map(({ key, ...r }) => ({ agent: key, ...r })),
    byModel: breakdown('model').map(({ key, ...r }) => ({ model: key, ...r })),
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/* ---------------- "הרץ עכשיו" ---------------- */

/**
 * מתי שירות הסוכנים משך בקשות לאחרונה, לפי משק בית.
 *
 * בזיכרון בלבד: אחרי אתחול של השרת זה מתאפס עד המשיכה הבאה (כ-20 שניות),
 * וזה בדיוק מה שצריך לשאלה "האם השירות חי עכשיו".
 */
const serviceSeenAt = new Map<string, string>()

export function agentServiceSeenAt(householdId: string): string | null {
  return serviceSeenAt.get(householdId) ?? null
}

/** שם הבוט בטלגרם, כפי שהשירות דיווח. בזיכרון — הטוקן של הבוט לא מגיע לכאן */
const telegramBot = new Map<string, string>()

export function agentTelegramBot(householdId: string): string | null {
  return telegramBot.get(householdId) ?? null
}

export type EnqueueResult =
  | { ok: true; id: string; existing: boolean }
  | { ok: false; reason: 'not_configured' }

export type RequestKind = 'run' | 'check_symbols'

/**
 * בקשה פתוחה אחת לכל סוכן ולכל סוג: לחיצה כפולה לא תריץ ותחייב פעמיים.
 * "בדוק סמלים" נכנס לאותו תור — לשירות אין פורט פתוח, הוא רק מושך.
 */
export function enqueueRun(householdId: string, agent: AgentId, userId: string, kind: RequestKind = 'run'): EnqueueResult {
  if (!agentsConfigured()) return { ok: false, reason: 'not_configured' }
  const pending = db
    .prepare(
      `SELECT id FROM agent_requests WHERE household_id = ? AND agent = ? AND kind = ? AND taken_at IS NULL`,
    )
    .get(householdId, agent, kind) as { id: string } | undefined
  if (pending) return { ok: true, id: pending.id, existing: true }
  const id = uid('rq_')
  db.prepare(
    `INSERT INTO agent_requests (id, household_id, agent, requested_at, requested_by, kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, householdId, agent, new Date().toISOString(), userId, kind)
  return { ok: true, id, existing: false }
}

/* ---------------- הדגמה ---------------- */

type DemoStep = { at: number; agent: AgentId; type: AgentEventType; text?: string; en?: string; tool?: string }

/**
 * תסריט הדגמה של שלושת הסוכנים.
 *
 * עובר באותו צינור בדיוק — שמירה, SSE, מסך — כך שהדגמה שעובדת מוכיחה
 * שהצינור עובד, עוד לפני שיש מפתח API. כל טקסט מתחיל ב"הדגמה" והריצה
 * מסומנת demo: הערכים כאן לדוגמה בלבד, ואסור שייראו כמו מצב אמיתי של התיק.
 */
const DEMO_SCRIPT: DemoStep[] = [
  { at: 0, agent: 'market', type: 'start', text: 'הדגמה · סריקת שוק יומית', en: 'Demo · daily market scan' },
  { at: 1500, agent: 'market', type: 'thinking' },
  { at: 3000, agent: 'market', type: 'tool_call', tool: 'get_market_snapshot', text: 'מושך מחירים ומחשב ממוצעים נעים', en: 'Fetching prices and computing moving averages' },
  { at: 4000, agent: 'spending', type: 'start', text: 'הדגמה · בדיקת הוצאות', en: 'Demo · spending check' },
  { at: 5500, agent: 'spending', type: 'tool_call', tool: 'get_spending_summary', text: 'סכומים לפי קטגוריה וחודש', en: 'Totals by category and month' },
  { at: 7000, agent: 'market', type: 'thinking' },
  { at: 9000, agent: 'research', type: 'start', text: 'הדגמה · מחקר שבועי', en: 'Demo · weekly research' },
  { at: 9000, agent: 'spending', type: 'tool_call', tool: 'get_reconciliation', text: 'חיובי כרטיס מול סכום העסקאות', en: 'Card charges against transaction totals' },
  { at: 9500, agent: 'market', type: 'finding', text: 'הדגמה · S&P 500 מעל הממוצע ה-200 (ערך לדוגמה)', en: 'Demo · S&P 500 above its 200-day average (sample value)' },
  { at: 10500, agent: 'research', type: 'thinking' },
  { at: 12000, agent: 'market', type: 'done', text: 'הדגמה · ארבעה נכסים נבדקו, אף סטופ לא קרוב (ערך לדוגמה)', en: 'Demo · four holdings checked, no stop is close (sample value)' },
  { at: 12000, agent: 'research', type: 'tool_call', tool: 'web_search', text: 'מחפש דוחות כספיים קרובים', en: 'Searching for upcoming earnings reports' },
  { at: 12500, agent: 'spending', type: 'thinking' },
  { at: 15000, agent: 'spending', type: 'alert', text: 'הדגמה · מסעדות 18% מעל התקציב החודשי (ערך לדוגמה)', en: 'Demo · restaurants 18% over the monthly budget (sample value)' },
  { at: 17000, agent: 'research', type: 'tool_call', tool: 'web_search', text: 'מאמת תאריכים מול מקור נוסף', en: 'Checking dates against a second source' },
  { at: 18000, agent: 'spending', type: 'done', text: 'הדגמה · חריגה אחת, ההתאמה מול הכרטיסים תקינה (ערך לדוגמה)', en: 'Demo · one overrun; card reconciliation is fine (sample value)' },
  { at: 21000, agent: 'research', type: 'thinking' },
  { at: 23500, agent: 'research', type: 'finding', text: 'הדגמה · דוח רבעוני קרוב לאחד הנכסים — שבוע חסימה לפי הכללים (ערך לדוגמה)', en: 'Demo · a holding reports earnings soon — a blocked week under the rules (sample value)' },
  { at: 26000, agent: 'research', type: 'done', text: 'הדגמה · שני נכסים עם דוח בשבועיים הקרובים (ערך לדוגמה)', en: 'Demo · two holdings report within two weeks (sample value)' },
]

const DEMO_LENGTH_MS = Math.max(...DEMO_SCRIPT.map((s) => s.at))

const demoRunning = new Set<string>()

/** מפעיל הדגמה. אחת בכל רגע לכל משק בית — לחיצה חוזרת לא מכפילה דמויות */
export function startDemo(householdId: string): boolean {
  if (demoRunning.has(householdId)) return false
  demoRunning.add(householdId)
  const stamp = Date.now().toString(36)
  ensureBuiltins(householdId)
  const runIds = Object.fromEntries(DEMO_AGENTS.map((a) => [a, `demo_${a}_${stamp}`])) as Record<AgentId, string>
  for (const step of DEMO_SCRIPT) {
    setTimeout(() => {
      // משק בית שנמחק באמצע ההדגמה — אין לאן לכתוב
      if (!householdExists(householdId)) return
      recordAgentEvent(
        householdId,
        { runId: runIds[step.agent], agent: step.agent, type: step.type, text: step.text, textEn: step.en, tool: step.tool },
        true,
      )
    }, step.at).unref()
  }
  setTimeout(() => demoRunning.delete(householdId), DEMO_LENGTH_MS + 1000).unref()
  return true
}

/* ---------------- הנתיבים של שירות הסוכנים ---------------- */

/**
 * ‎/api/agents — נתיבים שרק שירות הסוכנים קורא להם.
 *
 * בלי AGENTS_TOKEN מוגדר הם מחזירים 404, לא 401: בפריסה בלי סוכנים אין
 * כאן משטח תקיפה בכלל, ואין סיבה לאשר מבחוץ שהנתיבים קיימים.
 */
export function agentServiceRouter() {
  const router = express.Router()

  router.use((req, res, next) => {
    if (!agentsConfigured()) return res.status(404).json({ error: 'לא נמצא' })
    if (!tokenMatches(req.headers.authorization)) return res.status(401).json({ error: 'לא מורשה' })
    next()
  })

  router.post('/events', (req, res) => {
    const household = String(req.body?.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const result = validateAgentEvent(req.body)
    if (!result.ok) return res.status(400).json({ error: result.error })
    if (!agentExists(household, result.event.agent)) return res.status(400).json({ error: 'סוכן לא מוכר' })
    recordAgentEvent(household, result.event)
    res.status(204).end()
  })

  /**
   * כל מה שהשירות צריך כדי לרוץ: ההגדרות, הזיכרון של כל סוכן, התיק, וקישור
   * הטלגרם. נמשך בכל סבב, ולכן סוכן שנוסף במסך רץ בלי פריסה ובלי הפעלה מחדש.
   */
  router.get('/defs', (req, res) => {
    const household = String(req.query.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const telegram = telegramLink(household)
    res.json({
      defs: listAgentDefs(household),
      memory: allAgentMemory(household),
      portfolio: getPortfolio(household),
      telegram: telegram ? { chatId: telegram.chatId, lang: telegram.lang } : null,
    })
  })

  /**
   * הכלי היחיד שכותב: הסוכן מעדכן את הזיכרון של עצמו, ורק אותו. כל עדכון
   * נרשם ביומן כאירוע memory עם הסיבה, כדי שסער יראה וישחזר אם צריך.
   */
  router.post('/memory', (req, res) => {
    const household = String(req.body?.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const agent = String(req.body?.agent ?? '')
    const runId = String(req.body?.runId ?? '')
    if (!AGENT_SLUG.test(agent) || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return res.status(400).json({ error: 'בקשה לא תקינה' })
    const result = saveAgentMemory(household, agent, req.body?.notes, req.body?.reason, 'agent')
    if (!result.ok) return res.status(400).json({ error: result.error })
    const reason = String(req.body?.reason ?? '').slice(0, 200)
    recordAgentEvent(household, {
      runId,
      agent,
      type: 'memory',
      text: reason || 'עדכן את הזיכרון',
      ...(typeof req.body?.reasonEn === 'string' ? { textEn: req.body.reasonEn.slice(0, 200) } : { textEn: 'Updated its memory' }),
    })
    res.json({ ok: true, length: result.notes.length })
  })

  /** הדוחות האחרונים של הסוכנים האחרים — לכלי read_agent_reports */
  router.get('/reports', (req, res) => {
    const household = String(req.query.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    res.json(latestReports(household, String(req.query.agent ?? '')))
  })

  /** ייבוא חד-פעמי של קובץ התיק הישן. תיק שכבר נערך במסך לא נדרס */
  router.post('/portfolio/import', (req, res) => {
    const household = String(req.body?.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const result = importPortfolio(household, req.body?.portfolio)
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    res.json({ imported: result.imported })
  })

  router.post('/symbols', (req, res) => {
    const household = String(req.body?.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const check = saveSymbolCheck(household, req.body)
    if (!check) return res.status(400).json({ error: 'תוצאות לא תקינות' })
    res.status(204).end()
  })

  /** השירות מדווח מה שם הבוט, כדי שהמסך יגיד לאן לשלוח את הקוד */
  router.post('/telegram/status', (req, res) => {
    const household = String(req.body?.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const bot = String(req.body?.botUsername ?? '')
    if (bot && /^[A-Za-z0-9_]{3,64}$/.test(bot)) telegramBot.set(household, bot)
    else telegramBot.delete(household)
    res.status(204).end()
  })

  /** הודעה בבוט שנראית כמו קוד. רק קוד תקף של משק הבית מקשר את הצ'אט */
  router.post('/telegram/link', (req, res) => {
    const household = String(req.body?.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const link = completeTelegramLink(household, req.body?.code, req.body?.chatId, req.body?.name)
    if (!link) return res.status(404).json({ error: 'קוד לא תקף' })
    res.json({ ok: true, lang: link.lang })
  })

  /**
   * ההקשר של סוכן ההוצאות — סיכומים בלבד, כפי שסער החליט.
   * כל מה שמוחזר כאן מגיע למודל; הגבול עצמו מוגדר ונבדק ב-agentContext.ts.
   */
  router.get('/context', (req, res) => {
    const household = String(req.query.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    res.json(buildSpendingContext(readState(household), readVersion(household)))
  })

  /** לפני כל קריאה למודל: האם התקציב החודשי נוצל */
  router.get('/budget', (req, res) => {
    const household = String(req.query.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    const { budgetUsd, spentUsd, monthStart: start } = agentBudget(household)
    res.json({ budgetUsd, spentUsd, monthStart: start })
  })

  router.get('/requests', (req, res) => {
    const household = String(req.query.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    serviceSeenAt.set(household, new Date().toISOString())
    const pending = db
      .prepare(
        `SELECT id, agent, kind, requested_at AS requestedAt FROM agent_requests
         WHERE household_id = ? AND taken_at IS NULL ORDER BY requested_at ASC`,
      )
      .all(household)
    res.json(pending)
  })

  router.post('/requests/:id/ack', (req, res) => {
    const household = String(req.body?.household ?? '')
    const id = String(req.params.id ?? '')
    const result = db
      .prepare(
        `UPDATE agent_requests SET taken_at = ? WHERE id = ? AND household_id = ? AND taken_at IS NULL`,
      )
      .run(new Date().toISOString(), id, household)
    if (!result.changes) return res.status(404).json({ error: 'הבקשה לא נמצאה' })
    res.status(204).end()
  })

  return router
}
