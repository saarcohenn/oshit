import { describe, expect, it } from 'vitest'
import { parseReport } from './report.js'

describe('פענוח הדוח הסופי', () => {
  it('מפרק סיכום וממצאים לפי חומרה', () => {
    const text = [
      'בדקתי את כל הנכסים.',
      '',
      'סיכום: השוק מעל ממוצע 200, אינטל קרובה לסטופ.',
      'ממצאים:',
      '- [התראה] אינטל 2.1% מעל הסטופ (0.6 ATR).',
      '- [מידע] S&P 7.4% מעל ממוצע 200.',
    ].join('\n')
    expect(parseReport(text)).toEqual({
      summary: 'השוק מעל ממוצע 200, אינטל קרובה לסטופ.',
      findings: [
        { severity: 'alert', text: 'אינטל 2.1% מעל הסטופ (0.6 ATR).' },
        { severity: 'info', text: 'S&P 7.4% מעל ממוצע 200.' },
      ],
    })
  })

  it('"- אין" אינו ממצא', () => {
    expect(parseReport('סיכום: הכול תקין.\nממצאים:\n- אין').findings).toEqual([])
  })

  it('מודל שלא עמד בפורמט — כל הטקסט הופך לסיכום, לא נבלע', () => {
    expect(parseReport('הכול נראה תקין היום.').summary).toBe('הכול נראה תקין היום.')
  })

  it('חוסם אורך ומספר ממצאים', () => {
    const many = Array.from({ length: 20 }, (_, i) => `- [מידע] ממצא ${i}`).join('\n')
    const r = parseReport(`סיכום: ${'א'.repeat(1000)}\nממצאים:\n${many}`)
    expect(r.findings).toHaveLength(8)
    expect(r.summary.length).toBeLessThanOrEqual(600)
  })
})
