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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `הבקשה נכשלה (${res.status})`)
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

  getState: (id: string) => request<AppState>(`/households/${id}/state`),

  putState: (id: string, state: AppState) =>
    request<{ ok: true }>(`/households/${id}/state`, {
      method: 'PUT',
      body: JSON.stringify(state),
    }),

  importState: (id: string, payload: unknown) =>
    request<{ ok: true }>(`/households/${id}/import`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  exportUrl: (id: string) => `${BASE}/api/households/${id}/export`,
}
