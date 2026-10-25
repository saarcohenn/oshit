import { describe, expect, it } from 'vitest'
import { parseReport } from './report.js'
import { addUsage, emptyUsage, roundUsd } from './pricing.js'
import type Anthropic from '@anthropic-ai/sdk'

describe('פענוח הדוח הסופי', () => {
  it('מפרק סיכום וממצאים לפי חומרה, בשתי השפות', () => {
    const text = [
      'בדקתי את כל הנכסים.',
      '',
      'סיכום: השוק מעל ממוצע 200, אינטל קרובה לסטופ. || EN: The market is above its MA200; Intel is near its stop.',
      'ממצאים:',
      '- [התראה] אינטל 2.1% מעל הסטופ (0.6 ATR). || EN: Intel is 2.1% above its stop (0.6 ATR).',
      '- [מידע] S&P 7.4% מעל ממוצע 200.',
    ].join('\n')
    expect(parseReport(text)).toEqual({
      summary: {
        text: 'השוק מעל ממוצע 200, אינטל קרובה לסטופ.',
        textEn: 'The market is above its MA200; Intel is near its stop.',
      },
      findings: [
        { severity: 'alert', text: 'אינטל 2.1% מעל הסטופ (0.6 ATR).', textEn: 'Intel is 2.1% above its stop (0.6 ATR).' },
        // שורה בלי אנגלית — המסך יציג עברית, לא ריק
        { severity: 'info', text: 'S&P 7.4% מעל ממוצע 200.', textEn: null },
      ],
    })
  })

  it('"- אין" אינו ממצא', () => {
    expect(parseReport('סיכום: הכול תקין. || EN: All good.\nממצאים:\n- אין').findings).toEqual([])
  })

  it('מודל שלא עמד בפורמט — כל הטקסט הופך לסיכום, לא נבלע', () => {
    expect(parseReport('הכול נראה תקין היום.').summary).toEqual({ text: 'הכול נראה תקין היום.', textEn: null })
  })

  it('חוסם אורך ומספר ממצאים', () => {
    const many = Array.from({ length: 20 }, (_, i) => `- [מידע] ממצא ${i} || EN: finding ${i}`).join('\n')
    const r = parseReport(`סיכום: ${'א'.repeat(1000)} || EN: ${'a'.repeat(1000)}\nממצאים:\n${many}`)
    expect(r.findings).toHaveLength(8)
    expect(r.summary.text.length).toBeLessThanOrEqual(600)
    expect(r.summary.textEn!.length).toBeLessThanOrEqual(600)
  })
})

describe('תמחור ריצה', () => {
  const usage = (u: Partial<Anthropic.Beta.BetaUsage>) => ({ input_tokens: 0, output_tokens: 0, ...u }) as Anthropic.Beta.BetaUsage

  it('Opus 5.5: קלט, פלט, מטמון וחיפושים', () => {
    const t = emptyUsage('claude-opus-5-5')
    addUsage(
      t,
      'claude-opus-5-5',
      usage({
        input_tokens: 10_000,
        output_tokens: 2_000,
        cache_read_input_tokens: 20_000,
        cache_creation_input_tokens: 4_000,
        server_tool_use: { web_search_requests: 3, web_fetch_requests: 0 },
      }),
    )
    // 10k×4 + 4k×5 + 20k×0.2 + 2k×20 = 40k+20k+4k+40k = 104k מיליוניות → 0.104, ועוד 3 חיפושים
    expect(roundUsd(t.costUsd)).toBe(0.134)
    expect(t).toMatchObject({ input: 34_000, output: 2_000, cacheRead: 20_000, cacheWrite: 4_000, searches: 3 })
  })

  it('כתיבה למטמון של שעה עולה פי 2', () => {
    const t = emptyUsage('claude-sonnet-5-5')
    addUsage(
      t,
      'claude-sonnet-5-5',
      usage({ cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 } }),
    )
    expect(roundUsd(t.costUsd)).toBe(4)
  })

  it('Haiku 5.5 מעל 100 אלף טוקני קלט מתומחר מחדש', () => {
    const short = emptyUsage('claude-haiku-5-5')
    addUsage(short, 'claude-haiku-5-5', usage({ input_tokens: 100_000 }))
    const long = emptyUsage('claude-haiku-5-5')
    addUsage(long, 'claude-haiku-5-5', usage({ input_tokens: 200_000 }))
    expect(roundUsd(short.costUsd)).toBe(0.01)
    expect(roundUsd(long.costUsd)).toBe(0.1)
  })

  it('מודל לא מוכר (חלופי אחרי סירוב) מתומחר כמו Opus 5.5 — לא אפס', () => {
    const t = emptyUsage('claude-opus-5-5')
    addUsage(t, 'claude-opus-4-8', usage({ output_tokens: 1_000_000 }))
    expect(t.costUsd).toBe(20)
    expect(t.model).toBe('claude-opus-4-8')
  })
})
