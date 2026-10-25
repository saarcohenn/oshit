/**
 * פענוח התשובה הסופית של סוכן לאירועים.
 *
 * הסוכן מסיים בפורמט קבוע (ראו REPORT_FORMAT), והמעטפת — לא המודל — הופכת
 * אותו לאירועים. כך לסוכן אין שום כלי שכותב משהו, גם לא ליומן של עצמו.
 *
 * אם המודל לא עמד בפורמט, כל הטקסט הופך לסיכום: עדיף סיכום לא מפורק מאשר
 * ממצא שנבלע בשקט.
 */

export const REPORT_FORMAT = `סיים את התשובה בדיוק בפורמט הזה, בעברית:

סיכום: <משפט או שניים>
ממצאים:
- [התראה] <משהו שדורש תשומת לב: סטופ קרוב, חריגה, פער>
- [מידע] <ממצא שכדאי לדעת>

אם אין ממצאים, כתוב "ממצאים:" ואחריו "- אין". אל תוסיף טקסט אחרי הרשימה.`

export interface ParsedReport {
  summary: string
  findings: Array<{ severity: 'alert' | 'info'; text: string }>
}

const MAX_FINDINGS = 8
const MAX_TEXT = 600

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s)

export function parseReport(text: string): ParsedReport {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const summaryLine = lines.find((l) => /^סיכום\s*:/.test(l))
  const findings: ParsedReport['findings'] = []

  for (const line of lines) {
    const m = line.match(/^[-•*]\s*\[(התראה|מידע)\]\s*(.+)$/)
    if (m && findings.length < MAX_FINDINGS) {
      findings.push({ severity: m[1] === 'התראה' ? 'alert' : 'info', text: clip(m[2].trim()) })
    }
  }

  if (!summaryLine) return { summary: clip(text.trim() || 'הסוכן סיים בלי סיכום'), findings }
  return { summary: clip(summaryLine.replace(/^סיכום\s*:\s*/, '').trim()), findings }
}
