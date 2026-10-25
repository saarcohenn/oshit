import { useEffect, useState } from 'react'
import type { AgentId, AgentsBudget as Budget } from '../types'
import { api } from '../lib/api'
import { getLang, tr, trf } from '../lib/i18n'

interface Props {
  householdId: string
  isOwner: boolean
  budget: Budget
  agentName: (agent: AgentId) => string
  onChange: (budget: Budget) => void
}

/** מעל זה הפס מתריע; ב-100% הסוכנים כבר לא קוראים למודל */
const WARN_RATIO = 0.8

const usd = (n: number) => `$${n.toFixed(2)}`

/** claude-opus-5-5 → Opus 5.5 */
function modelName(model: string): string {
  const m = model.match(/^claude-([a-z]+)-(\d+)-(\d+)/)
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : model
}

/**
 * כמה עלו הסוכנים החודש, מול תקציב שמוגדר כאן.
 *
 * הסכום נספר ב-Osh.it מכל ריצה, לפי המודל שענה, כולל מטמון וחיפושים — בלי
 * מפתח ניהול של Anthropic. זו הערכה לפי המחירון; תקרת ההוצאה ב-Console
 * נשארת הבלם האחרון.
 */
export default function AgentsBudget({ householdId, isOwner, budget, agentName, onChange }: Props) {
  const [draft, setDraft] = useState(budget.budgetUsd?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setDraft(budget.budgetUsd?.toString() ?? ''), [budget.budgetUsd])

  const limit = budget.budgetUsd
  const ratio = limit ? budget.spentUsd / limit : 0
  const color = ratio >= 1 ? 'var(--danger-fill)' : ratio >= WARN_RATIO ? 'var(--viz-semi)' : 'var(--accent)'
  const month = new Date(budget.monthStart).toLocaleDateString(getLang() === 'he' ? 'he-IL' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  })
  const dirty = draft.trim() !== (limit?.toString() ?? '')

  async function save() {
    const value = draft.trim() === '' ? null : Number(draft)
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError(tr('תקציב לא תקין'))
      return
    }
    setSaving(true)
    setError('')
    try {
      onChange(await api.setAgentsBudget(householdId, value))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-title">{tr('תקציב הסוכנים')}</div>
      <div className="card-sub">
        {trf('{month} · נספר כאן מכל ריצה, לפי המודל שענה, כולל חיפושים. תקרת ההוצאה ב-Console של Anthropic נשארת הבלם האחרון.', {
          month,
        })}
      </div>

      <div className="agent-budget-total">
        <strong>{usd(budget.spentUsd)}</strong>
        <span className="dim">{limit != null ? trf('מתוך {limit}', { limit: usd(limit) }) : tr('לא הוגדר תקציב')}</span>
      </div>
      {limit != null && (
        <>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
            <span style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
          </div>
          <div className="mini-label" style={{ color: ratio >= 1 ? 'var(--danger)' : undefined, fontWeight: 500 }}>
            {ratio >= 1
              ? tr('התקציב נוצל — הסוכנים לא יקראו למודל עד החודש הבא או עד שתגדילו אותו.')
              : trf('{p}% מהתקציב', { p: Math.round(ratio * 100) })}
          </div>
        </>
      )}

      {budget.byAgent.length > 0 && (
        <div className="agent-budget-split">
          <ul>
            {budget.byAgent.map((row) => (
              <li key={row.agent}>
                <span className={`agent-swatch ${row.agent}`} />
                <span>{agentName(row.agent)}</span>
                <span className="dim">{trf('{n} ריצות', { n: row.runs })}</span>
                <strong>{usd(row.usd)}</strong>
              </li>
            ))}
          </ul>
          <ul>
            {budget.byModel.map((row) => (
              <li key={row.model}>
                <span>{modelName(row.model)}</span>
                <span className="dim">{trf('{n} ריצות', { n: row.runs })}</span>
                <strong>{usd(row.usd)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwner && (
        <form
          className="agent-budget-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label htmlFor="agents-budget">{tr('תקציב חודשי בדולרים')}</label>
          <input
            id="agents-budget"
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            placeholder={tr('ללא')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: 110 }}
          />
          <button className="btn sm" type="submit" disabled={!dirty || saving}>
            {saving ? tr('שומר…') : tr('שמור')}
          </button>
          {error && (
            <span className="notice warn" role="alert">
              {error}
            </span>
          )}
        </form>
      )}
    </div>
  )
}
