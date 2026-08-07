import type { AppState } from '../types'

export interface Household {
  id: string
  name: string
  emoji: string
  createdAt: string
  transactionCount: number
}

/**
 * בפיתוח הלקוח רץ ב-Vite על פורט אחר מהשרת, ולכן הכתובת מגיעה ממשתנה סביבה.
 * בייצור הלקוח מוגש מאותו שרת, ונתיב יחסי הוא הנכון.
 */
const BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * מזהה ייחודי ללשונית הזו. נשלח עם כל כתיבה כדי שהשרת לא ישדר לנו
 * בחזרה את השינוי שאנחנו עצמנו ביצענו.
 */
export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36)

/** נזרקת כשמכשיר אחר שינה את הנתונים בין הטעינה לשמירה */
export class ConflictError extends Error {
  constructor(public currentVersion: number) {
    super('הנתונים שונו ממכשיר אחר')
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID },
    // הנתונים חייבים להגיע מהשרת ולא ממטמון הדפדפן, אחרת מכשירים לא מתכנסים
    cache: 'no-store',
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; currentVersion?: number }
    if (res.status === 409) throw new ConflictError(body.currentVersion ?? 0)
    throw new Error(body.error ?? `הבקשה נכשלה (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  listHouseholds: () => request<Household[]>('/households'),

  createHousehold: (name: string, emoji: string) =>
    request<Household>('/households', {
      method: 'POST',
      body: JSON.stringify({ name, emoji }),
    }),

  renameHousehold: (id: string, name: string, emoji: string) =>
    request<Household>(`/households/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, emoji }),
    }),

  deleteHousehold: (id: string) => request<void>(`/households/${id}`, { method: 'DELETE' }),

  getState: (id: string) => request<AppState & { version: number }>(`/households/${id}/state`),

  putState: (id: string, state: AppState, version: number) =>
    request<{ ok: true; version: number }>(`/households/${id}/state`, {
      method: 'PUT',
      body: JSON.stringify({ ...state, version }),
    }),

  importState: (id: string, payload: unknown) =>
    request<{ ok: true }>(`/households/${id}/import`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  exportUrl: (id: string) => `${BASE}/api/households/${id}/export`,

  /** זרם עדכונים חי. הדפדפן מחבר מחדש לבד אם החיבור נופל */
  eventsUrl: (id: string) =>
    `${BASE}/api/households/${id}/events?clientId=${encodeURIComponent(CLIENT_ID)}`,
}
