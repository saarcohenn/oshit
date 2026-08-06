import { useMemo, useState } from 'react'
import type { AppState, CategoryId, Goal, Income, PlannedChange, Transaction } from '../types'
import { useCategories } from '../lib/categoryContext'
import { ils, monthLabel } from '../lib/format'
import {
  addMonths,
  changeSaving,
  goalProgress,
  incomeForMonth,
  monthlyPicture,
  recurringIncome,
  transactionsForGoal,
} from '../lib/plan'

interface Props {
  state: AppState
  transactions: Transaction[]
  month: string
  onSetIncomes: (incomes: Income[]) => void
  onSetGoals: (goals: Goal[]) => void
  onSetChanges: (changes: PlannedChange[]) => void
  /** מעבר למסך העסקאות מסונן לפי היעד */
  onShowGoalExpenses: (goalId: string) => void
}

const uid = () => Math.random().toString(36).slice(2, 10)

export default function PlanPanel({
  state,
  transactions,
  month,
  onSetIncomes,
  onSetGoals,
  onSetChanges,
  onShowGoalExpenses,
}: Props) {
  const cats = useCategories()
  const [showPaidGoals, setShowPaidGoals] = useState(true)

  const goalIdByTx = useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const [id, a] of Object.entries(state.annotations)) map[id] = a.goalId
    return map
  }, [state.annotations])

  const progress = useMemo(
    () => state.goals.map((g) => goalProgress(g, transactions, goalIdByTx, month)),
    [state.goals, transactions, goalIdByTx, month],
  )

  const goalsMonthly = progress.reduce((s, p) => s + (p.monthlyNeeded ?? 0), 0)
  const picture = monthlyPicture(state.incomes, transactions, goalsMonthly, month)
  const totalRemaining = progress.reduce((s, p) => s + p.remaining, 0)
  const changesSaving = state.plannedChanges.reduce((s, c) => s + changeSaving(c), 0)

  const shownGoals = showPaidGoals
    ? progress
    : progress.filter((p) => !p.goal.done && (p.goal.targetAmount <= 0 || p.remaining > 0))

  /** מספר העסקאות שנספרות לכל יעד — כדי להראות שיש מה לפתוח */
  const relatedCount = useMemo(() => {
    const map: Record<string, number> = {}
    for (const g of state.goals) {
      map[g.id] = transactionsForGoal(g, transactions, goalIdByTx).length
    }
    return map
  }, [state.goals, transactions, goalIdByTx])

  /* ---------- mutations ---------- */

  function patchIncome(id: string, patch: Partial<Income>) {
    onSetIncomes(state.incomes.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }
  function addIncome() {
    onSetIncomes([
      ...state.incomes,
      { id: uid(), name: 'משכורת', amount: 0, kind: 'recurring', owner: '' },
    ])
  }
  function removeIncome(id: string) {
    onSetIncomes(state.incomes.filter((i) => i.id !== id))
  }

  function patchGoal(id: string, patch: Partial<Goal>) {
    onSetGoals(state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }
  function addGoal() {
    onSetGoals([
      ...state.goals,
      {
        id: uid(),
        name: 'הוצאה גדולה חדשה',
        emoji: '🎁',
        targetAmount: 0,
        paidManual: 0,
        targetMonth: addMonths(month, 6),
      },
    ])
  }
  function removeGoal(id: string) {
    onSetGoals(state.goals.filter((g) => g.id !== id))
  }

  function patchChange(id: string, patch: Partial<PlannedChange>) {
    onSetChanges(state.plannedChanges.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function addChange() {
    onSetChanges([
      ...state.plannedChanges,
      {
        id: uid(),
        name: 'הוצאה קבועה שמשתנה',
        currentMonthly: 0,
        futureMonthly: 0,
        fromMonth: addMonths(month, 1),
      },
    ])
  }
  function removeChange(id: string) {
    onSetChanges(state.plannedChanges.filter((c) => c.id !== id))
  }

  const monthOptions = useMemo(() => {
    // חלון של שנתיים קדימה ושנה אחורה — מספיק לכל תכנון סביר
    const list: string[] = []
    for (let i = -12; i <= 24; i++) list.push(addMonths(month, i))
    return list
  }, [month])

  return (
    <div className="grid">
      {/* ---------- תמונת החודש ---------- */}
      <div className="grid cols-4">
        <div className="card">
          <div className="stat-label">הכנסות בחודש</div>
          <div className="stat-value tinted" style={{ color: 'var(--ok)' }}>
            {ils(picture.income)}
          </div>
          <div className="stat-note">
            {picture.income ? `קבוע: ${ils(recurringIncome(state.incomes))}` : 'הזינו הכנסות למטה'}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">הוצאות בחודש</div>
          <div className="stat-value tinted" style={{ color: 'var(--danger)' }}>
            {ils(picture.expenses)}
          </div>
          <div className="stat-note">{monthLabel(month)} — מתוך נתוני האשראי</div>
        </div>
        <div className="card">
          <div className="stat-label">נשאר בסוף החודש</div>
          <div
            className="stat-value tinted"
            style={{ color: picture.net >= 0 ? 'var(--ok)' : 'var(--danger)' }}
          >
            {picture.income ? ils(picture.net) : '—'}
          </div>
          <div className="stat-note">
            {picture.income ? `שיעור חיסכון ${picture.savingRate}%` : 'צריך הכנסות כדי לחשב'}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">אחרי הפרשה ליעדים</div>
          <div
            className="stat-value tinted"
            style={{ color: picture.free >= 0 ? 'var(--ok)' : 'var(--danger)' }}
          >
            {picture.income ? ils(picture.free) : '—'}
          </div>
          <div className="stat-note">הפרשה נדרשת: {ils(goalsMonthly)} בחודש</div>
        </div>
      </div>

      {picture.income > 0 && picture.free < 0 && (
        <div className="notice warn">
          בקצב הנוכחי חסרים <strong>{ils(Math.abs(picture.free))}</strong> בחודש כדי לעמוד בכל היעדים
          בזמן. אפשר לדחות חודש יעד, להוריד סכום יעד, או לקצץ בהוצאות — ראו "איפה לחסוך".
        </div>
      )}

      {/* ---------- הכנסות ---------- */}
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">💼 הכנסות</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              קובץ האשראי מכיל רק הוצאות, ולכן את ההכנסות מזינים כאן. בלעדיהן אי אפשר לדעת
              כמה באמת נשאר בסוף החודש.
            </div>
          </div>
          <button className="btn ghost spacer" onClick={addIncome}>
            + הוספת הכנסה
          </button>
        </div>

        {state.incomes.length === 0 ? (
          <p className="dim">עוד לא הוזנו הכנסות.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>מקור</th>
                  <th>של מי</th>
                  <th>סוג</th>
                  <th>חודש</th>
                  <th className="num">סכום</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.incomes.map((income) => (
                  <tr key={income.id}>
                    <td>
                      <input
                        type="text"
                        value={income.name}
                        onChange={(e) => patchIncome(income.id, { name: e.target.value })}
                        style={{ minWidth: 150 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={income.owner ?? ''}
                        placeholder="אני / בת הזוג"
                        onChange={(e) => patchIncome(income.id, { owner: e.target.value })}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td>
                      <select
                        value={income.kind}
                        onChange={(e) =>
                          patchIncome(income.id, { kind: e.target.value as Income['kind'] })
                        }
                      >
                        <option value="recurring">קבועה כל חודש</option>
                        <option value="oneoff">חד-פעמית</option>
                      </select>
                    </td>
                    <td>
                      {income.kind === 'oneoff' ? (
                        <select
                          value={income.month ?? month}
                          onChange={(e) => patchIncome(income.id, { month: e.target.value })}
                        >
                          {monthOptions.map((m) => (
                            <option key={m} value={m}>
                              {monthLabel(m)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="dim">כל חודש</span>
                      )}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={income.amount || ''}
                        onChange={(e) =>
                          patchIncome(income.id, { amount: Number(e.target.value) || 0 })
                        }
                        style={{ width: 110 }}
                      />
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => removeIncome(income.id)}>
                        מחיקה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- יעדים / הוצאות גדולות ---------- */}
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">🏔️ הוצאות גדולות שבדרך</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              לכל יעד: כמה הוא עולה, כמה כבר שולם, ומתי הוא. האפליקציה מחשבת כמה צריך להפריש
              כל חודש. תשלומים שכבר בוצעו בכרטיס נספרים אוטומטית לפי הקטגוריה המקושרת.
            </div>
          </div>
          <label className="spacer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={showPaidGoals}
              onChange={(e) => setShowPaidGoals(e.target.checked)}
            />
            הצגת יעדים שהושלמו ({progress.filter((p) => p.goal.done || (p.goal.targetAmount > 0 && p.remaining === 0)).length})
          </label>
          <button className="btn ghost" onClick={addGoal}>
            + הוספת יעד
          </button>
        </div>

        <div className="grid cols-3" style={{ marginBottom: 14 }}>
          <div className="card">
            <div className="stat-label">סך היעדים</div>
            <div className="stat-value">
              {ils(state.goals.reduce((s, g) => s + g.targetAmount, 0))}
            </div>
            <div className="stat-note">{state.goals.length} יעדים</div>
          </div>
          <div className="card">
            <div className="stat-label">עוד צריך לשלם</div>
            <div className="stat-value tinted" style={{ color: 'var(--warn)' }}>
              {ils(totalRemaining)}
            </div>
            <div className="stat-note">אחרי מה שכבר שולם</div>
          </div>
          <div className="card">
            <div className="stat-label">הפרשה חודשית נדרשת</div>
            <div className="stat-value">{ils(goalsMonthly)}</div>
            <div className="stat-note">כדי לעמוד בכל חודשי היעד</div>
          </div>
        </div>

        {state.goals.length === 0 ? (
          <p className="dim">עוד לא הוגדרו הוצאות גדולות.</p>
        ) : (
          <div className="grid cols-2">
            {shownGoals.map((p) => {
              const g = p.goal
              // יעד ללא סכום עדיין לא מולא — הוא אינו "מכוסה", הוא פשוט ריק
              const empty = g.targetAmount <= 0
              const done = !empty && p.remaining === 0
              return (
                <div className={`card goal-card ${g.done ? 'goal-done' : ''}`} key={g.id}>
                  <div className="toolbar" style={{ marginBottom: 10 }}>
                    <input
                      type="text"
                      value={g.emoji}
                      onChange={(e) => patchGoal(g.id, { emoji: e.target.value })}
                      style={{ width: 52, textAlign: 'center' }}
                      aria-label="אימוג׳י"
                    />
                    <input
                      type="text"
                      value={g.name}
                      onChange={(e) => patchGoal(g.id, { name: e.target.value })}
                      style={{ flex: 1, minWidth: 120, fontWeight: 650 }}
                    />
                    <button className="link-btn" onClick={() => removeGoal(g.id)}>
                      מחיקה
                    </button>
                  </div>

                  <div className="toolbar" style={{ marginBottom: 12 }}>
                    <label className="done-toggle">
                      <input
                        type="checkbox"
                        checked={!!g.done}
                        onChange={(e) => patchGoal(g.id, { done: e.target.checked })}
                      />
                      <span>{g.done ? '✅ הושלם' : 'סמנו כשהיעד סגור'}</span>
                    </label>
                    <button
                      className="link-btn spacer"
                      onClick={() => onShowGoalExpenses(g.id)}
                      title="מעבר למסך העסקאות עם סינון לפי היעד"
                    >
                      🔎 הצגת ההוצאות ({relatedCount[g.id] ?? 0}) ←
                    </button>
                  </div>

                  <div className="bar" style={{ marginBottom: 6 }}>
                    <span
                      style={{
                        width: `${g.done ? 100 : p.percent}%`,
                        background:
                          done || g.done
                            ? 'var(--ok)'
                            : 'linear-gradient(90deg, var(--accent-2), var(--accent))',
                      }}
                    />
                  </div>
                  <div className="mini-label" style={{ marginBottom: 12 }}>
                    שולם {ils(p.paid)} מתוך {ils(g.targetAmount)} · {p.percent}%
                    {p.paidFromTransactions > 0 && (
                      <> · מתוכם {ils(p.paidFromTransactions)} אותרו בעסקאות</>
                    )}
                  </div>

                  <div className="grid" style={{ gap: 9 }}>
                    <label className="field-row">
                      <span>עלות כוללת</span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={g.targetAmount || ''}
                        onChange={(e) =>
                          patchGoal(g.id, { targetAmount: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label className="field-row">
                      <span>שולם מחוץ לכרטיס</span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={g.paidManual || ''}
                        onChange={(e) =>
                          patchGoal(g.id, { paidManual: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label className="field-row">
                      <span>חודש היעד</span>
                      <select
                        value={g.targetMonth ?? ''}
                        onChange={(e) => patchGoal(g.id, { targetMonth: e.target.value || undefined })}
                      >
                        <option value="">בלי תאריך</option>
                        {monthOptions.map((m) => (
                          <option key={m} value={m}>
                            {monthLabel(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-row">
                      <span>קטגוריה מקושרת</span>
                      <select
                        value={g.linkedCategory ?? ''}
                        onChange={(e) =>
                          patchGoal(g.id, {
                            linkedCategory: (e.target.value || undefined) as CategoryId | undefined,
                          })
                        }
                      >
                        <option value="">אין — ספירה ידנית בלבד</option>
                        {cats.list.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.emoji} {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={`notice ${empty && !g.done ? 'warn' : ''}`} style={{ marginTop: 12, fontSize: 13 }}>
                    {g.done ? (
                      <>
                        ✅ היעד סומן כהושלם ואינו נכלל עוד בהפרשה החודשית.
                        {p.paid < g.targetAmount && g.targetAmount > 0 && (
                          <> נרשמו {ils(p.paid)} מתוך {ils(g.targetAmount)}.</>
                        )}
                      </>
                    ) : empty ? (
                      <>✏️ מלאו את העלות הכוללת ואת חודש היעד כדי שנחשב כמה להפריש בחודש.</>
                    ) : done ? (
                      <>✅ היעד מכוסה במלואו.</>
                    ) : p.overdue ? (
                      <>
                        ⚠ חודש היעד כבר עבר ונותרו <strong>{ils(p.remaining)}</strong>.
                      </>
                    ) : p.monthlyNeeded !== null ? (
                      <>
                        נותרו {ils(p.remaining)} על פני {p.monthsLeft} חודשים —{' '}
                        <strong>{ils(p.monthlyNeeded)} בחודש</strong>
                      </>
                    ) : (
                      <>נותרו {ils(p.remaining)}. קבעו חודש יעד כדי לחשב הפרשה חודשית.</>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- שינויים מתוכננים ---------- */}
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">🔀 שינויים מתוכננים בהוצאות קבועות</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              הוצאה קבועה שאתם כבר יודעים שתשתנה בתאריך מסוים — הפסקת מנוי, הוזלה, סיום התחייבות.
            </div>
          </div>
          <button className="btn ghost spacer" onClick={addChange}>
            + הוספת שינוי
          </button>
        </div>

        {state.plannedChanges.length === 0 ? (
          <p className="dim">לא הוגדרו שינויים מתוכננים.</p>
        ) : (
          <>
            <div className="notice" style={{ marginBottom: 14 }}>
              סך החיסכון החודשי אחרי שכל השינויים ייכנסו לתוקף:{' '}
              <strong>{ils(changesSaving)}</strong> בחודש · {ils(changesSaving * 12)} בשנה.
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 170 }}>מה משתנה</th>
                    <th className="num">היום</th>
                    <th className="num">אחרי השינוי</th>
                    <th>מתי</th>
                    <th className="num">חיסכון חודשי</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.plannedChanges.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => patchChange(c.id, { name: e.target.value })}
                          style={{ minWidth: 160 }}
                        />
                        {c.note && <div className="mini-label">{c.note}</div>}
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={c.currentMonthly || ''}
                          onChange={(e) =>
                            patchChange(c.id, { currentMonthly: Number(e.target.value) || 0 })
                          }
                          style={{ width: 100 }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={c.futureMonthly || ''}
                          onChange={(e) =>
                            patchChange(c.id, { futureMonthly: Number(e.target.value) || 0 })
                          }
                          style={{ width: 100 }}
                        />
                      </td>
                      <td>
                        <select
                          value={c.fromMonth}
                          onChange={(e) => patchChange(c.id, { fromMonth: e.target.value })}
                        >
                          {monthOptions.map((m) => (
                            <option key={m} value={m}>
                              {monthLabel(m)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className="num strong"
                        style={{ color: changeSaving(c) > 0 ? 'var(--ok)' : undefined }}
                      >
                        {ils(changeSaving(c))}
                      </td>
                      <td>
                        <button className="link-btn" onClick={() => removeChange(c.id)}>
                          מחיקה
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {state.incomes.length > 0 && (
        <div className="card">
          <div className="card-title">תחזית קדימה</div>
          <div className="card-sub">
            בהנחה שההכנסות נשארות כפי שהן וההוצאות דומות ל{monthLabel(month)}, כולל השינויים
            המתוכננים.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>חודש</th>
                  <th className="num">הכנסה צפויה</th>
                  <th className="num">הפרשה ליעדים</th>
                  <th className="num">שינויים בהוצאות</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const m = addMonths(month, i)
                  const inc = incomeForMonth(state.incomes, m)
                  const activeChanges = state.plannedChanges.filter((c) => m >= c.fromMonth)
                  const saved = activeChanges.reduce((s, c) => s + changeSaving(c), 0)
                  const dueGoals = progress.filter((p) => p.goal.targetMonth === m)
                  return (
                    <tr key={m}>
                      <td className="strong">
                        {monthLabel(m)}
                        {dueGoals.length > 0 && (
                          <div className="mini-label">
                            יעד החודש: {dueGoals.map((p) => p.goal.name).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="num">{ils(inc)}</td>
                      <td className="num">{ils(goalsMonthly)}</td>
                      <td className="num" style={{ color: saved > 0 ? 'var(--ok)' : undefined }}>
                        {saved > 0 ? `−${ils(saved)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
