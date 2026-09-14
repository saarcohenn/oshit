import { useMemo, useState } from 'react'
import type {
  AppState,
  CategoryId,
  Goal,
  HouseholdSettings,
  Income,
  PlannedChange,
  Transaction,
} from '../types'
import { useCategories } from '../lib/categoryContext'
import { ils, monthLabel, shortDate } from '../lib/format'
import { cycleRangeLabel } from '../lib/cycle'
import { IconArchive, IconChevron, IconClose, IconPlus } from './Icons'
import { IncomeExpenseChart } from './charts'
import { transactionMonth } from '../lib/analytics'
import { tr } from '../lib/i18n'
import {
  addMonths,
  changeSaving,
  goalDueMonth,
  goalProgress,
  activeInMonth,
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
  onSetSettings: (settings: HouseholdSettings) => void
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
  onSetSettings,
}: Props) {
  const cats = useCategories()
  /* יעד נפתח רק כשנוגעים בו. כרטיס פתוח הוא כשמונה שדות, וחמישה כאלה
     זה קיר של פקדים — בנייד במיוחד */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [archiveOpen, setArchiveOpen] = useState(false)

  const toggleGoal = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /*
   * ההכנסות שייכות לחודש. הרשימה הציגה קודם את כולן בכל מצב, כך שבספטמבר
   * נראו גם שורות של אוגוסט — הסכומים תמיד היו נכונים, רק הרשימה לא.
   */
  const [allMonthsIncome, setAllMonthsIncome] = useState(false)
  const visibleIncomes = useMemo(
    () => (allMonthsIncome ? state.incomes : state.incomes.filter((i) => activeInMonth(i, month))),
    [state.incomes, month, allMonthsIncome],
  )

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

  /* יעד שסומן כהושלם יורד מהרשימה הפעילה ועובר לארכיון */
  const activeGoals = progress.filter((p) => !p.goal.done)
  const archivedGoals = progress.filter((p) => p.goal.done)

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
    onSetIncomes(
      state.incomes.map((i) => {
        if (i.id !== id) return i
        const next = { ...i, ...patch }
        /*
         * הבורר הציג חודש גם כשלא נשמר כזה, ולכן הכנסה חד-פעמית "נעלמה"
         * מהסיכום: ההשוואה מול undefined לעולם לא התאימה.
         * מרגע שהסוג הוא חד-פעמי חייב להיות חודש בפועל.
         */
        if (next.kind === 'oneoff' && !next.month) next.month = month
        if (next.kind === 'recurring') delete next.month
        return next
      }),
    )
  }
  function addIncome() {
    // בראש הרשימה: השורה החדשה היא זו שצריך למלא, ואין סיבה לגלול אליה
    onSetIncomes([
      { id: uid(), name: 'משכורת', amount: 0, kind: 'recurring', owner: '' },
      ...state.incomes,
    ])
  }
  function removeIncome(id: string) {
    onSetIncomes(state.incomes.filter((i) => i.id !== id))
  }

  function patchGoal(id: string, patch: Partial<Goal>) {
    onSetGoals(state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }
  function addGoal() {
    const goal: Goal = {
      id: uid(),
      name: 'הוצאה גדולה חדשה',
      emoji: '🎁',
      targetAmount: 0,
      paidManual: 0,
      targetMonth: addMonths(month, 6),
    }
    onSetGoals([goal, ...state.goals])
    setExpanded((prev) => new Set(prev).add(goal.id))
  }

  /** בחירת אופן המועד. שומר על החודש שכבר נבחר כשעוברים בין המצבים */
  function setDueMode(g: Goal, mode: 'none' | 'month' | 'date') {
    const current = goalDueMonth(g) ?? addMonths(month, 6)
    if (mode === 'none') patchGoal(g.id, { targetMonth: undefined, targetDate: undefined })
    else if (mode === 'month') patchGoal(g.id, { targetMonth: current, targetDate: undefined })
    else patchGoal(g.id, { targetDate: `${current}-01`, targetMonth: undefined })
  }
  function removeGoal(id: string) {
    onSetGoals(state.goals.filter((g) => g.id !== id))
  }

  function patchChange(id: string, patch: Partial<PlannedChange>) {
    onSetChanges(state.plannedChanges.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function addChange() {
    onSetChanges([
      {
        id: uid(),
        name: 'הוצאה קבועה שמשתנה',
        currentMonthly: 0,
        futureMonthly: 0,
        fromMonth: addMonths(month, 1),
      },
      ...state.plannedChanges,
    ])
  }
  function removeChange(id: string) {
    onSetChanges(state.plannedChanges.filter((c) => c.id !== id))
  }

  /*
   * חלון של שנה לאחור וחצי שנה קדימה סביב החודש הפעיל, כך שהוא יושב
   * בערך במרכז ואפשר לראות גם מה כבר מתוכנן קדימה.
   */
  const incomeExpensePoints = useMemo(() => {
    const months: string[] = []
    for (let i = -11; i <= 6; i++) months.push(addMonths(month, i))
    const spend = new Map<string, number>()
    for (const t of transactions) {
      if (t.currency && t.currency !== 'ILS') continue
      const m = transactionMonth(t)
      spend.set(m, (spend.get(m) ?? 0) + t.amount)
    }
    return months
      .map((m) => ({ month: m, income: incomeForMonth(state.incomes, m), expense: spend.get(m) ?? 0 }))
      .filter((p) => p.income > 0 || p.expense > 0)
  }, [state.incomes, transactions, month])

  const monthOptions = useMemo(() => {
    // חלון של שנתיים קדימה ושנה אחורה — מספיק לכל תכנון סביר
    const list: string[] = []
    for (let i = -12; i <= 24; i++) list.push(addMonths(month, i))
    return list
  }, [month])

  /**
   * כרטיס יעד מתקפל.
   *
   * סגור הוא שורה אחת שעונה על מה ששואלים בפועל — כמה שולם, מתי, וכמה
   * להפריש החודש. כל השדות נפתחים רק כשבאים לערוך, אחרת חמישה יעדים הם
   * קיר של עשרות פקדים שאי אפשר לסרוק, בטח לא בטלפון.
   */
  const renderGoal = (p: (typeof progress)[number]) => {
    const g = p.goal
    const open = expanded.has(g.id)
    // יעד ללא סכום עדיין לא מולא — הוא אינו "מכוסה", הוא פשוט ריק
    const empty = g.targetAmount <= 0
    const covered = !empty && p.remaining === 0
    const due = goalDueMonth(g)
    const dueLabel = g.targetDate ? shortDate(g.targetDate) : due ? monthLabel(due) : 'בלי מועד'
    const mode: 'none' | 'month' | 'date' = g.targetDate ? 'date' : g.targetMonth ? 'month' : 'none'

    return (
      <div className={`card goal-card ${g.done ? 'goal-done' : ''}`} key={g.id}>
        <div className="goal-head-row">
          <button
            className="goal-head"
            onClick={() => toggleGoal(g.id)}
            aria-expanded={open}
            title={open ? 'סגירת הפרטים' : 'פתיחת הפרטים'}
          >
            <span className="goal-emoji" aria-hidden>
              {g.emoji}
            </span>
            <span className="goal-head-text">
              <b>{g.name}</b>
              <span className="mini-label">
                {empty
                  ? 'עוד לא הוזנה עלות'
                  : `${ils(p.paid)} מתוך ${ils(g.targetAmount)} · ${p.percent}%`}
                {' · '}
                {dueLabel}
              </span>
            </span>
            <span className="goal-head-figure">
              {g.done ? (
                <span className="pill mandatory">{tr('הושלם')}</span>
              ) : covered ? (
                <span className="pill mandatory">{tr('מכוסה')}</span>
              ) : p.overdue ? (
                <span className="pill optional">{tr('באיחור')}</span>
              ) : p.monthlyNeeded ? (
                <>
                  <b>{ils(p.monthlyNeeded)}</b>
                  <span className="mini-label">{tr('בחודש')}</span>
                </>
              ) : null}
            </span>
            <IconChevron size={16} className={`chev ${open ? 'open' : ''}`} />
          </button>
          <button
            className="icon-btn sm danger"
            title={tr('מחיקת היעד')}
            aria-label={`מחיקת ${g.name}`}
            onClick={() => {
              if (confirm(`למחוק את "${g.name}"? הפעולה אינה הפיכה.`)) removeGoal(g.id)
            }}
          >
            <IconClose size={15} />
          </button>
        </div>

        <div className="bar goal-bar">
          <span
            style={{
              width: `${g.done ? 100 : p.percent}%`,
              background:
                covered || g.done
                  ? 'var(--ok)'
                  : 'linear-gradient(90deg, var(--accent-2), var(--accent))',
            }}
          />
        </div>

        {open && (
          <div className="goal-body">
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <input
                className="emoji-input"
                type="text"
                value={g.emoji}
                onChange={(e) => patchGoal(g.id, { emoji: e.target.value })}
                aria-label={tr('אימוג׳י')}
              />
              <input
                type="text"
                value={g.name}
                onChange={(e) => patchGoal(g.id, { name: e.target.value })}
                style={{ flex: 1, minWidth: 120, fontWeight: 650 }}
                aria-label={tr('שם היעד')}
              />
            </div>

            <div className="toolbar" style={{ marginBottom: 12 }}>
              <label className="done-toggle">
                <input
                  type="checkbox"
                  checked={!!g.done}
                  onChange={(e) => patchGoal(g.id, { done: e.target.checked })}
                />
                <span>{g.done ? '✅ בארכיון' : 'סמנו כשהיעד סגור — יעבור לארכיון'}</span>
              </label>
              <button
                className="link-btn spacer"
                onClick={() => onShowGoalExpenses(g.id)}
                title={tr('מעבר למסך העסקאות עם סינון לפי היעד')}
              >
                🔎 הצגת ההוצאות ({relatedCount[g.id] ?? 0}) ←
              </button>
            </div>

            <div className="mini-label" style={{ marginBottom: 12 }}>
              שולם {ils(p.paid)} מתוך {ils(g.targetAmount)} · {p.percent}%
              {p.paidFromTransactions > 0 && (
                <> · מתוכם {ils(p.paidFromTransactions)} אותרו בעסקאות</>
              )}
            </div>

            <div className="grid" style={{ gap: 9 }}>
              <label className="field-row">
                <span>{tr('עלות כוללת')}</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={g.targetAmount || ''}
                  onChange={(e) => patchGoal(g.id, { targetAmount: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="field-row">
                <span>{tr('שולם מחוץ לכרטיס')}</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={g.paidManual || ''}
                  onChange={(e) => patchGoal(g.id, { paidManual: Number(e.target.value) || 0 })}
                />
              </label>

              {/* חתונה או טיסה הן תאריך, לא חודש. שיפוץ הוא חודש ותו לא */}
              <div className="field-row">
                <span>{tr('מועד היעד')}</span>
                <div className="due-picker">
                  <select
                    value={mode}
                    onChange={(e) => setDueMode(g, e.target.value as typeof mode)}
                    aria-label={tr('סוג המועד')}
                  >
                    <option value="none">{tr('בלי מועד')}</option>
                    <option value="month">{tr('חודש')}</option>
                    <option value="date">{tr('תאריך מדויק')}</option>
                  </select>
                  {mode === 'month' && (
                    <select
                      value={g.targetMonth ?? ''}
                      onChange={(e) => patchGoal(g.id, { targetMonth: e.target.value })}
                      aria-label={tr('חודש היעד')}
                    >
                      {monthOptions.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                        </option>
                      ))}
                    </select>
                  )}
                  {mode === 'date' && (
                    <input
                      type="date"
                      value={g.targetDate ?? ''}
                      onChange={(e) => patchGoal(g.id, { targetDate: e.target.value || undefined })}
                      aria-label={tr('תאריך היעד')}
                    />
                  )}
                </div>
              </div>

              <label className="field-row">
                <span>{tr('קטגוריה מקושרת')}</span>
                <select
                  value={g.linkedCategory ?? ''}
                  onChange={(e) =>
                    patchGoal(g.id, {
                      linkedCategory: (e.target.value || undefined) as CategoryId | undefined,
                    })
                  }
                >
                  <option value="">{tr('אין — ספירה ידנית בלבד')}</option>
                  {cats.list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className={`notice ${empty && !g.done ? 'warn' : ''}`}
              style={{ marginTop: 12, fontSize: 13 }}
            >
              {g.done ? (
                <>
                  ✅ היעד בארכיון ואינו נכלל עוד בהפרשה החודשית.
                  {p.paid < g.targetAmount && g.targetAmount > 0 && (
                    <>
                      {' '}
                      נרשמו {ils(p.paid)} מתוך {ils(g.targetAmount)}.
                    </>
                  )}
                </>
              ) : empty ? (
                <>✏️ מלאו את העלות הכוללת ואת המועד כדי שנחשב כמה להפריש בחודש.</>
              ) : covered ? (
                <>✅ היעד מכוסה במלואו.</>
              ) : p.overdue ? (
                <>
                  ⚠ המועד כבר עבר ונותרו <strong>{ils(p.remaining)}</strong>.
                </>
              ) : p.monthlyNeeded !== null ? (
                <>
                  נותרו {ils(p.remaining)} על פני {p.monthsLeft} חודשים —{' '}
                  <strong>{ils(p.monthlyNeeded)} בחודש</strong>
                </>
              ) : (
                <>נותרו {ils(p.remaining)}. קבעו מועד כדי לחשב הפרשה חודשית.</>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <h1 className="page-title">{tr('הכנסות ויעדים')}</h1>
          <div className="page-sub">
            {activeGoals.length} {tr('יעדים פעילים')}
            {archivedGoals.length > 0 && <> · {archivedGoals.length} {tr('בארכיון')}</>}
          </div>
        </div>
        <button className="btn" onClick={addIncome}>
          {tr('הוספת הכנסה')}
        </button>
      </div>

      {/* ---------- תמונת החודש ---------- */}
      <div className="kpis">
        <div className="card">
          <div className="stat-label">{tr('הכנסות בחודש')}</div>
          <div className="stat-value tinted" style={{ color: 'var(--ok)' }}>
            {ils(picture.income)}
          </div>
          <div className="stat-note">
            {picture.income ? `קבוע: ${ils(recurringIncome(state.incomes))}` : 'הזינו הכנסות למטה'}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('הוצאות בחודש')}</div>
          <div className="stat-value tinted" style={{ color: 'var(--danger)' }}>
            {ils(picture.expenses)}
          </div>
          <div className="stat-note">{monthLabel(month)} — מתוך נתוני האשראי</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('נשאר בסוף החודש')}</div>
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
          <div className="stat-label">{tr('אחרי הפרשה ליעדים')}</div>
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
        <div className="notice warn">{tr('בקצב הנוכחי חסרים')}{' '}<strong>{ils(Math.abs(picture.free))}</strong>{' '}{tr('בחודש כדי לעמוד בכל היעדים בזמן. אפשר לדחות חודש יעד, להוריד סכום יעד, או לקצץ בהוצאות — ראו "איפה לחסוך".')}</div>
      )}

      {/* ---------- יעדים / הוצאות גדולות ---------- */}
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">{tr('🏔️ הוצאות גדולות שבדרך')}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{tr('לכל יעד: כמה הוא עולה, כמה כבר שולם, ומתי הוא. האפליקציה מחשבת כמה צריך להפריש כל חודש. תשלומים שכבר בוצעו בכרטיס נספרים אוטומטית לפי הקטגוריה המקושרת.')}</div>
          </div>
          <button className="add-btn spacer" onClick={addGoal} title={tr('הוספת יעד')} aria-label={tr('הוספת יעד')}>
            <IconPlus size={19} />
          </button>
        </div>

        <div className="kpis three inset" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="stat-label">{tr('סך היעדים')}</div>
            {/* הארכיון אינו נספר: יעד סגור אינו התחייבות שצריך לתכנן מולה */}
            <div className="stat-value">
              {ils(activeGoals.reduce((s, p) => s + p.goal.targetAmount, 0))}
            </div>
            <div className="stat-note">
              {activeGoals.length} יעדים פעילים
              {archivedGoals.length > 0 && ` · ${archivedGoals.length} בארכיון`}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">{tr('עוד צריך לשלם')}</div>
            <div className="stat-value tinted" style={{ color: 'var(--warn)' }}>
              {ils(totalRemaining)}
            </div>
            <div className="stat-note">{tr('אחרי מה שכבר שולם')}</div>
          </div>
          <div className="card">
            <div className="stat-label">{tr('הפרשה חודשית נדרשת')}</div>
            <div className="stat-value">{ils(goalsMonthly)}</div>
            <div className="stat-note">{tr('כדי לעמוד בכל חודשי היעד')}</div>
          </div>
        </div>

        {state.goals.length === 0 ? (
          <p className="dim">{tr('עוד לא הוגדרו הוצאות גדולות.')}</p>
        ) : activeGoals.length === 0 ? (
          <p className="dim">{tr('כל היעדים הושלמו ועברו לארכיון.')}</p>
        ) : (
          <div className="grid cols-2">{activeGoals.map(renderGoal)}</div>
        )}

        {archivedGoals.length > 0 && (
          <div className="archive">
            <button
              className="archive-head"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
            >
              <IconArchive size={17} />
              <span className="grow">{tr('ארכיון — יעדים שהושלמו')}</span>
              <span className="chip">{archivedGoals.length}</span>
              <IconChevron size={16} className={`chev ${archiveOpen ? 'open' : ''}`} />
            </button>
            {archiveOpen && (
              <div className="archive-body">
                <p className="dim tiny">{tr('היעדים האלה אינם נספרים בהפרשה החודשית, אבל הנתונים שלהם נשמרים במלואם. ביטול הסימון מחזיר יעד לרשימה הפעילה.')}</p>
                <div className="grid cols-2">{archivedGoals.map(renderGoal)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- הכנסות ---------- */}
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">{tr('💼 הכנסות')}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{tr('קובץ האשראי מכיל רק הוצאות, ולכן את ההכנסות מזינים כאן. בלעדיהן אי אפשר לדעת כמה באמת נשאר בסוף החודש.')}</div>
          </div>
          <label className="spacer" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input
              type="checkbox"
              checked={allMonthsIncome}
              onChange={(e) => setAllMonthsIncome(e.target.checked)}
            />
            {tr('כל החודשים')}
          </label>
          <button className="add-btn spacer" onClick={addIncome} title={tr('הוספת הכנסה')} aria-label={tr('הוספת הכנסה')}>
            <IconPlus size={19} />
          </button>
        </div>

        {visibleIncomes.length === 0 ? (
          <p className="dim">
            {state.incomes.length
              ? tr('אין הכנסות בחודש הזה. הוסיפו אחת, או הציגו את כל החודשים.')
              : tr('עוד לא הוזנו הכנסות.')}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="responsive income-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>{tr('מקור')}</th>
                  <th>{tr('של מי')}</th>
                  <th>{tr('סוג')}</th>
                  <th>{tr('חודש')}</th>
                  <th className="num">{tr('סכום')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleIncomes.map((income) => (
                  <tr key={income.id}>
                    <td className="c-name" data-label={tr('מקור')}>
                      <input
                        type="text"
                        value={income.name}
                        onChange={(e) => patchIncome(income.id, { name: e.target.value })}
                        style={{ minWidth: 150 }}
                      />
                    </td>
                    <td className="c-owner" data-label={tr('של מי')}>
                      <input
                        type="text"
                        value={income.owner ?? ''}
                        placeholder={tr('אני / בת הזוג')}
                        onChange={(e) => patchIncome(income.id, { owner: e.target.value })}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td className="c-kind" data-label={tr('סוג')}>
                      <select
                        value={income.kind}
                        onChange={(e) =>
                          patchIncome(income.id, { kind: e.target.value as Income['kind'] })
                        }
                      >
                        <option value="recurring">{tr('קבועה כל חודש')}</option>
                        <option value="oneoff">{tr('חד-פעמית')}</option>
                      </select>
                    </td>
                    <td className="c-month" data-label={tr('חודש')}>
                      {income.kind === 'oneoff' && !income.month && (
                        <span className="pill optional" title={tr('הכנסה חד-פעמית בלי חודש אינה נספרת')}>{tr('בחרו חודש')}</span>
                      )}
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
                        <span className="dim">{tr('כל חודש')}</span>
                      )}
                    </td>
                    <td className="num c-amount" data-label={tr('סכום')}>
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
                    <td className="c-del" data-label="">
                      <button
                        className="icon-btn sm danger"
                        onClick={() => removeIncome(income.id)}
                        title={tr('מחיקת ההכנסה')}
                        aria-label={`מחיקת ${income.name}`}
                      >
                        <IconClose size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- הכנסה מול הוצאה לאורך זמן ---------- */}
      {incomeExpensePoints.length > 1 && (
        <div className="card">
          <div className="card-title">{tr('📊 הכנסות מול הוצאות')}</div>
          <div className="card-sub">{tr('החודש הפעיל מסומן. חודש שההוצאה בו עלתה על ההכנסה מסומן באדום.')}</div>
          <IncomeExpenseChart points={incomeExpensePoints} current={month} />
        </div>
      )}

      {/* ---------- שינויים מתוכננים ---------- */}
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">{tr('🔀 שינויים מתוכננים בהוצאות קבועות')}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{tr('הוצאה קבועה שאתם כבר יודעים שתשתנה בתאריך מסוים — הפסקת מנוי, הוזלה, סיום התחייבות.')}</div>
          </div>
          <button className="add-btn spacer" onClick={addChange} title={tr('הוספת שינוי')} aria-label={tr('הוספת שינוי')}>
            <IconPlus size={19} />
          </button>
        </div>

        {state.plannedChanges.length === 0 ? (
          <p className="dim">{tr('לא הוגדרו שינויים מתוכננים.')}</p>
        ) : (
          <>
            <div className="notice" style={{ marginBottom: 14 }}>
              סך החיסכון החודשי אחרי שכל השינויים ייכנסו לתוקף:{' '}
              <strong>{ils(changesSaving)}</strong> בחודש · {ils(changesSaving * 12)} בשנה.
            </div>
            <div className="table-wrap">
              <table className="responsive">
                <thead>
                  <tr>
                    <th style={{ minWidth: 170 }}>{tr('מה משתנה')}</th>
                    <th className="num">{tr('היום')}</th>
                    <th className="num">{tr('אחרי השינוי')}</th>
                    <th>{tr('מתי')}</th>
                    <th className="num">{tr('חיסכון חודשי')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.plannedChanges.map((c) => (
                    <tr key={c.id}>
                      <td data-label={tr('מה משתנה')}>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => patchChange(c.id, { name: e.target.value })}
                          style={{ minWidth: 160 }}
                        />
                        {c.note && <div className="mini-label">{c.note}</div>}
                      </td>
                      <td className="num" data-label={tr('היום')}>
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
                      <td className="num" data-label={tr('אחרי השינוי')}>
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
                      <td data-label={tr('מתי')}>
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
                        data-label={tr('חיסכון חודשי')}
                        style={{ color: changeSaving(c) > 0 ? 'var(--ok)' : undefined }}
                      >
                        {ils(changeSaving(c))}
                      </td>
                      <td data-label="">
                        <button
                          className="icon-btn sm danger"
                          onClick={() => removeChange(c.id)}
                          title={tr('מחיקת השינוי')}
                          aria-label={`מחיקת ${c.name}`}
                        >
                          <IconClose size={15} />
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
          <div className="card-title">{tr('תחזית קדימה')}</div>
          <div className="card-sub">
            בהנחה שההכנסות נשארות כפי שהן וההוצאות דומות ל{monthLabel(month)}, כולל השינויים
            המתוכננים.
          </div>
          <div className="table-wrap">
            <table className="responsive">
              <thead>
                <tr>
                  <th>{tr('חודש')}</th>
                  <th className="num">{tr('הכנסה צפויה')}</th>
                  <th className="num">{tr('הפרשה ליעדים')}</th>
                  <th className="num">{tr('שינויים בהוצאות')}</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const m = addMonths(month, i)
                  const inc = incomeForMonth(state.incomes, m)
                  const activeChanges = state.plannedChanges.filter((c) => m >= c.fromMonth)
                  const saved = activeChanges.reduce((s, c) => s + changeSaving(c), 0)
                  const dueGoals = progress.filter((p) => goalDueMonth(p.goal) === m)
                  return (
                    <tr key={m}>
                      <td className="strong" data-label={tr('חודש')}>
                        {monthLabel(m)}
                        {dueGoals.length > 0 && (
                          <div className="mini-label">
                            יעד החודש: {dueGoals.map((p) => p.goal.name).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="num" data-label={tr('הכנסה צפויה')}>{ils(inc)}</td>
                      <td className="num" data-label={tr('הפרשה ליעדים')}>{ils(goalsMonthly)}</td>
                      <td className="num" data-label={tr('שינויים בהוצאות')} style={{ color: saved > 0 ? 'var(--ok)' : undefined }}>
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
      {/* ---------- מחזור החיוב ---------- */}
      <div className="card">
        <div className="card-title">{tr('🗓️ מחזור החיוב')}</div>
        <div className="card-sub">{tr('אם המשכורות נכנסות בתחילת החודש והאשראי נגבה ב-10, חודש קלנדרי חותך את התקופה באמצע. כאן קובעים באיזה יום נפתח מחזור חדש, וכל החישובים — סיכומים, תקציבים, מגמה והשוואות — עוברים לפיו.')}</div>
        <div className="cycle-row">
          <label className="form-field" style={{ maxWidth: 220 }}>
            <span>{tr('המחזור מתחיל ביום')}</span>
            <select
              value={state.settings?.cycleStartDay ?? 1}
              onChange={(e) => onSetSettings({ cycleStartDay: Number(e.target.value) })}
            >
              <option value={1}>{tr('1 — חודש קלנדרי רגיל')}</option>
              {Array.from({ length: 27 }, (_, i) => i + 2).map((d) => (
                <option key={d} value={d}>
                  {d} בחודש
                </option>
              ))}
            </select>
          </label>
          <div className="cycle-hint">
            {(state.settings?.cycleStartDay ?? 1) > 1 ? (
              <>
                המחזור הנוכחי: <strong>{cycleRangeLabel(month)}</strong>
                <div className="mini-label">{tr('חיוב שמתבצע לפני היום הזה נספר עדיין למחזור הקודם.')}</div>
              </>
            ) : (
              <span className="dim">{tr('כרגע החישוב לפי חודשים קלנדריים.')}</span>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
