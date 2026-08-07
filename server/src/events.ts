import type { Response } from 'express'

/**
 * שידור חי של שינויים למכשירים המחוברים.
 *
 * Server-Sent Events ולא WebSocket: התקשורת חד-כיוונית מטבעה (השרת מודיע
 * "מישהו שינה, גרסה N"), הכתיבה ממילא עוברת ב-HTTP רגיל, וזרם SSE עובר
 * דרך reverse proxy בלי הגדרות שדרוג פרוטוקול. הדפדפן גם מחבר מחדש לבד.
 */
interface Client {
  res: Response
  /** מזהה המכשיר, כדי שלא נעיר אותו על כתיבה שהוא עצמו ביצע */
  clientId: string
}

const rooms = new Map<string, Set<Client>>()

/** משך ההמתנה בין פעימות. פרוקסי רבים סוגרים חיבור שקט אחרי דקה */
const HEARTBEAT_MS = 25_000

export function subscribe(householdId: string, clientId: string, res: Response): () => void {
  const room = rooms.get(householdId) ?? new Set<Client>()
  const client: Client = { res, clientId }
  room.add(client)
  rooms.set(householdId, room)

  const heartbeat = setInterval(() => {
    // הערה בפרוטוקול SSE — מחזיקה את החיבור בלי לייצר אירוע בצד הלקוח
    res.write(': ping\n\n')
  }, HEARTBEAT_MS)

  return () => {
    clearInterval(heartbeat)
    room.delete(client)
    if (room.size === 0) rooms.delete(householdId)
  }
}

/** מודיע לכל המכשירים של משק הבית שיש גרסה חדשה, חוץ מזה שכתב אותה */
export function broadcastVersion(householdId: string, version: number, originClientId?: string) {
  const room = rooms.get(householdId)
  if (!room) return
  const payload = `event: state\ndata: ${JSON.stringify({ version })}\n\n`
  for (const client of room) {
    if (originClientId && client.clientId === originClientId) continue
    try {
      client.res.write(payload)
    } catch {
      // חיבור שנסגר יטופל ב-close handler שלו
    }
  }
}

export function connectedCount(householdId: string): number {
  return rooms.get(householdId)?.size ?? 0
}
