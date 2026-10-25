import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db.js'
import {
  enqueueRun,
  listAgentRuns,
  recordAgentEvent,
  tokenMatches,
  validateAgentEvent,
} from './agents.js'

/*
 * המסד כאן זמני — vitest.config.ts מכוון את DATA_DIR לתיקייה חדשה בכל
 * הרצה. אף בדיקה כאן לא פונה ל-Anthropic: הצינור לא מכיר את המודל בכלל.
 */

const HH = 'h_test'

beforeAll(() => {
  db.prepare(`INSERT OR IGNORE INTO households (id, name) VALUES (?, 'בדיקה')`).run(HH)
})

afterEach(() => {
  delete process.env.AGENTS_TOKEN
  db.prepare('DELETE FROM agent_events').run()
  db.prepare('DELETE FROM agent_runs').run()
  db.prepare('DELETE FROM agent_requests').run()
})

describe('זיהוי השירות', () => {
  it('בלי טוקן מוגדר אף בקשה אינה מורשית', () => {
    expect(tokenMatches('Bearer anything')).toBe(false)
    expect(tokenMatches(undefined)).toBe(false)
  })

  it('מקבל את הטוקן הנכון, עם או בלי Bearer', () => {
    process.env.AGENTS_TOKEN = 's3cret-token'
    expect(tokenMatches('Bearer s3cret-token')).toBe(true)
    expect(tokenMatches('s3cret-token')).toBe(true)
  })

  it('דוחה טוקן שגוי, ריק, או קידומת של הנכון', () => {
    process.env.AGENTS_TOKEN = 's3cret-token'
    expect(tokenMatches('Bearer wrong')).toBe(false)
    expect(tokenMatches('Bearer ')).toBe(false)
    expect(tokenMatches('Bearer s3cret')).toBe(false)
  })
})

describe('ולידציה של אירוע', () => {
  const base = { runId: 'r_1', agent: 'market', type: 'start' }

  it('מקבל אירוע תקין', () => {
    expect(validateAgentEvent(base).ok).toBe(true)
  })

  it.each([
    ['runId עם תווים אסורים', { ...base, runId: 'r 1;drop' }],
    ['סוכן שאינו ברשימה', { ...base, agent: 'trader' }],
    ['סוג שאינו ברשימה', { ...base, type: 'buy' }],
    ['טקסט ארוך מדי', { ...base, text: 'א'.repeat(2001) }],
    ['שם כלי ארוך מדי', { ...base, tool: 'x'.repeat(65) }],
    ['נתונים גדולים מדי', { ...base, data: { blob: 'x'.repeat(9000) } }],
    ['usage שלילי', { ...base, type: 'done', usage: { input: -1, output: 5 } }],
    ['usage לא שלם', { ...base, type: 'done', usage: { input: 1.5, output: 5 } }],
  ])('דוחה %s', (_name, body) => {
    expect(validateAgentEvent(body).ok).toBe(false)
  })

  /*
   * סוכן שאין לו מה למכור לא צריך סוג אירוע של מסחר. הרשימה הסגורה היא
   * מה שמונע מטקסט מוזרק בדף אינטרנט להפוך לאירוע מסוג חדש במסך.
   */
  it('אין סוג אירוע של ביצוע', () => {
    for (const type of ['buy', 'sell', 'order', 'trade', 'demo_trade']) {
      expect(validateAgentEvent({ ...base, type }).ok).toBe(false)
    }
  })
})

describe('שמירת אירועים', () => {
  it('start פותח ריצה, done סוגר אותה עם סיכום וטוקנים', () => {
    recordAgentEvent(HH, { runId: 'r_a', agent: 'market', type: 'start', text: 'התחלה' })
    recordAgentEvent(HH, { runId: 'r_a', agent: 'market', type: 'tool_call', tool: 'get_market_snapshot' })
    recordAgentEvent(HH, {
      runId: 'r_a',
      agent: 'market',
      type: 'done',
      text: 'סיכום',
      usage: { input: 1200, output: 300 },
    })
    const [run] = listAgentRuns(HH)
    expect(run.status).toBe('done')
    expect(run.summary).toBe('סיכום')
    expect(run.inputTokens).toBe(1200)
    expect(run.outputTokens).toBe(300)
    expect(run.events.map((e) => e.type)).toEqual(['start', 'tool_call', 'done'])
  })

  it('אירוע בלי start עדיין נשמר, בריצה שנפתחת בשבילו', () => {
    recordAgentEvent(HH, { runId: 'r_b', agent: 'spending', type: 'finding', text: 'ממצא' })
    const [run] = listAgentRuns(HH)
    expect(run.id).toBe('r_b')
    expect(run.status).toBe('running')
    expect(run.events).toHaveLength(1)
  })

  it('שגיאה סוגרת את הריצה כשגיאה', () => {
    recordAgentEvent(HH, { runId: 'r_c', agent: 'research', type: 'start' })
    recordAgentEvent(HH, { runId: 'r_c', agent: 'research', type: 'error', text: 'נכשל' })
    expect(listAgentRuns(HH)[0].status).toBe('error')
  })

  it('שומר רק 50 ריצות לכל סוכן', () => {
    for (let i = 0; i < 55; i++) {
      const runId = `r_${String(i).padStart(3, '0')}`
      recordAgentEvent(HH, { runId, agent: 'market', type: 'start' })
      recordAgentEvent(HH, { runId, agent: 'market', type: 'done' })
    }
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM agent_runs WHERE household_id = ? AND agent = 'market'`)
      .get(HH) as { n: number }
    expect(count.n).toBe(50)
    // ההיסטוריה של סוכן אחר לא נגעת בניקוי
    recordAgentEvent(HH, { runId: 'r_other', agent: 'spending', type: 'start' })
    recordAgentEvent(HH, { runId: 'r_other', agent: 'spending', type: 'done' })
    const events = db
      .prepare(`SELECT COUNT(*) AS n FROM agent_events WHERE household_id = ? AND agent = 'market'`)
      .get(HH) as { n: number }
    expect(events.n).toBe(100)
  })
})

describe('"הרץ עכשיו"', () => {
  it('בלי שירות מוגדר הבקשה נדחית ולא נשמרת', () => {
    expect(enqueueRun(HH, 'market', 'u_1')).toEqual({ ok: false, reason: 'not_configured' })
    const n = db.prepare('SELECT COUNT(*) AS n FROM agent_requests').get() as { n: number }
    expect(n.n).toBe(0)
  })

  it('לחיצה כפולה מחזירה את אותה בקשה ולא מוסיפה שנייה', () => {
    process.env.AGENTS_TOKEN = 't'
    const first = enqueueRun(HH, 'market', 'u_1')
    const second = enqueueRun(HH, 'market', 'u_1')
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(second.id).toBe(first.id)
      expect(second.existing).toBe(true)
    }
  })

  it('סוכנים שונים מקבלים בקשות נפרדות', () => {
    process.env.AGENTS_TOKEN = 't'
    const a = enqueueRun(HH, 'market', 'u_1')
    const b = enqueueRun(HH, 'spending', 'u_1')
    expect(a.ok && b.ok && a.id !== b.id).toBe(true)
  })
})
