import { describe, expect, it } from 'vitest'
import { atr, parseYahooChart, sma, snapshot, type Bar, type PriceSeries } from './indicators.js'
import { flagsFor, holdingSnapshot, screen } from './agents/market.js'

const bar = (i: number, close: number, range = 2): Bar => ({
  date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  open: close,
  high: close + range / 2,
  low: close - range / 2,
  close,
})

describe('פענוח תשובת Yahoo', () => {
  // 2026-10-21 ו-22 בשעון ישראל (‎+3), ונר חי שני לאותו 22 בסוף
  const chart = (currency: string, close: (number | null)[], gmtoffset = 10_800) => ({
    chart: {
      result: [
        {
          meta: { currency, gmtoffset },
          timestamp: [1792562400, 1792648800, 1792735200, 1792652400],
          indicators: {
            quote: [{ open: close, high: close.map((c) => (c == null ? null : c + 10)), low: close, close }],
          },
        },
      ],
      error: null,
    },
  })

  it('ממיר אגורות לשקלים — הסטופים בקובץ התיק בשקלים', () => {
    const s = parseYahooChart(chart('ILA', [11000, 11200, null, 11300]), 'TEVA.TA')
    expect(s.currency).toBe('ILS')
    expect(s.bars.map((b) => [b.date, b.close])).toEqual([
      ['2026-10-21', 110],
      ['2026-10-22', 113],
    ])
  })

  it('יום עם מחיר חסר או אפס נזרק, ונר כפול לאותו תאריך — האחרון מנצח', () => {
    const s = parseYahooChart(chart('USD', [20, 0, 21, 22]), 'INTC')
    expect(s.currency).toBe('USD')
    expect(s.bars.map((b) => [b.date, b.close])).toEqual([
      ['2026-10-21', 20],
      ['2026-10-22', 22],
      ['2026-10-23', 21],
    ])
  })

  it('התאריך לפי שעון הבורסה ולא UTC', () => {
    // 00:30 בטוקיו הוא עדיין היום הקודם ב-UTC
    const s = parseYahooChart(
      { chart: { result: [{ meta: { currency: 'JPY', gmtoffset: 32_400 }, timestamp: [1792596600], indicators: { quote: [{ open: [1], high: [1], low: [1], close: [1] }] } }] } },
      '^N225',
    )
    expect(s.bars[0].date).toBe('2026-10-22')
  })

  it('תשובה בלי סדרה נכשלת במפורש, עם ההסבר של Yahoo', () => {
    expect(() => parseYahooChart({ chart: { result: null, error: { description: 'symbol may be delisted' } } }, 'X')).toThrow(
      /X: symbol may be delisted/,
    )
    expect(() => parseYahooChart('<html>', 'X')).toThrow(/X:/)
  })
})

describe('ממוצע נע', () => {
  it('ממוצע של n הסגירות האחרונות', () => {
    const bars = [1, 2, 3, 4, 5].map((c, i) => bar(i, c))
    expect(sma(bars, 3)).toBe(4)
  })

  it('בלי מספיק נתונים — null ולא ממוצע חלקי', () => {
    expect(sma([bar(0, 1)], 3)).toBeNull()
  })
})

describe('ATR', () => {
  it('טווח קבוע נותן ATR שווה לטווח', () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100, 4))
    expect(atr(bars, 14)).toBeCloseTo(4)
  })

  it('פער פתיחה נכנס לטווח האמיתי דרך הסגירה הקודמת', () => {
    // סגירה ב-100, ואז יום שכולו בין 110 ל-112: הטווח האמיתי 12 ולא 2
    const bars = [bar(0, 100, 2), { date: '2026-01-02', open: 111, high: 112, low: 110, close: 111 }]
    expect(atr(bars, 1)).toBe(12)
  })

  it('בלי מספיק נתונים — null', () => {
    expect(atr([bar(0, 1), bar(1, 1)], 14)).toBeNull()
  })
})

describe('תמונת מצב ודגלים', () => {
  // 200 ימים של עלייה מ-50 ל-249, ואז ירידה חדה
  const rising = Array.from({ length: 200 }, (_, i) => bar(i, 50 + i))

  it('מחשב מרחק מהממוצע ומהסטופ', () => {
    const s = snapshot('x.us', 'X', rising, 240)
    expect(s.close).toBe(249)
    expect(s.ma200).toBe(149.5)
    expect(s.ma50AboveMa200).toBe(true)
    expect(s.stop?.distancePct).toBe(3.75)
    expect(s.stop?.distanceAtr).toBeGreaterThan(0)
  })

  it('מסמן קרבה לסטופ באחוזים', () => {
    expect(flagsFor(snapshot('x.us', 'X', rising, 245))).toContain('קרוב לסטופ')
    expect(flagsFor(snapshot('x.us', 'X', rising, 200))).not.toContain('קרוב לסטופ')
  })

  it('מסמן סגירה מתחת לסטופ ומתחת לממוצע 200', () => {
    const crashed = [...rising, bar(200, 100)]
    const flags = flagsFor(snapshot('x.us', 'X', crashed, 120))
    expect(flags).toContain('הסגירה האחרונה בסטופ או מתחתיו')
    expect(flags).toContain('מתחת לממוצע 200')
  })

  it('היסטוריה קצרה מסומנת ולא מנוחשת', () => {
    const s = snapshot('x.us', 'X', rising.slice(0, 60))
    expect(s.ma200).toBeNull()
    expect(flagsFor(s)).toContain('אין מספיק היסטוריה לממוצע 200')
  })
})

describe('סטופ במטבע אחר', () => {
  const rising = Array.from({ length: 200 }, (_, i) => bar(i, 50 + i))

  it('לא מושווה, ומסומן במפורש', () => {
    const h = holdingSnapshot({ name: 'טבע', symbol: 'TEVA', currency: 'ILS', stop: 110 }, { currency: 'USD', bars: rising })
    expect(h.stop).toBeUndefined()
    expect(h.flags.some((f) => f.includes('הסטופ לא נבדק'))).toBe(true)
  })

  it('באותו מטבע — מושווה', () => {
    const h = holdingSnapshot({ name: 'X', symbol: 'X', currency: 'USD', stop: 240 }, { currency: 'USD', bars: rising })
    expect(h.stop?.distancePct).toBe(3.75)
  })
})

describe('סריקת רשימת המעקב', () => {
  const series = (closes: number[]): PromiseSettledResult<PriceSeries> => ({
    status: 'fulfilled',
    value: { currency: 'USD', bars: closes.map((c, i) => bar(i, c)) },
  })
  const up = (end: number) => Array.from({ length: 200 }, (_, i) => 50 + (i * (end - 50)) / 199)

  it('מפריד לפי התנאים הטכניים וממיין לפי המרחק מעל ממוצע 200', () => {
    const result = screen(
      [
        { name: 'מתון', symbol: 'A' },
        { name: 'חזק', symbol: 'B' },
        { name: 'נפל', symbol: 'C' },
        { name: 'שבור', symbol: 'D' },
      ],
      [series(up(120)), series(up(300)), series([...up(200), 60]), { status: 'rejected', reason: new Error('D: אין נתונים') }],
    )
    expect(result.passing.map((r) => r.symbol)).toEqual(['B', 'A'])
    expect(result.notPassing.map((r) => [r.symbol, r.aboveMa200])).toEqual([['C', false]])
    expect(result.errors).toEqual([{ name: 'שבור', symbol: 'D', error: 'D: אין נתונים' }])
  })
})
