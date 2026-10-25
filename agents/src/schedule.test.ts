import { describe, expect, it } from 'vitest'
import { isDue, wallClock, type Schedule } from './schedule.js'

// לוחות הזמנים של הסוכנים המובנים, כפי שהם נזרעים בשרת
const SCHEDULES: Record<string, Schedule> = {
  market: { days: [2, 3, 4, 5, 6], hour: 8, minute: 41 },
  spending: { days: [0, 1, 2, 3, 4, 5, 6], hour: 7, minute: 30 },
  research: { days: [0], hour: 8, minute: 22 },
}

describe('שעון ישראל', () => {
  it('שעון חורף: UTC+2', () => {
    // יום ראשון 4 בינואר 2026, 06:22 UTC
    expect(wallClock(new Date('2026-01-04T06:22:00Z'))).toEqual({ date: '2026-01-04', day: 0, hour: 8, minute: 22 })
  })

  it('שעון קיץ: UTC+3', () => {
    expect(wallClock(new Date('2026-07-05T05:22:00Z'))).toEqual({ date: '2026-07-05', day: 0, hour: 8, minute: 22 })
  })

  it('חצות בישראל הוא עדיין אתמול ב-UTC — התאריך לפי ישראל', () => {
    expect(wallClock(new Date('2026-01-03T22:30:00Z')).date).toBe('2026-01-04')
  })

  it('"08:41" נשאר 08:41 משני צדי המעבר לשעון חורף (25 באוקטובר 2026)', () => {
    // לפני המעבר UTC+3, אחריו UTC+2 — אותה שעת קיר, שעת UTC שונה
    expect(wallClock(new Date('2026-10-24T05:41:00Z'))).toMatchObject({ hour: 8, minute: 41 })
    expect(wallClock(new Date('2026-10-27T06:41:00Z'))).toMatchObject({ hour: 8, minute: 41 })
  })
})

describe('מתי מגיע תורו של סוכן', () => {
  const clock = (day: number, hour: number, minute: number, date = '2026-10-27') => ({ date, day, hour, minute })

  it('השוק רץ ג׳–ש׳ ולא בראשון או בשני', () => {
    expect(isDue(SCHEDULES.market, clock(2, 8, 41), undefined)).toBe(true)
    expect(isDue(SCHEDULES.market, clock(6, 8, 41), undefined)).toBe(true)
    expect(isDue(SCHEDULES.market, clock(0, 8, 41), undefined)).toBe(false)
    expect(isDue(SCHEDULES.market, clock(1, 8, 41), undefined)).toBe(false)
  })

  it('חלון של עשר דקות — לולאה מאוחרת עדיין תופסת', () => {
    expect(isDue(SCHEDULES.market, clock(2, 8, 40), undefined)).toBe(false)
    expect(isDue(SCHEDULES.market, clock(2, 8, 50), undefined)).toBe(true)
    expect(isDue(SCHEDULES.market, clock(2, 8, 51), undefined)).toBe(false)
  })

  it('לא רץ פעמיים באותו יום', () => {
    expect(isDue(SCHEDULES.spending, clock(2, 7, 31), '2026-10-27')).toBe(false)
    expect(isDue(SCHEDULES.spending, clock(3, 7, 31, '2026-10-28'), '2026-10-27')).toBe(true)
  })

  it('המחקר רק בראשון', () => {
    expect(isDue(SCHEDULES.research, clock(0, 8, 22, '2026-10-25'), undefined)).toBe(true)
    expect(isDue(SCHEDULES.research, clock(1, 8, 22), undefined)).toBe(false)
  })
})
