import { randomBytes } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import { AgentRunError, MODEL, runAgent, type AgentDefinition } from './claude.js'
import { emptyUsage, roundUsd } from './pricing.js'
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

const TRIGGER_TEXT: Record<Trigger, { text: string; textEn: string }> = {
  schedule: { text: 'ריצה מתוזמנת', textEn: 'Scheduled run' },
  manual: { text: 'הופעל ידנית', textEn: 'Started manually' },
}

/** ריצה שלא קראה למודל — אפס, אבל עדיין רשומה, כדי שהמסך יראה שהיא לא עלתה כסף */
const FREE = () => emptyUsage(MODEL)

/**
 * בדיקת התקציב לפני קריאה למודל. ריצה שכבר באמצע יכולה לחרוג בריצה אחת לכל
 * היותר — התקרה ב-Console נשארת הבלם האחרון. כשל בבדיקה עצמה לא עוצר: עדיף
 * ריצה אחת לא מבוקרת מאשר סוכנים שמושבתים כי Osh.it התאתחל.
 */
async function overBudget(oshit: Oshit): Promise<{ spent: number; budget: number } | null> {
  try {
    const b = await oshit.budget()
    return b.budgetUsd != null && b.spentUsd >= b.budgetUsd ? { spent: b.spentUsd, budget: b.budgetUsd } : null
  } catch (err) {
    console.error('בדיקת התקציב נכשלה:', (err as Error).message)
    return null
  }
}

export async function execute(agent: AgentId, trigger: Trigger, deps: RunDeps): Promise<RunOutcome> {
  const runId = newRunId(agent)
  const emit = (type: Parameters<Oshit['event']>[2], fields?: Parameters<Oshit['event']>[3]) =>
    deps.oshit.event(runId, agent, type, fields)

  await emit('start', TRIGGER_TEXT[trigger])

  if (!deps.client) {
    await emit('error', {
      text: 'אין מפתח Anthropic בשרת — ראו docs/agents-setup.md',
      textEn: 'No Anthropic key on the server — see docs/agents-setup.md',
      usage: FREE(),
    })
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
        await emit('done', {
          text: 'אין נתונים חדשים מאז הבדיקה הקודמת — לא נשלח דבר למודל',
          textEn: 'No new data since the last check — nothing was sent to the model',
          usage: FREE(),
        })
        return { status: 'skipped', spendingVersion }
      }
      if (!context.latestMonth) {
        await emit('done', { text: 'אין עדיין נתוני הוצאות במשק הבית', textEn: 'No spending data in the household yet', usage: FREE() })
        return { status: 'skipped', spendingVersion }
      }
      def = spendingAgent(context)
    } else {
      def = agent === 'market' ? marketAgent(deps.portfolioFile) : researchAgent(deps.portfolioFile)
    }

    const over = await overBudget(deps.oshit)
    if (over) {
      await emit('error', {
        text: `התקציב החודשי נוצל ($${over.spent.toFixed(2)} מתוך $${over.budget.toFixed(2)}) — הריצה לא נשלחה למודל`,
        textEn: `Monthly budget reached ($${over.spent.toFixed(2)} of $${over.budget.toFixed(2)}) — the run was not sent to the model`,
        usage: FREE(),
      })
      return { status: 'error', spendingVersion }
    }

    const { text, usage } = await runAgent(deps.client, def, emit)
    usage.costUsd = roundUsd(usage.costUsd)
    const report = parseReport(text)
    for (const f of report.findings) {
      await emit(f.severity === 'alert' ? 'alert' : 'finding', { text: f.text, textEn: f.textEn })
    }
    await emit('done', { ...report.summary, usage })
    return { status: 'done', spendingVersion }
  } catch (err) {
    const usage = err instanceof AgentRunError ? { ...err.usage, costUsd: roundUsd(err.usage.costUsd) } : FREE()
    console.error(`[${agent}] ריצה ${runId} נכשלה:`, (err as Error).message)
    await emit('error', { text: (err as Error).message, usage })
    return { status: 'error' }
  }
}
