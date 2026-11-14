import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from './app.js'
import { createSession } from './auth.js'
import { db, migrateRoles } from './db.js'
import { listHouseholds } from './households.js'
import { HOUSEHOLD_COLORS } from './palette.js'
import { readState, readVersion, writeState } from './state.js'
import { createUser, roleOf } from './users.js'

/*
 * משקי בית, תפקידים והזמנות — דרך HTTP אמיתי, עם עוגיית חיבור, כדי
 * שהשערים עצמם ייבדקו ולא רק הפונקציות שמאחוריהם.
 *
 * כל הנתונים כאן סינתטיים. המסד זמני (vitest.config.ts), וכל משתמש
 * ומשק בית שנוצרים כאן נמחקים בסוף.
 */

interface Person {
  id: string
  name: string
  token: string
}

let server: Server
let base = ''
const createdUsers: string[] = []

async function person(name: string): Promise<Person> {
  const email = `${name}-${Math.random().toString(36).slice(2, 10)}@example.test`
  const id = await createUser(email, name, 'synthetic-pass-1')
  createdUsers.push(id)
  return { id, name, token: createSession(id) }
}

async function call(who: Person | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who) headers.Cookie = `oshit_session=${who.token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function invite(owner: Person, householdId: string, role: string, who: Person) {
  const created = await call(owner, 'POST', `/api/households/${householdId}/invites`, { role })
  expect(created.status).toBe(201)
  return call(who, 'POST', `/api/invites/${created.body.code}/accept`)
}

/** בעלים, עורך, צופה ומישהו מבחוץ, סביב משק בית אחד */
async function sharedHousehold() {
  const owner = await person('בעלים')
  const editor = await person('עורכת')
  const viewer = await person('צופה')
  const outsider = await person('זר')
  const created = await call(owner, 'POST', '/api/households', { name: 'בית לבדיקה' })
  expect(created.status).toBe(201)
  const hh: string = created.body.id
  expect((await invite(owner, hh, 'editor', editor)).body).toMatchObject({ role: 'editor', alreadyMember: false })
  expect((await invite(owner, hh, 'viewer', viewer)).body).toMatchObject({ role: 'viewer', alreadyMember: false })
  return { owner, editor, viewer, outsider, hh }
}

const tx = (id: string, date: string, card: string, extra: Record<string, unknown> = {}) => ({
  id,
  card,
  merchant: 'בית קפה',
  merchantKey: 'בית קפה',
  date,
  chargeDate: date,
  amount: 42,
  category: 'other',
  ...extra,
})

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  for (const id of createdUsers) {
    for (const h of listHouseholds(id)) db.prepare('DELETE FROM households WHERE id = ?').run(h.id)
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
  }
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('שערי התפקידים', () => {
  let s: Awaited<ReturnType<typeof sharedHousehold>>
  beforeAll(async () => {
    s = await sharedHousehold()
  })

  it('כל חבר קורא; עריכה ובעלים כותבים; צפייה לא', async () => {
    const path = `/api/households/${s.hh}/state`
    for (const who of [s.owner, s.editor, s.viewer]) {
      expect((await call(who, 'GET', path)).status).toBe(200)
    }
    const write = { settings: { cycleStartDay: 1 } }
    expect((await call(s.viewer, 'PUT', path, write)).status).toBe(403)
    expect((await call(s.editor, 'PUT', path, write)).status).toBe(200)
    expect((await call(s.owner, 'PUT', path, write)).status).toBe(200)
  })

  it('מי שאינו חבר מקבל 404 ולא 403, ומי שלא מחובר 401', async () => {
    const path = `/api/households/${s.hh}/state`
    expect((await call(s.outsider, 'GET', path)).status).toBe(404)
    expect((await call(s.outsider, 'PUT', path, {})).status).toBe(404)
    expect((await call(null, 'GET', path)).status).toBe(401)
  })

  it('שיתוף, שחזור גיבוי, שינוי ומחיקה — לבעלים בלבד', async () => {
    const id = s.hh
    for (const who of [s.editor, s.viewer]) {
      expect((await call(who, 'POST', `/api/households/${id}/invites`, { role: 'viewer' })).status).toBe(403)
      expect((await call(who, 'POST', `/api/households/${id}/import`, { state: {} })).status).toBe(403)
      expect((await call(who, 'PATCH', `/api/households/${id}`, { name: 'שם אחר' })).status).toBe(403)
      expect((await call(who, 'DELETE', `/api/households/${id}`)).status).toBe(403)
      expect((await call(who, 'POST', `/api/households/${id}/transfer`, { userId: who.id })).status).toBe(403)
    }
    expect((await call(s.owner, 'POST', `/api/households/${id}/import`, { state: {} })).status).toBe(200)
  })

  it('הזמנות פתוחות מוצגות רק לבעלים', async () => {
    await call(s.owner, 'POST', `/api/households/${s.hh}/invites`, { role: 'viewer' })
    const asOwner = await call(s.owner, 'GET', `/api/households/${s.hh}/members`)
    const asEditor = await call(s.editor, 'GET', `/api/households/${s.hh}/members`)
    expect(asOwner.body.invites.length).toBeGreaterThan(0)
    expect(asEditor.body.invites).toEqual([])
    expect(asEditor.body.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'editor', 'viewer'])
  })

  it('כל חבר רשאי לעזוב, ואחר כך משק הבית כבר לא נגיש לו', async () => {
    expect((await call(s.viewer, 'DELETE', `/api/households/${s.hh}/members/${s.viewer.id}`)).status).toBe(204)
    expect((await call(s.viewer, 'GET', `/api/households/${s.hh}/state`)).status).toBe(404)
  })
})

describe('הזמנות', () => {
  it('בלי הרשאה ההזמנה היא לעריכה, "member" הישן מתורגם לעריכה, וערך זר נדחה', async () => {
    const owner = await person('בעלים')
    const hh = (await call(owner, 'POST', '/api/households', { name: 'בית' })).body.id
    const path = `/api/households/${hh}/invites`
    expect((await call(owner, 'POST', path, {})).body.role).toBe('editor')
    expect((await call(owner, 'POST', path, { role: 'member' })).body.role).toBe('editor')
    expect((await call(owner, 'POST', path, { role: 'admin' })).status).toBe(400)
  })

  it('מי שכבר חבר אינו יורד בתפקיד, וההזמנה נשארת למי שנשלחה אליו', async () => {
    const s = await sharedHousehold()
    const code = (await call(s.owner, 'POST', `/api/households/${s.hh}/invites`, { role: 'viewer' })).body.code

    const self = await call(s.owner, 'POST', `/api/invites/${code}/accept`)
    expect(self.body).toMatchObject({ alreadyMember: true, role: 'owner' })
    expect(roleOf(s.hh, s.owner.id)).toBe('owner')

    const editor = await call(s.editor, 'POST', `/api/invites/${code}/accept`)
    expect(editor.body).toMatchObject({ alreadyMember: true, role: 'editor' })
    expect(roleOf(s.hh, s.editor.id)).toBe('editor')

    const fresh = await call(s.outsider, 'POST', `/api/invites/${code}/accept`)
    expect(fresh.body).toMatchObject({ alreadyMember: false, role: 'viewer' })
    expect(roleOf(s.hh, s.outsider.id)).toBe('viewer')

    // עכשיו היא נוצלה
    const late = await person('מאוחר')
    expect((await call(late, 'POST', `/api/invites/${code}/accept`)).status).toBe(404)
  })

  it('ביטול הזמנה אחת, ורק דרך משק הבית שלה', async () => {
    const owner = await person('בעלים')
    const guest = await person('אורח')
    const a = (await call(owner, 'POST', '/api/households', { name: 'בית א' })).body.id
    const b = (await call(owner, 'POST', '/api/households', { name: 'בית ב' })).body.id
    const first = (await call(owner, 'POST', `/api/households/${a}/invites`, { role: 'viewer' })).body.code
    const second = (await call(owner, 'POST', `/api/households/${a}/invites`, { role: 'editor' })).body.code

    // קוד של בית א אינו נמחק דרך בית ב
    expect((await call(owner, 'DELETE', `/api/households/${b}/invites/${first}`)).status).toBe(404)
    expect((await call(owner, 'DELETE', `/api/households/${a}/invites/${first}`)).status).toBe(204)
    expect((await call(guest, 'POST', `/api/invites/${first}/accept`)).status).toBe(404)

    const pending = (await call(owner, 'GET', `/api/households/${a}/members`)).body.invites
    expect(pending.map((i: { code: string }) => i.code)).toEqual([second])
  })
})

describe('בעלות', () => {
  it('בעלים יחיד משנה תפקיד של אחרים, אבל לא מוריד את עצמו', async () => {
    const s = await sharedHousehold()
    const members = `/api/households/${s.hh}/members`
    expect((await call(s.owner, 'PATCH', `${members}/${s.editor.id}`, { role: 'viewer' })).status).toBe(200)
    expect(roleOf(s.hh, s.editor.id)).toBe('viewer')
    expect((await call(s.owner, 'PATCH', `${members}/${s.viewer.id}`, { role: 'editor' })).status).toBe(200)
    expect(roleOf(s.hh, s.viewer.id)).toBe('editor')
    expect((await call(s.owner, 'PATCH', `${members}/${s.owner.id}`, { role: 'editor' })).status).toBe(400)
    expect((await call(s.owner, 'PATCH', `${members}/${s.editor.id}`, { role: 'boss' })).status).toBe(400)
    expect((await call(s.owner, 'PATCH', `${members}/${s.outsider.id}`, { role: 'viewer' })).status).toBe(404)
  })

  it('העברת בעלות: היעד נעשה בעלים, המעביר יורד לעריכה', async () => {
    const s = await sharedHousehold()
    const transfer = `/api/households/${s.hh}/transfer`
    expect((await call(s.owner, 'POST', transfer, { userId: s.owner.id })).status).toBe(400)
    expect((await call(s.owner, 'POST', transfer, { userId: s.outsider.id })).status).toBe(404)

    const done = await call(s.owner, 'POST', transfer, { userId: s.editor.id })
    expect(done.status).toBe(200)
    expect(done.body.role).toBe('editor')
    expect(roleOf(s.hh, s.editor.id)).toBe('owner')
    expect(roleOf(s.hh, s.owner.id)).toBe('editor')
    // הבעלים לשעבר כבר לא יכול לשתף
    expect((await call(s.owner, 'POST', `/api/households/${s.hh}/invites`, {})).status).toBe(403)
  })
})

describe('סוג וצבע', () => {
  it('עסק קטן מתחיל עם קטגוריות עסקיות ועוגן אחד ל"שונות"', async () => {
    const owner = await person('בעלים')
    const created = await call(owner, 'POST', '/api/households', { name: 'קליניקה', kind: 'business' })
    expect(created.status).toBe(201)
    expect(created.body.kind).toBe('business')
    const ids = (readState(created.body.id).categories as Array<{ id: string; isFallback: boolean }>)
    expect(ids.map((c) => c.id)).toEqual(expect.arrayContaining(['taxes', 'equipment', 'subscriptions', 'other']))
    expect(ids.map((c) => c.id)).not.toContain('groceries')
    expect(ids.filter((c) => c.isFallback).map((c) => c.id)).toEqual(['other'])
  })

  it('בית שהופך לעסק מקבל רק את מה שחסר, ושום קטגוריה קיימת לא משתנה', async () => {
    const owner = await person('בעלים')
    const hh = (await call(owner, 'POST', '/api/households', { name: 'בית' })).body.id
    const before = readState(hh).categories as Array<{ id: string; name: string }>
    const v0 = readVersion(hh)

    const changed = await call(owner, 'PATCH', `/api/households/${hh}`, { kind: 'business' })
    expect(changed.body.kind).toBe('business')
    const after = readState(hh).categories as Array<{ id: string; name: string }>
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.map((c) => c.id)).toEqual(expect.arrayContaining(['taxes', 'equipment']))
    expect(new Set(after.map((c) => c.id)).size).toBe(after.length)
    expect(readVersion(hh)).toBe(v0 + 1)

    // שוב לאותו סוג — אין מה להוסיף, והגרסה לא זזה
    await call(owner, 'PATCH', `/api/households/${hh}`, { kind: 'business' })
    expect(readVersion(hh)).toBe(v0 + 1)
  })

  it('צבע וסוג נבדקים; בלי צבע מתקבל צבע שעוד אין למשתמש', async () => {
    const owner = await person('בעלים')
    expect((await call(owner, 'POST', '/api/households', { name: 'א', color: 'red' })).status).toBe(400)
    expect((await call(owner, 'POST', '/api/households', { name: 'א', kind: 'castle' })).status).toBe(400)

    const first = await call(owner, 'POST', '/api/households', { name: 'א', color: HOUSEHOLD_COLORS[0] })
    expect(first.body.color).toBe(HOUSEHOLD_COLORS[0])
    const second = await call(owner, 'POST', '/api/households', { name: 'ב' })
    expect(second.body.color).toBe(HOUSEHOLD_COLORS[1])

    const bad = await call(owner, 'PATCH', `/api/households/${first.body.id}`, { color: 'url(x)' })
    expect(bad.status).toBe(400)
    const good = await call(owner, 'PATCH', `/api/households/${first.body.id}`, { color: '#9085E9' })
    expect(good.body.color).toBe('#9085E9')
  })
})

describe('רשימת משקי הבית', () => {
  it('מחזירה לכל בית תפקיד, חברים, כרטיסים ותאריך ראשון', async () => {
    const s = await sharedHousehold()
    writeState(s.hh, {
      transactions: [
        tx('t1', '2025-03-04', '1111'),
        tx('t2', '2025-02-10', '2222'),
        tx('t3', '2025-02-11', '', { manual: true }),
      ],
      accountMovements: [{ id: 'm1', date: '2025-01-20', description: 'משכורת', amount: 1000, kind: 'income' }],
    })
    const asViewer = listHouseholds(s.viewer.id).find((h) => h.id === s.hh)!
    expect(asViewer).toMatchObject({
      role: 'viewer',
      kind: 'home',
      memberCount: 3,
      transactionCount: 3,
      movementCount: 1,
      cardCount: 2,
      firstDate: '2025-01-20',
      agentsLive: false,
    })
    expect(asViewer.memberNames[0]).toBe('בעלים')
    expect(asViewer.memberNames).toHaveLength(3)
    expect(HOUSEHOLD_COLORS).toContain(asViewer.color)
    // מי שמבחוץ לא רואה את הבית בכלל
    expect(listHouseholds(s.outsider.id).some((h) => h.id === s.hh)).toBe(false)
  })
})

describe('שמירת המצב', () => {
  it('אירוע חד-פעמי ובן הבית נשמרים גם בעסקאות כרטיס', async () => {
    const owner = await person('בעלים')
    const hh = (await call(owner, 'POST', '/api/households', { name: 'בית' })).body.id
    writeState(hh, { transactions: [tx('t1', '2025-05-01', '1111', { oneOff: true, person: 'דנה' }), tx('t2', '2025-05-02', '1111')] })
    const [first, second] = readState(hh).transactions as Array<Record<string, unknown>>
    expect(first).toMatchObject({ oneOff: true, person: 'דנה' })
    expect(second.oneOff).toBeUndefined()
    expect(second.person).toBeUndefined()
  })
})

describe('הגירת התפקידים', () => {
  it('"member" ישן נקרא כעריכה, וההגירה כותבת editor', async () => {
    const owner = await person('בעלים')
    const legacy = await person('ותיקה')
    const hh = (await call(owner, 'POST', '/api/households', { name: 'בית ישן' })).body.id
    db.prepare("INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'member')").run(hh, legacy.id)
    db.prepare(
      "INSERT INTO invites (code, household_id, role, created_by, expires_at) VALUES ('legacy-code', ?, 'member', ?, '2999-01-01 00:00:00')",
    ).run(hh, owner.id)

    expect(roleOf(hh, legacy.id)).toBe('editor')
    expect((await call(legacy, 'PUT', `/api/households/${hh}/state`, { settings: { cycleStartDay: 1 } })).status).toBe(200)

    migrateRoles()
    const raw = (sql: string) => (db.prepare(sql).get(hh) as { role: string }).role
    expect(raw(`SELECT role FROM household_members WHERE household_id = ? AND user_id = '${legacy.id}'`)).toBe('editor')
    expect(raw("SELECT role FROM invites WHERE household_id = ? AND code = 'legacy-code'")).toBe('editor')
  })
})
