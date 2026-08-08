import { randomBytes } from 'node:crypto'
import { db, sqlTime, uid } from './db.js'
import { hashPassword } from './auth.js'

export interface UserRow {
  id: string
  email: string
  name: string
  passwordHash: string
}

export interface Member {
  userId: string
  email: string
  name: string
  role: 'owner' | 'member'
  createdAt: string
  /** האם זו השורה של המשתמש שמבקש את הרשימה */
  isSelf?: boolean
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
}

export function findUserByEmail(email: string): UserRow | null {
  return (
    (db
      .prepare('SELECT id, email, name, password_hash AS passwordHash FROM users WHERE email = ?')
      .get(normalizeEmail(email)) as UserRow | undefined) ?? null
  )
}

export function findUserById(id: string): UserRow | null {
  return (
    (db
      .prepare('SELECT id, email, name, password_hash AS passwordHash FROM users WHERE id = ?')
      .get(id) as UserRow | undefined) ?? null
  )
}

export async function createUser(email: string, name: string, password: string): Promise<string> {
  const id = uid('u_')
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
    id,
    normalizeEmail(email),
    name.trim(),
    await hashPassword(password),
  )
  return id
}

/* ---------------- חברות במשק בית ---------------- */

export function addMember(householdId: string, userId: string, role: 'owner' | 'member') {
  db.prepare(
    `INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(household_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(householdId, userId, role)
}

export function removeMember(householdId: string, userId: string) {
  db.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?').run(
    householdId,
    userId,
  )
}

export function roleOf(householdId: string, userId: string): 'owner' | 'member' | null {
  const row = db
    .prepare('SELECT role FROM household_members WHERE household_id = ? AND user_id = ?')
    .get(householdId, userId) as { role: 'owner' | 'member' } | undefined
  return row?.role ?? null
}

export function listMembers(householdId: string): Member[] {
  return db
    .prepare(
      `SELECT m.user_id AS userId, u.email, u.name, m.role, m.created_at AS createdAt
       FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ?
       ORDER BY m.role = 'owner' DESC, m.created_at ASC`,
    )
    .all(householdId) as Member[]
}

export function ownerCount(householdId: string): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM household_members WHERE household_id = ? AND role = 'owner'",
      )
      .get(householdId) as { n: number }
  ).n
}

/* ---------------- הזמנות ---------------- */

export interface Invite {
  code: string
  householdId: string
  role: 'owner' | 'member'
  expiresAt: string
  acceptedAt: string | null
}

/** תוקף ההזמנה. מספיק כדי לשלוח קישור לבן הזוג, קצר מכדי לשכוח אותו פתוח */
const INVITE_DAYS = 7

export function createInvite(
  householdId: string,
  createdBy: string,
  role: 'owner' | 'member' = 'member',
): Invite {
  const code = randomBytes(18).toString('base64url')
  const expiresAt = sqlTime(new Date(Date.now() + INVITE_DAYS * 86_400_000))
  db.prepare(
    'INSERT INTO invites (code, household_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(code, householdId, role, createdBy, expiresAt)
  return { code, householdId, role, expiresAt, acceptedAt: null }
}

export interface InviteInfo {
  code: string
  householdId: string
  householdName: string
  householdEmoji: string
  invitedBy: string | null
  role: 'owner' | 'member'
}

/** פרטי ההזמנה להצגה לפני התחברות — בלי לחשוף שום נתון פיננסי */
export function inviteInfo(code: string): InviteInfo | null {
  const row = db
    .prepare(
      `SELECT i.code, i.household_id AS householdId, i.role,
              h.name AS householdName, h.emoji AS householdEmoji,
              u.name AS invitedBy
       FROM invites i
       JOIN households h ON h.id = i.household_id
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.code = ? AND i.accepted_at IS NULL AND i.expires_at > datetime('now')`,
    )
    .get(code) as InviteInfo | undefined
  return row ?? null
}

/**
 * ממשת הזמנה. מסומנת כמנוצלת באותה עסקה שבה נוספת החברות, כדי ששני
 * לחיצות על אותו קישור לא יוסיפו שני אנשים.
 */
export const acceptInvite = db.transaction((code: string, userId: string): InviteInfo | null => {
  const info = inviteInfo(code)
  if (!info) return null
  addMember(info.householdId, userId, info.role)
  db.prepare(
    "UPDATE invites SET accepted_by = ?, accepted_at = datetime('now') WHERE code = ?",
  ).run(userId, code)
  return info
})

export function revokeInvites(householdId: string) {
  db.prepare('DELETE FROM invites WHERE household_id = ? AND accepted_at IS NULL').run(householdId)
}

export function pendingInvites(householdId: string): Invite[] {
  return db
    .prepare(
      `SELECT code, household_id AS householdId, role, expires_at AS expiresAt, accepted_at AS acceptedAt
       FROM invites
       WHERE household_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')
       ORDER BY created_at DESC`,
    )
    .all(householdId) as Invite[]
}

/* ---------------- מעבר מגרסה בלי משתמשים ---------------- */

/**
 * עד עכשיו לא היו משתמשים כלל, וכל מי שהגיע לשרת ראה את כל משקי הבית.
 * המשתמש הראשון שנרשם מאמץ את משקי הבית היתומים ונעשה הבעלים שלהם,
 * אחרת הנתונים הקיימים היו נשארים בלי אף אחד שרשאי לראות אותם.
 *
 * מוגבל למשתמש הראשון בכוונה: ברגע שיש חשבון אחד במערכת, משק בית בלי
 * חברים אינו "מורשת" אלא תקלה, ואימוץ אוטומטי שלו היה דלת אחורית.
 */
export const adoptOrphanHouseholds = db.transaction((userId: string): number => {
  const orphans = db
    .prepare(
      `SELECT h.id FROM households h
       WHERE NOT EXISTS (SELECT 1 FROM household_members m WHERE m.household_id = h.id)`,
    )
    .all() as Array<{ id: string }>
  for (const { id } of orphans) addMember(id, userId, 'owner')
  return orphans.length
})
