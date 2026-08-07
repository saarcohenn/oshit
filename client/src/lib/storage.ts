import type { AppState } from '../types'

const KEY = 'oshit.state.v1'
/** המפתח מהתקופה שבה האפליקציה נקראה "כספית" — נקרא פעם אחת כדי לא לאבד נתונים */
const LEGACY_KEY = 'kaspit.state.v1'

export const EMPTY_STATE: AppState = {
  settings: { cycleStartDay: 1 },
  categories: [],
  transactions: [],
  budgets: [],
  merchantRules: [],
  importedFiles: [],
  annotations: {},
  incomes: [],
  goals: [],
  plannedChanges: [],
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as Partial<AppState>
    // כל שדה נקרא בנפרד כדי שגרסה ישנה של הנתונים תמשיך להיטען אחרי הוספת שדות
    return {
      settings: parsed.settings ?? { cycleStartDay: 1 },
      categories: parsed.categories ?? [],
      transactions: parsed.transactions ?? [],
      budgets: parsed.budgets ?? [],
      merchantRules: parsed.merchantRules ?? [],
      importedFiles: parsed.importedFiles ?? [],
      annotations: parsed.annotations ?? {},
      incomes: parsed.incomes ?? [],
      goals: parsed.goals ?? [],
      plannedChanges: parsed.plannedChanges ?? [],
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (err) {
    console.error('שמירת הנתונים נכשלה', err)
  }
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `oshit-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
