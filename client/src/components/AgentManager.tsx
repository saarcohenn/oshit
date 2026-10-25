import { useState } from 'react'
import type { AgentDef, AgentId, AgentToolId, AgentToolInfo, AgentVersion } from '../types'
import { api } from '../lib/api'
import { getLang, tr, trf } from '../lib/i18n'

interface Props {
  householdId: string
  isOwner: boolean
  defs: AgentDef[]
  catalog: Record<AgentToolId, AgentToolInfo>
  memory: Record<AgentId, string>
  onChanged: () => Promise<void> | void
}

const MODELS: Array<{ id: AgentDef['model']; label: string }> = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
]

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const MAX_INSTRUCTIONS = 8000
const MAX_MEMORY = 4000

const pick = (he: string, en: string) => (getLang() === 'en' && en ? en : he)

const TEMPLATE: Omit<AgentDef, 'id'> = {
  name: '',
  nameEn: '',
  role: '',
  roleEn: '',
  emoji: '🤖',
  color: '#3b82f6',
  instructions: 'התפקיד שלך: <מה הסוכן בודק>.\n\nמה חשוב לסער:\n- <דבר ראשון שצריך לבדוק>\n- <מתי זו התראה ומתי זה מידע>',
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

const pad = (n: number) => String(n).padStart(2, '0')

function scheduleText(s: AgentDef['schedule']): string {
  if (!s) return tr('ידני בלבד')
  const days = s.days.length === 7 ? tr('כל יום') : s.days.map((d) => tr(DAYS[d])).join(' ')
  return `${days} · ${pad(s.hour)}:${pad(s.minute)}`
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(getLang() === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })

/**
 * השוואת שורות בין שתי גרסאות של ההנחיות — LCS פשוט. ההנחיות קצרות (עד 8,000
 * תווים), כך שטבלה של שורות × שורות זולה, ואין צורך בספרייה.
 */
export function lineDiff(before: string, after: string): Array<{ kind: 'same' | 'add' | 'del'; text: string }> {
  const a = before.split('\n')
  const b = after.split('\n')
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: Array<{ kind: 'same' | 'add' | 'del'; text: string }> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'del', text: a[i++] })
    } else {
      out.push({ kind: 'add', text: b[j++] })
    }
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++] })
  while (j < b.length) out.push({ kind: 'add', text: b[j++] })
  return out
}

/**
 * ניהול הסוכנים: רשימה, עורך, היסטוריית גרסאות וזיכרון.
 *
 * הכלים נבחרים מקטלוג סגור, וליד כל אחד כתוב מה הוא שולח ל-Anthropic. אין
 * כאן שדה לכלי חדש: כלי חדש הוא קוד, ונבדק לפני שהוא נכנס.
 */
export default function AgentManager({ householdId, isOwner, defs, catalog, memory, onChanged }: Props) {
  const [draft, setDraft] = useState<AgentDef | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [versions, setVersions] = useState<Array<AgentVersion & { def: AgentDef }> | null>(null)
  const [diffOf, setDiffOf] = useState<number | null>(null)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [memoryVersions, setMemoryVersions] = useState<Array<AgentVersion & { notes: string; reason: string }> | null>(null)

  const saved = draft && !creating ? defs.find((d) => d.id === draft.id) : undefined

  function open(def: AgentDef | null) {
    setError('')
    setNotice('')
    setVersions(null)
    setMemoryVersions(null)
    setDiffOf(null)
    setCreating(!def)
    setDraft(def ? structuredClone(def) : { ...structuredClone(TEMPLATE), id: '' })
    setMemoryDraft(def ? (memory[def.id] ?? '') : '')
  }

  const set = <K extends keyof AgentDef>(key: K, value: AgentDef[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await onChanged()
      setNotice(done)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    await run(async () => {
      const result = creating ? await api.createAgent(householdId, draft) : await api.updateAgent(householdId, draft)
      setDraft(result)
      setCreating(false)
      setVersions(null)
    }, tr('נשמר. השינוי יחול בריצה הבאה.'))
  }

  async function remove() {
    if (!draft || !saved) return
    const question = saved.builtin
      ? tr('לכבות את הסוכן? אפשר להדליק אותו שוב בכל רגע.')
      : tr('למחוק את הסוכן ואת הזיכרון שלו? ההיסטוריה של הריצות שלו נשארת ביומן.')
    if (!window.confirm(question)) return
    await run(async () => {
      await api.deleteAgent(householdId, saved.id)
      if (!saved.builtin) setDraft(null)
      else setDraft({ ...saved, enabled: false })
    }, saved.builtin ? tr('הסוכן כובה.') : tr('הסוכן נמחק.'))
  }

  async function loadVersions() {
    if (!saved) return
    try {
      setVersions(await api.agentVersions(householdId, saved.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function loadMemoryVersions() {
    if (!saved) return
    try {
      setMemoryVersions(await api.agentMemoryVersions(householdId, saved.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const toggleTool = (tool: AgentToolId) =>
    draft && set('tools', draft.tools.includes(tool) ? draft.tools.filter((t) => t !== tool) : [...draft.tools, tool])

  const toggleDay = (day: number) => {
    if (!draft?.schedule) return
    const days = draft.schedule.days.includes(day) ? draft.schedule.days.filter((d) => d !== day) : [...draft.schedule.days, day].sort()
    set('schedule', { ...draft.schedule, days })
  }

  return (
    <div className="card">
      <div className="agent-log-head">
        <div className="card-title">{tr('ניהול הסוכנים')}</div>
        {isOwner && !draft && (
          <button className="btn sm" onClick={() => open(null)}>
            {tr('סוכן חדש')}
          </button>
        )}
      </div>
      <div className="card-sub">
        {tr('ההנחיות, הכלים, לוח הזמנים והמודל של כל סוכן נערכים כאן ונכנסים לתוקף בריצה הבאה, בלי פריסה. הגבולות — "מנתח, לא מבצע" — מצורפים בקוד לפני כל הנחיה, ואי אפשר להסיר אותם מכאן.')}
      </div>

      {!draft && (
        <ul className="agent-def-list">
          {defs.map((def) => (
            <li key={def.id} className={def.enabled ? '' : 'off'}>
              <span className="agent-swatch" style={{ background: def.color }} />
              <span aria-hidden="true">{def.emoji}</span>
              <strong>{pick(def.name, def.nameEn)}</strong>
              <span className="dim">
                {MODELS.find((m) => m.id === def.model)?.label} · {scheduleText(def.schedule)}
                {!def.enabled && ` · ${tr('כבוי')}`}
                {memory[def.id] ? ` · ${tr('יש זיכרון')}` : ''}
              </span>
              <button className="btn sm ghost" onClick={() => open(def)}>
                {isOwner ? tr('עריכה') : tr('הצגה')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <form
          className="agent-editor"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <fieldset disabled={!isOwner || busy}>
            <div className="agent-editor-grid">
              {creating && (
                <label>
                  {tr('מזהה (באנגלית, קבוע)')}
                  <input type="text"
                    value={draft.id}
                    onChange={(e) => set('id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="fx-watch"
                    required
                    pattern="[a-z][a-z0-9-]{1,30}"
                    dir="ltr"
                  />
                </label>
              )}
              <label>
                {tr('שם')}
                <input type="text" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={40} required />
              </label>
              <label>
                {tr('שם באנגלית')}
                <input type="text" value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} maxLength={40} dir="ltr" />
              </label>
              <label>
                {tr('תיאור קצר')}
                <input type="text" value={draft.role} onChange={(e) => set('role', e.target.value)} maxLength={120} />
              </label>
              <label>
                {tr('תיאור באנגלית')}
                <input type="text" value={draft.roleEn} onChange={(e) => set('roleEn', e.target.value)} maxLength={120} dir="ltr" />
              </label>
              <label>
                {tr('סמל')}
                <input type="text" value={draft.emoji} onChange={(e) => set('emoji', e.target.value)} style={{ width: 70 }} />
              </label>
              <label>
                {tr('צבע')}
                <input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)} />
              </label>
            </div>

            <label className="agent-editor-block">
              {tr('הנחיות')}
              <textarea
                value={draft.instructions}
                onChange={(e) => set('instructions', e.target.value)}
                rows={10}
                maxLength={MAX_INSTRUCTIONS}
                required
              />
              <span className="mini-label">
                {trf('{n} מתוך {max} תווים', { n: draft.instructions.length.toLocaleString(), max: MAX_INSTRUCTIONS.toLocaleString() })}
              </span>
            </label>

            <div className="agent-editor-block">
              <div className="agent-editor-label">{tr('כלים — ומה כל אחד שולח ל-Anthropic')}</div>
              <ul className="agent-tool-list">
                {(Object.keys(catalog) as AgentToolId[]).map((tool) => (
                  <li key={tool}>
                    <label>
                      <input type="checkbox" checked={draft.tools.includes(tool)} onChange={() => toggleTool(tool)} />
                      <strong>{pick(catalog[tool].label, catalog[tool].labelEn)}</strong>
                      <span className="dim">{pick(catalog[tool].sends, catalog[tool].sendsEn)}</span>
                    </label>
                    {tool === 'web_search' && draft.tools.includes('web_search') && (
                      <label className="agent-inline">
                        {tr('עד כמה חיפושים לריצה')}
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={draft.maxSearches}
                          onChange={(e) => set('maxSearches', Number(e.target.value))}
                          style={{ width: 70 }}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="agent-editor-block">
              <label className="agent-inline">
                <input
                  type="checkbox"
                  checked={!!draft.schedule}
                  onChange={(e) => set('schedule', e.target.checked ? { days: [0, 1, 2, 3, 4], hour: 8, minute: 0 } : null)}
                />
                {tr('ריצה מתוזמנת (שעון ישראל)')}
              </label>
              {draft.schedule && (
                <div className="agent-schedule">
                  {DAYS.map((label, day) => (
                    <button
                      type="button"
                      key={day}
                      className={`btn sm${draft.schedule!.days.includes(day) ? '' : ' ghost'}`}
                      aria-pressed={draft.schedule!.days.includes(day)}
                      onClick={() => toggleDay(day)}
                    >
                      {tr(label)}
                    </button>
                  ))}
                  <input
                    type="time"
                    value={`${pad(draft.schedule.hour)}:${pad(draft.schedule.minute)}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      if (Number.isInteger(h) && Number.isInteger(m)) set('schedule', { ...draft.schedule!, hour: h, minute: m })
                    }}
                  />
                </div>
              )}
            </div>

            <div className="agent-editor-grid">
              <label>
                {tr('מודל')}
                <select value={draft.model} onChange={(e) => set('model', e.target.value as AgentDef['model'])}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr('מאמץ')}
                <select value={draft.effort} onChange={(e) => set('effort', e.target.value as AgentDef['effort'])}>
                  <option value="low">{tr('נמוך')}</option>
                  <option value="medium">{tr('בינוני')}</option>
                  <option value="high">{tr('גבוה')}</option>
                </select>
              </label>
              <label>
                {tr('תקרת סבבים')}
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.maxIterations}
                  onChange={(e) => set('maxIterations', Number(e.target.value))}
                />
              </label>
              <label>
                {tr('הודעות בטלגרם')}
                <select value={draft.notify} onChange={(e) => set('notify', e.target.value as AgentDef['notify'])}>
                  <option value="alerts">{tr('רק התראות וכשלים')}</option>
                  <option value="all">{tr('כל ריצה')}</option>
                  <option value="none">{tr('בלי הודעות')}</option>
                </select>
              </label>
              <label className="agent-inline">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
                {tr('פעיל')}
              </label>
            </div>
          </fieldset>

          {error && (
            <div className="notice warn" role="alert">
              {error}
            </div>
          )}
          {notice && <div className="notice">{notice}</div>}

          <div className="agent-slot-actions">
            {isOwner && (
              <button className="btn" type="submit" disabled={busy}>
                {busy ? tr('שומר…') : tr('שמור')}
              </button>
            )}
            <button className="btn ghost" type="button" onClick={() => setDraft(null)}>
              {tr('סגירה')}
            </button>
            {isOwner && saved && (
              <button className="btn ghost" type="button" onClick={() => void remove()} disabled={busy}>
                {saved.builtin ? tr('כיבוי') : tr('מחיקה')}
              </button>
            )}
            {isOwner && saved?.builtin && (
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() =>
                  window.confirm(tr('להחזיר את הסוכן להגדרות המקוריות? הגרסה הנוכחית תישמר בהיסטוריה.')) &&
                  void run(async () => setDraft(await api.resetAgent(householdId, saved.id)), tr('הוחזר להגדרות המקוריות.'))
                }
              >
                {tr('החזרה למקור')}
              </button>
            )}
          </div>

          {saved && (
            <>
              <div className="agent-editor-section">
                <div className="agent-editor-label">{tr('הזיכרון של הסוכן')}</div>
                <p className="dim">
                  {tr('מה שהסוכן רשם לעצמו בין ריצות. הוא נכנס להנחיות שלו בריצה הבאה. כל שינוי — של הסוכן או שלכם — נשמר בהיסטוריה עם סיבה.')}
                </p>
                <textarea
                  value={memoryDraft}
                  onChange={(e) => setMemoryDraft(e.target.value)}
                  rows={6}
                  maxLength={MAX_MEMORY}
                  readOnly={!isOwner}
                  placeholder={tr('עדיין ריק')}
                />
                {isOwner && (
                  <div className="agent-slot-actions">
                    <button
                      className="btn sm"
                      type="button"
                      disabled={busy || memoryDraft === (memory[saved.id] ?? '')}
                      onClick={() => void run(() => api.saveAgentMemory(householdId, saved.id, memoryDraft), tr('הזיכרון נשמר.'))}
                    >
                      {tr('שמירת הזיכרון')}
                    </button>
                    <button className="btn sm ghost" type="button" onClick={() => setMemoryDraft('')} disabled={busy || !memoryDraft}>
                      {tr('ניקוי')}
                    </button>
                    <button className="btn sm ghost" type="button" onClick={() => void loadMemoryVersions()}>
                      {tr('היסטוריית הזיכרון')}
                    </button>
                  </div>
                )}
                {memoryVersions && (
                  <ul className="agent-versions">
                    {memoryVersions.length === 0 && <li className="dim">{tr('אין עדיין גרסאות')}</li>}
                    {memoryVersions.map((v) => (
                      <li key={v.seq}>
                        <span>{dateTime(v.savedAt)}</span>
                        <span className="dim">{v.savedBy === 'agent' ? tr('הסוכן') : tr('נערך במסך')}</span>
                        <span>{v.reason}</span>
                        {isOwner && (
                          <button
                            className="btn sm ghost"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const r = await api.revertAgentMemory(householdId, saved.id, v.seq)
                                setMemoryDraft(r.notes)
                                setMemoryVersions(null)
                              }, tr('הזיכרון שוחזר.'))
                            }
                          >
                            {tr('שחזור')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="agent-editor-section">
                <div className="agent-editor-label">{tr('היסטוריית ההגדרות')}</div>
                {!versions ? (
                  <button className="btn sm ghost" type="button" onClick={() => void loadVersions()}>
                    {tr('הצגת גרסאות')}
                  </button>
                ) : (
                  <ul className="agent-versions">
                    {versions.length === 0 && <li className="dim">{tr('אין עדיין גרסאות — הסוכן לא נערך מאז שנוצר.')}</li>}
                    {versions.map((v) => (
                      <li key={v.seq}>
                        <span>{dateTime(v.savedAt)}</span>
                        <span className="dim">{v.savedBy}</span>
                        <button className="btn sm ghost" type="button" onClick={() => setDiffOf(diffOf === v.seq ? null : v.seq)}>
                          {diffOf === v.seq ? tr('הסתרה') : tr('הבדלים מהנוכחית')}
                        </button>
                        {isOwner && (
                          <button
                            className="btn sm ghost"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                setDraft(await api.revertAgent(householdId, saved.id, v.seq))
                                setVersions(null)
                              }, tr('הגרסה שוחזרה.'))
                            }
                          >
                            {tr('שחזור')}
                          </button>
                        )}
                        {diffOf === v.seq && (
                          <pre className="agent-diff" dir="auto">
                            {lineDiff(v.def.instructions, saved.instructions).map((line, i) => (
                              <span key={i} className={`diff-${line.kind}`}>
                                {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : '  '}
                                {line.text}
                                {'\n'}
                              </span>
                            ))}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </form>
      )}
    </div>
  )
}
