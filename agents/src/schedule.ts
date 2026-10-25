/**
 * מתי כל סוכן רץ — לפי שעון ישראל, בלי ספריית זמנים.
 *
 * ההשוואה היא לשעת הקיר (שעה:דקה) ולא לחותמת זמן מחושבת מראש, ולכן מעבר
 * לשעון קיץ לא מזיז ריצה: "08:41" נשאר 08:41 בשני הצדדים של המעבר.
 */

import type { AgentId } from './oshit.js'

export interface Schedule {
  /** ימי השבוע לפי getDay: 0 ראשון … 6 שבת */
  days: number[]
  hour: number
  minute: number
}

export interface WallClock {
  /** YYYY-MM-DD בשעון המקומי */
  date: string
  day: number
  hour: number
  minute: number
}

/**
 * לפי האיפיון: שוק ג׳–ש׳ 08:41 (אחרי נעילת וול סטריט של הלילה), הוצאות כל
 * יום 07:30, מחקר א׳ 08:22.
 */
export const SCHEDULES: Record<AgentId, Schedule> = {
  market: { days: [2, 3, 4, 5, 6], hour: 8, minute: 41 },
  spending: { days: [0, 1, 2, 3, 4, 5, 6], hour: 7, minute: 30 },
  research: { days: [0], hour: 8, minute: 22 },
}

const ZONE = 'Asia/Jerusalem'

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** השעה בישראל עכשיו, בלי קשר לאזור הזמן של הקונטיינר (שהוא בדרך כלל UTC) */
export function wallClock(now: Date = new Date(), zone = ZONE): WallClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: WEEKDAY[parts.weekday],
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

/**
 * האם הגיע הזמן להריץ.
 *
 * חלון של כמה דקות ולא דקה מדויקת: הלולאה בודקת כל 30 שניות, ומשימה ארוכה
 * של סוכן אחר עלולה לעכב אותה מעבר לדקה. הסימון "רץ היום" מונע ריצה כפולה.
 */
export function isDue(schedule: Schedule, clock: WallClock, lastRunDate: string | undefined, graceMinutes = 10): boolean {
  if (!schedule.days.includes(clock.day)) return false
  if (lastRunDate === clock.date) return false
  const now = clock.hour * 60 + clock.minute
  const at = schedule.hour * 60 + schedule.minute
  return now >= at && now < at + graceMinutes
}
