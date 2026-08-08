import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { db } from './db.js'
import {
  createHousehold,
  ensureDefaultHousehold,
  getHousehold,
  listHouseholds,
} from './households.js'
import { readState, readVersion, VersionConflict, writeState } from './state.js'
import { broadcastVersion, connectedCount, subscribe } from './events.js'
import {
  attachUser,
  clearAttempts,
  clearSessionCookie,
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  noteFailedAttempt,
  purgeExpiredSessions,
  requireAuth,
  sessionToken,
  setSessionCookie,
  tooManyAttempts,
  verifyPassword,
} from './auth.js'
import {
  acceptInvite,
  addMember,
  createInvite,
  createUser,
  findUserByEmail,
  findUserById,
  inviteInfo,
  listMembers,
  normalizeEmail,
  ownerCount,
  pendingInvites,
  removeMember,
  revokeInvites,
  roleOf,
  userCount,
  adoptOrphanHouseholds,
} from './users.js'

const PORT = Number(process.env.PORT ?? 8080)
const PUBLIC_DIR = process.env.PUBLIC_DIR ?? join(process.cwd(), 'public')

/*
 * הרשמה חופשית סגורה כברירת מחדל. שרת ביתי שנחשף לאינטרנט דרך מנהרה
 * הוא הפריסה הרגילה כאן, ופתיחת הרשמה לכל מי שמגיע לכתובת הייתה נותנת
 * לזרים ליצור חשבונות. הצטרפות נעשית בהזמנה; הדלת נפתחת רק בהתקנה
 * חדשה לגמרי, עד שנוצר החשבון הראשון.
 */
const OPEN_REGISTRATION = process.env.OSHIT_OPEN_REGISTRATION === 'true'

const app = express()
// מאחורי פרוקסי — כדי ש-req.secure ישקף את ה-TLS שהסתיים בפרוקסי
app.set('trust proxy', 1)
// קובץ אשראי של שנה שלמה עדיין קטן, אבל ברירת המחדל של express קטנה מדי עבורו
app.use(express.json({ limit: '20mb' }))
app.use(attachUser)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: 2 })
})

/* ---------------- הזדהות ---------------- */

const MIN_PASSWORD = 8

function publicUser(u: { id: string; email: string; name: string }) {
  return { id: u.id, email: u.email, name: u.name }
}

/**
 * Express 4 אינו תופס דחייה של handler אסינכרוני: היא מגיעה כ-unhandled
 * rejection, וב-Node מודרני זה מפיל את התהליך כולו. שגיאה בבדיקת סיסמה
 * אחת אינה סיבה שכל מי שמחובר יאבד את השרת.
 */
function asyncRoute(
  fn: (req: express.Request, res: express.Response) => Promise<unknown>,
): express.RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next)
  }
}

/**
 * המצב ההתחלתי שהלקוח שואל עליו לפני שהוא מצייר משהו: האם יש כבר
 * חשבון במערכת, האם אנחנו מחוברים, והאם מחכה הזמנה בקישור.
 */
app.get('/api/auth/state', (req, res) => {
  const code = String(req.query.invite ?? '')
  res.json({
    needsSetup: userCount() === 0,
    openRegistration: OPEN_REGISTRATION,
    user: req.user ? publicUser(req.user) : null,
    invite: code ? inviteInfo(code) : null,
  })
})

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''))
  const name = String(req.body?.name ?? '').trim()
  const password = String(req.body?.password ?? '')
  const code = String(req.body?.invite ?? '')

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'כתובת דוא״ל לא תקינה' })
  }
  if (!name) return res.status(400).json({ error: 'חסר שם' })
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `הסיסמה צריכה להיות באורך ${MIN_PASSWORD} תווים לפחות` })
  }

  const first = userCount() === 0
  const invite = code ? inviteInfo(code) : null
  // בלי החשבון הראשון, בלי הזמנה תקפה ובלי הרשמה פתוחה — אין כניסה
  if (!first && !invite && !OPEN_REGISTRATION) {
    return res.status(403).json({ error: 'ההרשמה סגורה. בקשו קישור הזמנה ממי שכבר משתמש' })
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'כבר קיים חשבון עם הדוא״ל הזה' })
  }

  const id = await createUser(email, name, password)

  if (first) {
    /*
     * שדרוג מגרסה שלא הכירה משתמשים: הנתונים שכבר במסד עוברים לבעלות
     * החשבון הראשון. בלי זה ההיסטוריה הייתה נשארת במסד בלי דרך להגיע אליה.
     */
    const adopted = adoptOrphanHouseholds(id)
    if (adopted) console.log(`אומצו ${adopted} משקי בית קיימים על ידי החשבון הראשון`)
  }
  if (invite) acceptInvite(invite.code, id)
  ensureDefaultHousehold(id)

  setSessionCookie(req, res, createSession(id))
  res.status(201).json({ user: publicUser({ id, email, name }) })
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''))
  const password = String(req.body?.password ?? '')
  const throttleKey = `${req.ip}|${email}`

  const wait = tooManyAttempts(throttleKey)
  if (wait) {
    return res.status(429).json({ error: `יותר מדי ניסיונות. נסו שוב בעוד ${wait} שניות` })
  }

  const user = findUserByEmail(email)
  // אותה תשובה בדיוק לדוא״ל לא קיים ולסיסמה שגויה, כדי לא לאשר קיום חשבון
  const ok = user ? await verifyPassword(password, user.passwordHash) : false
  if (!user || !ok) {
    noteFailedAttempt(throttleKey)
    return res.status(401).json({ error: 'דוא״ל או סיסמה שגויים' })
  }

  clearAttempts(throttleKey)
  const code = String(req.body?.invite ?? '')
  if (code) acceptInvite(code, user.id)

  setSessionCookie(req, res, createSession(user.id))
  res.json({ user: publicUser(user) })
}))

app.post('/api/auth/logout', (req, res) => {
  const token = sessionToken(req)
  if (token) destroySession(token)
  clearSessionCookie(req, res)
  res.status(204).end()
})

app.post('/api/auth/password', requireAuth, asyncRoute(async (req, res) => {
  const current = String(req.body?.currentPassword ?? '')
  const next = String(req.body?.newPassword ?? '')
  if (next.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `הסיסמה צריכה להיות באורך ${MIN_PASSWORD} תווים לפחות` })
  }
  const user = findUserById(req.user!.id)!
  if (!(await verifyPassword(current, user.passwordHash))) {
    return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' })
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    await hashPassword(next),
    user.id,
  )
  // כל שאר המכשירים מנותקים; החיבור הנוכחי מונפק מחדש
  destroyAllSessions(user.id)
  setSessionCookie(req, res, createSession(user.id))
  res.json({ ok: true })
}))

/** מימוש הזמנה על ידי מי שכבר מחובר */
app.post('/api/invites/:code/accept', requireAuth, (req, res) => {
  const info = acceptInvite(req.params.code, req.user!.id)
  if (!info) return res.status(404).json({ error: 'ההזמנה אינה תקפה או שכבר מומשה' })
  res.json({ householdId: info.householdId, householdName: info.householdName })
})

/* ---------------- משקי בית ---------------- */

const households = express.Router()
app.use('/api/households', requireAuth, households)

/**
 * שער הגישה לכל נתוני משק הבית.
 *
 * חוסר חברות מוחזר כ-404 ולא כ-403: מזהה משק בית שאיננו חברים בו לא
 * אמור להיות ניתן לאישור מבחוץ, וההבחנה בין "לא קיים" ל"קיים ואינך
 * מורשה" היא בדיוק מה שמאפשר למנות מזהים.
 */
function member(role?: 'owner') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const actual = roleOf(req.params.id, req.user!.id)
    if (!actual) return res.status(404).json({ error: 'משק הבית לא נמצא' })
    if (role === 'owner' && actual !== 'owner') {
      return res.status(403).json({ error: 'רק בעלים של משק הבית יכול לבצע את הפעולה' })
    }
    next()
  }
}

households.get('/', (req, res) => {
  res.json(listHouseholds(req.user!.id))
})

households.post('/', (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  if (!name) return res.status(400).json({ error: 'חסר שם למשק הבית' })
  const emoji = String(req.body?.emoji ?? '🏡').slice(0, 8) || '🏡'
  const id = createHousehold(name, emoji, req.user!.id)
  res.status(201).json(getHousehold(id, req.user!.id))
})

households.patch('/:id', member('owner'), (req, res) => {
  const current = getHousehold(req.params.id, req.user!.id)!
  const name = String(req.body?.name ?? current.name).trim() || current.name
  const emoji = String(req.body?.emoji ?? current.emoji).slice(0, 8) || current.emoji
  db.prepare('UPDATE households SET name = ?, emoji = ? WHERE id = ?').run(name, emoji, req.params.id)
  res.json(getHousehold(req.params.id, req.user!.id))
})

/**
 * מחיקה קשה. הכול מדורדר דרך ON DELETE CASCADE ואין סל מיחזור —
 * זו הנקודה שבה משק בית מוחק את הנתונים שלו לגמרי, גם עבור מי שחולק אותו.
 */
households.delete('/:id', member('owner'), (req, res) => {
  if (listHouseholds(req.user!.id).length <= 1) {
    return res.status(400).json({ error: 'אי אפשר למחוק את משק הבית האחרון' })
  }
  db.prepare('DELETE FROM households WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

/* ---------------- שיתוף ---------------- */

households.get('/:id/members', member(), (req, res) => {
  const list = listMembers(req.params.id).map((m) => ({ ...m, isSelf: m.userId === req.user!.id }))
  res.json({
    members: list,
    invites: roleOf(req.params.id, req.user!.id) === 'owner' ? pendingInvites(req.params.id) : [],
  })
})

households.post('/:id/invites', member('owner'), (req, res) => {
  const role = req.body?.role === 'owner' ? 'owner' : 'member'
  res.status(201).json(createInvite(req.params.id, req.user!.id, role))
})

households.delete('/:id/invites', member('owner'), (req, res) => {
  revokeInvites(req.params.id)
  res.status(204).end()
})

/**
 * הסרת חבר. הבעלים מסיר אחרים, וכל אחד רשאי להסיר את עצמו — עזיבה
 * אינה מוחקת דבר, רק מנתקת את הגישה.
 */
households.delete('/:id/members/:userId', member(), (req, res) => {
  const me = req.user!.id
  const target = req.params.userId
  const myRole = roleOf(req.params.id, me)
  if (target !== me && myRole !== 'owner') {
    return res.status(403).json({ error: 'רק בעלים יכול להסיר חברים אחרים' })
  }
  if (roleOf(req.params.id, target) === 'owner' && ownerCount(req.params.id) <= 1) {
    return res.status(400).json({ error: 'אי אפשר להסיר את הבעלים היחיד של משק הבית' })
  }
  removeMember(req.params.id, target)
  res.status(204).end()
})

households.patch('/:id/members/:userId', member('owner'), (req, res) => {
  const role = req.body?.role === 'owner' ? 'owner' : 'member'
  if (!roleOf(req.params.id, req.params.userId)) {
    return res.status(404).json({ error: 'המשתמש אינו חבר במשק הבית' })
  }
  if (role === 'member' && ownerCount(req.params.id) <= 1) {
    return res.status(400).json({ error: 'צריך להישאר בעלים אחד לפחות' })
  }
  addMember(req.params.id, req.params.userId, role)
  res.json({ ok: true })
})

/* ---------------- מצב משק הבית ---------------- */

households.get('/:id/state', member(), (req, res) => {
  res.json({ ...readState(req.params.id), version: readVersion(req.params.id) })
})

households.put('/:id/state', member(), (req, res) => {
  const id = req.params.id
  const { version, ...rest } = req.body ?? {}
  try {
    const next = writeState(id, rest, typeof version === 'number' ? version : undefined)
    broadcastVersion(id, next, String(req.headers['x-client-id'] ?? ''))
    res.json({ ok: true, version: next, listeners: connectedCount(id) })
  } catch (err) {
    if (err instanceof VersionConflict) {
      // מכשיר אחר כתב בינתיים. הלקוח יטען מחדש במקום לדרוס
      return res.status(409).json({
        error: 'הנתונים שונו ממכשיר אחר',
        currentVersion: err.current,
      })
    }
    console.error('שמירת המצב נכשלה', err)
    res.status(500).json({ error: 'שמירת הנתונים נכשלה' })
  }
})

/**
 * זרם עדכונים חי. המכשיר נשאר מחובר ומקבל הודעה בכל פעם שמישהו אחר כתב,
 * ואז מושך את המצב המעודכן. כך עריכה במחשב מופיעה בטלפון בלי לרענן,
 * וגם שינוי של בן הזוג מחשבון אחר מגיע מיד.
 */
households.get('/:id/events', member(), (req, res) => {
  const id = req.params.id
  const clientId = String(req.query.clientId ?? '')

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // מונע מ-nginx וממקביליו לצבור את הזרם במאגר במקום להעביר אותו מיד
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  // הודעה ראשונה מיד, כדי שהלקוח ידע אם הוא כבר מפגר אחרי גרסה
  res.write(`event: state\ndata: ${JSON.stringify({ version: readVersion(id) })}\n\n`)

  const unsubscribe = subscribe(id, clientId, res)
  req.on('close', unsubscribe)
})

/** ייצוא מלא — הבסיס ל"הנתונים שלך שייכים לך" */
households.get('/:id/export', member(), (req, res) => {
  const id = req.params.id
  const household = getHousehold(id, req.user!.id)!
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="oshit-${id}-${new Date().toISOString().slice(0, 10)}.json"`,
  )
  res.send(
    JSON.stringify({ exportedAt: new Date().toISOString(), household, state: readState(id) }, null, 2),
  )
})

/** ייבוא של גיבוי לתוך משק בית קיים, מחליף את תוכנו */
households.post('/:id/import', member(), (req, res) => {
  const id = req.params.id
  const state = req.body?.state ?? req.body
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'קובץ הגיבוי אינו תקין' })
  }
  try {
    const next = writeState(id, state)
    broadcastVersion(id, next)
    res.json({ ok: true, version: next })
  } catch (err) {
    console.error('ייבוא הגיבוי נכשל', err)
    res.status(500).json({ error: 'ייבוא הגיבוי נכשל' })
  }
})

/* ---------------- הגשת הלקוח ---------------- */

if (existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR))
  // אפליקציית עמוד יחיד: כל נתיב שאינו API מוגש מ-index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, 'index.html'))
  })
}

/* כל שגיאה שלא טופלה מגיעה לכאן — כולל דחיות מ-asyncRoute */
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('שגיאה לא מטופלת', err)
  if (res.headersSent) return
  res.status(500).json({ error: 'שגיאת שרת' })
})

purgeExpiredSessions()
setInterval(purgeExpiredSessions, 6 * 60 * 60_000).unref()

app.listen(PORT, () => {
  console.log(`Osh.it server → http://localhost:${PORT}`)
  console.log(`נתונים נשמרים ב-${process.env.DATA_DIR ?? join(process.cwd(), 'data')}`)
  if (userCount() === 0) console.log('אין עדיין חשבון — הכניסה הראשונה תיצור אותו')
})
