import { useMemo } from 'react'
import type { Budget, CategoryId, Transaction } from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { availableMonths, partialMonths, summarize } from '../lib/analytics'
import { ils, monthLabel, pct, plural } from '../lib/format'
import { tr, trf } from '../lib/i18n'

interface Props {
  transactions: Transaction[]
  month: string
  budgets: Budget[]
  onSetBudget: (category: CategoryId, limit: number) => void
}

/**
 * ממוצע ההוצאה בקטגוריה — בסיס טוב לקביעת תקציב.
 * חודשים חלקיים נשמטים מהחישוב, אחרת הם היו מושכים כל ממוצע כלפי מטה.
 */
function averages(transactions: Transaction[]): Map<CategoryId, number> {
  const partial = partialMonths(transactions)
  const full = availableMonths(transactions).filter((m) => !partial.has(m))
  const months = full.length ? full : availableMonths(transactions)
  const result = new Map<CategoryId, number>()
  if (!months.length) return result
  for (const m of months) {
    for (const c of summarize(transactions, m).byCategory) {
      result.set(c.category, (result.get(c.category) ?? 0) + c.total)
    }
  }
  for (const [k, v] of result) result.set(k, v / months.length)
  return result
}

export default function BudgetsPanel({ transactions, month, budgets, onSetBudget }: Props) {
  const cats = useCategories()
  const summary = useMemo(() => summarize(transactions, month), [transactions, month])
  const avg = useMemo(() => averages(transactions), [transactions])

  const spent = new Map(summary.byCategory.map((c) => [c.category, c.total]))
  const budgetMap = new Map(budgets.map((b) => [b.category, b.limit]))

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0)
  const budgetedSpend = budgets.reduce((s, b) => s + (spent.get(b.category) ?? 0), 0)
  const over = budgets.filter((b) => (spent.get(b.category) ?? 0) > b.limit)

  /** ממלא תקציב לכל קטגוריה פעילה לפי הממוצע בפועל, מעוגל ל-50 ₪ */
  function suggestAll() {
    for (const [category, value] of avg) {
      if (value < 50) continue
      onSetBudget(category, Math.round(value / 50) * 50)
    }
  }

  /*
   * כל הקטגוריות מוצגות, ולא רק אלה שכבר הוצא בהן.
   * קודם אפשר היה לקבוע תקציב רק לקטגוריה עם היסטוריה, ולכן לא הייתה
   * דרך לתקצב מראש משהו שטרם הוצא בו — וזה בדיוק מה שתקציב אמור לעשות.
   */
  const active = cats.list

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <h1 className="page-title">{tr('תקציבים')}</h1>
          <div className="page-sub">
            {monthLabel(month)} · {plural(budgets.length, 'קטגוריה מתוקצבת', 'קטגוריות מתוקצבות')}
          </div>
        </div>
      </div>

      <div className="kpis three">
        <div className="card">
          <div className="stat-label">{tr('סך התקציב שהוגדר')}</div>
          <div className="stat-value">{totalBudget ? ils(totalBudget) : '—'}</div>
          <div className="stat-note">{plural(budgets.length, 'קטגוריה', 'קטגוריות')} מתוקצבות</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('נוצל מתוך התקציב')}</div>
          <div
            className="stat-value tinted"
            style={{ color: budgetedSpend > totalBudget ? 'var(--danger)' : 'var(--ok)' }}
          >
            {totalBudget ? `${pct(budgetedSpend, totalBudget)}%` : '—'}
          </div>
          <div className="stat-note">{ils(budgetedSpend)} מתוך {ils(totalBudget)}</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('חריגות')}</div>
          <div className="stat-value tinted" style={{ color: over.length ? 'var(--danger)' : 'var(--ok)' }}>
            {over.length}
          </div>
          <div className="stat-note">
            {over.length
              ? over.map((b) => `${cats.byId(b.category).emoji} ${cats.byId(b.category).name}`).join(', ')
              : tr('הכול בתוך התקציב')}
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="toolbar card-pad">
          <div>
            <div className="card-title">תקציב חודשי — {monthLabel(month)}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{tr('קבעו תקרה לכל קטגוריה. הפס מראה כמה כבר נוצל בחודש הנבחר. "ממוצע חודשי" מחושב מהחודשים המלאים שיובאו בלבד.')}</div>
          </div>
          <button className="btn ghost spacer" onClick={suggestAll}>{tr('✨ הצעה לפי הממוצע שלכם')}</button>
        </div>

        <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr>
                <th>{tr('קטגוריה')}</th>
                <th>{tr('נחיצות')}</th>
                <th className="num">{tr('ממוצע חודשי')}</th>
                <th className="num">{tr('הוצאה בפועל')}</th>
                <th style={{ minWidth: 150 }}>{tr('ניצול')}</th>
                <th className="num">{tr('תקציב')}</th>
                <th className="num">{tr('נשאר')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map((cat) => {
                const used = spent.get(cat.id) ?? 0
                const limit = budgetMap.get(cat.id) ?? 0
                const ratio = limit ? used / limit : 0
                const remaining = limit - used
                // מעל התקרה אדום, קרוב אליה צהוב; אחרת צבע הקטגוריה — כך הפס מזוהה גם בלי לקרוא
                const barColor =
                  ratio > 1 ? 'var(--danger-fill)' : ratio > 0.85 ? 'var(--viz-semi)' : cat.color

                return (
                  <tr key={cat.id}>
                    <td data-label={tr('קטגוריה')}>
                      <span aria-hidden>{cat.emoji}</span> {cat.name}
                    </td>
                    <td data-label={tr('נחיצות')}>
                      <span className={`pill ${cat.necessity}`}>{tr(NECESSITY_LABEL[cat.necessity])}</span>
                    </td>
                    <td className="num dim" data-label={tr('ממוצע חודשי')}>{avg.has(cat.id) ? ils(avg.get(cat.id)!) : '—'}</td>
                    <td className="num strong" data-label={tr('הוצאה בפועל')}>{used ? ils(used) : '—'}</td>
                    <td data-label={tr('ניצול')}>
                      {limit ? (
                        <>
                          <div className="bar">
                            <span
                              style={{ width: `${Math.min(100, ratio * 100)}%`, background: barColor }}
                            />
                          </div>
                          <div className="mini-label" style={{ color: ratio > 1 ? 'var(--danger)' : undefined, fontWeight: 500 }}>
                            {trf('{p}% מהתקציב', { p: Math.round(ratio * 100) })}
                          </div>
                        </>
                      ) : (
                        <span className="dim">{tr('לא הוגדר')}</span>
                      )}
                    </td>
                    <td className="num" data-label={tr('תקציב')}>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        style={{ width: 96 }}
                        value={limit || ''}
                        placeholder="—"
                        onChange={(e) => onSetBudget(cat.id, Number(e.target.value) || 0)}
                      />
                    </td>
                    <td className="num strong" data-label={tr('נשאר')} style={{ color: limit && remaining < 0 ? 'var(--danger)' : undefined }}>
                      {limit ? ils(remaining) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
