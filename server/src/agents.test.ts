import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db.js'
import {
  agentBudget,
  agentLog,
  agentLogText,
  enqueueRun,
  listAgentRuns,
  monthStart,
  recordAgentEvent,
  setAgentBudget,
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

  it('מוחק רק ריצה שגם מעבר ל-200 האחרונות וגם ישנה מ-90 יום', () => {
    // 205 ריצות: 5 הראשונות בנות 100 יום, השאר טריות
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString()
    for (let i = 0; i < 205; i++) {
      const runId = `r_${String(i).padStart(3, '0')}`
      recordAgentEvent(HH, { runId, agent: 'market', type: 'start' })
      if (i < 5) db.prepare('UPDATE agent_runs SET started_at = ? WHERE id = ?').run(old, runId)
    }
    recordAgentEvent(HH, { runId: 'r_204', agent: 'market', type: 'done' })
    const count = () =>
      (db.prepare(`SELECT COUNT(*) AS n FROM agent_runs WHERE household_id = ? AND agent = 'market'`).get(HH) as { n: number }).n
    expect(count()).toBe(200)
    expect(db.prepare(`SELECT 1 FROM agent_events WHERE run_id = 'r_000'`).get()).toBeUndefined()

    // מעבר ל-200 אבל טריות — נשארות
    for (let i = 205; i < 210; i++) recordAgentEvent(HH, { runId: `r_${i}`, agent: 'market', type: 'start' })
    recordAgentEvent(HH, { runId: 'r_209', agent: 'market', type: 'done' })
    expect(count()).toBe(205)
  })

  it('שומר אנגלית, עלות, מודל וחיפושים', () => {
    recordAgentEvent(HH, { runId: 'r_en', agent: 'research', type: 'finding', text: 'ממצא', textEn: 'A finding' })
    recordAgentEvent(HH, {
      runId: 'r_en',
      agent: 'research',
      type: 'done',
      text: 'סיכום',
      textEn: 'Summary',
      usage: { input: 9000, output: 800, searches: 3, costUsd: 0.082, model: 'claude-opus-5-5' },
    })
    const [run] = listAgentRuns(HH)
    expect(run).toMatchObject({ summary: 'סיכום', summaryEn: 'Summary', costUsd: 0.082, model: 'claude-opus-5-5', searches: 3 })
    expect(run.events[0]).toMatchObject({ text: 'ממצא', textEn: 'A finding' })
  })
})

describe('ולידציה של שימוש ועלות', () => {
  const done = { runId: 'r_1', agent: 'market', type: 'done' }

  it.each([
    ['עלות שלילית', { input: 1, output: 1, costUsd: -1 }],
    ['עלות של יותר מ-100$ לריצה', { input: 1, output: 1, costUsd: 101 }],
    ['מודל עם תווים אסורים', { input: 1, output: 1, model: 'claude; drop' }],
    ['חיפושים לא שלמים', { input: 1, output: 1, searches: 1.5 }],
  ])('דוחה %s', (_name, usage) => {
    expect(validateAgentEvent({ ...done, usage }).ok).toBe(false)
  })

  it('אנגלית ארוכה מדי נדחית כמו עברית', () => {
    expect(validateAgentEvent({ ...done, textEn: 'a'.repeat(2001) }).ok).toBe(false)
  })
})

describe('תקציב', () => {
  afterEach(() => {
    setAgentBudget(HH, null)
  })

  it('החודש מתחיל בחצות לפי שעון ישראל, בקיץ ובחורף', () => {
    // 1 באוקטובר 2026, 00:30 בישראל (‎+3) — עדיין 30 בספטמבר ב-UTC
    expect(monthStart(new Date('2026-09-30T21:30:00Z'))).toBe('2026-09-30T21:00:00.000Z')
    // דצמבר, שעון חורף (‎+2)
    expect(monthStart(new Date('2026-12-15T10:00:00Z'))).toBe('2026-11-30T22:00:00.000Z')
    // 23:30 ב-31 באוקטובר בישראל הוא עדיין אוקטובר
    expect(monthStart(new Date('2026-10-31T21:30:00Z'))).toBe('2026-09-30T21:00:00.000Z')
  })

  it('סופר את החודש בלבד, בלי הדגמות, ומעריך ריצות ישנות לפי טוקנים', () => {
    const now = new Date()
    const start = monthStart(now)
    const lastMonth = new Date(Date.parse(start) - 86_400_000).toISOString()

    recordAgentEvent(HH, { runId: 'r_cost', agent: 'market', type: 'done', usage: { input: 1, output: 1, costUsd: 0.5 } })
    // ריצה מלפני רישום העלות: 100k קלט × 4$ + 10k פלט × 20$ = 0.6$
    recordAgentEvent(HH, { runId: 'r_legacy', agent: 'spending', type: 'done', usage: { input: 100_000, output: 10_000 } })
    recordAgentEvent(HH, { runId: 'r_demo', agent: 'research', type: 'done', usage: { input: 1, output: 1, costUsd: 9 } }, true)
    recordAgentEvent(HH, { runId: 'r_old', agent: 'market', type: 'done', usage: { input: 1, output: 1, costUsd: 7 } })
    db.prepare(`UPDATE agent_runs SET started_at = ? WHERE id = 'r_old'`).run(lastMonth)

    setAgentBudget(HH, 1)
    const b = agentBudget(HH, now)
    expect(b.budgetUsd).toBe(1)
    expect(b.spentUsd).toBe(1.1)
    expect(b.byAgent).toEqual([
      { agent: 'spending', usd: 0.6, runs: 1 },
      { agent: 'market', usd: 0.5, runs: 1 },
    ])
  })

  it('בלי תקציב — null, לא אפס', () => {
    expect(agentBudget(HH).budgetUsd).toBeNull()
  })
})

describe('היומן', () => {
  it('מחזיר את הצעדים האחרונים מהחדש, ומגביל לגדלים המותרים', () => {
    for (let i = 0; i < 60; i++) recordAgentEvent(HH, { runId: 'r_log', agent: 'market', type: 'thinking', text: `צעד ${i}` })
    const log = agentLog(HH, 50)
    expect(log).toHaveLength(50)
    expect(log[0].text).toBe('צעד 59')
    expect(agentLog(HH, 99_999)).toHaveLength(50)
    expect(agentLog(HH, 250)).toHaveLength(60)
  })

  it('קובץ טקסט: מהישן לחדש, שורה לכל צעד, באנגלית כשיש', () => {
    recordAgentEvent(HH, { runId: 'r_txt', agent: 'market', type: 'start', text: 'התחלה', textEn: 'Start' })
    recordAgentEvent(HH, { runId: 'r_txt', agent: 'market', type: 'finding', text: 'שורה\nשנייה' })
    recordAgentEvent(HH, { runId: 'r_txt', agent: 'market', type: 'done', text: 'סוף', usage: { input: 1, output: 1, costUsd: 0.0123 } })
    const lines = agentLogText(HH, 'en').trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0].split('\t').slice(1, 5)).toEqual(['market', 'start', '', 'Start'])
    // בלי אנגלית — העברית, וירידת השורה מקופלת
    expect(lines[1].split('\t')[4]).toBe('שורה ⏎ שנייה')
    expect(lines[2].split('\t')[5]).toBe('$0.0123')
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
