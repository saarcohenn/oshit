import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { readConfig } from './config.js'
import { Oshit, type AgentId } from './oshit.js'
import { execute, type Trigger } from './run.js'
import { SCHEDULES, isDue, wallClock } from './schedule.js'

/**
 * השירות: מתזמן, תור "הרץ עכשיו", ודופק.
 *
 * ריצה אחת בכל רגע. שלושה סוכנים ששולחים בקשות במקביל לא חוסכים כלום —
 * הם רק מסבכים את העלות ואת המסך. בקשות ממתינות בתור ורצות אחת אחרי השנייה.
 */

const POLL_MS = 20_000
const TICK_MS = 30_000

interface State {
  lastRunDate: Partial<Record<AgentId, string>>
  lastSpendingVersion?: number
}

const config = readConfig()
const oshit = new Oshit(config)
const client = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null

mkdirSync(config.dataDir, { recursive: true })
const stateFile = join(config.dataDir, 'state.json')
const heartbeatFile = join(config.dataDir, 'heartbeat')

/** נשמר לדיסק כדי שהפעלה מחדש בתוך חלון התזמון לא תריץ פעמיים */
function loadState(): State {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8')) as State
  } catch {
    return { lastRunDate: {} }
  }
}
const state = loadState()
const saveState = () => writeFileSync(stateFile, JSON.stringify(state))

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
      const outcome = await execute(next.agent, next.trigger, {
        oshit,
        client,
        portfolioFile: config.portfolioFile,
        lastSpendingVersion: state.lastSpendingVersion,
      })
      // גרסה נרשמת רק אחרי ריצה שהצליחה — ריצה שנכשלה תנסה שוב מחר
      if (next.agent === 'spending' && outcome.status !== 'error' && outcome.spendingVersion != null) {
        state.lastSpendingVersion = outcome.spendingVersion
        saveState()
      }
    }
  } finally {
    busy = false
  }
}

function tick() {
  writeFileSync(heartbeatFile, new Date().toISOString())
  const clock = wallClock()
  for (const agent of Object.keys(SCHEDULES) as AgentId[]) {
    if (isDue(SCHEDULES[agent], clock, state.lastRunDate[agent])) {
      state.lastRunDate[agent] = clock.date
      saveState()
      enqueue(agent, 'schedule')
    }
  }
}

async function poll() {
  try {
    for (const request of await oshit.requests()) {
      // מאשרים לפני שמריצים: בקשה שנכשלה באמצע לא תרוץ שוב ושוב
      await oshit.ack(request.id)
      enqueue(request.agent, 'manual')
    }
  } catch (err) {
    console.error('משיכת התור נכשלה:', (err as Error).message)
  }
}

console.log(
  client
    ? `oshit-agents פעיל · משק בית ${config.household}`
    : 'oshit-agents במצב המתנה: אין ANTHROPIC_API_KEY. בקשות "הרץ עכשיו" ייענו בהסבר.',
)
tick()
void poll()
setInterval(tick, TICK_MS)
setInterval(() => void poll(), POLL_MS)
