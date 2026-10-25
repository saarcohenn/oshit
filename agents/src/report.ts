/**
 * פענוח התשובה הסופית של סוכן לאירועים.
 *
 * הסוכן מסיים בפורמט קבוע (ראו REPORT_FORMAT), והמעטפת — לא המודל — הופכת
 * אותו לאירועים. כך לסוכן אין שום כלי שכותב משהו, גם לא ליומן של עצמו.
 *
 * כל שורה בשתי שפות, כדי שהמסך באנגלית יציג אנגלית. פלט מובנה (JSON schema)
 * היה אמין יותר, אבל הוא נדחה עם 400 כשיש ציטוטים — וחיפוש ברשת תמיד מצטט.
 *
 * אם המודל לא עמד בפורמט, כל הטקסט הופך לסיכום: עדיף סיכום לא מפורק מאשר
 * ממצא שנבלע בשקט.
 */

export const REPORT_FORMAT = `סיים את התשובה בדיוק בפורמט הזה. כל שורה בעברית, ואחרי " || EN: " אותו תוכן באנגלית:

סיכום: <משפט או שניים> || EN: <the same in English>
ממצאים:
- [התראה] <משהו שדורש תשומת לב: סטופ קרוב, חריגה, פער> || EN: <the same in English>
- [מידע] <ממצא שכדאי לדעת> || EN: <the same in English>

אם אין ממצאים, כתוב "ממצאים:" ואחריו "- אין". אל תוסיף טקסט אחרי הרשימה.`

export interface Bilingual {
  text: string
  /** ‏null — המודל לא כתב אנגלית לשורה הזו; המסך יציג את העברית */
  textEn: string | null
}

export interface ParsedReport {
  summary: Bilingual
  findings: Array<{ severity: 'alert' | 'info' } & Bilingual>
}

const MAX_FINDINGS = 8
const MAX_TEXT = 600
const SEPARATOR = /\s*\|\|\s*EN\s*:\s*/i

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s)

function split(raw: string): Bilingual {
  const [he, en] = raw.split(SEPARATOR, 2)
  return { text: clip(he.trim()), textEn: en?.trim() ? clip(en.trim()) : null }
}

export function parseReport(text: string): ParsedReport {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const summaryLine = lines.find((l) => /^סיכום\s*:/.test(l))
  const findings: ParsedReport['findings'] = []

  for (const line of lines) {
    const m = line.match(/^[-•*]\s*\[(התראה|מידע)\]\s*(.+)$/)
    if (m && findings.length < MAX_FINDINGS) {
      findings.push({ severity: m[1] === 'התראה' ? 'alert' : 'info', ...split(m[2]) })
    }
  }

  if (!summaryLine) return { summary: { text: clip(text.trim() || 'הסוכן סיים בלי סיכום'), textEn: null }, findings }
  return { summary: split(summaryLine.replace(/^סיכום\s*:\s*/, '')), findings }
}
