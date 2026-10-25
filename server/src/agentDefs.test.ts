import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db.js'
import {
  BUILTIN_DEFS,
  LIMITS,
  agentDefVersions,
  agentMemory,
  agentMemoryVersions,
  completeTelegramLink,
  deleteAgentDef,
  getAgentDef,
  getPortfolio,
  importPortfolio,
  latestReports,
  listAgentDefs,
  revertAgentDef,
  revertAgentMemory,
  saveAgentDef,
  saveAgentMemory,
  savePortfolio,
  startTelegramLink,
  telegramLink,
  validateAgentDef,
  validatePortfolio,
} from './agentDefs.js'
import { recordAgentEvent } from './agents.js'

const HH = 'h_defs'
const OTHER = 'h_other'

beforeAll(() => {
  db.prepare(`INSERT OR IGNORE INTO households (id, name) VALUES (?, 'בדיקה')`).run(HH)
  db.prepare(`INSERT OR IGNORE INTO households (id, name) VALUES (?, 'אחר')`).run(OTHER)
})

afterEach(() => {
  for (const t of [
    'agent_defs',
    'agent_def_versions',
    'agent_memory',
    'agent_memory_versions',
    'agent_portfolio',
    'agent_portfolio_versions',
    'agent_settings',
    'agent_events',
    'agent_runs',
  ]) {
    db.prepare(`DELETE FROM ${t}`).run()
  }
})

const custom = (over: Record<string, unknown> = {}) => ({
  id: 'fx-watch',
  name: 'סוכן מט"ח',
  nameEn: 'FX agent',
  role: 'שער הדולר',
  roleEn: 'The dollar rate',
  emoji: '💱',
  color: '#3366AA',
  instructions: 'בדוק את שער הדולר מול השקל.',
  tools: ['get_market_snapshot', 'update_memory'],
  schedule: { days: [1, 3], hour: 9, minute: 5 },
  model: 'claude-haiku-5-5',
  effort: 'low',
  maxIterations: 4,
  maxSearches: 0,
  notify: 'alerts',
  enabled: true,
  ...over,
})

describe('ולידציה של הגדרת סוכן', () => {
  it('מקבלת הגדרה תקינה ומנרמלת צבע', () => {
    const r = validateAgentDef(custom(), false)
    expect(r.ok && r.value.color).toBe('#3366aa')
  })

  it.each([
    ['כלי שאינו בקטלוג — אין דרך להוסיף כלי ביצוע מהמסך', { tools: ['place_order'] }],
    ['מודל לא מוכר', { model: 'gpt-5' }],
    ['מזהה עם תווים אסורים', { id: 'Fx Watch' }],
    ['הנחיות ריקות', { instructions: '   ' }],
    ['הנחיות ארוכות מדי', { instructions: 'א'.repeat(LIMITS.instructions + 1) }],
    ['יום שלא קיים', { schedule: { days: [7], hour: 9, minute: 0 } }],
    ['שעה שלא קיימת', { schedule: { days: [1], hour: 24, minute: 0 } }],
    ['יותר מדי סבבים', { maxIterations: 13 }],
    ['צבע לא תקין', { color: 'red' }],
    ['מאמץ לא מוכר', { effort: 'max' }],
  ])('דוחה %s', (_name, over) => {
    expect(validateAgentDef(custom(over), false).ok).toBe(false)
  })

  it('חיפושים נספרים רק כשיש חיפוש ברשת', () => {
    const r = validateAgentDef(custom({ maxSearches: 5 }), false)
    expect(r.ok && r.value.maxSearches).toBe(0)
  })

  it('builtin נקבע בשרת, לא בגוף הבקשה', () => {
    const r = validateAgentDef(custom({ builtin: true }), false)
    expect(r.ok && r.value.builtin).toBe(false)
  })
})

describe('זריעה, שמירה וגרסאות', () => {
  it('הסוכנים המובנים נזרעים פעם אחת, ועריכה לא נדרסת בזריעה הבאה', () => {
    expect(listAgentDefs(HH).map((d) => d.id)).toEqual(['market', 'spending', 'research'])
    const market = getAgentDef(HH, 'market')!
    saveAgentDef(HH, { ...market, instructions: 'הנחיות חדשות' }, 'u_1', false)
    expect(listAgentDefs(HH)).toHaveLength(3)
    expect(getAgentDef(HH, 'market')!.instructions).toBe('הנחיות חדשות')
  })

  it('סוכן חדש נוסף אחרי המובנים, ומזהה כפול נדחה', () => {
    expect(saveAgentDef(HH, custom(), 'u_1', true).ok).toBe(true)
    expect(listAgentDefs(HH).at(-1)!.id).toBe('fx-watch')
    expect(saveAgentDef(HH, custom(), 'u_1', true)).toMatchObject({ ok: false, status: 400 })
  })

  it('כל שמירה היא גרסה, ושחזור נשמר כגרסה חדשה', () => {
    saveAgentDef(HH, custom(), 'u_1', true)
    saveAgentDef(HH, custom({ instructions: 'גרסה 2' }), 'u_1', false)
    const [v2, v1] = agentDefVersions(HH, 'fx-watch')
    expect(v2.def.instructions).toBe('גרסה 2')
    revertAgentDef(HH, 'fx-watch', v1.seq, 'u_1')
    expect(getAgentDef(HH, 'fx-watch')!.instructions).toBe('בדוק את שער הדולר מול השקל.')
    expect(agentDefVersions(HH, 'fx-watch')).toHaveLength(3)
  })

  it('מחיקת סוכן מובנה רק מכבה אותו; סוכן שנוצר במסך נמחק עם הזיכרון שלו', () => {
    deleteAgentDef(HH, 'research', 'u_1')
    expect(getAgentDef(HH, 'research')!.enabled).toBe(false)

    saveAgentDef(HH, custom(), 'u_1', true)
    saveAgentMemory(HH, 'fx-watch', 'הערה', 'סיבה', 'agent')
    deleteAgentDef(HH, 'fx-watch', 'u_1')
    expect(getAgentDef(HH, 'fx-watch')).toBeNull()
    expect(agentMemory(HH, 'fx-watch')).toBe('')
  })

  it('משקי בית לא רואים זה את הסוכנים של זה', () => {
    saveAgentDef(HH, custom(), 'u_1', true)
    expect(getAgentDef(OTHER, 'fx-watch')).toBeNull()
  })

  it('ההגדרות המובנות עוברות את הולידציה של עצמן', () => {
    for (const d of BUILTIN_DEFS) expect(validateAgentDef(d, true).ok).toBe(true)
  })
})

describe('זיכרון', () => {
  it('נשמר עם סיבה, מוגבל באורך, ומשוחזר', () => {
    listAgentDefs(HH)
    saveAgentMemory(HH, 'market', 'אינטל קרובה לסטופ', 'ריצה 1', 'agent')
    saveAgentMemory(HH, 'market', 'אינטל התרחקה', 'ריצה 2', 'agent')
    expect(saveAgentMemory(HH, 'market', 'א'.repeat(LIMITS.memory + 1), '', 'agent').ok).toBe(false)
    const versions = agentMemoryVersions(HH, 'market')
    expect(versions.map((v) => v.reason)).toEqual(['ריצה 2', 'ריצה 1'])
    revertAgentMemory(HH, 'market', versions[1].seq, 'u_1')
    expect(agentMemory(HH, 'market')).toBe('אינטל קרובה לסטופ')
  })

  it('לסוכן שלא קיים אין זיכרון', () => {
    expect(saveAgentMemory(HH, 'ghost', 'x', '', 'agent').ok).toBe(false)
  })
})

describe('התיק', () => {
  const portfolio = {
    benchmark: { name: 'S&P 500', symbol: '^GSPC' },
    holdings: [{ name: 'טבע', symbol: 'TEVA.TA', currency: 'ils', stop: 110, stopLimit: 108 }],
    watchlist: [{ name: 'Nasdaq-100', symbol: 'QQQ' }],
    rules: 'כללים',
  }

  it('מנרמל מטבע ודוחה סמל או סטופ לא תקינים', () => {
    const r = validatePortfolio(portfolio)
    expect(r.ok && r.value.holdings[0].currency).toBe('ILS')
    expect(validatePortfolio({ ...portfolio, holdings: [{ ...portfolio.holdings[0], symbol: 'TE VA' }] }).ok).toBe(false)
    expect(validatePortfolio({ ...portfolio, holdings: [{ ...portfolio.holdings[0], stop: -1 }] }).ok).toBe(false)
  })

  it('ייבוא מהקובץ רק כשאין תיק — עריכה במסך לא נדרסת', () => {
    expect(importPortfolio(HH, portfolio)).toMatchObject({ ok: true, imported: true })
    savePortfolio(HH, { ...portfolio, rules: 'נערך במסך' }, 'u_1')
    expect(importPortfolio(HH, portfolio)).toMatchObject({ ok: true, imported: false })
    expect(getPortfolio(HH)!.rules).toBe('נערך במסך')
  })
})

describe('קישור טלגרם', () => {
  it('רק הקוד התקף של משק הבית מקשר, ורק פעם אחת', () => {
    const { code } = startTelegramLink(HH, 'en')
    expect(completeTelegramLink(OTHER, code, 111, 'זר')).toBeNull()
    expect(completeTelegramLink(HH, 'WRONG1', 222, 'מישהו')).toBeNull()
    expect(completeTelegramLink(HH, code.toLowerCase(), 333, 'סער')).toMatchObject({ chatId: 333, lang: 'en' })
    expect(completeTelegramLink(HH, code, 444, 'שוב')).toBeNull()
    expect(telegramLink(HH)!.chatId).toBe(333)
  })

  it('קוד שפג תוקפו לא מקשר', () => {
    const { code } = startTelegramLink(HH, 'he')
    const later = new Date(Date.now() + 16 * 60_000)
    expect(completeTelegramLink(HH, code, 555, 'מאוחר', later)).toBeNull()
  })
})

describe('דוחות של סוכנים אחרים', () => {
  it('הריצה המוצלחת האחרונה של כל סוכן אחר, עם הממצאים, בלי הדגמות', () => {
    listAgentDefs(HH)
    recordAgentEvent(HH, { runId: 'm1', agent: 'market', type: 'done', text: 'ישן' })
    recordAgentEvent(HH, { runId: 'm2', agent: 'market', type: 'alert', text: 'סטופ קרוב' })
    recordAgentEvent(HH, { runId: 'm2', agent: 'market', type: 'done', text: 'חדש' })
    recordAgentEvent(HH, { runId: 's1', agent: 'spending', type: 'done', text: 'הוצאות' })
    recordAgentEvent(HH, { runId: 'd1', agent: 'research', type: 'done', text: 'הדגמה' }, true)
    const reports = latestReports(HH, 'spending')
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ agent: 'market', summary: 'חדש', findings: [{ severity: 'alert', text: 'סטופ קרוב' }] })
  })
})
