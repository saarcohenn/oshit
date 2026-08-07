import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import { api, type Household } from './api'
import { EMPTY_STATE } from './storage'

const ACTIVE_KEY = 'oshit.activeHousehold'
const LEGACY_STATE_KEYS = ['oshit.state.v1', 'kaspit.state.v1']

export type SyncStatus = 'loading' | 'ready' | 'saving' | 'offline' | 'error'

/**
 * מנהל את החיבור לשרת: רשימת משקי הבית, המצב של הפעיל שבהם, ושמירה אוטומטית.
 *
 * השמירה מושהית — עריכה רציפה של שדה לא תייצר בקשה לכל הקשה.
 * המצב מוחזק גם בזיכרון המקומי, ולכן שינויים מוצגים מיד ואינם ממתינים לשרת.
 */
export function useHouseholdState() {
  const [households, setHouseholds] = useState<Household[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // שמירה נדחית רק אחרי טעינה מוצלחת, כדי שהמצב הריק ההתחלתי לא ידרוס נתונים
  const loadedFor = useRef<string | null>(null)

  const loadHousehold = useCallback(async (id: string) => {
    setStatus('loading')
    loadedFor.current = null
    try {
      const next = await api.getState(id)
      setState({ ...EMPTY_STATE, ...next })
      loadedFor.current = id
      setStatus('ready')
      setError(null)
      localStorage.setItem(ACTIVE_KEY, id)
    } catch (err) {
      setStatus('offline')
      setError((err as Error).message)
    }
  }, [])

  const refreshHouseholds = useCallback(async () => {
    const list = await api.listHouseholds()
    setHouseholds(list)
    return list
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const list = await refreshHouseholds()
        const saved = localStorage.getItem(ACTIVE_KEY)
        const chosen = list.find((h) => h.id === saved)?.id ?? list[0]?.id ?? null
        setActiveId(chosen)
        if (chosen) await loadHousehold(chosen)
        else setStatus('ready')
      } catch (err) {
        setStatus('offline')
        setError((err as Error).message)
      }
    })()
  }, [refreshHouseholds, loadHousehold])

  /** שמירה מושהית בכל שינוי מצב */
  useEffect(() => {
    if (!activeId || loadedFor.current !== activeId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // הבדיקה חוזרת גם כאן: בין תזמון השמירה לבין הרגע שהיא רצה אפשר היה
      // להחליף משק בית או להתחיל טעינה מחדש, ואז השמירה הייתה כותבת
      // מצב של משק בית אחד לתוך אחר, או דורסת נתונים בשרת במצב חלקי
      if (loadedFor.current !== activeId) return
      setStatus('saving')
      api
        .putState(activeId, stateRef.current)
        .then(() => {
          setStatus('ready')
          setError(null)
        })
        .catch((err) => {
          setStatus('error')
          setError((err as Error).message)
        })
    }, 600)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state, activeId])

  const switchHousehold = useCallback(
    async (id: string) => {
      setActiveId(id)
      await loadHousehold(id)
    },
    [loadHousehold],
  )

  const createHousehold = useCallback(
    async (name: string, emoji: string) => {
      const created = await api.createHousehold(name, emoji)
      await refreshHouseholds()
      await switchHousehold(created.id)
    },
    [refreshHouseholds, switchHousehold],
  )

  const renameHousehold = useCallback(
    async (id: string, name: string, emoji: string) => {
      await api.renameHousehold(id, name, emoji)
      await refreshHouseholds()
    },
    [refreshHouseholds],
  )

  const deleteHousehold = useCallback(
    async (id: string) => {
      await api.deleteHousehold(id)
      const list = await refreshHouseholds()
      if (id === activeId) {
        const next = list[0]?.id ?? null
        setActiveId(next)
        if (next) await loadHousehold(next)
      }
    },
    [activeId, refreshHouseholds, loadHousehold],
  )

  /**
   * נתונים שנשמרו בגרסה שרצה כולה בדפדפן מועברים פעם אחת לשרת,
   * כדי שמי שכבר השתמש באפליקציה לא יאבד את מה שהזין.
   */
  const pendingLocalImport = useCallback((): AppState | null => {
    for (const key of LEGACY_STATE_KEYS) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as AppState
        if (parsed.transactions?.length || parsed.incomes?.length || parsed.goals?.length) {
          return parsed
        }
      } catch {
        /* מתעלמים מנתונים פגומים */
      }
    }
    return null
  }, [])

  const consumeLocalImport = useCallback(() => {
    for (const key of LEGACY_STATE_KEYS) localStorage.removeItem(key)
  }, [])

  return {
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
    reload: () => (activeId ? loadHousehold(activeId) : Promise.resolve()),
  }
}
