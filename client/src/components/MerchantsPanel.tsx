import { useMemo, useState } from 'react'
import type { CategoryId, Frequency, MerchantRule, Necessity, Transaction } from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { FREQUENCIES, FREQUENCY_SHORT, monthlyEquivalent } from '../lib/frequency'
import { ils, txCount } from '../lib/format'
import { tr } from '../lib/i18n'

interface Props {
  transactions: Transaction[]
  merchantRules: MerchantRule[]
  onSetMerchantRule: (merchantKey: string, patch: Partial<Omit<MerchantRule, 'merchantKey'>>) => void
}

interface MerchantRow {
  merchantKey: string
  /** השם שמוצג כרגע — הכינוי אם הוגדר, אחרת השם מהבנק */
  display: string
  /** השם המקוצר כפי שהבנק שלח אותו */
  original: string
  alias?: string
  total: number
  count: number
  months: number
  category: CategoryId
  necessity: Necessity
  frequency: Frequency
  lastDate: string
}

export default function MerchantsPanel({ transactions, merchantRules, onSetMerchantRule }: Props) {
  const cats = useCategories()
  const [query, setQuery] = useState('')
  const [onlyUnnamed, setOnlyUnnamed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const rules = useMemo(
    () => new Map(merchantRules.map((r) => [r.merchantKey, r])),
    [merchantRules],
  )

  const rows = useMemo<MerchantRow[]>(() => {
    const map = new Map<string, MerchantRow>()
    for (const t of transactions) {
      const rule = rules.get(t.merchantKey)
      const entry = map.get(t.merchantKey) ?? {
        merchantKey: t.merchantKey,
        display: t.merchant,
        original: t.bankName ?? t.merchant,
        alias: rule?.alias,
        total: 0,
        count: 0,
        months: 0,
        category: t.category,
        necessity: t.necessity,
        frequency: rule?.frequency ?? 'monthly',
        lastDate: t.date,
      }
      entry.total += t.amount
      entry.count++
      if (t.date > entry.lastDate) entry.lastDate = t.date
      map.set(t.merchantKey, entry)
    }

    // מספר החודשים שבהם בית העסק הופיע — רמז חזק לחיוב חוזר
    const monthsByMerchant = new Map<string, Set<string>>()
    for (const t of transactions) {
      const set = monthsByMerchant.get(t.merchantKey) ?? new Set()
      set.add((t.chargeDate || t.date).slice(0, 7))
      monthsByMerchant.set(t.merchantKey, set)
    }
    for (const [key, row] of map) row.months = monthsByMerchant.get(key)?.size ?? 1

    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [transactions, rules])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (onlyUnnamed && r.alias) return false
      if (q && !r.display.toLowerCase().includes(q) && !r.original.includes(q)) return false
      return true
    })
  }, [rows, query, onlyUnnamed])

  const named = rows.filter((r) => r.alias).length

  function startEdit(row: MerchantRow) {
    setEditing(row.merchantKey)
    setDraft(row.alias ?? row.display)
  }

  function commit(merchantKey: string) {
    const value = draft.trim()
    onSetMerchantRule(merchantKey, { alias: value || undefined })
    setEditing(null)
    setDraft('')
  }

  return (
    <div className="grid">
      <div className="grid cols-3">
        <div className="card">
          <div className="stat-label">{tr('בתי עסק')}</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-note">{tr('בכל החודשים שיובאו')}</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('קיבלו שם מוכר')}</div>
          <div className="stat-value tinted" style={{ color: 'var(--ok)' }}>
            {named}
          </div>
          <div className="stat-note">מתוך {rows.length}</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('חוזרים ביותר מחודש')}</div>
          <div className="stat-value">{rows.filter((r) => r.months > 1).length}</div>
          <div className="stat-note">{tr('מועמדים לחיוב קבוע')}</div>
        </div>
      </div>

      <div className="notice">{tr('הבנק מקצר שמות של בתי עסק ל-14 תווים, ולכן "מרכבה a45 (חצי" או "אחים סרור - ב." לא תמיד אומרים משהו. תנו כאן שם שאתם מזהים — הוא יחליף את השם המקוצר בכל האפליקציה, בכל החודשים, וגם בקבצים שתייבאו בעתיד.')}</div>

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder={tr('חיפוש בית עסק…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 230 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={onlyUnnamed}
              onChange={(e) => setOnlyUnnamed(e.target.checked)}
            />{tr('רק כאלה שעוד לא נתתי להם שם')}</label>
          <div className="spacer strong">{shown.length} בתי עסק</div>
        </div>

        <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>{tr('שם תצוגה')}</th>
                <th className="num">{tr('סך הכל')}</th>
                <th className="num">{tr('עסקאות')}</th>
                <th className="num">{tr('חודשים')}</th>
                <th>{tr('קטגוריה')}</th>
                <th>{tr('נחיצות')}</th>
                <th title={tr('חשמל, מים וארנונה מגיעים בדרך כלל אחת לחודשיים')}>{tr('תדירות')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.merchantKey}>
                  <td data-label={tr('שם תצוגה')}>
                    {editing === row.merchantKey ? (
                      <div className="alias-cell">
                        <input
                          type="text"
                          autoFocus
                          value={draft}
                          placeholder={tr('למשל: מוסך של אבי')}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commit(row.merchantKey)
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          style={{ minWidth: 170 }}
                        />
                        <button className="btn sm" onClick={() => commit(row.merchantKey)}>{tr('שמירה')}</button>
                        <button className="link-btn" onClick={() => setEditing(null)}>{tr('ביטול')}</button>
                      </div>
                    ) : (
                      <div className="alias-cell">
                        <span aria-hidden>{cats.byId(row.category).emoji}</span>
                        <div>
                          <div className="strong">{row.display}</div>
                          {row.alias && (
                            <div className="alias-orig">בבנק: {row.original}</div>
                          )}
                        </div>
                        <button className="link-btn" onClick={() => startEdit(row)}>
                          {row.alias ? 'שינוי' : '✏️ תנו שם'}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="num strong" data-label={tr('סך הכל')}>{ils(row.total)}</td>
                  <td className="num dim" data-label={tr('עסקאות')}>{txCount(row.count)}</td>
                  <td className="num dim" data-label={tr('חודשים')}>{row.months}</td>
                  <td data-label={tr('קטגוריה')}>
                    <select
                      value={row.category}
                      onChange={(e) =>
                        onSetMerchantRule(row.merchantKey, { category: e.target.value as CategoryId })
                      }
                    >
                      {cats.list.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label={tr('נחיצות')}>
                    <select
                      value={row.necessity}
                      onChange={(e) =>
                        onSetMerchantRule(row.merchantKey, { necessity: e.target.value as Necessity })
                      }
                    >
                      {(['mandatory', 'semi', 'optional'] as Necessity[]).map((n) => (
                        <option key={n} value={n}>
                          {tr(NECESSITY_LABEL[n])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label={tr('תדירות')}>
                    <select
                      value={row.frequency}
                      onChange={(e) =>
                        onSetMerchantRule(row.merchantKey, {
                          frequency: e.target.value as Frequency,
                        })
                      }
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {tr(FREQUENCY_SHORT[f])}
                        </option>
                      ))}
                    </select>
                    {row.frequency !== 'monthly' && row.frequency !== 'oneoff' && (
                      <div className="mini-label">
                        ≈ {ils(monthlyEquivalent(row.total / row.count, row.frequency))} בחודש
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {shown.length === 0 && <p className="dim">{tr('לא נמצאו בתי עסק מתאימים לסינון.')}</p>}
      </div>
    </div>
  )
}
