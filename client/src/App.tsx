import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  Budget,
  CategoryId,
  Frequency,
  MerchantRule,
  Transaction,
  TxAnnotation,
} from './types'
import type { ManualPaymentDraft } from './components/ManualPaymentForm'
import { normalizeMerchant } from './lib/merchant'
import { exportState } from './lib/storage'
import { useHouseholdState } from './lib/useHouseholdState'
import { CategoryProvider } from './lib/categoryContext'
import { api } from './lib/api'
import { availableMonths } from './lib/analytics'
import { monthLabel } from './lib/format'
import { applyTheme, loadTheme, nextTheme, THEME_LABEL, type Theme } from './lib/theme'
import ImportPanel from './components/ImportPanel'
import Dashboard from './components/Dashboard'
import TransactionsTable from './components/TransactionsTable'
import MerchantsPanel from './components/MerchantsPanel'
import BudgetsPanel from './components/BudgetsPanel'
import RecurringPanel from './components/RecurringPanel'
import SavingsPanel from './components/SavingsPanel'
import PlanPanel from './components/PlanPanel'
import HouseholdBar from './components/HouseholdBar'
import {
  IconAuto,
  IconBrand,
  IconBudget,
  IconCategories,
  IconGoals,
  IconImport,
  IconMerchants,
  IconOverview,
  IconMoon,
  IconRecurring,
  IconSavings,
  IconSun,
  IconTransactions,
} from './components/Icons'
import CategoriesPanel from './components/CategoriesPanel'

type Tab =
  | 'dashboard'
  | 'plan'
  | 'budgets'
  | 'recurring'
  | 'savings'
  | 'transactions'
  | 'merchants'
  | 'categories'
  | 'import'

type TabDef = { id: Tab; label: string; Icon: (p: { size?: number }) => JSX.Element }

/**
 * הניווט מחולק לשתי קבוצות: מסכים שמסתכלים בהם יום-יום, ומסכים שמסדרים בהם
 * את הנתונים ומגיעים אליהם לעיתים רחוקות. תשע לשוניות ברצף אחד נקראות כערימה,
 * וההפרדה נותנת להן היררכיה בלי להסתיר כלום מאחורי תפריט.
 */
const VIEW_TABS: TabDef[] = [
  { id: 'dashboard', label: 'סקירה', Icon: IconOverview },
  { id: 'plan', label: 'הכנסות ויעדים', Icon: IconGoals },
  { id: 'budgets', label: 'תקציבים', Icon: IconBudget },
  { id: 'recurring', label: 'חיובים קבועים', Icon: IconRecurring },
  { id: 'savings', label: 'איפה לחסוך', Icon: IconSavings },
  { id: 'transactions', label: 'עסקאות', Icon: IconTransactions },
]

const SETUP_TABS: TabDef[] = [
  { id: 'merchants', label: 'בתי עסק', Icon: IconMerchants },
  { id: 'categories', label: 'קטגוריות', Icon: IconCategories },
  { id: 'import', label: 'ייבוא', Icon: IconImport },
]

/** תוצאת מיזוג של קובץ אחד לתוך הנתונים הקיימים */
export interface ImportSummary {
  added: number
  updated: number
  unchanged: number
  /** סכום העסקאות החדשות בלבד */
  newTotal: number
}

export default function App() {
  const {
    households,
    activeId,
    state,
    setState,
    status,
    error,
    switchHousehold,
    createHousehold,
    renameHousehold,
    deleteHousehold,
    refreshHouseholds,
    pendingLocalImport,
    consumeLocalImport,
    reload,
  } = useHouseholdState()

  const [tab, setTab] = useState<Tab>('dashboard')
  const [month, setMonth] = useState<string>('')
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  /** יעד שנבחר במסך התכנון — מסנן את מסך העסקאות */
  const [goalFilter, setGoalFilter] = useState<string | null>(null)

  useEffect(() => applyTheme(theme), [theme])

  // הייבוא צריך להשוות מול הנתונים הנוכחיים ולהחזיר סיכום מיד,
  // ולכן הוא קורא מ-ref ולא ממתין לעדכון ה-state
  const stateRef = useRef(state)
  stateRef.current = state


  /** העסקאות אחרי החלת הדריסות הידניות ברמת בית עסק */
  const transactions = useMemo<Transaction[]>(() => {
    if (!state.merchantRules.length) return state.transactions
    const rules = new Map(state.merchantRules.map((r) => [r.merchantKey, r]))
    return state.transactions.map((t) => {
      const rule = rules.get(t.merchantKey)
      if (!rule) return t
      return {
        ...t,
        category: rule.category ?? t.category,
        necessity: rule.necessity ?? t.necessity,
        merchant: rule.alias || t.merchant,
        bankName: rule.alias ? t.merchant : undefined,
      }
    })
  }, [state.transactions, state.merchantRules])

  /** תדירות החיוב לכל בית עסק, במפה נוחה לחיפוש */
  const frequencies = useMemo(() => {
    const map: Record<string, Frequency> = {}
    for (const r of state.merchantRules) if (r.frequency) map[r.merchantKey] = r.frequency
    return map
  }, [state.merchantRules])

  const months = useMemo(() => availableMonths(transactions), [transactions])
  const activeMonth = month && months.includes(month) ? month : months[0] ?? ''

  /**
   * ממזג קובץ חדש לתוך הנתונים הקיימים ומדווח מה בדיוק קרה.
   * הזיהוי נעשה לפי מזהה העסקה, ולכן ייבוא של אותו חודש שוב יזהה
   * רק את מה שהתווסף מאז, וכן יעדכן עסקאות שקיבלו בינתיים סכום או תאריך חיוב סופי.
   */
  function importTransactions(incoming: Transaction[], fileName: string): ImportSummary {
    const existing = new Map(stateRef.current.transactions.map((t) => [t.id, t]))
    const summary: ImportSummary = { added: 0, updated: 0, unchanged: 0, newTotal: 0 }

    for (const t of incoming) {
      const prev = existing.get(t.id)
      if (!prev) {
        summary.added++
        summary.newTotal += t.amount
      } else if (
        prev.amount !== t.amount ||
        prev.chargeDate !== t.chargeDate ||
        prev.category !== t.category
      ) {
        summary.updated++
      } else {
        summary.unchanged++
      }
    }

    setState((prev) => {
      const byId = new Map(prev.transactions.map((t) => [t.id, t]))
      for (const t of incoming) byId.set(t.id, t)
      return {
        ...prev,
        transactions: [...byId.values()],
        importedFiles: prev.importedFiles.includes(fileName)
          ? prev.importedFiles
          : [...prev.importedFiles, fileName],
      }
    })

    return summary
  }

  /**
   * מוסיף או מעדכן תשלום שהוזן ידנית.
   * תשלומים כאלה מקבלים מזהה משלהם ואינם מתנגשים במזהים שנגזרים מקובץ הבנק,
   * ולכן ייבוא עתידי לא ידרוס אותם ולא ייצור עותק שני.
   */
  function saveManualPayment(draft: ManualPaymentDraft, frequency: Frequency) {
    const merchantKey = normalizeMerchant(draft.merchant)
    setState((prev) => {
      const id = draft.id ?? `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      const tx: Transaction = {
        id,
        card: draft.paidVia ? `דרך ${draft.paidVia}` : 'תשלום ידני',
        merchant: draft.merchant,
        merchantKey,
        date: draft.date,
        chargeDate: draft.date,
        amount: draft.amount,
        originalAmount: draft.amount,
        currency: 'ILS',
        kind: 'תשלום ידני',
        installment: null,
        category: draft.category,
        necessity: draft.necessity,
        source: 'ידני',
        manual: true,
        paidVia: draft.paidVia || undefined,
      }

      const existingIdx = prev.transactions.findIndex((t) => t.id === id)
      const transactions =
        existingIdx >= 0
          ? prev.transactions.map((t) => (t.id === id ? tx : t))
          : [...prev.transactions, tx]

      // התדירות נשמרת ברמת בית העסק כדי שתחול גם על החיובים הבאים שלו
      const existingRule = prev.merchantRules.find((r) => r.merchantKey === merchantKey)
      const rule: MerchantRule = { ...(existingRule ?? { merchantKey }), frequency }
      const merchantRules = existingRule
        ? prev.merchantRules.map((r) => (r.merchantKey === merchantKey ? rule : r))
        : [...prev.merchantRules, rule]

      const annotations = { ...prev.annotations }
      if (draft.note) annotations[id] = { ...(annotations[id] ?? {}), note: draft.note }

      return { ...prev, transactions, merchantRules, annotations }
    })
  }

  /** מחיקה מותרת רק לתשלומים ידניים — עסקאות מהבנק הן מקור אמת ואין לערוך אותן */
  function deleteTransaction(id: string) {
    setState((prev) => {
      const target = prev.transactions.find((t) => t.id === id)
      if (!target?.manual) return prev
      const annotations = { ...prev.annotations }
      delete annotations[id]
      return { ...prev, transactions: prev.transactions.filter((t) => t.id !== id), annotations }
    })
  }

  function setAnnotation(transactionId: string, patch: Partial<TxAnnotation>) {
    setState((prev) => {
      const next: TxAnnotation = { ...(prev.annotations[transactionId] ?? {}), ...patch }
      const annotations = { ...prev.annotations }
      // הערה ריקה לגמרי נמחקת כדי לא לצבור רשומות ריקות
      if (!next.reference && !next.note && !next.goalId) delete annotations[transactionId]
      else annotations[transactionId] = next
      return { ...prev, annotations }
    })
  }

  function setMerchantRule(merchantKey: string, patch: Partial<Omit<MerchantRule, 'merchantKey'>>) {
    setState((prev) => {
      const existing = prev.merchantRules.find((r) => r.merchantKey === merchantKey)
      const next: MerchantRule = { ...(existing ?? { merchantKey }), ...patch }
      return {
        ...prev,
        merchantRules: existing
          ? prev.merchantRules.map((r) => (r.merchantKey === merchantKey ? next : r))
          : [...prev.merchantRules, next],
      }
    })
  }

  function setBudget(category: CategoryId, limit: number) {
    setState((prev) => {
      const rest = prev.budgets.filter((b) => b.category !== category)
      const next: Budget[] = limit > 0 ? [...rest, { category, limit }] : rest
      return { ...prev, budgets: next }
    })
  }

  /** מרוקן את תוכן משק הבית אך משאיר את ערכת הקטגוריות שלו על כנה */
  function resetAll() {
    if (!confirm('למחוק את כל העסקאות, התקציבים והיעדים של משק הבית הזה? הפעולה אינה הפיכה.'))
      return
    setState((prev) => ({
      ...prev,
      transactions: [],
      budgets: [],
      merchantRules: [],
      importedFiles: [],
      annotations: {},
      incomes: [],
      goals: [],
      plannedChanges: [],
    }))
    setTab('import')
  }

  /** מעביר עסקאות מקטגוריה שנמחקה אל קטגוריה אחרת */
  function reassignCategory(from: CategoryId, to: CategoryId) {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((t) =>
        t.category === from ? { ...t, category: to } : t,
      ),
      merchantRules: prev.merchantRules.map((r) =>
        r.category === from ? { ...r, category: to } : r,
      ),
      budgets: prev.budgets.filter((b) => b.category !== from),
      goals: prev.goals.map((g) =>
        g.linkedCategory === from ? { ...g, linkedCategory: to } : g,
      ),
    }))
  }

  /** מעלה לשרת נתונים שנשמרו בגרסה שרצה כולה בדפדפן */
  async function migrateLocalData() {
    const local = pendingLocalImport()
    if (!local || !activeId) return
    if (
      !confirm(
        `נמצאו נתונים שנשמרו בדפדפן מגרסה קודמת (${local.transactions?.length ?? 0} עסקאות).
` +
          `להעלות אותם למשק הבית הפעיל? הנתונים הקיימים בו יוחלפו.`,
      )
    )
      return
    // ערכת הקטגוריות של משק הבית נשמרת — בגרסה הישנה היא לא הייתה חלק מהנתונים
    await api.importState(activeId, { ...local, categories: state.categories })
    consumeLocalImport()
    await reload()
    await refreshHouseholds()
  }

  const hasData = transactions.length > 0

  if (status === 'loading' && !households.length) {
    return (
      <div className="app">
        <div className="empty">
          <h2>טוען…</h2>
          <p>מתחבר לשרת של Osh.it</p>
        </div>
      </div>
    )
  }

  if (status === 'offline' && !households.length) {
    return (
      <div className="app">
        <div className="empty">
          <h2>אין חיבור לשרת</h2>
          <p>
            לא הצלחנו להגיע ל-API של Osh.it.{error ? ` (${error})` : ''}
            <br />
            ודאו שהשרת רץ, ונסו לרענן.
          </p>
          <button className="btn" onClick={() => location.reload()}>
            רענון
          </button>
        </div>
      </div>
    )
  }

  return (
    <CategoryProvider categories={state.categories}>
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
        <div className="logo">
          <span className="logo-mark" aria-hidden>
            <IconBrand size={21} />
          </span>
          <div className="logo-text">
            <b>Osh<span className="dot">.</span>it</b>
            <small>לאן הלך העו״ש — ואיפה אפשר לחסוך</small>
          </div>
        </div>

          <HouseholdBar
            households={households}
            activeId={activeId}
            onSwitch={(id) => void switchHousehold(id)}
            onCreate={(n, e) => void createHousehold(n, e)}
            onRename={(id, n, e) => void renameHousehold(id, n, e)}
            onDelete={(id) => void deleteHousehold(id)}
          />

          <div className="spacer" />

          <SyncBadge status={status} error={error} />

          {hasData && months.length > 0 && (
            <select
              value={activeMonth}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="בחירת חודש"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}

          <button
            className="icon-btn"
            onClick={() => setTheme(nextTheme(theme))}
            title={`מצב תצוגה: ${THEME_LABEL[theme]} — לחצו להחלפה`}
            aria-label={`מצב תצוגה: ${THEME_LABEL[theme]}`}
          >
            {theme === 'light' ? <IconSun /> : theme === 'dark' ? <IconMoon /> : <IconAuto />}
          </button>
        </div>

        {/* הניווט בשורה נפרדת שמתחילה מימין — כיוון הקריאה בעברית */}
        <nav className="tabs" aria-label="ניווט ראשי">
          {VIEW_TABS.map((t) => (
            <NavTab key={t.id} tab={t} active={tab === t.id} onSelect={setTab} />
          ))}
          <span className="tabs-divider" aria-hidden />
          {SETUP_TABS.map((t) => (
            <NavTab key={t.id} tab={t} active={tab === t.id} onSelect={setTab} setup />
          ))}
        </nav>
      </header>

      <main className="main">
        {pendingLocalImport() && (
          <div className="notice warn" style={{ marginBottom: 16 }}>
            נמצאו נתונים ששמרתם בדפדפן לפני שהאפליקציה עברה לשרת.{' '}
            <button className="link-btn" onClick={() => void migrateLocalData()}>
              העלאה למשק הבית הפעיל ←
            </button>
          </div>
        )}
        {!hasData && tab !== 'import' ? (
          <div className="empty">
            <h2>עוד אין נתונים</h2>
            <p>ייבאו את קובץ האקסל של פירוט כרטיסי האשראי כדי להתחיל.</p>
            <button className="btn" onClick={() => setTab('import')}>
              מעבר לייבוא
            </button>
          </div>
        ) : (
          <>
            {tab === 'dashboard' && (
              <Dashboard
                transactions={transactions}
                month={activeMonth}
                incomes={state.incomes}
                onGoToPlan={() => setTab('plan')}
              />
            )}
            {tab === 'budgets' && (
              <BudgetsPanel
                transactions={transactions}
                month={activeMonth}
                budgets={state.budgets}
                onSetBudget={setBudget}
              />
            )}
            {tab === 'recurring' && (
              <RecurringPanel transactions={transactions} frequencies={frequencies} />
            )}
            {tab === 'savings' && <SavingsPanel transactions={transactions} month={activeMonth} />}
            {tab === 'plan' && (
              <PlanPanel
                state={state}
                transactions={transactions}
                month={activeMonth}
                onSetIncomes={(incomes) => setState((p) => ({ ...p, incomes }))}
                onSetGoals={(goals) => setState((p) => ({ ...p, goals }))}
                onSetChanges={(plannedChanges) => setState((p) => ({ ...p, plannedChanges }))}
                onShowGoalExpenses={(goalId) => {
                  setGoalFilter(goalId)
                  setTab('transactions')
                }}
              />
            )}
            {tab === 'transactions' && (
              <TransactionsTable
                transactions={transactions}
                month={activeMonth}
                annotations={state.annotations}
                goals={state.goals}
                frequencies={frequencies}
                goalFilter={goalFilter}
                onClearGoalFilter={() => setGoalFilter(null)}
                onSetMerchantRule={setMerchantRule}
                onSetAnnotation={setAnnotation}
                onSaveManual={saveManualPayment}
                onDeleteManual={deleteTransaction}
              />
            )}
            {tab === 'categories' && (
              <CategoriesPanel
                categories={state.categories}
                transactions={state.transactions}
                onChange={(categories) => setState((p) => ({ ...p, categories }))}
                onReassign={reassignCategory}
              />
            )}
            {tab === 'merchants' && (
              <MerchantsPanel
                transactions={transactions}
                merchantRules={state.merchantRules}
                onSetMerchantRule={setMerchantRule}
              />
            )}
            {tab === 'import' && (
              <ImportPanel
                state={state}
                onImport={importTransactions}
                onExport={() => exportState(state)}
                onReset={resetAll}
                onDone={() => setTab('dashboard')}
              />
            )}
          </>
        )}
      </main>
    </div>
    </CategoryProvider>
  )
}

function NavTab({
  tab,
  active,
  onSelect,
  setup = false,
}: {
  tab: TabDef
  active: boolean
  onSelect: (id: Tab) => void
  /** לשוניות ההגדרה מצטמצמות לאייקון בלבד כשאין רוחב — הן בשימוש נדיר יותר */
  setup?: boolean
}) {
  const { Icon } = tab
  return (
    <button
      className={`tab ${setup ? 'setup' : ''} ${active ? 'active' : ''}`}
      onClick={() => onSelect(tab.id)}
      aria-current={active ? 'page' : undefined}
      title={tab.label}
    >
      <Icon />
      <span className="tab-label">{tab.label}</span>
    </button>
  )
}

/** מחוון סנכרון קטן — האפליקציה שומרת לבד, וכדאי שיהיה ברור מתי */
function SyncBadge({ status, error }: { status: string; error: string | null }) {
  const label: Record<string, string> = {
    loading: 'טוען…',
    ready: 'נשמר',
    saving: 'שומר…',
    offline: 'אין חיבור',
    error: 'שמירה נכשלה',
  }
  return (
    <span className={`sync-badge ${status}`} title={error ?? undefined}>
      {label[status] ?? status}
    </span>
  )
}
