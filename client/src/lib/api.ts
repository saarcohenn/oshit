import { tr, trf } from './i18n'
import type { AppState } from '../types'

export interface Household {
  id: string
  name: string
  emoji: string
  createdAt: string
  transactionCount: number
  role: 'owner' | 'member'
  memberCount: number
}

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface InviteInfo {
  code: string
  householdId: string
  householdName: string
  householdEmoji: string
  invitedBy: string | null
  role: 'owner' | 'member'
}

export interface AuthState {
  /** אין עדיין אף חשבון — המסך הראשון יוצר את הבעלים */
  needsSetup: boolean
  openRegistration: boolean
  user: AuthUser | null
  invite: InviteInfo | null
}

export interface Member {
  userId: string
  email: string
  name: string
  role: 'owner' | 'member'
  createdAt: string
  isSelf: boolean
}

export interface PendingInvite {
  code: string
  role: 'owner' | 'member'
  expiresAt: string
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
    super(tr('הנתונים שונו ממכשיר אחר'))
  }
}

/** נזרקת כשהחיבור פג או בוטל. כל מסך שמקבל אותה חוזר למסך ההתחברות */
export class UnauthorizedError extends Error {
  constructor() {
    super(tr('נדרשת התחברות'))
  }
}

/**
 * חיבור שפג באמצע עבודה יכול לצוץ מכל בקשה שהיא, גם כזו שרצה ברקע.
 * במקום לפזר טיפול בכל קורא, כאן משודר אירוע אחד שהשכבה העליונה מאזינה לו.
 */
const UNAUTHORIZED_EVENT = 'oshit:unauthorized'

export function onUnauthorized(handler: () => void): () => void {
  window.addEventListener(UNAUTHORIZED_EVENT, handler)
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID },
    // עוגיית החיבור חייבת להישלח; בפיתוח הלקוח והשרת אינם באותו מקור
    credentials: 'include',
    // הנתונים חייבים להגיע מהשרת ולא ממטמון הדפדפן, אחרת מכשירים לא מתכנסים
    cache: 'no-store',
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; currentVersion?: number }
    if (res.status === 409) throw new ConflictError(body.currentVersion ?? 0)
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      throw new UnauthorizedError()
    }
    throw new Error(body.error ?? trf('הבקשה נכשלה ({status})', { status: res.status }))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  /* ---------------- הזדהות ---------------- */

  authState: (invite?: string) =>
    request<AuthState>(`/auth/state${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`),

  register: (payload: { email: string; name: string; password: string; invite?: string }) =>
    request<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string; invite?: string }) =>
    request<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  acceptInvite: (code: string) =>
    request<{ householdId: string; householdName: string }>(
      `/invites/${encodeURIComponent(code)}/accept`,
      { method: 'POST' },
    ),

  /* ---------------- שיתוף ---------------- */

  members: (id: string) =>
    request<{ members: Member[]; invites: PendingInvite[] }>(`/households/${id}/members`),

  createInvite: (id: string, role: 'owner' | 'member' = 'member') =>
    request<PendingInvite>(`/households/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  revokeInvites: (id: string) => request<void>(`/households/${id}/invites`, { method: 'DELETE' }),

  removeMember: (id: string, userId: string) =>
    request<void>(`/households/${id}/members/${userId}`, { method: 'DELETE' }),

  setMemberRole: (id: string, userId: string, role: 'owner' | 'member') =>
    request<{ ok: true }>(`/households/${id}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  /* ---------------- משקי בית ---------------- */

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
