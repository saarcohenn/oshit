/**
 * מחזור חיוב.
 *
 * חודש קלנדרי אינו בהכרח המחזור הכלכלי של משק הבית: אם כרטיס האשראי נגבה
 * ב-10 לחודש, כל מה שקרה בין ה-10 לחודש הבא שייך לאותה "משכורת" ולאותו תקציב.
 * חיתוך ב-1 לחודש מפצל את התקופה הזו לשניים ומעוות כל השוואה.
 *
 * יום 1 מחזיר בדיוק את החודש הקלנדרי, כך שההתנהגות ההיסטורית נשמרת
 * כברירת מחדל.
 *
 * המצב מוחזק ברמת המודול ולא מועבר בכל קריאה: הלקוח מציג משק בית אחד
 * בכל רגע נתון, וחוט של פרמטר דרך עשרות פונקציות ניתוח היה מרעיש בלי להוסיף.
 */
let cycleStartDay = 1

export function setCycleStartDay(day: number): void {
  const n = Math.round(Number(day) || 1)
  // 28 הוא הגבול הבטוח — יום 29–31 אינו קיים בכל חודש
  cycleStartDay = Math.min(28, Math.max(1, n))
}

export function getCycleStartDay(): number {
  return cycleStartDay
}

/**
 * המחזור שאליו שייך תאריך.
 * המחזור נקרא על שם החודש שבו הוא נפתח: עם יום התחלה 10,
 * ה-5 באוגוסט שייך למחזור יולי, וה-12 באוגוסט למחזור אוגוסט.
 */
export function cycleMonth(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m) return isoDate.slice(0, 7)
  if (cycleStartDay <= 1 || (d ?? 1) >= cycleStartDay) {
    return `${y}-${String(m).padStart(2, '0')}`
  }
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  return `${prev.y}-${String(prev.m).padStart(2, '0')}`
}

/** '2026-08' => '10.08.26 – 09.09.26' — לתיאור טווח המחזור למשתמש */
export function cycleRangeLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  if (cycleStartDay <= 1) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const endMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  const endDay = cycleStartDay - 1
  return `${pad(cycleStartDay)}.${pad(m)}.${String(y).slice(2)} – ${pad(endDay)}.${pad(endMonth.m)}.${String(endMonth.y).slice(2)}`
}
