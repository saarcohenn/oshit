import { randomBytes } from 'node:crypto'
import { db, sqlTime, uid } from './db.js'
import { hashPassword } from './auth.js'

export interface UserRow {
  id: string
  email: string
  name: string
  passwordHash: string
}

/**
 * שלושה תפקידים במשק בית.
 *
 * owner — הכול, כולל שיתוף, סוכנים, שחזור גיבוי, העברת בעלות ומחיקה.
 * editor — ייבוא דוחות, קטגוריות, תקציבים ויעדים.
 * viewer — קריאה בלבד. רואה הכול, לא משנה דבר.
 */
export type Role = 'owner' | 'editor' | 'viewer'

export const ROLES: readonly Role[] = ['owner', 'editor', 'viewer']

/**
 * תפקיד מקלט חיצוני או משורה במסד. 'member' הוא השם של editor לפני v3 —
 * שורות ישנות, הזמנות שנשלחו לפני השדרוג, ולקוח ישן שעוד פתוח בטאב.
 */
export function parseRole(value: unknown): Role | null {
  if (value === 'owner' || value === 'editor' || value === 'viewer') return value
  if (value === 'member') return 'editor'
  return null
}

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 }

/** האם התפקיד הזה מספיק לפעולה שדורשת את min */
export const roleAtLeast = (role: Role, min: Role) => RANK[role] >= RANK[min]

export interface Member {
  userId: string
  email: string
  name: string
  role: Role
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

/**
 * מוסיף חבר חדש. חבר קיים אינו משתנה כאן: קודם זה היה upsert, ולכן בעלים
 * שלחץ על קישור הזמנה שלו עצמו ירד לחבר רגיל. שינוי תפקיד עובר ב-setRole בלבד.
 */
export function addMember(householdId: string, userId: string, role: Role) {
  db.prepare(
    `INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(household_id, user_id) DO NOTHING`,
  ).run(householdId, userId, role)
}

/** משנה תפקיד של מי שכבר חבר. מחזיר false אם אינו חבר */
export function setRole(householdId: string, userId: string, role: Role): boolean {
  return (
    db
      .prepare('UPDATE household_members SET role = ? WHERE household_id = ? AND user_id = ?')
      .run(role, householdId, userId).changes > 0
  )
}

export function removeMember(householdId: string, userId: string) {
  db.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?').run(
    householdId,
    userId,
  )
}

/**
 * התפקיד של המשתמש במשק הבית, או null אם אינו חבר.
 * ערך לא מוכר במסד נקרא כצפייה — ההרשאה המצומצמת ביותר, לא המרחיבה.
 */
export function roleOf(householdId: string, userId: string): Role | null {
  const row = db
    .prepare('SELECT role FROM household_members WHERE household_id = ? AND user_id = ?')
    .get(householdId, userId) as { role: string } | undefined
  if (!row) return null
  return parseRole(row.role) ?? 'viewer'
}

export function listMembers(householdId: string): Member[] {
  const rows = db
    .prepare(
      `SELECT m.user_id AS userId, u.email, u.name, m.role, m.created_at AS createdAt
       FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'viewer' THEN 2 ELSE 1 END, m.created_at ASC`,
    )
    .all(householdId) as Array<Omit<Member, 'role'> & { role: string }>
  return rows.map((m) => ({ ...m, role: parseRole(m.role) ?? 'viewer' }))
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
  role: Role
  expiresAt: string
  acceptedAt: string | null
}

/** תוקף ההזמנה. מספיק כדי לשלוח קישור לבן הזוג, קצר מכדי לשכוח אותו פתוח */
const INVITE_DAYS = 7

export function createInvite(householdId: string, createdBy: string, role: Role = 'editor'): Invite {
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
  householdColor: string
  invitedBy: string | null
  role: Role
}

/** פרטי ההזמנה להצגה לפני התחברות — בלי לחשוף שום נתון פיננסי */
export function inviteInfo(code: string): InviteInfo | null {
  const row = db
    .prepare(
      `SELECT i.code, i.household_id AS householdId, i.role,
              h.name AS householdName, h.emoji AS householdEmoji, h.color AS householdColor,
              u.name AS invitedBy
       FROM invites i
       JOIN households h ON h.id = i.household_id
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.code = ? AND i.accepted_at IS NULL AND i.expires_at > datetime('now')`,
    )
    .get(code) as (Omit<InviteInfo, 'role'> & { role: string }) | undefined
  return row ? { ...row, role: parseRole(row.role) ?? 'viewer' } : null
}

export interface AcceptedInvite extends InviteInfo {
  /** כבר היו חברים: התפקיד לא השתנה וההזמנה נשארה פתוחה */
  alreadyMember: boolean
}

/**
 * ממשת הזמנה. מסומנת כמנוצלת באותה עסקה שבה נוספת החברות, כדי ששני
 * לחיצות על אותו קישור לא יוסיפו שני אנשים.
 *
 * מי שכבר חבר נשאר בדיוק בתפקיד שלו, וההזמנה אינה נשרפת: בעלים שבודק
 * את הקישור שיצר לא יורד לצפייה, וגם לא מנצל את ההזמנה של מי שנשלחה אליו.
 */
export const acceptInvite = db.transaction((code: string, userId: string): AcceptedInvite | null => {
  const info = inviteInfo(code)
  if (!info) return null
  const current = roleOf(info.householdId, userId)
  if (current) return { ...info, role: current, alreadyMember: true }
  addMember(info.householdId, userId, info.role)
  db.prepare(
    "UPDATE invites SET accepted_by = ?, accepted_at = datetime('now') WHERE code = ?",
  ).run(userId, code)
  return { ...info, alreadyMember: false }
})

export function revokeInvites(householdId: string) {
  db.prepare('DELETE FROM invites WHERE household_id = ? AND accepted_at IS NULL').run(householdId)
}

/** ביטול הזמנה אחת. רק ממשק הבית שלה — קוד של בית אחר אינו נמחק דרך בית זה */
export function revokeInvite(householdId: string, code: string): boolean {
  return (
    db
      .prepare('DELETE FROM invites WHERE household_id = ? AND code = ? AND accepted_at IS NULL')
      .run(householdId, code).changes > 0
  )
}

export function pendingInvites(householdId: string): Invite[] {
  const rows = db
    .prepare(
      `SELECT code, household_id AS householdId, role, expires_at AS expiresAt, accepted_at AS acceptedAt
       FROM invites
       WHERE household_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')
       ORDER BY created_at DESC`,
    )
    .all(householdId) as Array<Omit<Invite, 'role'> & { role: string }>
  return rows.map((i) => ({ ...i, role: parseRole(i.role) ?? 'viewer' }))
}

/**
 * העברת בעלות: היעד נעשה בעלים, והמעביר יורד לעריכה. בעסקה אחת — אין
 * רגע שבו למשק הבית אין בעלים. מחזיר false אם היעד אינו חבר או שהוא המעביר.
 */
export const transferOwnership = db.transaction(
  (householdId: string, fromUserId: string, toUserId: string): boolean => {
    if (fromUserId === toUserId || !roleOf(householdId, toUserId)) return false
    setRole(householdId, toUserId, 'owner')
    setRole(householdId, fromUserId, 'editor')
    return true
  },
)

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
