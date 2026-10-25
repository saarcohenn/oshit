import { randomBytes } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import { AgentRunError, runAgent, type AgentDefinition } from './claude.js'
import type { AgentId, Oshit } from './oshit.js'
import { parseReport } from './report.js'
import { marketAgent } from './agents/market.js'
import { researchAgent } from './agents/research.js'
import { spendingAgent, type SpendingContext } from './agents/spending.js'

/**
 * ריצה אחת של סוכן, מתחילתה ועד אירוע הסיום.
 *
 * כל ריצה נגמרת ב-done או ב-error — גם כשאין מפתח, גם כשאין נתונים חדשים.
 * דמות שנשארת "חושבת" לנצח במסך גרועה יותר מדמות שאומרת שנכשלה.
 */

export type Trigger = 'schedule' | 'manual'

export interface RunDeps {
  oshit: Oshit
  /** ‏null — אין מפתח בשרת; הריצה נסגרת מיד בהסבר */
  client: Anthropic | null
  portfolioFile: string
  /** הגרסה של משק הבית בריצת ההוצאות הקודמת שהצליחה */
  lastSpendingVersion?: number
}

export interface RunOutcome {
  status: 'done' | 'skipped' | 'error'
  spendingVersion?: number
}

export function newRunId(agent: AgentId, now = new Date()): string {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14)
  return `${agent}_${stamp}_${randomBytes(3).toString('hex')}`
}

const TRIGGER_TEXT: Record<Trigger, string> = { schedule: 'ריצה מתוזמנת', manual: 'הופעל ידנית' }

export async function execute(agent: AgentId, trigger: Trigger, deps: RunDeps): Promise<RunOutcome> {
  const runId = newRunId(agent)
  const emit = (type: Parameters<Oshit['event']>[2], fields?: Parameters<Oshit['event']>[3]) =>
    deps.oshit.event(runId, agent, type, fields)

  await emit('start', { text: TRIGGER_TEXT[trigger] })

  if (!deps.client) {
    await emit('error', { text: 'אין מפתח Anthropic בשרת — ראו docs/agents-setup.md', usage: { input: 0, output: 0 } })
    return { status: 'error' }
  }

  let spendingVersion: number | undefined
  try {
    let def: AgentDefinition
    if (agent === 'spending') {
      const context = await deps.oshit.context<SpendingContext>()
      spendingVersion = context.version
      // ריצה מתוזמנת בלי נתונים חדשים לא קוראת למודל. ידנית — תמיד רצה
      if (trigger === 'schedule' && context.version === deps.lastSpendingVersion) {
        await emit('done', { text: 'אין נתונים חדשים מאז הבדיקה הקודמת — לא נשלח דבר למודל', usage: { input: 0, output: 0 } })
        return { status: 'skipped', spendingVersion }
      }
      if (!context.latestMonth) {
        await emit('done', { text: 'אין עדיין נתוני הוצאות במשק הבית', usage: { input: 0, output: 0 } })
        return { status: 'skipped', spendingVersion }
      }
      def = spendingAgent(context)
    } else {
      def = agent === 'market' ? marketAgent(deps.portfolioFile) : researchAgent(deps.portfolioFile)
    }

    const { text, usage } = await runAgent(deps.client, def, emit)
    const report = parseReport(text)
    for (const f of report.findings) await emit(f.severity === 'alert' ? 'alert' : 'finding', { text: f.text })
    await emit('done', { text: report.summary, usage })
    return { status: 'done', spendingVersion }
  } catch (err) {
    const usage = err instanceof AgentRunError ? err.usage : { input: 0, output: 0 }
    console.error(`[${agent}] ריצה ${runId} נכשלה:`, (err as Error).message)
    await emit('error', { text: (err as Error).message, usage })
    return { status: 'error' }
  }
}
