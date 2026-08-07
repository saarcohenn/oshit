/**
 * Service worker של Osh.it.
 *
 * האפליקציה עובדת כולה בצד הלקוח, ולכן די באסטרטגיה פשוטה:
 * ניווטים מקבלים רשת-קודם עם נפילה למטמון (כדי שגרסה חדשה תיטען מיד כשיש רשת,
 * והאפליקציה תמשיך לעבוד לגמרי אופליין כשאין), ונכסים סטטיים מקבלים מטמון-קודם.
 *
 * שום בקשה אינה נשלחת לשרת חיצוני ושום נתון פיננסי אינו נשמר כאן —
 * הנתונים חיים ב-localStorage בלבד.
 */
const VERSION = 'oshit-v2'
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        /*
         * כל נכס נשמר בנפרד ובאופן סלחני. addAll נכשל כולו אם משאב אחד
         * נכשל, ומאחורי שער הזדהות די בהפניה אחת לדף התחברות כדי שה-service
         * worker לא יותקן בכלל — והאפליקציה תישאר בלי מצב אופליין.
         */
        await Promise.all(
          PRECACHE.map(async (url) => {
            try {
              const response = await fetch(url, { credentials: 'same-origin' })
              if (isCacheable(response)) await cache.put(url, response)
            } catch {
              // נכס בודד שלא נשמר אינו סיבה להפיל את ההתקנה
            }
          }),
        )
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/**
 * רק תשובה תקינה, מאותו מקור, ושלא עברה הפניה.
 * הפניה מסגירה שער הזדהות שהחזיר דף התחברות במקום את המשאב המבוקש.
 */
function isCacheable(response) {
  return response.ok && response.type === 'basic' && !response.redirected
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // מאחורי שער הזדהות, תשובה לניווט יכולה להיות דף התחברות או הפניה
          // לדומיין אחר. שמירה שלה במטמון הייתה מגישה את דף ההתחברות
          // לצמיתות, גם אחרי התחברות מוצלחת.
          if (isCacheable(response)) {
            const copy = response.clone()
            caches.open(VERSION).then((cache) => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? caches.match('/'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (isCacheable(response)) {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
