import type { AgentDef } from './defs.js'
import type { ParsedReport } from './report.js'

/**
 * טלגרם — הערוץ שבו הסוכנים פונים לסער בעצמם.
 *
 * הטוקן של הבוט נמצא רק בקונטיינר הזה, כמו המפתח של Anthropic. הקישור נעשה
 * בקוד חד-פעמי מהמסך: סער שולח אותו לבוט, השירות מזהה אותו ב-getUpdates
 * ומעביר ל-Osh.it לאימות. הודעה מכל צ'אט אחר לא מקבלת תשובה ולא נשמרת.
 *
 * הודעות כטקסט רגיל, בלי HTML: טקסט של מודל עלול להכיל תווים שהיו שוברים
 * את העיצוב, ואין כאן מה לעצב.
 */

const API = 'https://api.telegram.org'
/** טלגרם חוסם הודעה מעל 4096 תווים */
const MAX_MESSAGE = 4000

export interface TelegramUpdate {
  update_id: number
  message?: { chat: { id: number; type: string; first_name?: string; username?: string; title?: string }; text?: string }
}

export class Telegram {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API}/bot${this.token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
    // בלי הטוקן בהודעה: הוא חלק מה-URL, ושגיאה נרשמת ביומן הקונטיינר
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`)
    return json.result as T
  }

  async username(): Promise<string> {
    return (await this.call<{ username: string }>('getMe')).username
  }

  /** בלי המתנה ארוכה: השירות כבר שואל כל 20 שניות */
  updates(offset: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] })
  }

  async send(chatId: number, text: string): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text: text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text,
      link_preview_options: { is_disabled: true },
    })
  }
}

/** "AB3K7Q", ‏"/start AB3K7Q" — מה שסער ישלח. כל טקסט אחר אינו קוד */
export function parseLinkCode(text: string | undefined): string | null {
  const m = (text ?? '').trim().match(/^\/?(?:start\s+)?([A-Za-z0-9]{6})$/)
  return m ? m[1].toUpperCase() : null
}

export type RunOutcomeKind = 'done' | 'error' | 'skipped'

/**
 * האם לשלוח הודעה על ריצה. כשל — תמיד, חוץ מסוכן שהוגדר "בלי הודעות":
 * סוכן שנכשל בשקט כל בוקר גרוע מהודעה מיותרת.
 */
export function shouldNotify(notify: AgentDef['notify'], kind: RunOutcomeKind, report: ParsedReport | null): boolean {
  if (notify === 'none' || kind === 'skipped') return false
  if (kind === 'error' || notify === 'all') return true
  return !!report?.findings.some((f) => f.severity === 'alert')
}

export function formatMessage(
  def: Pick<AgentDef, 'name' | 'nameEn'>,
  lang: 'he' | 'en',
  outcome: { kind: RunOutcomeKind; report: ParsedReport | null; error?: { text: string; textEn: string } },
  link?: string,
): string {
  const en = lang === 'en'
  const t = (b: { text: string; textEn: string | null }) => (en && b.textEn ? b.textEn : b.text)
  const lines = [`🤖 ${en ? def.nameEn : def.name}`]
  if (outcome.kind === 'error') {
    lines.push(`❌ ${outcome.error ? (en ? outcome.error.textEn : outcome.error.text) : en ? 'The run failed' : 'הריצה נכשלה'}`)
  } else if (outcome.report) {
    lines.push(t(outcome.report.summary))
    for (const f of outcome.report.findings) lines.push(`${f.severity === 'alert' ? '⚠️' : '•'} ${t(f)}`)
  }
  if (link) lines.push('', link)
  return lines.join('\n')
}
