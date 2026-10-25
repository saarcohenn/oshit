import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { readConfig, readPortfolioFile } from './config.js'
import type { AgentDef, ServicePayload } from './defs.js'
import { Oshit, type AgentId } from './oshit.js'
import { fetchMany } from './prices.js'
import { execute, type RunOutcome, type Trigger } from './run.js'
import { isDue, wallClock } from './schedule.js'
import { Telegram, formatMessage, parseLinkCode, shouldNotify } from './telegram.js'

/**
 * השירות: מתזמן, תור "הרץ עכשיו", טלגרם ודופק.
 *
 * הסוכנים עצמם מוגדרים ב-Osh.it ונמשכים בכל סבב — סוכן שנוסף או נערך במסך
 * רץ בלי פריסה ובלי הפעלה מחדש. ריצה אחת בכל רגע: סוכנים שרצים במקביל לא
 * חוסכים כלום, הם רק מסבכים את העלות ואת המסך.
 */

const POLL_MS = 20_000
const TICK_MS = 30_000

interface State {
  lastRunDate: Record<AgentId, string>
  /** גרסת משק הבית בריצה המוצלחת האחרונה, לכל סוכן שעובד רק עם הוצאות */
  lastSpendingVersion: Record<AgentId, number>
  /** ההודעה הבאה לקרוא מהבוט — כדי לא לעבד פעמיים אחרי הפעלה מחדש */
  telegramOffset?: number
  portfolioImported?: boolean
}

const config = readConfig()
const oshit = new Oshit(config)
const client = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null
const telegram = config.telegramToken ? new Telegram(config.telegramToken) : null

mkdirSync(config.dataDir, { recursive: true })
const stateFile = join(config.dataDir, 'state.json')
const heartbeatFile = join(config.dataDir, 'heartbeat')

/** נשמר לדיסק כדי שהפעלה מחדש בתוך חלון התזמון לא תריץ פעמיים */
function loadState(): State {
  try {
    const raw = JSON.parse(readFileSync(stateFile, 'utf8')) as Partial<State> & { lastSpendingVersion?: unknown }
    // גרסה קודמת שמרה מספר אחד, של סוכן ההוצאות
    const versions =
      typeof raw.lastSpendingVersion === 'number' ? { spending: raw.lastSpendingVersion } : (raw.lastSpendingVersion ?? {})
    return { ...raw, lastRunDate: raw.lastRunDate ?? {}, lastSpendingVersion: versions as Record<AgentId, number> }
  } catch {
    return { lastRunDate: {}, lastSpendingVersion: {} }
  }
}
const state = loadState()
const saveState = () => writeFileSync(stateFile, JSON.stringify(state))

/** ההגדרות האחרונות שנמשכו. כשל במשיכה משאיר את הקודמות — לא עוצר את המתזמן */
let payload: ServicePayload | null = null

async function refresh(): Promise<ServicePayload | null> {
  try {
    payload = await oshit.payload()
  } catch (err) {
    console.error('משיכת ההגדרות נכשלה:', (err as Error).message)
  }
  return payload
}

/* ---------------- תור הריצות ---------------- */

const queue: Array<{ agent: AgentId; trigger: Trigger }> = []
let busy = false

function enqueue(agent: AgentId, trigger: Trigger) {
  if (queue.some((q) => q.agent === agent)) return
  queue.push({ agent, trigger })
  void drain()
}

async function drain() {
  if (busy) return
  busy = true
  try {
    for (let next = queue.shift(); next; next = queue.shift()) {
      // לפני כל ריצה: הזיכרון והתיק העדכניים, כולל מה שסוכן קודם בתור כתב
      const current = await refresh()
      const def = current?.defs.find((d) => d.id === next.agent)
      if (!current || !def) continue
      if (!def.enabled && next.trigger === 'schedule') continue

      const outcome = await execute(def, next.trigger, {
        oshit,
        client,
        portfolio: current.portfolio,
        memory: current.memory[def.id] ?? '',
        lastSpendingVersion: state.lastSpendingVersion[def.id],
      })
      // גרסה נרשמת רק אחרי ריצה שהצליחה — ריצה שנכשלה תנסה שוב בפעם הבאה
      if (outcome.status !== 'error' && outcome.spendingVersion != null) {
        state.lastSpendingVersion[def.id] = outcome.spendingVersion
        saveState()
      }
      await notify(def, outcome, current)
    }
  } finally {
    busy = false
  }
}

/* ---------------- טלגרם ---------------- */

async function notify(def: AgentDef, outcome: RunOutcome, current: ServicePayload) {
  if (!telegram || !current.telegram) return
  const kind = outcome.status
  if (!shouldNotify(def.notify, kind, outcome.report)) return
  const text = formatMessage(def, current.telegram.lang, { kind, report: outcome.report, error: outcome.error }, config.publicUrl ?? undefined)
  try {
    await telegram.send(current.telegram.chatId, text)
  } catch (err) {
    // הודעה שלא נשלחה לא מפילה ריצה שכבר הסתיימה
    console.error(`[${def.id}] הודעת טלגרם לא נשלחה:`, (err as Error).message)
  }
}

let botUsername: string | null = null

/**
 * הודעות שהגיעו לבוט. רק קוד קישור תקף מקבל תשובה; כל השאר נקרא ונזרק —
 * בלי תשובה, כדי שהבוט לא יאשר לזרים שהוא קיים.
 */
async function pollTelegram() {
  if (!telegram) return
  try {
    botUsername ??= await telegram.username()
    await oshit.telegramStatus(botUsername)
    const updates = await telegram.updates(state.telegramOffset ?? 0)
    for (const u of updates) {
      state.telegramOffset = u.update_id + 1
      const code = parseLinkCode(u.message?.text)
      const chat = u.message?.chat
      if (!code || !chat || chat.type !== 'private') continue
      const link = await oshit.telegramLink(code, chat.id, chat.username || chat.first_name || '')
      if (link) {
        await telegram.send(
          chat.id,
          link.lang === 'en'
            ? '✅ Connected to Osh.it. The agents will message you here.'
            : '✅ מחובר ל-Osh.it. הסוכנים ישלחו לכאן הודעות.',
        )
      }
    }
    if (updates.length) saveState()
  } catch (err) {
    console.error('טלגרם:', (err as Error).message)
  }
}

/* ---------------- בדיקת סמלים ---------------- */

/** כל סמל בתיק — האם יש לו מחירים, ובאיזה מטבע. התוצאה מוצגת בעורך התיק */
async function checkSymbols() {
  const p = (await refresh())?.portfolio
  if (!p) return
  const symbols = [...new Set([p.benchmark.symbol, ...p.holdings.flatMap((h) => (h.symbol ? [h.symbol] : [])), ...p.watchlist.map((w) => w.symbol)])]
  const results = await fetchMany(symbols)
  try {
    await oshit.symbols(
      results.map((r, i) =>
        r.status === 'fulfilled'
          ? { symbol: symbols[i], ok: true, currency: r.value.currency }
          : { symbol: symbols[i], ok: false, error: (r.reason as Error).message },
      ),
    )
  } catch (err) {
    console.error('דיווח בדיקת הסמלים נכשל:', (err as Error).message)
  }
}

/* ---------------- לולאות ---------------- */

async function tick() {
  writeFileSync(heartbeatFile, new Date().toISOString())
  const current = await refresh()
  if (!current) return
  const clock = wallClock()
  for (const def of current.defs) {
    if (!def.enabled || !def.schedule) continue
    if (isDue(def.schedule, clock, state.lastRunDate[def.id])) {
      state.lastRunDate[def.id] = clock.date
      saveState()
      enqueue(def.id, 'schedule')
    }
  }
}

async function poll() {
  try {
    for (const request of await oshit.requests()) {
      // מאשרים לפני שמבצעים: בקשה שנכשלה באמצע לא תרוץ שוב ושוב
      await oshit.ack(request.id)
      if (request.kind === 'check_symbols') void checkSymbols()
      else enqueue(request.agent, 'manual')
    }
  } catch (err) {
    console.error('משיכת התור נכשלה:', (err as Error).message)
  }
  await pollTelegram()
}

/** ייבוא חד-פעמי של קובץ התיק הישן. השרת מתעלם אם כבר יש תיק במסד */
async function importOldPortfolio() {
  if (state.portfolioImported) return
  try {
    const file = readPortfolioFile(config.portfolioFile)
    if (file) {
      const { imported } = await oshit.importPortfolio(file)
      console.log(imported ? 'התיק יובא מהקובץ אל Osh.it. מעכשיו עורכים אותו במסך.' : 'יש כבר תיק ב-Osh.it — הקובץ לא נקרא.')
    }
    state.portfolioImported = true
    saveState()
  } catch (err) {
    console.error('ייבוא התיק נכשל, ינוסה שוב בהפעלה הבאה:', (err as Error).message)
  }
}

console.log(
  client
    ? `oshit-agents פעיל · משק בית ${config.household}${telegram ? ' · טלגרם' : ''}`
    : 'oshit-agents במצב המתנה: אין ANTHROPIC_API_KEY. בקשות "הרץ עכשיו" ייענו בהסבר.',
)
void importOldPortfolio().then(() => tick())
void poll()
setInterval(() => void tick(), TICK_MS)
setInterval(() => void poll(), POLL_MS)
