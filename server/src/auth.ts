import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { NextFunction, Request, Response } from 'express'
import { db, sqlTime, uid } from './db.js'

interface ScryptOpts {
  N: number
  r: number
  p: number
  maxmem: number
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  opts: ScryptOpts,
) => Promise<Buffer>

/*
 * פרמטרים ל-scrypt. N הוא עלות הזיכרון — 2^15 דורש כ-32MB לכל בדיקה,
 * מה שהופך ניחוש המוני ליקר גם למי שהשיג את המסד, ועדיין נמשך פחות
 * מעשירית שנייה בכניסה בודדת.
 *
 * maxmem חייב להיקבע במפורש: ברירת המחדל של Node היא בדיוק 32MB,
 * והפרמטרים האלה דורשים קצת יותר — בלי זה הקריאה נכשלת לגמרי.
 */
const SCRYPT = { N: 32768, r: 8, p: 1 }
const KEYLEN = 64

/** 128·N·r הוא הצורך המדויק; הכפלה משאירה מרווח לגרסאות שמחשבות אחרת */
const maxmemFor = (N: number, r: number) => 256 * N * r

const SESSION_COOKIE = 'oshit_session'
/** חודשיים. אפליקציה ביתית שמותקנת כ-PWA לא אמורה לבקש סיסמה כל שבוע */
const SESSION_DAYS = 60

export interface AuthUser {
  id: string
  email: string
  name: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

/* ---------------- סיסמאות ---------------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEYLEN, {
    ...SCRYPT,
    maxmem: maxmemFor(SCRYPT.N, SCRYPT.r),
  })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // הפרמטרים נקראים מהערך השמור ולא מהקבועים: סיסמאות שנוצרו לפני
  // שינוי עלות עדיין חייבות להיבדק לפי מה שהן נוצרו איתו
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt') return false
  const N = Number(n)
  const R = Number(r)
  const expected = Buffer.from(hashB64, 'base64')
  const derived = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r: R,
    p: Number(p),
    maxmem: maxmemFor(N, R),
  })
  // השוואה בזמן קבוע — השוואת מחרוזות רגילה מדליפה כמה תווים תאמו
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/* ---------------- חיבורים ---------------- */

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url')
  const expires = sqlTime(new Date(Date.now() + SESSION_DAYS * 86_400_000))
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expires,
  )
  return token
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

/** מנתק את המשתמש מכל המכשירים — נדרש אחרי החלפת סיסמה */
export function destroyAllSessions(userId: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

function userForToken(token: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(sha256(token)) as AuthUser | undefined
  if (!row) return null
  db.prepare("UPDATE sessions SET seen_at = datetime('now') WHERE token_hash = ?").run(sha256(token))
  return row
}

export function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run()
  db.prepare("DELETE FROM invites WHERE expires_at <= datetime('now') AND accepted_at IS NULL").run()
}

/* ---------------- עוגיות ---------------- */

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== name) continue
    return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

/**
 * Secure נקבע לפי הבקשה ולא לפי משתנה סביבה: בהתקנה ביתית שמגיעים אליה
 * ב-http לפי כתובת IP, עוגיית Secure פשוט לא הייתה נשמרת ואי אפשר היה
 * להיכנס בכלל. מאחורי פרוקסי ה-TLS מסתיים בו, ולכן נבדק גם x-forwarded-proto.
 */
function isSecureRequest(req: Request): boolean {
  if (req.secure) return true
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  return proto === 'https'
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: SESSION_DAYS * 86_400_000,
  })
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
  })
}

export const sessionToken = (req: Request) => readCookie(req, SESSION_COOKIE)

/* ---------------- שכבת ביניים ---------------- */

/** מזהה את המשתמש אם יש חיבור תקף, בלי לחסום בקשות אנונימיות */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = sessionToken(req)
  if (token) req.user = userForToken(token) ?? undefined
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'נדרשת התחברות' })
  next()
}

/* ---------------- ריסון ניסיונות ---------------- */

/*
 * חלון החלקה פשוט בזיכרון. השרת הזה הוא תהליך יחיד, ואין טעם בתלות
 * חיצונית כדי להאט ניחוש סיסמאות — מספיק למנוע אלפי ניסיונות בדקה.
 */
const attempts = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60_000

export function tooManyAttempts(key: string): number {
  const entry = attempts.get(key)
  if (!entry) return 0
  if (Date.now() > entry.until) {
    attempts.delete(key)
    return 0
  }
  if (entry.count < MAX_ATTEMPTS) return 0
  return Math.ceil((entry.until - Date.now()) / 1000)
}

export function noteFailedAttempt(key: string) {
  const entry = attempts.get(key)
  if (!entry || Date.now() > entry.until) {
    attempts.set(key, { count: 1, until: Date.now() + WINDOW_MS })
    return
  }
  entry.count++
}

export function clearAttempts(key: string) {
  attempts.delete(key)
}

export { uid }
