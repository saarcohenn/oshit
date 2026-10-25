import { randomInt } from 'node:crypto'
import { db } from './db.js'

/**
 * הגדרות הסוכנים, הזיכרון שלהם, התיק וקישור הטלגרם — כולם במסד, נערכים מהמסך.
 *
 * סוכן הוא נתונים: שם, הנחיות, לוח זמנים, מודל ורשימת כלים. הכלים עצמם הם
 * קוד בשירות הסוכנים, מתוך קטלוג סגור של כלים לקריאה בלבד — מכאן אפשר לבחור
 * מתוכו, לא להרחיב אותו. כך "הסוכנים לא מבצעים" נאכף מהמבנה גם כשסער מוסיף
 * סוכן חדש מהמסך, והנוסח של GUARDRAILS מצורף בקוד לפני כל הנחיה שנכתבה כאן.
 *
 * כל שמירה של הגדרה, זיכרון או תיק נרשמת כגרסה, ואפשר לחזור אליה.
 */

/* ---------------- קטלוג הכלים ---------------- */

export interface ToolInfo {
  label: string
  labelEn: string
  /** מה הכלי שולח ל-Anthropic — מוצג ליד תיבת הסימון בעורך */
  sends: string
  sendsEn: string
}

export const TOOL_CATALOG = {
  get_market_snapshot: {
    label: 'נתוני שוק',
    labelEn: 'Market data',
    sends: 'מחירים ציבוריים, שמות הנכסים, הסטופים והכללים שלך. לא כמויות ולא שווי.',
    sendsEn: 'Public prices, your holdings’ names, stops and rules. No quantities or values.',
  },
  screen_watchlist: {
    label: 'רשימת מעקב',
    labelEn: 'Watchlist',
    sends: 'שמות הנכסים ברשימת המעקב ומחירים ציבוריים.',
    sendsEn: 'The names on your watchlist and public prices.',
  },
  get_holdings: {
    label: 'נכסי התיק',
    labelEn: 'Holdings',
    sends: 'שמות וסמלים של הנכסים בתיק וברשימת המעקב בלבד.',
    sendsEn: 'Names and symbols of your holdings and watchlist only.',
  },
  get_spending_summary: {
    label: 'סיכום הוצאות',
    labelEn: 'Spending summary',
    sends: 'סכומים לפי קטגוריה וחודש, ותקציבים. רשימת העסקאות לא נשלחת.',
    sendsEn: 'Totals by category and month, and budgets. The transaction list is never sent.',
  },
  get_flagged_items: {
    label: 'פריטים חריגים',
    labelEn: 'Flagged items',
    sends: 'עד 15 פריטים חריגים: בית עסק, סכום ותאריך.',
    sendsEn: 'Up to 15 flagged items: merchant, amount and date.',
  },
  get_reconciliation: {
    label: 'התאמת כרטיסים',
    labelEn: 'Card reconciliation',
    sends: 'סכום החיוב לכל כרטיס (ארבע ספרות אחרונות) מול סכום העסקאות.',
    sendsEn: 'The charge per card (last four digits) against the transaction total.',
  },
  web_search: {
    label: 'חיפוש ברשת',
    labelEn: 'Web search',
    sends: 'שאילתות חיפוש. הסוכן קורא דפים שעלולים להכיל טקסט מטעה.',
    sendsEn: 'Search queries. The agent reads pages that may contain misleading text.',
  },
  read_agent_reports: {
    label: 'דוחות של סוכנים אחרים',
    labelEn: 'Other agents’ reports',
    sends: 'הסיכום והממצאים האחרונים של כל סוכן אחר.',
    sendsEn: 'The latest summary and findings of every other agent.',
  },
  update_memory: {
    label: 'עדכון זיכרון',
    labelEn: 'Update memory',
    sends: 'הזיכרון של הסוכן עצמו. הכלי כותב רק לזיכרון הזה.',
    sendsEn: 'The agent’s own notes. This tool writes only to those notes.',
  },
} satisfies Record<string, ToolInfo>

export type ToolId = keyof typeof TOOL_CATALOG
export const TOOL_IDS = Object.keys(TOOL_CATALOG) as ToolId[]

export const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const
export const EFFORTS = ['low', 'medium', 'high'] as const
export const NOTIFY = ['alerts', 'all', 'none'] as const

/* ---------------- הגדרת סוכן ---------------- */

export interface Schedule {
  /** 0 = ראשון */
  days: number[]
  hour: number
  minute: number
}

export interface AgentDef {
  id: string
  name: string
  nameEn: string
  role: string
  roleEn: string
  emoji: string
  color: string
  /** ההנחיות שסער כותב. GUARDRAILS מצורף לפניהן בקוד ואינו חלק מהן */
  instructions: string
  tools: ToolId[]
  /** ‏null — רק "הרץ עכשיו" */
  schedule: Schedule | null
  model: (typeof MODELS)[number]
  effort: (typeof EFFORTS)[number]
  maxIterations: number
  maxSearches: number
  notify: (typeof NOTIFY)[number]
  enabled: boolean
  builtin: boolean
}

export const LIMITS = {
  instructions: 8000,
  name: 40,
  role: 120,
  memory: 4000,
  reason: 200,
  versions: 50,
  agents: 20,
} as const

const SLUG = /^[a-z][a-z0-9-]{1,30}$/
const COLOR = /^#[0-9a-f]{6}$/i

/**
 * שלושת הסוכנים המקוריים, כפי שהיו בקוד — עכשיו נקודת התחלה שאפשר לערוך.
 * מחיקה שלהם רק מכבה אותם, וכך "שחזור לברירת המחדל" תמיד אפשרי.
 */
export const BUILTIN_DEFS: AgentDef[] = [
  {
    id: 'market',
    name: 'סוכן השוק',
    nameEn: 'Market agent',
    role: 'מחירים, ממוצעים, סטופים ורשימת המעקב — מול הכללים שלך',
    roleEn: 'Prices, moving averages, stops and your watchlist, against your rules',
    emoji: '📈',
    color: '#1a9e8f',
    instructions: `התפקיד שלך: סוכן השוק. אתה בודק את מצב השוק ואת הנכסים בתיק של סער מול הכללים שלו, ומדווח מה דורש תשומת לב — סטופ קרוב, נכס שירד מתחת לממוצע 200, מדד הייחוס מול ממוצע 200.

רשימת המעקב היא רשימה שסער בחר. אתה סורק אותה מול התנאים הטכניים שבכללים שלו, ומדווח אילו נכסים עומדים בהם ובאיזה סדר — זו עובדה לפי הכללים, לא המלצה. נסח כך: "X עומד בתנאי הכניסה הטכניים לפי הכללים". אל תציע נכסים שאינם ברשימה, וציין שמועד הדוח הקרוב לא נבדק כאן.`,
    tools: ['get_market_snapshot', 'screen_watchlist', 'update_memory'],
    schedule: { days: [2, 3, 4, 5, 6], hour: 8, minute: 41 },
    model: 'claude-opus-5-5',
    effort: 'medium',
    maxIterations: 8,
    maxSearches: 0,
    notify: 'alerts',
    enabled: true,
    builtin: true,
  },
  {
    id: 'spending',
    name: 'סוכן ההוצאות',
    nameEn: 'Spending agent',
    role: 'תקציבים, חריגות והתאמת חיובי כרטיס',
    roleEn: 'Budgets, anomalies and card charge reconciliation',
    emoji: '💳',
    color: '#e0892c',
    instructions: `התפקיד שלך: סוכן ההוצאות. אתה מקבל סיכומי הוצאות של משק הבית — סכומים לפי קטגוריה וחודש, חריגות מתקציב, פריטים חריגים, והתאמה בין חיובי הכרטיס בעו"ש לסכום העסקאות בקובץ הכרטיס.

מה חשוב לסער:
- קטגוריה שעברה או מתקרבת לתקציב בחודש הנוכחי.
- שינוי בולט מול החודשים הקודמים באותה קטגוריה.
- פריט חריג (חיוב גדול, בית עסק חדש) — לציין אותו, לא לשפוט אותו.
- חיוב כרטיס שלא תואם את סכום העסקאות. "no_card_data" אינו אי-התאמה: זה קובץ כרטיס שעוד לא יובא.

אין לך את רשימת העסקאות, וזה מכוון. אל תבקש אותה ואל תנחש מה יש בה.`,
    tools: ['get_spending_summary', 'get_flagged_items', 'get_reconciliation', 'update_memory'],
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], hour: 7, minute: 30 },
    model: 'claude-opus-5-5',
    effort: 'medium',
    maxIterations: 8,
    maxSearches: 0,
    notify: 'alerts',
    enabled: true,
    builtin: true,
  },
  {
    id: 'research',
    name: 'סוכן המחקר',
    nameEn: 'Research agent',
    role: 'חדשות ודוחות קרובים לתיק ולרשימת המעקב',
    roleEn: 'News and upcoming earnings for your holdings and watchlist',
    emoji: '🔎',
    color: '#7b6cf0',
    instructions: `התפקיד שלך: סוכן המחקר השבועי. אתה מחפש ברשת חדשות מהשבוע האחרון ומועדי דוחות קרובים לנכסים שבתיק של סער, ומדווח מה עשוי להיות רלוונטי לכללים שלו. למשל: דוח רבעוני בשבוע הקרוב — הכללים שלו אוסרים כניסה בשבוע שלפני דוח.

לנכסים ברשימת המעקב בדוק רק מועד דוח קרוב, אם יש כזה. אם החיפושים לא מספיקים לכולם, תעדף את הנכסים שבתיק, וציין אילו לא נבדקו. אל תציע נכסים שאינם ברשימות.

ציין את המקור לכל ממצא.`,
    tools: ['get_holdings', 'web_search', 'update_memory'],
    schedule: { days: [0], hour: 8, minute: 22 },
    model: 'claude-opus-5-5',
    effort: 'medium',
    maxIterations: 8,
    maxSearches: 8,
    notify: 'alerts',
    enabled: true,
    builtin: true,
  },
]

export const BUILTIN_IDS = BUILTIN_DEFS.map((d) => d.id)

/** תבנית לסוכן חדש מהמסך */
export const NEW_AGENT_TEMPLATE: Omit<AgentDef, 'id'> = {
  name: '',
  nameEn: '',
  role: '',
  roleEn: '',
  emoji: '🤖',
  color: '#3b82f6',
  instructions: `התפקיד שלך: <מה הסוכן בודק>.

מה חשוב לסער:
- <דבר ראשון שצריך לבדוק>
- <מתי זו התראה ומתי זה מידע>`,
  tools: ['update_memory'],
  schedule: null,
  model: 'claude-sonnet-5-5',
  effort: 'medium',
  maxIterations: 6,
  maxSearches: 0,
  notify: 'alerts',
  enabled: true,
  builtin: false,
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * בדיקת הגדרה שמגיעה מהמסך. כל שדה נבדק בנפרד, וכל מה שלא מוכר נזרק —
 * לא נשמר "ליתר ביטחון". builtin נקבע בשרת, לא בגוף הבקשה.
 */
export function validateAgentDef(body: unknown, builtin: boolean): Validation<AgentDef> {
  const b = (body ?? {}) as Record<string, unknown>
  const id = str(b.id)
  if (!SLUG.test(id)) return { ok: false, error: 'מזהה לא תקין: אותיות לטיניות קטנות, ספרות ומקף' }

  const name = str(b.name)
  const nameEn = str(b.nameEn) || name
  if (!name || name.length > LIMITS.name || nameEn.length > LIMITS.name) return { ok: false, error: 'שם לא תקין' }
  const role = str(b.role)
  const roleEn = str(b.roleEn) || role
  if (role.length > LIMITS.role || roleEn.length > LIMITS.role) return { ok: false, error: 'תיאור ארוך מדי' }

  const emoji = str(b.emoji) || '🤖'
  if ([...emoji].length > 4) return { ok: false, error: 'סמל ארוך מדי' }
  const color = str(b.color)
  if (!COLOR.test(color)) return { ok: false, error: 'צבע לא תקין' }

  const instructions = typeof b.instructions === 'string' ? b.instructions.trim() : ''
  if (!instructions) return { ok: false, error: 'חסרות הנחיות' }
  if (instructions.length > LIMITS.instructions) return { ok: false, error: 'ההנחיות ארוכות מדי' }

  if (!Array.isArray(b.tools)) return { ok: false, error: 'רשימת כלים לא תקינה' }
  const tools = [...new Set(b.tools.map(String))]
  const unknown = tools.filter((t) => !TOOL_IDS.includes(t as ToolId))
  if (unknown.length) return { ok: false, error: `כלי לא מוכר: ${unknown.join(', ')}` }

  let schedule: Schedule | null = null
  if (b.schedule != null) {
    const s = b.schedule as Record<string, unknown>
    const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number))].sort() : []
    const hour = Number(s.hour)
    const minute = Number(s.minute)
    if (
      !days.length ||
      !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
      !Number.isInteger(hour) ||
      hour < 0 ||
      hour > 23 ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    ) {
      return { ok: false, error: 'לוח זמנים לא תקין' }
    }
    schedule = { days, hour, minute }
  }

  if (!MODELS.includes(b.model as AgentDef['model'])) return { ok: false, error: 'מודל לא מוכר' }
  if (!EFFORTS.includes(b.effort as AgentDef['effort'])) return { ok: false, error: 'רמת מאמץ לא מוכרת' }
  if (!NOTIFY.includes(b.notify as AgentDef['notify'])) return { ok: false, error: 'הגדרת התראות לא מוכרת' }

  const maxIterations = Number(b.maxIterations)
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 12) {
    return { ok: false, error: 'מספר סבבים בין 1 ל-12' }
  }
  const maxSearches = tools.includes('web_search') ? Number(b.maxSearches) : 0
  if (!Number.isInteger(maxSearches) || maxSearches < 0 || maxSearches > 10) {
    return { ok: false, error: 'מספר חיפושים בין 0 ל-10' }
  }

  return {
    ok: true,
    value: {
      id,
      name,
      nameEn,
      role,
      roleEn,
      emoji,
      color: color.toLowerCase(),
      instructions,
      tools: tools as ToolId[],
      schedule,
      model: b.model as AgentDef['model'],
      effort: b.effort as AgentDef['effort'],
      maxIterations,
      maxSearches,
      notify: b.notify as AgentDef['notify'],
      enabled: b.enabled !== false,
      builtin,
    },
  }
}

/* ---------------- שמירה וגרסאות ---------------- */

type Row = Record<string, any>

const now = () => new Date().toISOString()

function parseDef(raw: string, builtin: number): AgentDef {
  return { ...(JSON.parse(raw) as AgentDef), builtin: !!builtin }
}

/** מוסיף סוכנים מובנים שחסרים. בטוח לקרוא שוב ושוב — קיים לא נדרס */
export function ensureBuiltins(householdId: string) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agent_defs (household_id, id, def, builtin, position, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  )
  db.transaction(() => {
    BUILTIN_DEFS.forEach((d, i) => insert.run(householdId, d.id, JSON.stringify(d), i, now()))
  })()
}

export function listAgentDefs(householdId: string): AgentDef[] {
  ensureBuiltins(householdId)
  return (
    db
      .prepare('SELECT def, builtin FROM agent_defs WHERE household_id = ? ORDER BY position, id')
      .all(householdId) as Row[]
  ).map((r) => parseDef(r.def, r.builtin))
}

export function getAgentDef(householdId: string, id: string): AgentDef | null {
  ensureBuiltins(householdId)
  const row = db.prepare('SELECT def, builtin FROM agent_defs WHERE household_id = ? AND id = ?').get(householdId, id) as
    | Row
    | undefined
  return row ? parseDef(row.def, row.builtin) : null
}

/** האם יש סוכן כזה — הצינור מקבל אירועים רק לסוכנים שקיימים */
export function agentExists(householdId: string, id: string): boolean {
  return getAgentDef(householdId, id) != null
}

function recordVersion(table: string, householdId: string, agentId: string | null, payload: Record<string, unknown>) {
  const columns = ['household_id', ...(agentId ? ['agent_id'] : []), ...Object.keys(payload), 'saved_at']
  const values = [householdId, ...(agentId ? [agentId] : []), ...Object.values(payload), now()]
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...values)
  // רק 50 הגרסאות האחרונות — היסטוריה לשחזור, לא ארכיון
  const scope = agentId ? 'household_id = ? AND agent_id = ?' : 'household_id = ?'
  const args = agentId ? [householdId, agentId] : [householdId]
  db.prepare(
    `DELETE FROM ${table} WHERE ${scope} AND seq NOT IN (
       SELECT seq FROM ${table} WHERE ${scope} ORDER BY seq DESC LIMIT ?
     )`,
  ).run(...args, ...args, LIMITS.versions)
}

export type SaveResult = { ok: true; def: AgentDef } | { ok: false; status: number; error: string }

/** שמירת הגדרה — חדשה או קיימת. כל שמירה נרשמת כגרסה */
export function saveAgentDef(householdId: string, body: unknown, userId: string, creating: boolean): SaveResult {
  const existing = getAgentDef(householdId, str((body as Row)?.id))
  if (creating && existing) return { ok: false, status: 400, error: 'כבר יש סוכן עם המזהה הזה' }
  if (!creating && !existing) return { ok: false, status: 404, error: 'הסוכן לא נמצא' }
  if (creating) {
    const count = db.prepare('SELECT COUNT(*) AS n FROM agent_defs WHERE household_id = ?').get(householdId) as { n: number }
    if (count.n >= LIMITS.agents) return { ok: false, status: 400, error: `עד ${LIMITS.agents} סוכנים למשק בית` }
  }
  const result = validateAgentDef(body, existing?.builtin ?? false)
  if (!result.ok) return { ok: false, status: 400, error: result.error }
  const def = result.value
  const json = JSON.stringify(def)
  db.transaction(() => {
    if (creating) {
      const max = db.prepare('SELECT MAX(position) AS p FROM agent_defs WHERE household_id = ?').get(householdId) as { p: number | null }
      db.prepare(
        `INSERT INTO agent_defs (household_id, id, def, builtin, position, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
      ).run(householdId, def.id, json, (max.p ?? 0) + 1, now())
    } else {
      db.prepare('UPDATE agent_defs SET def = ?, updated_at = ? WHERE household_id = ? AND id = ?').run(
        json,
        now(),
        householdId,
        def.id,
      )
    }
    recordVersion('agent_def_versions', householdId, def.id, { def: json, saved_by: userId })
  })()
  return { ok: true, def }
}

/** מחיקה. סוכן מובנה רק נכבה — כדי שתמיד יהיה ממה לחזור */
export function deleteAgentDef(householdId: string, id: string, userId: string): SaveResult {
  const def = getAgentDef(householdId, id)
  if (!def) return { ok: false, status: 404, error: 'הסוכן לא נמצא' }
  if (def.builtin) return saveAgentDef(householdId, { ...def, enabled: false }, userId, false)
  db.transaction(() => {
    db.prepare('DELETE FROM agent_defs WHERE household_id = ? AND id = ?').run(householdId, id)
    db.prepare('DELETE FROM agent_memory WHERE household_id = ? AND agent_id = ?').run(householdId, id)
  })()
  return { ok: true, def: { ...def, enabled: false } }
}

export function agentDefVersions(householdId: string, id: string) {
  return (
    db
      .prepare(
        `SELECT v.seq, v.def, v.saved_at AS savedAt, COALESCE(u.name, v.saved_by) AS savedBy
         FROM agent_def_versions v LEFT JOIN users u ON u.id = v.saved_by
         WHERE v.household_id = ? AND v.agent_id = ? ORDER BY v.seq DESC`,
      )
      .all(householdId, id) as Row[]
  ).map((r) => ({ seq: r.seq as number, savedAt: r.savedAt as string, savedBy: r.savedBy as string, def: JSON.parse(r.def) as AgentDef }))
}

/** שחזור גרסה — נשמר כגרסה חדשה, כך שגם השחזור עצמו ניתן לביטול */
export function revertAgentDef(householdId: string, id: string, seq: number, userId: string): SaveResult {
  const row = db
    .prepare('SELECT def FROM agent_def_versions WHERE household_id = ? AND agent_id = ? AND seq = ?')
    .get(householdId, id, seq) as Row | undefined
  if (!row) return { ok: false, status: 404, error: 'הגרסה לא נמצאה' }
  return saveAgentDef(householdId, JSON.parse(row.def), userId, false)
}

/** מחזיר סוכן מובנה להגדרות המקוריות שלו */
export function resetBuiltin(householdId: string, id: string, userId: string): SaveResult {
  const original = BUILTIN_DEFS.find((d) => d.id === id)
  if (!original) return { ok: false, status: 404, error: 'אין גרסה מקורית לסוכן הזה' }
  return saveAgentDef(householdId, original, userId, false)
}

/* ---------------- זיכרון ---------------- */

export function agentMemory(householdId: string, id: string): string {
  const row = db.prepare('SELECT notes FROM agent_memory WHERE household_id = ? AND agent_id = ?').get(householdId, id) as
    | Row
    | undefined
  return row?.notes ?? ''
}

export function allAgentMemory(householdId: string): Record<string, string> {
  return Object.fromEntries(
    (db.prepare('SELECT agent_id, notes FROM agent_memory WHERE household_id = ?').all(householdId) as Row[]).map((r) => [
      r.agent_id,
      r.notes,
    ]),
  )
}

export type MemoryResult = { ok: true; notes: string } | { ok: false; error: string }

/**
 * כתיבת זיכרון — מהסוכן (author = 'agent') או מהמסך (author = מזהה המשתמש).
 * הזיכרון הוא טקסט חופשי בלבד, מוגבל באורך, וכל שינוי נשמר כגרסה עם סיבה.
 */
export function saveAgentMemory(
  householdId: string,
  id: string,
  notes: unknown,
  reason: unknown,
  author: string,
): MemoryResult {
  if (!agentExists(householdId, id)) return { ok: false, error: 'הסוכן לא נמצא' }
  const text = typeof notes === 'string' ? notes.trim() : ''
  if (text.length > LIMITS.memory) return { ok: false, error: `הזיכרון מוגבל ל-${LIMITS.memory} תווים` }
  const why = (typeof reason === 'string' ? reason.trim() : '').slice(0, LIMITS.reason)
  db.transaction(() => {
    db.prepare(
      `INSERT INTO agent_memory (household_id, agent_id, notes, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(household_id, agent_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`,
    ).run(householdId, id, text, now())
    recordVersion('agent_memory_versions', householdId, id, { notes: text, reason: why, saved_by: author })
  })()
  return { ok: true, notes: text }
}

export function agentMemoryVersions(householdId: string, id: string) {
  return db
    .prepare(
      `SELECT v.seq, v.notes, v.reason, v.saved_at AS savedAt, COALESCE(u.name, v.saved_by) AS savedBy
       FROM agent_memory_versions v LEFT JOIN users u ON u.id = v.saved_by
       WHERE v.household_id = ? AND v.agent_id = ? ORDER BY v.seq DESC`,
    )
    .all(householdId, id) as Array<{ seq: number; notes: string; reason: string; savedAt: string; savedBy: string }>
}

export function revertAgentMemory(householdId: string, id: string, seq: number, userId: string): MemoryResult {
  const row = db
    .prepare('SELECT notes FROM agent_memory_versions WHERE household_id = ? AND agent_id = ? AND seq = ?')
    .get(householdId, id, seq) as Row | undefined
  if (!row) return { ok: false, error: 'הגרסה לא נמצאה' }
  return saveAgentMemory(householdId, id, row.notes, `שוחזר מגרסה ${seq}`, userId)
}

/* ---------------- התיק ---------------- */

export interface Holding {
  name: string
  symbol: string | null
  currency: string
  stop?: number
  stopLimit?: number
  note?: string
}

export interface WatchItem {
  name: string
  symbol: string
  note?: string
}

export interface Portfolio {
  benchmark: { name: string; symbol: string }
  holdings: Holding[]
  watchlist: WatchItem[]
  rules: string
}

const SYMBOL = /^[A-Za-z0-9^.=-]{1,20}$/
const CURRENCY = /^[A-Z]{3}$/
const MAX_HOLDINGS = 50
const MAX_WATCHLIST = 100

const positive = (v: unknown) => (v == null || v === '' ? undefined : Number(v))

/** בדיקת התיק מהמסך. סמל נבדק בצורה בלבד — האם הוא קיים, בודק שירות הסוכנים */
export function validatePortfolio(body: unknown): Validation<Portfolio> {
  const b = (body ?? {}) as Record<string, any>
  const benchmark = { name: str(b.benchmark?.name), symbol: str(b.benchmark?.symbol) }
  if (!benchmark.name || !SYMBOL.test(benchmark.symbol)) return { ok: false, error: 'מדד ייחוס לא תקין' }

  if (!Array.isArray(b.holdings) || b.holdings.length > MAX_HOLDINGS) return { ok: false, error: 'רשימת נכסים לא תקינה' }
  const holdings: Holding[] = []
  for (const h of b.holdings) {
    const name = str(h?.name)
    const symbol = str(h?.symbol) || null
    const currency = str(h?.currency).toUpperCase()
    const stop = positive(h?.stop)
    const stopLimit = positive(h?.stopLimit)
    if (!name || name.length > 80) return { ok: false, error: 'שם נכס לא תקין' }
    if (symbol && !SYMBOL.test(symbol)) return { ok: false, error: `סמל לא תקין: ${symbol}` }
    if (!CURRENCY.test(currency)) return { ok: false, error: `מטבע לא תקין אצל ${name}` }
    for (const [label, v] of [['סטופ', stop], ['לימיט', stopLimit]] as const) {
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) return { ok: false, error: `${label} לא תקין אצל ${name}` }
    }
    const note = str(h?.note).slice(0, 200)
    holdings.push({
      name,
      symbol,
      currency,
      ...(stop !== undefined ? { stop } : {}),
      ...(stopLimit !== undefined ? { stopLimit } : {}),
      ...(note ? { note } : {}),
    })
  }

  const rawWatch = b.watchlist ?? []
  if (!Array.isArray(rawWatch) || rawWatch.length > MAX_WATCHLIST) return { ok: false, error: 'רשימת מעקב לא תקינה' }
  const watchlist: WatchItem[] = []
  for (const w of rawWatch) {
    const name = str(w?.name)
    const symbol = str(w?.symbol)
    if (!name || name.length > 80 || !SYMBOL.test(symbol)) return { ok: false, error: `פריט לא תקין ברשימת המעקב: ${name || symbol}` }
    const note = str(w?.note).slice(0, 200)
    watchlist.push({ name, symbol, ...(note ? { note } : {}) })
  }

  const rules = typeof b.rules === 'string' ? b.rules.trim() : ''
  if (rules.length > LIMITS.instructions) return { ok: false, error: 'הכללים ארוכים מדי' }
  return { ok: true, value: { benchmark, holdings, watchlist, rules } }
}

export function getPortfolio(householdId: string): Portfolio | null {
  const row = db.prepare('SELECT doc FROM agent_portfolio WHERE household_id = ?').get(householdId) as Row | undefined
  return row ? (JSON.parse(row.doc) as Portfolio) : null
}

export type PortfolioResult = { ok: true; portfolio: Portfolio } | { ok: false; status: number; error: string }

export function savePortfolio(householdId: string, body: unknown, author: string): PortfolioResult {
  const result = validatePortfolio(body)
  if (!result.ok) return { ok: false, status: 400, error: result.error }
  const doc = JSON.stringify(result.value)
  db.transaction(() => {
    db.prepare(
      `INSERT INTO agent_portfolio (household_id, doc, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(household_id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`,
    ).run(householdId, doc, now())
    recordVersion('agent_portfolio_versions', householdId, null, { doc, saved_by: author })
  })()
  return { ok: true, portfolio: result.value }
}

/**
 * ייבוא חד-פעמי מקובץ התיק שבשרת — רק כשאין עדיין תיק במסד. כך הקובץ הישן
 * לא דורס עריכה שנעשתה במסך, גם אם השירות עולה מחדש עם הקובץ עדיין מותקן.
 */
export function importPortfolio(householdId: string, body: unknown): PortfolioResult & { imported?: boolean } {
  const existing = getPortfolio(householdId)
  if (existing) return { ok: true, portfolio: existing, imported: false }
  const saved = savePortfolio(householdId, body, 'import')
  return saved.ok ? { ...saved, imported: true } : saved
}

export function portfolioVersions(householdId: string) {
  return (
    db
      .prepare(
        `SELECT v.seq, v.doc, v.saved_at AS savedAt, COALESCE(u.name, v.saved_by) AS savedBy
         FROM agent_portfolio_versions v LEFT JOIN users u ON u.id = v.saved_by
         WHERE v.household_id = ? ORDER BY v.seq DESC`,
      )
      .all(householdId) as Row[]
  ).map((r) => ({ seq: r.seq as number, savedAt: r.savedAt as string, savedBy: r.savedBy as string, portfolio: JSON.parse(r.doc) as Portfolio }))
}

export function revertPortfolio(householdId: string, seq: number, userId: string): PortfolioResult {
  const row = db
    .prepare('SELECT doc FROM agent_portfolio_versions WHERE household_id = ? AND seq = ?')
    .get(householdId, seq) as Row | undefined
  if (!row) return { ok: false, status: 404, error: 'הגרסה לא נמצאה' }
  return savePortfolio(householdId, JSON.parse(row.doc), userId)
}

/* ---------------- הגדרות קטנות: טלגרם, בדיקת סמלים ---------------- */

function getSetting<T>(householdId: string, key: string): T | null {
  const row = db.prepare('SELECT value FROM agent_settings WHERE household_id = ? AND key = ?').get(householdId, key) as
    | Row
    | undefined
  return row ? (JSON.parse(row.value) as T) : null
}

function setSetting(householdId: string, key: string, value: unknown) {
  if (value == null) {
    db.prepare('DELETE FROM agent_settings WHERE household_id = ? AND key = ?').run(householdId, key)
    return
  }
  db.prepare(
    `INSERT INTO agent_settings (household_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(household_id, key) DO UPDATE SET value = excluded.value`,
  ).run(householdId, key, JSON.stringify(value))
}

export interface TelegramLink {
  chatId: number
  name: string
  lang: 'he' | 'en'
  linkedAt: string
}

/** אותיות בלי 0/O ו-1/I — קוד שמקלידים בטלפון */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_MS = 15 * 60_000

export function telegramLink(householdId: string): TelegramLink | null {
  return getSetting<TelegramLink>(householdId, 'telegram')
}

/** קוד חד-פעמי לקישור. קוד חדש מבטל את הקודם */
export function startTelegramLink(householdId: string, lang: 'he' | 'en') {
  const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()
  setSetting(householdId, 'telegram_code', { code, expiresAt, lang })
  return { code, expiresAt }
}

/**
 * השירות מצא בבוט הודעה שנראית כמו קוד. רק קוד תקף של משק הבית הזה מקשר;
 * כל צ'אט אחר לא מקבל כלום. הקוד נמחק אחרי שימוש אחד.
 */
export function completeTelegramLink(householdId: string, code: unknown, chatId: unknown, name: unknown, at = new Date()) {
  const pending = getSetting<{ code: string; expiresAt: string; lang: 'he' | 'en' }>(householdId, 'telegram_code')
  const typed = String(code ?? '').trim().toUpperCase()
  if (!pending || pending.code !== typed || Date.parse(pending.expiresAt) < at.getTime()) return null
  if (!Number.isSafeInteger(Number(chatId))) return null
  const link: TelegramLink = {
    chatId: Number(chatId),
    name: String(name ?? '').slice(0, 64),
    lang: pending.lang,
    linkedAt: at.toISOString(),
  }
  setSetting(householdId, 'telegram', link)
  setSetting(householdId, 'telegram_code', null)
  return link
}

export function unlinkTelegram(householdId: string) {
  setSetting(householdId, 'telegram', null)
  setSetting(householdId, 'telegram_code', null)
}

export function setTelegramLang(householdId: string, lang: 'he' | 'en') {
  const link = telegramLink(householdId)
  if (link) setSetting(householdId, 'telegram', { ...link, lang })
}

export function pendingTelegramCode(householdId: string) {
  const pending = getSetting<{ code: string; expiresAt: string }>(householdId, 'telegram_code')
  return pending && Date.parse(pending.expiresAt) > Date.now() ? pending : null
}

export interface SymbolCheck {
  checkedAt: string
  results: Array<{ symbol: string; ok: boolean; currency?: string; error?: string }>
}

export function symbolCheck(householdId: string): SymbolCheck | null {
  return getSetting<SymbolCheck>(householdId, 'symbol_check')
}

export function saveSymbolCheck(householdId: string, body: unknown): SymbolCheck | null {
  const raw = (body as Row)?.results
  if (!Array.isArray(raw) || raw.length > MAX_HOLDINGS + MAX_WATCHLIST + 1) return null
  const results = raw
    .filter((r) => SYMBOL.test(String(r?.symbol ?? '')))
    .map((r) => ({
      symbol: String(r.symbol),
      ok: r.ok === true,
      ...(r.currency ? { currency: String(r.currency).slice(0, 8) } : {}),
      ...(r.error ? { error: String(r.error).slice(0, 200) } : {}),
    }))
  const check = { checkedAt: now(), results }
  setSetting(householdId, 'symbol_check', check)
  return check
}

/* ---------------- דוחות של סוכנים אחרים ---------------- */

/** הסיכום והממצאים של הריצה המוצלחת האחרונה של כל סוכן, חוץ מזה ששואל */
export function latestReports(householdId: string, except: string) {
  const runs = db
    .prepare(
      `SELECT r.id, r.agent, r.finished_at AS finishedAt, r.summary, r.summary_en AS summaryEn
       FROM agent_runs r
       WHERE r.household_id = ? AND r.status = 'done' AND r.demo = 0 AND r.agent != ?
         AND r.finished_at = (SELECT MAX(finished_at) FROM agent_runs x
                              WHERE x.household_id = r.household_id AND x.agent = r.agent
                                AND x.status = 'done' AND x.demo = 0)`,
    )
    .all(householdId, except) as Row[]
  const findings = db.prepare(
    `SELECT type, text FROM agent_events WHERE household_id = ? AND run_id = ? AND type IN ('finding', 'alert') ORDER BY seq`,
  )
  return runs.map((r) => ({
    agent: r.agent as string,
    finishedAt: r.finishedAt as string,
    summary: r.summary as string | null,
    findings: (findings.all(householdId, r.id) as Row[]).map((f) => ({ severity: f.type === 'alert' ? 'alert' : 'info', text: f.text })),
  }))
}
