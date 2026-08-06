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
const VERSION = 'oshit-v1'
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
      .then((cache) => cache.addAll(PRECACHE))
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy))
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
        // רק תשובות תקינות מאותו מקור נכנסות למטמון
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
