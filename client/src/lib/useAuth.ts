import { useCallback, useEffect, useState } from 'react'
import { api, onUnauthorized, type AuthState, type AuthUser, type InviteInfo } from './api'

/**
 * קוד ההזמנה מגיע בכתובת (?invite=…). הוא נשמר בזיכרון ומנוקה מסרגל
 * הכתובות מיד — קישור הזמנה הוא סוד, ואין סיבה שיישאר בהיסטוריית
 * הדפדפן או ייצא בטעות בצילום מסך של הכתובת.
 */
function takeInviteFromUrl(): string {
  const params = new URLSearchParams(location.search)
  const code = params.get('invite') ?? ''
  if (code) {
    params.delete('invite')
    const rest = params.toString()
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)
  }
  return code
}

export interface Auth {
  loading: boolean
  user: AuthUser | null
  needsSetup: boolean
  openRegistration: boolean
  invite: InviteInfo | null
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearInvite: () => void
}

export function useAuth(): Auth {
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<AuthState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invite] = useState(takeInviteFromUrl)

  const refresh = useCallback(async () => {
    try {
      setState(await api.authState(invite || undefined))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [invite])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /*
   * חיבור שפג בזמן שהאפליקציה פתוחה — טלפון שנשאר על השולחן שבוע.
   * במקום בקשות שנכשלות בשקט, המסך חוזר להתחברות.
   */
  useEffect(
    () =>
      onUnauthorized(() => {
        setState((prev) => (prev?.user ? { ...prev, user: null } : prev))
      }),
    [],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null)
      const { user } = await api.login({ email, password, invite: invite || undefined })
      setState((prev) => ({
        needsSetup: false,
        openRegistration: prev?.openRegistration ?? false,
        invite: null,
        user,
      }))
    },
    [invite],
  )

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      setError(null)
      const { user } = await api.register({ email, name, password, invite: invite || undefined })
      setState((prev) => ({
        needsSetup: false,
        openRegistration: prev?.openRegistration ?? false,
        invite: null,
        user,
      }))
    },
    [invite],
  )

  const logout = useCallback(async () => {
    await api.logout()
    setState((prev) => (prev ? { ...prev, user: null, invite: null } : prev))
  }, [])

  return {
    loading,
    user: state?.user ?? null,
    needsSetup: state?.needsSetup ?? false,
    openRegistration: state?.openRegistration ?? false,
    invite: state?.invite ?? null,
    error,
    login,
    register,
    logout,
    clearInvite: () => setState((prev) => (prev ? { ...prev, invite: null } : prev)),
  }
}
