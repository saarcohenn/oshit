/**
 * רישום ה-service worker ועדכון צבע סרגל המערכת לפי מצב התצוגה.
 * נרשם רק בבנייה לייצור — בפיתוח הוא היה מגיש קבצים מהמטמון ומסתיר שינויים.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('רישום ה-service worker נכשל', err)
    })
  })
}

/** מסנכרן את theme-color עם הרקע בפועל, כדי שסרגל המערכת בנייד יתאים */
export function syncThemeColor(): void {
  const apply = () => {
    const bg = getComputedStyle(document.body).backgroundColor
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    if (bg) meta.content = bg
  }

  apply()
  // מצב 'auto' משתנה יחד עם הגדרת המערכת, ולכן צריך להאזין גם לה
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', () => requestAnimationFrame(apply))
  new MutationObserver(() => requestAnimationFrame(apply)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}
