import { useMemo, useState } from 'react'
import type {
  CategoryId,
  Frequency,
  Goal,
  MerchantRule,
  Necessity,
  Transaction,
  TxAnnotation,
} from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { transactionMonth } from '../lib/analytics'
import { FREQUENCIES, FREQUENCY_LABEL, FREQUENCY_SHORT, monthlyEquivalent } from '../lib/frequency'
import { addMonths } from '../lib/plan'
import { ils, ilsExact, monthLabel, shortDate, txCount } from '../lib/format'
import ManualPaymentForm, { type ManualPaymentDraft } from './ManualPaymentForm'

interface Props {
  transactions: Transaction[]
  month: string
  annotations: Record<string, TxAnnotation>
  goals: Goal[]
  frequencies: Record<string, Frequency>
  /** סינון לפי יעד — מגיע ממסך "הכנסות ויעדים" בלחיצה על "הצגת ההוצאות" */
  goalFilter: string | null
  onClearGoalFilter: () => void
  onSetMerchantRule: (merchantKey: string, patch: Partial<Omit<MerchantRule, 'merchantKey'>>) => void
  onSetAnnotation: (transactionId: string, patch: Partial<TxAnnotation>) => void
  onSaveManual: (draft: ManualPaymentDraft, frequency: Frequency) => void
  onDeleteManual: (id: string) => void
}

type SortKey = 'date' | 'amount' | 'merchant'

export default function TransactionsTable({
  transactions,
  month,
  annotations,
  goals,
  frequencies,
  goalFilter,
  onClearGoalFilter,
  onSetMerchantRule,
  onSetAnnotation,
  onSaveManual,
  onDeleteManual,
}: Props) {
  const cats = useCategories()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'all'>('all')
  const [necessityFilter, setNecessityFilter] = useState<Necessity | 'all'>('all')
  const [allMonths, setAllMonths] = useState(false)
  const [sort, setSort] = useState<SortKey>('amount')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [editingManual, setEditingManual] = useState<Transaction | null>(null)

  const activeGoal = goals.find((g) => g.id === goalFilter) ?? null
  // סינון לפי יעד מתעלם מהחודש הנבחר: הוצאות ליעד אחד מתפרסות על פני חודשים
  const showAllMonths = allMonths || !!activeGoal

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = transactions.filter((t) => {
      if (activeGoal) {
        const assigned = annotations[t.id]?.goalId
        const belongs = assigned
          ? assigned === activeGoal.id
          : !!activeGoal.linkedCategory && t.category === activeGoal.linkedCategory
        if (!belongs) return false
      } else if (!showAllMonths && transactionMonth(t) !== month) {
        return false
      }
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (necessityFilter !== 'all' && t.necessity !== necessityFilter) return false

      const ann = annotations[t.id]
      if (
        q &&
        !t.merchant.toLowerCase().includes(q) &&
        !t.merchantKey.includes(q) &&
        !t.card.toLowerCase().includes(q) &&
        !(ann?.reference ?? '').toLowerCase().includes(q) &&
        !(ann?.note ?? '').toLowerCase().includes(q)
      )
        return false
      return true
    })

    return filtered.sort((a, b) => {
      if (sort === 'amount') return b.amount - a.amount
      if (sort === 'merchant') return a.merchant.localeCompare(b.merchant, 'he')
      return b.chargeDate.localeCompare(a.chargeDate) || b.date.localeCompare(a.date)
    })
  }, [
    transactions,
    month,
    showAllMonths,
    categoryFilter,
    necessityFilter,
    query,
    sort,
    annotations,
    activeGoal,
  ])

  const total = rows.reduce((s, t) => s + t.amount, 0)
  const manualCount = rows.filter((t) => t.manual).length

  /** החודש המוקדם ביותר שיש עליו נתונים — לזיהוי תשלומים קודמים שלא יובאו */
  const earliestMonth = useMemo(
    () => transactions.map(transactionMonth).sort()[0] ?? null,
    [transactions],
  )

  const nonMonthly = rows.filter((t) => {
    const f = frequencies[t.merchantKey]
    return f && f !== 'monthly' && f !== 'oneoff'
  })
  const normalizedTotal = rows.reduce((sum, t) => {
    const f = frequencies[t.merchantKey] ?? 'monthly'
    return sum + (f === 'oneoff' ? t.amount : monthlyEquivalent(t.amount, f))
  }, 0)

  return (
    <div className="grid">
      {formOpen && (
        <ManualPaymentForm
          editing={editingManual ?? undefined}
          defaultDate={`${month}-01`}
          onSave={(draft, frequency) => {
            onSaveManual(draft, frequency)
            setFormOpen(false)
            setEditingManual(null)
          }}
          onCancel={() => {
            setFormOpen(false)
            setEditingManual(null)
          }}
        />
      )}

      {activeGoal && (
        <div className="notice goal-filter">
          <span>
            מוצגות ההוצאות המשויכות ל<strong>{activeGoal.emoji} {activeGoal.name}</strong> — כל
            החודשים, מכל הקטגוריות. סך הכול <strong>{ils(total)}</strong> ב-{txCount(rows.length)}.
          </span>
          <button className="btn ghost sm" onClick={onClearGoalFilter}>
            ניקוי הסינון
          </button>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder="חיפוש בית עסק, אסמכתא או הערה…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 230 }}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryId | 'all')}
          >
            <option value="all">כל הקטגוריות</option>
            {cats.list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <select
            value={necessityFilter}
            onChange={(e) => setNecessityFilter(e.target.value as Necessity | 'all')}
          >
            <option value="all">כל רמות הנחיצות</option>
            <option value="mandatory">חובה</option>
            <option value="semi">חצי-חובה</option>
            <option value="optional">מותרות</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="amount">מיון: סכום</option>
            <option value="date">מיון: תאריך</option>
            <option value="merchant">מיון: שם בית עסק</option>
          </select>
          {!activeGoal && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input
                type="checkbox"
                checked={allMonths}
                onChange={(e) => setAllMonths(e.target.checked)}
              />
              כל החודשים
            </label>
          )}
          <button
            className="btn spacer"
            onClick={() => {
              setEditingManual(null)
              setFormOpen(true)
            }}
          >
            + תשלום שלא בכרטיס
          </button>
        </div>

        <div className="toolbar" style={{ marginBottom: 10 }}>
          <div className="strong">
            {txCount(rows.length)} · {ilsExact(total)}
            {manualCount > 0 && (
              <span className="dim">
                {' '}
                · {manualCount === 1 ? 'תשלום ידני אחד' : `${manualCount} תשלומים ידניים`}
              </span>
            )}
          </div>
          <button
            className="link-btn spacer"
            onClick={() =>
              setExpanded(expanded.size === rows.length ? new Set() : new Set(rows.map((t) => t.id)))
            }
          >
            {expanded.size === rows.length && rows.length > 0 ? 'סגירת הכול' : 'פתיחת הכול'}
          </button>
        </div>

        {nonMonthly.length > 0 && (
          <div className="notice warn">
            ברשימה יש{' '}
            {nonMonthly.length === 1
              ? 'חיוב אחד שאינו חודשי'
              : `${nonMonthly.length} חיובים שאינם חודשיים`}{' '}
            (חשמל, מים, ארנונה וכדומה). מנורמל לחודש, הסכום המוצג שווה ל-
            <strong>{ils(normalizedTotal)}</strong> בחודש במקום {ils(total)} — זה המספר להשוואה מול
            תקציב חודשי.
          </div>
        )}

        <div className="notice">
          לחיצה על שורה פותחת אותה: אסמכתא, הערה חופשית, שיוך ליעד ופרטי החיוב המלאים.
          ✏️ ליד שם בית העסק משנה את השם <strong>בכל העסקאות שלו</strong>, ואילו האסמכתא וההערה
          שייכות <strong>לעסקה הבודדת</strong>.
        </div>

        <div className="table-wrap">
          <table className="tx-table responsive">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>תאריך</th>
                <th>בית עסק</th>
                <th className="num">סכום</th>
                <th>קטגוריה</th>
                <th>נחיצות</th>
                <th>תדירות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const ann = annotations[t.id]
                const isOpen = expanded.has(t.id)
                const freq = frequencies[t.merchantKey] ?? 'monthly'
                const goal = goals.find((g) => g.id === ann?.goalId)

                return [
                  <tr
                    key={t.id}
                    className={`tx-row ${isOpen ? 'open' : ''}`}
                    onClick={() => toggle(t.id)}
                  >
                    <td className="cell-chevron">
                      <span className={`chevron ${isOpen ? 'open' : ''}`} aria-hidden>
                        ▾
                      </span>
                    </td>
                    <td className="num dim" data-label="תאריך">
                      {shortDate(t.date)}
                      {showAllMonths && (
                        <div className="mini-label">חיוב: {monthLabel(transactionMonth(t))}</div>
                      )}
                    </td>
                    <td className="cell-merchant">
                      <span className="strong">{t.merchant}</span>
                      {t.manual && <span className="chip active tag">ידני</span>}
                      {t.installment && (
                        <span className="chip tag">
                          תשלום {t.installment.current}/{t.installment.total}
                        </span>
                      )}
                      {goal && (
                        <span className="chip active tag">
                          {goal.emoji} {goal.name}
                        </span>
                      )}
                      {ann?.reference && <div className="tx-ref">📌 {ann.reference}</div>}
                      {ann?.note && !isOpen && <div className="tx-note-hint">💬 {ann.note}</div>}
                      {t.paidVia && <div className="alias-orig">שולם דרך {t.paidVia}</div>}
                    </td>
                    <td className="num strong" data-label="סכום">
                      <span>
                        {ilsExact(t.amount)}
                        {freq !== 'monthly' && freq !== 'oneoff' && (
                          <div className="mini-label">
                            ≈ {ils(monthlyEquivalent(t.amount, freq))} בחודש
                          </div>
                        )}
                      </span>
                    </td>
                    <td data-label="קטגוריה" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={t.category}
                        onChange={(e) =>
                          onSetMerchantRule(t.merchantKey, { category: e.target.value as CategoryId })
                        }
                      >
                        {cats.list.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.emoji} {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="נחיצות" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={t.necessity}
                        onChange={(e) =>
                          onSetMerchantRule(t.merchantKey, { necessity: e.target.value as Necessity })
                        }
                      >
                        {(['mandatory', 'semi', 'optional'] as Necessity[]).map((n) => (
                          <option key={n} value={n}>
                            {NECESSITY_LABEL[n]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="תדירות" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={freq}
                        onChange={(e) =>
                          onSetMerchantRule(t.merchantKey, { frequency: e.target.value as Frequency })
                        }
                      >
                        {FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {FREQUENCY_SHORT[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>,

                  isOpen && (
                    <tr key={`${t.id}-details`} className="tx-details-row">
                      <td colSpan={7}>
                        <div className="tx-details">
                          <div className="tx-details-main">
                            <label className="form-field">
                              <span>📌 אסמכתא — למה היה התשלום הזה</span>
                              <input
                                type="text"
                                value={ann?.reference ?? ''}
                                placeholder="למשל: מקדמה לצלם החתונה"
                                onChange={(e) =>
                                  onSetAnnotation(t.id, { reference: e.target.value || undefined })
                                }
                              />
                            </label>

                            <label className="form-field">
                              <span>💬 הערה</span>
                              <textarea
                                rows={3}
                                value={ann?.note ?? ''}
                                placeholder="כל מה שתרצו לזכור על העסקה הזו"
                                onChange={(e) =>
                                  onSetAnnotation(t.id, { note: e.target.value || undefined })
                                }
                              />
                            </label>

                            <label className="form-field">
                              <span>🏔️ שיוך להוצאה גדולה</span>
                              <select
                                value={ann?.goalId ?? ''}
                                onChange={(e) =>
                                  onSetAnnotation(t.id, { goalId: e.target.value || undefined })
                                }
                              >
                                <option value="">בלי שיוך ליעד</option>
                                {goals.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.emoji} {g.name}
                                  </option>
                                ))}
                              </select>
                              {goals.length === 0 && (
                                <span className="mini-label">
                                  הגדירו יעדים בלשונית "הכנסות ויעדים"
                                </span>
                              )}
                            </label>
                          </div>

                          <div className="tx-details-side">
                            <div className="detail-line">
                              <span>שם בית העסק</span>
                              <strong>
                                {t.merchant}
                                <button
                                  className="link-btn"
                                  style={{ marginInlineStart: 7 }}
                                  onClick={() => {
                                    const value = prompt(
                                      `איך קוראים ל"${t.bankName ?? t.merchant}"?\nהשם יחליף את השם מהבנק בכל העסקאות של בית העסק.`,
                                      t.merchant,
                                    )
                                    if (value === null) return
                                    onSetMerchantRule(t.merchantKey, {
                                      alias: value.trim() || undefined,
                                    })
                                  }}
                                >
                                  ✏️ שינוי
                                </button>
                              </strong>
                            </div>
                            {t.bankName && (
                              <div className="detail-line">
                                <span>השם בבנק</span>
                                <strong>{t.bankName}</strong>
                              </div>
                            )}
                            <div className="detail-line">
                              <span>כרטיס</span>
                              <strong>{t.card}</strong>
                            </div>
                            <div className="detail-line">
                              <span>תאריך עסקה</span>
                              <strong>{shortDate(t.date)}</strong>
                            </div>
                            <div className="detail-line">
                              <span>תאריך חיוב</span>
                              <strong>{shortDate(t.chargeDate)}</strong>
                            </div>
                            {t.currency !== 'ILS' && (
                              <div className="detail-line">
                                <span>סכום מקורי</span>
                                <strong>
                                  {t.originalAmount.toLocaleString('he-IL')} {t.currency}
                                </strong>
                              </div>
                            )}
                            {t.installment && (
                              <>
                                <div className="detail-line">
                                  <span>תשלומים</span>
                                  <strong>
                                    {t.installment.current} מתוך {t.installment.total}
                                  </strong>
                                </div>
                                {(() => {
                                  if (t.installment!.current <= 1 || !earliestMonth) return null
                                  const firstMonth = addMonths(
                                    transactionMonth(t),
                                    -(t.installment!.current - 1),
                                  )
                                  if (firstMonth >= earliestMonth) return null
                                  const missing = t.installment!.current - 1
                                  return (
                                    <div className="notice warn" style={{ fontSize: 12, marginTop: 6 }}>
                                      {missing === 1 ? 'תשלום קודם אחד' : `${missing} תשלומים קודמים`}{' '}
                                      של העסקה הזו חויבו לפני {monthLabel(earliestMonth)} ולא נכללים
                                      בנתונים. ייבאו את הקבצים של אותם חודשים כדי לראות את העסקה
                                      במלואה.
                                    </div>
                                  )
                                })()}
                              </>
                            )}
                            <div className="detail-line">
                              <span>סוג</span>
                              <strong>{t.kind || '—'}</strong>
                            </div>
                            <div className="detail-line">
                              <span>תדירות</span>
                              <strong>{FREQUENCY_LABEL[freq]}</strong>
                            </div>
                            <div className="detail-line">
                              <span>מקור</span>
                              <strong>{t.source}</strong>
                            </div>

                            {t.manual && (
                              <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
                                <button
                                  className="btn ghost sm"
                                  onClick={() => {
                                    setEditingManual(t)
                                    setFormOpen(true)
                                  }}
                                >
                                  עריכת התשלום
                                </button>
                                <button
                                  className="btn danger sm"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `למחוק את התשלום "${t.merchant}" על ${ilsExact(t.amount)}?`,
                                      )
                                    )
                                      onDeleteManual(t.id)
                                  }}
                                >
                                  מחיקה
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && <p className="dim">לא נמצאו עסקאות מתאימות לסינון.</p>}
      </div>
    </div>
  )
}
