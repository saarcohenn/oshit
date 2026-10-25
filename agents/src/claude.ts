import Anthropic from '@anthropic-ai/sdk'
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import type { EventFields, EventType } from './oshit.js'

/**
 * הלולאה מול Claude — Tool Runner, לא Agent SDK.
 *
 * ה-Agent SDK מגיע עם Bash וכתיבת קבצים מובנים. ה-Tool Runner מריץ רק את
 * הכלים שמוגדרים כאן, וכולם קוראים בלבד. האילוץ "הסוכנים לא מבצעים" נאכף
 * מהמבנה: אין לסוכן כלי שמבצע משהו, אז אין מה לשכוח לנעול.
 */

export const MODEL = 'claude-opus-5-5'
/** תקרת סבבים לריצה. כל סבב הוא קריאה בתשלום; סוכן שלא סיים ב-8 — נתקע */
const MAX_ITERATIONS = 8
const MAX_TOKENS = 16_000

export type Emit = (type: EventType, fields?: EventFields) => Promise<void>

/** טיפוס הסכמה כפי ש-betaTool מקבל אותה, בלי תלות ישירה ב-json-schema-to-ts */
type ToolSchema = Parameters<typeof betaTool>[0]['inputSchema']

export interface AgentTool {
  name: string
  description: string
  inputSchema: ToolSchema
  /** מה הדמות "אומרת" בזמן שהכלי רץ */
  label: string
  run: (input: Record<string, unknown>) => Promise<unknown>
}

export interface AgentDefinition {
  system: string
  prompt: string
  tools: AgentTool[]
  /** כלי שרת של Anthropic, כמו חיפוש ברשת. רצים אצלם, בלי run */
  serverTools?: Anthropic.Beta.BetaToolUnion[]
}

export interface Usage {
  input: number
  output: number
}

/** כשל עם השימוש שנצבר עד אליו — גם ריצה שנכשלה עולה כסף, והמסך מציג את זה */
export class AgentRunError extends Error {
  constructor(
    message: string,
    readonly usage: Usage,
  ) {
    super(message)
  }
}

/** כל הטוקנים שחויבו כקלט, כולל מטמון — מעריך את העלות מלמעלה ולא מלמטה */
function addUsage(total: Usage, u: Anthropic.Beta.BetaUsage) {
  total.input += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
  total.output += u.output_tokens
}

const textOf = (message: Anthropic.Beta.BetaMessage) =>
  message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

export async function runAgent(client: Anthropic, def: AgentDefinition, emit: Emit): Promise<{ text: string; usage: Usage }> {
  const usage: Usage = { input: 0, output: 0 }

  const tools = def.tools.map((t) =>
    betaTool({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      run: async (input) => {
        await emit('tool_call', { tool: t.name, text: t.label })
        try {
          return JSON.stringify(await t.run(input as Record<string, unknown>))
        } catch (err) {
          // המודל מקבל את הכשל כתוצאה ויכול לדווח עליו, במקום שהריצה כולה תיפול
          return JSON.stringify({ error: (err as Error).message })
        }
      },
    }),
  )

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    max_iterations: MAX_ITERATIONS,
    // ב-Opus 5.5 החשיבה תמיד פעילה; העומק נקבע ב-effort, ו-medium הוא ברירת המחדל שלו
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // סירוב של המודל עובר בצד השרת למודל חלופי, באותה קריאה
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: def.system,
    tools: [...tools, ...(def.serverTools ?? [])],
    messages: [{ role: 'user', content: def.prompt }],
  })

  await emit('thinking', { text: 'קורא את ההנחיות ומתכנן' })

  let last: Anthropic.Beta.BetaMessage | undefined
  try {
    for await (const message of runner) {
      last = message
      addUsage(usage, message.usage)

      // חיפוש ברשת רץ אצל Anthropic, בלי run() אצלנו — מדווחים עליו מהתשובה
      for (const block of message.content) {
        if (block.type === 'server_tool_use') {
          const query = (block.input as { query?: unknown })?.query
          await emit('tool_call', { tool: block.name, text: typeof query === 'string' ? query : 'מחפש ברשת' })
        }
      }

      if (message.stop_reason === 'pause_turn') {
        // ה-runner לא ממשיך לבד אחרי השהיה של כלי שרת — מחזירים לו את התור
        runner.pushMessages({ role: 'assistant', content: message.content })
      } else if (message.stop_reason === 'tool_use') {
        const said = textOf(message)
        await emit('thinking', { text: said ? said.slice(0, 300) : 'מעבד את התוצאות' })
      }
    }
  } catch (err) {
    throw new AgentRunError(err instanceof Anthropic.APIError ? `Claude API: ${err.message}` : (err as Error).message, usage)
  }

  if (!last) throw new AgentRunError('לא התקבלה תשובה מהמודל', usage)
  switch (last.stop_reason) {
    case 'end_turn':
    case 'stop_sequence':
      return { text: textOf(last), usage }
    case 'max_tokens':
      // תשובה קטועה עדיין שווה משהו — אבל לא בשקט
      return { text: `${textOf(last)}\n\n- [התראה] התשובה נקטעה באורך המרבי`, usage }
    case 'refusal':
      throw new AgentRunError('המודל סירב להשלים את הריצה', usage)
    case 'tool_use':
    case 'pause_turn':
      throw new AgentRunError(`הסוכן לא סיים אחרי ${MAX_ITERATIONS} סבבים`, usage)
    default:
      throw new AgentRunError(`סיום לא צפוי: ${String(last.stop_reason)}`, usage)
  }
}
