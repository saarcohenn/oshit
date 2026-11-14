import type { Household, HouseholdKind, Role } from './api'
import { monthLabel } from './format'
import { tr, trf } from './i18n'

/** אותה פלטה כמו בשרת (server/src/palette.ts) */
export const HOUSEHOLD_COLORS = ['#35c4b5', '#3987e5', '#e3703c', '#9085e9', '#e06a95', '#d99a1a'] as const

export const ROLES: readonly Role[] = ['owner', 'editor', 'viewer']

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'בעלים',
  editor: 'עריכה',
  viewer: 'צפייה',
}

/** מה כל תפקיד רשאי — המקרא שמתחת לרשימת החברים */
export const ROLE_HINT: Record<Role, string> = {
  owner: 'הכול, כולל סוכנים ומחיקה',
  editor: 'ייבוא, קטגוריות ותקציבים',
  viewer: 'קריאה בלבד',
}

export const KIND_LABEL: Record<HouseholdKind, string> = {
  home: 'משק בית',
  business: 'עסק קטן',
}

export const canEdit = (role: Role | null | undefined) => role === 'owner' || role === 'editor'

const CODE = /^[A-Za-z0-9_-]{8,64}$/

/**
 * קוד הזמנה מתוך מה שהודבק: קישור מלא, קישור בלי https, או הקוד עצמו.
 * מחזיר null כשאין שם קוד שנראה תקין — עדיף להגיד את זה מיד מאשר
 * לשלוח לשרת מחרוזת שבוודאות תיכשל.
 */
export function parseInviteInput(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const fromLink = text.match(/[?&]invite=([^&#\s]+)/)
  if (fromLink) {
    let code = fromLink[1]
    try {
      code = decodeURIComponent(code)
    } catch {
      return null
    }
    return CODE.test(code) ? code : null
  }
  return CODE.test(text) ? text : null
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

const DARK_INK = '#04201d'
const DARK_INK_LUMINANCE = luminance(DARK_INK)

/**
 * צבע הטקסט על משטח בצבע של משק בית: לבן או דיו כהה, מה שנותן ניגודיות
 * גבוהה יותר. הצבע נבחר על ידי המשתמש, ולכן אין להניח מראש שלבן קריא עליו.
 */
export function inkOn(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#ffffff'
  const l = luminance(hex)
  const onWhite = 1.05 / (l + 0.05)
  const onDark = (l + 0.05) / (DARK_INK_LUMINANCE + 0.05)
  return onDark > onWhite ? DARK_INK : '#ffffff'
}

const AVATAR_COLORS = ['#35c4b5', '#9085e9', '#e3703c', '#3987e5', '#e06a95', '#d99a1a']

/** צבע קבוע לכל שם, כדי שאותו אדם ייראה אותו דבר בכל מקום */
export function avatarColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export const initialOf = (name: string) => (name.trim().charAt(0) || '?').toUpperCase()

const count = (n: number) => n.toLocaleString('en-US')

/** "1,206 עסקאות · מינואר 2025", או "אין עדיין · ממתין לקובץ ראשון" */
export function dataSummary(h: Household): string {
  const parts: string[] = []
  if (h.transactionCount) parts.push(trf('{n} עסקאות', { n: count(h.transactionCount) }))
  if (h.movementCount) parts.push(trf('{n} תנועות עו״ש', { n: count(h.movementCount) }))
  if (!parts.length) return tr('אין עדיין · ממתין לקובץ ראשון')
  if (h.firstDate) parts.push(trf('מ{since}', { since: monthLabel(h.firstDate.slice(0, 7)) }))
  return parts.join(' · ')
}

/** מאיפה הנתונים מגיעים: כרטיסים ועו"ש */
export function sourcesSummary(h: Household): string {
  const parts: string[] = []
  if (h.cardCount === 1) parts.push(tr('כרטיס אחד'))
  else if (h.cardCount > 1) parts.push(trf('{n} כרטיסים', { n: h.cardCount }))
  if (h.movementCount) parts.push(tr('חשבון עו״ש'))
  return parts.length ? parts.join(' · ') : tr('עוד לא חובר')
}

/**
 * מצב הסוכנים. "פעיל" רק כששירות הסוכנים באמת דיווח על הבית הזה —
 * סוכן מוגדר בלי שירות שמריץ אותו אינו פעיל.
 */
export function agentsSummary(h: Household): string {
  if (!h.agentsLive) return tr('כבוי')
  return h.agentCount === 1 ? tr('פעיל · סוכן אחד') : trf('פעיל · {n} סוכנים', { n: h.agentCount })
}

export function membersSummary(h: Household): string {
  if (h.memberCount <= 1) return tr('רק אתם')
  return h.memberNames.join(', ')
}

export function kindSummary(kind: HouseholdKind): string {
  return kind === 'business' ? tr('עסק קטן · קטגוריות עסקיות') : tr('משק בית')
}
