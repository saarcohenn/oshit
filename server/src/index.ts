import { join } from 'node:path'
import { app } from './app.js'
import { purgeExpiredSessions } from './auth.js'
import { userCount } from './users.js'

const PORT = Number(process.env.PORT ?? 8080)

purgeExpiredSessions()
setInterval(purgeExpiredSessions, 6 * 60 * 60_000).unref()

app.listen(PORT, () => {
  console.log(`Osh.it server → http://localhost:${PORT}`)
  console.log(`נתונים נשמרים ב-${process.env.DATA_DIR ?? join(process.cwd(), 'data')}`)
  if (userCount() === 0) console.log('אין עדיין חשבון — הכניסה הראשונה תיצור אותו')
})
