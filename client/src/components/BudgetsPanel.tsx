import { useMemo } from 'react'
import type { Budget, CategoryId, Transaction } from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { availableMonths, partialMonths, summarize } from '../lib/analytics'
import { ils, monthLabel, pct, plural } from '../lib/format'

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

  // הקטגוריות שיש בהן פעילות כלשהי — אין טעם להציג תקציב לקטגוריה ריקה
  const active = cats.list.filter((c) => spent.has(c.id) || budgetMap.has(c.id) || avg.has(c.id))

  return (
    <div className="grid">
      <div className="grid cols-3">
        <div className="card">
          <div className="stat-label">סך התקציב שהוגדר</div>
          <div className="stat-value">{totalBudget ? ils(totalBudget) : '—'}</div>
          <div className="stat-note">{plural(budgets.length, 'קטגוריה', 'קטגוריות')} מתוקצבות</div>
        </div>
        <div className="card">
          <div className="stat-label">נוצל מתוך התקציב</div>
          <div
            className="stat-value tinted"
            style={{ color: budgetedSpend > totalBudget ? 'var(--danger)' : 'var(--ok)' }}
          >
            {totalBudget ? `${pct(budgetedSpend, totalBudget)}%` : '—'}
          </div>
          <div className="stat-note">{ils(budgetedSpend)} מתוך {ils(totalBudget)}</div>
        </div>
        <div className="card">
          <div className="stat-label">חריגות</div>
          <div className="stat-value tinted" style={{ color: over.length ? 'var(--danger)' : 'var(--ok)' }}>
            {over.length}
          </div>
          <div className="stat-note">
            {over.length ? over.map((b) => cats.byId(b.category).name).join(', ') : 'הכול בתוך התקציב'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">תקציב חודשי — {monthLabel(month)}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              קבעו תקרה לכל קטגוריה. הפס מראה כמה כבר נוצל בחודש הנבחר.
              "ממוצע חודשי" מחושב מהחודשים המלאים שיובאו בלבד.
            </div>
          </div>
          <button className="btn ghost spacer" onClick={suggestAll}>
            ✨ הצעה לפי הממוצע שלכם
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>קטגוריה</th>
                <th>נחיצות</th>
                <th className="num">ממוצע חודשי</th>
                <th className="num">הוצאה בפועל</th>
                <th style={{ minWidth: 150 }}>ניצול</th>
                <th className="num">תקציב</th>
                <th className="num">נשאר</th>
              </tr>
            </thead>
            <tbody>
              {active.map((cat) => {
                const used = spent.get(cat.id) ?? 0
                const limit = budgetMap.get(cat.id) ?? 0
                const ratio = limit ? used / limit : 0
                const remaining = limit - used
                const barColor =
                  ratio > 1 ? 'var(--danger)' : ratio > 0.85 ? 'var(--warn)' : 'var(--ok)'

                return (
                  <tr key={cat.id}>
                    <td>
                      <span aria-hidden>{cat.emoji}</span> {cat.name}
                    </td>
                    <td>
                      <span className={`pill ${cat.necessity}`}>{NECESSITY_LABEL[cat.necessity]}</span>
                    </td>
                    <td className="num dim">{avg.has(cat.id) ? ils(avg.get(cat.id)!) : '—'}</td>
                    <td className="num strong">{used ? ils(used) : '—'}</td>
                    <td>
                      {limit ? (
                        <>
                          <div className="bar">
                            <span
                              style={{ width: `${Math.min(100, ratio * 100)}%`, background: barColor }}
                            />
                          </div>
                          <div className="mini-label">{Math.round(ratio * 100)}%</div>
                        </>
                      ) : (
                        <span className="dim">לא הוגדר</span>
                      )}
                    </td>
                    <td className="num">
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
                    <td className="num strong" style={{ color: limit && remaining < 0 ? 'var(--danger)' : undefined }}>
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
