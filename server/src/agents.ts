import { createHash, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { db, uid } from './db.js'
import { broadcastAgent } from './events.js'
import { readState, readVersion } from './state.js'
import { buildSpendingContext } from './agentContext.js'

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

export const AGENT_IDS = ['market', 'spending', 'research'] as const
export type AgentId = (typeof AGENT_IDS)[number]

export const EVENT_TYPES = ['start', 'thinking', 'tool_call', 'finding', 'alert', 'done', 'error'] as const
export type AgentEventType = (typeof EVENT_TYPES)[number]

const TERMINAL: AgentEventType[] = ['done', 'error']

/** כמה ריצות נשמרות לכל סוכן. ההיסטוריה היא לתצוגה, לא ארכיון */
const KEEP_RUNS = 50

const LIMITS = { text: 2000, tool: 64, data: 8000 } as const

export interface AgentEventInput {
  runId: string
  agent: AgentId
  type: AgentEventType
  text?: string
  tool?: string
  data?: unknown
  usage?: { input: number; output: number }
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
  if (!AGENT_IDS.includes(b.agent as AgentId)) return { ok: false, error: 'סוכן לא מוכר' }
  if (!EVENT_TYPES.includes(b.type as AgentEventType)) return { ok: false, error: 'סוג אירוע לא מוכר' }

  const event: AgentEventInput = { runId, agent: b.agent as AgentId, type: b.type as AgentEventType }

  if (b.text != null) {
    const text = String(b.text)
    if (text.length > LIMITS.text) return { ok: false, error: 'טקסט ארוך מדי' }
    event.text = text
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
    event.usage = { input, output }
  }
  return { ok: true, event }
}

/* ---------------- שמירה ושידור ---------------- */

const householdExists = (id: string) =>
  Boolean(db.prepare('SELECT 1 FROM households WHERE id = ?').get(id))

/** מוחק ריצות ישנות מעבר לתקרה, יחד עם האירועים שלהן */
function prune(householdId: string, agent: AgentId) {
  const stale = db
    .prepare(
      `SELECT id FROM agent_runs WHERE household_id = ? AND agent = ?
       ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
    )
    .all(householdId, agent, KEEP_RUNS) as Array<{ id: string }>
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
      `INSERT INTO agent_events (household_id, run_id, agent, type, at, text, tool, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      householdId,
      input.runId,
      input.agent,
      input.type,
      at,
      input.text ?? null,
      input.tool ?? null,
      input.data === undefined ? null : JSON.stringify(input.data),
    )

    if (TERMINAL.includes(input.type)) {
      db.prepare(
        `UPDATE agent_runs SET status = ?, finished_at = ?, summary = ?,
           input_tokens = ?, output_tokens = ?
         WHERE household_id = ? AND id = ?`,
      ).run(
        input.type,
        at,
        input.text ?? null,
        input.usage?.input ?? null,
        input.usage?.output ?? null,
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
              input_tokens AS inputTokens, output_tokens AS outputTokens, demo
       FROM agent_runs WHERE household_id = ? ORDER BY started_at DESC LIMIT ?`,
    )
    .all(householdId, limit) as Row[]
  if (!runs.length) return []

  const placeholders = runs.map(() => '?').join(',')
  const events = db
    .prepare(
      `SELECT run_id AS runId, agent, type, at, text, tool, data FROM agent_events
       WHERE household_id = ? AND run_id IN (${placeholders}) ORDER BY seq ASC`,
    )
    .all(householdId, ...runs.map((r) => r.id)) as Row[]

  const byRun = new Map<string, Row[]>()
  for (const e of events) {
    const list = byRun.get(e.runId) ?? []
    list.push({
      runId: e.runId,
      agent: e.agent,
      type: e.type,
      at: e.at,
      ...(e.text ? { text: e.text } : {}),
      ...(e.tool ? { tool: e.tool } : {}),
      ...(e.data ? { data: safeParse(e.data) } : {}),
    })
    byRun.set(e.runId, list)
  }

  return runs.map((r) => ({
    id: r.id,
    agent: r.agent,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt ?? null,
    summary: r.summary ?? null,
    inputTokens: r.inputTokens ?? null,
    outputTokens: r.outputTokens ?? null,
    demo: !!r.demo,
    events: byRun.get(r.id) ?? [],
  }))
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

export type EnqueueResult =
  | { ok: true; id: string; existing: boolean }
  | { ok: false; reason: 'not_configured' }

/** בקשה פתוחה אחת לכל סוכן: לחיצה כפולה לא תריץ ותחייב פעמיים */
export function enqueueRun(householdId: string, agent: AgentId, userId: string): EnqueueResult {
  if (!agentsConfigured()) return { ok: false, reason: 'not_configured' }
  const pending = db
    .prepare(
      `SELECT id FROM agent_requests WHERE household_id = ? AND agent = ? AND taken_at IS NULL`,
    )
    .get(householdId, agent) as { id: string } | undefined
  if (pending) return { ok: true, id: pending.id, existing: true }
  const id = uid('rq_')
  db.prepare(
    `INSERT INTO agent_requests (id, household_id, agent, requested_at, requested_by)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, householdId, agent, new Date().toISOString(), userId)
  return { ok: true, id, existing: false }
}

/* ---------------- הדגמה ---------------- */

type DemoStep = { at: number; agent: AgentId; type: AgentEventType; text?: string; tool?: string }

/**
 * תסריט הדגמה של שלושת הסוכנים.
 *
 * עובר באותו צינור בדיוק — שמירה, SSE, מסך — כך שהדגמה שעובדת מוכיחה
 * שהצינור עובד, עוד לפני שיש מפתח API. כל טקסט מתחיל ב"הדגמה" והריצה
 * מסומנת demo: הערכים כאן לדוגמה בלבד, ואסור שייראו כמו מצב אמיתי של התיק.
 */
const DEMO_SCRIPT: DemoStep[] = [
  { at: 0, agent: 'market', type: 'start', text: 'הדגמה · סריקת שוק יומית' },
  { at: 1500, agent: 'market', type: 'thinking' },
  { at: 3000, agent: 'market', type: 'tool_call', tool: 'get_market_snapshot', text: 'מושך מחירים ומחשב ממוצעים נעים' },
  { at: 4000, agent: 'spending', type: 'start', text: 'הדגמה · בדיקת הוצאות' },
  { at: 5500, agent: 'spending', type: 'tool_call', tool: 'get_spending_summary', text: 'סכומים לפי קטגוריה וחודש' },
  { at: 7000, agent: 'market', type: 'thinking' },
  { at: 9000, agent: 'research', type: 'start', text: 'הדגמה · מחקר שבועי' },
  { at: 9000, agent: 'spending', type: 'tool_call', tool: 'get_reconciliation', text: 'חיובי כרטיס מול סכום העסקאות' },
  { at: 9500, agent: 'market', type: 'finding', text: 'הדגמה · S&P 500 מעל הממוצע ה-200 (ערך לדוגמה)' },
  { at: 10500, agent: 'research', type: 'thinking' },
  { at: 12000, agent: 'market', type: 'done', text: 'הדגמה · ארבעה נכסים נבדקו, אף סטופ לא קרוב (ערך לדוגמה)' },
  { at: 12000, agent: 'research', type: 'tool_call', tool: 'web_search', text: 'מחפש דוחות כספיים קרובים' },
  { at: 12500, agent: 'spending', type: 'thinking' },
  { at: 15000, agent: 'spending', type: 'alert', text: 'הדגמה · מסעדות 18% מעל התקציב החודשי (ערך לדוגמה)' },
  { at: 17000, agent: 'research', type: 'tool_call', tool: 'web_search', text: 'מאמת תאריכים מול מקור נוסף' },
  { at: 18000, agent: 'spending', type: 'done', text: 'הדגמה · חריגה אחת, ההתאמה מול הכרטיסים תקינה (ערך לדוגמה)' },
  { at: 21000, agent: 'research', type: 'thinking' },
  { at: 23500, agent: 'research', type: 'finding', text: 'הדגמה · דוח רבעוני קרוב לאחד הנכסים — שבוע חסימה לפי הכללים (ערך לדוגמה)' },
  { at: 26000, agent: 'research', type: 'done', text: 'הדגמה · שני נכסים עם דוח בשבועיים הקרובים (ערך לדוגמה)' },
]

const DEMO_LENGTH_MS = Math.max(...DEMO_SCRIPT.map((s) => s.at))

const demoRunning = new Set<string>()

/** מפעיל הדגמה. אחת בכל רגע לכל משק בית — לחיצה חוזרת לא מכפילה דמויות */
export function startDemo(householdId: string): boolean {
  if (demoRunning.has(householdId)) return false
  demoRunning.add(householdId)
  const stamp = Date.now().toString(36)
  const runIds = Object.fromEntries(AGENT_IDS.map((a) => [a, `demo_${a}_${stamp}`])) as Record<AgentId, string>
  for (const step of DEMO_SCRIPT) {
    setTimeout(() => {
      // משק בית שנמחק באמצע ההדגמה — אין לאן לכתוב
      if (!householdExists(householdId)) return
      recordAgentEvent(
        householdId,
        { runId: runIds[step.agent], agent: step.agent, type: step.type, text: step.text, tool: step.tool },
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
    recordAgentEvent(household, result.event)
    res.status(204).end()
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

  router.get('/requests', (req, res) => {
    const household = String(req.query.household ?? '')
    if (!householdExists(household)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    serviceSeenAt.set(household, new Date().toISOString())
    const pending = db
      .prepare(
        `SELECT id, agent, requested_at AS requestedAt FROM agent_requests
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
