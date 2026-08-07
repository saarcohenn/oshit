import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { db } from './db.js'
import {
  createHousehold,
  ensureDefaultHousehold,
  householdExists,
  listHouseholds,
} from './households.js'
import { readState, readVersion, VersionConflict, writeState } from './state.js'
import { broadcastVersion, connectedCount, subscribe } from './events.js'

const PORT = Number(process.env.PORT ?? 8080)
const PUBLIC_DIR = process.env.PUBLIC_DIR ?? join(process.cwd(), 'public')

const app = express()
// קובץ אשראי של שנה שלמה עדיין קטן, אבל ברירת המחדל של express קטנה מדי עבורו
app.use(express.json({ limit: '20mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: 1 })
})

/* ---------------- משקי בית ---------------- */

app.get('/api/households', (_req, res) => {
  res.json(listHouseholds())
})

app.post('/api/households', (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  if (!name) return res.status(400).json({ error: 'חסר שם למשק הבית' })
  const emoji = String(req.body?.emoji ?? '🏡').slice(0, 8) || '🏡'
  const id = createHousehold(name, emoji)
  res.status(201).json(listHouseholds().find((h) => h.id === id))
})

app.patch('/api/households/:id', (req, res) => {
  if (!householdExists(req.params.id)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
  const current = listHouseholds().find((h) => h.id === req.params.id)!
  const name = String(req.body?.name ?? current.name).trim() || current.name
  const emoji = String(req.body?.emoji ?? current.emoji).slice(0, 8) || current.emoji
  db.prepare('UPDATE households SET name = ?, emoji = ? WHERE id = ?').run(name, emoji, req.params.id)
  res.json(listHouseholds().find((h) => h.id === req.params.id))
})

/**
 * מחיקה קשה. הכול מדורדר דרך ON DELETE CASCADE ואין סל מיחזור —
 * זו הנקודה שבה משק בית מוחק את הנתונים שלו לגמרי.
 */
app.delete('/api/households/:id', (req, res) => {
  if (!householdExists(req.params.id)) return res.status(404).json({ error: 'משק הבית לא נמצא' })
  if (listHouseholds().length <= 1) {
    return res.status(400).json({ error: 'אי אפשר למחוק את משק הבית האחרון' })
  }
  db.prepare('DELETE FROM households WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

/* ---------------- מצב משק הבית ---------------- */

function requireHousehold(req: express.Request, res: express.Response): string | null {
  const id = req.params.id
  if (!householdExists(id)) {
    res.status(404).json({ error: 'משק הבית לא נמצא' })
    return null
  }
  return id
}

app.get('/api/households/:id/state', (req, res) => {
  const id = requireHousehold(req, res)
  if (!id) return
  res.json({ ...readState(id), version: readVersion(id) })
})

app.put('/api/households/:id/state', (req, res) => {
  const id = requireHousehold(req, res)
  if (!id) return
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
 * ואז מושך את המצב המעודכן. כך עריכה במחשב מופיעה בטלפון בלי לרענן.
 */
app.get('/api/households/:id/events', (req, res) => {
  const id = requireHousehold(req, res)
  if (!id) return

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
  res.write(`event: state
data: ${JSON.stringify({ version: readVersion(id) })}

`)

  const unsubscribe = subscribe(id, clientId, res)
  req.on('close', unsubscribe)
})

/** ייצוא מלא — הבסיס ל"הנתונים שלך שייכים לך" */
app.get('/api/households/:id/export', (req, res) => {
  const id = requireHousehold(req, res)
  if (!id) return
  const household = listHouseholds().find((h) => h.id === id)!
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
app.post('/api/households/:id/import', (req, res) => {
  const id = requireHousehold(req, res)
  if (!id) return
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

ensureDefaultHousehold()

app.listen(PORT, () => {
  console.log(`Osh.it server → http://localhost:${PORT}`)
  console.log(`נתונים נשמרים ב-${process.env.DATA_DIR ?? join(process.cwd(), 'data')}`)
})
