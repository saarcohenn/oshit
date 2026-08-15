import { useSyncExternalStore } from 'react'
import { EN } from './translations'

export type Lang = 'he' | 'en'

const STORAGE_KEY = 'oshit.lang'

/** עברית היא ברירת המחדל: זו השפה שהאפליקציה נכתבה בה ושבה מגיעים קבצי הבנק */
const DEFAULT_LANG: Lang = 'he'

export const LANGS: Array<{ id: Lang; label: string; dir: 'rtl' | 'ltr' }> = [
  { id: 'he', label: 'עברית', dir: 'rtl' },
  { id: 'en', label: 'English', dir: 'ltr' },
]

const dirOf = (lang: Lang) => (lang === 'he' ? 'rtl' : 'ltr')

function load(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'he' || saved === 'en') return saved
  } catch {
    // דפדפן שחוסם אחסון מקומי — ברירת המחדל עדיין תקפה
  }
  return DEFAULT_LANG
}

let current: Lang = load()
const listeners = new Set<() => void>()

export const getLang = (): Lang => current

/**
 * מחיל את השפה על מסמך ה-HTML.
 *
 * הכיווניות אינה עניין של עיצוב בלבד: היא משנה את משמעותן של תכונות
 * ה-CSS הלוגיות שכל הפריסה בנויה עליהן, ולכן די בהחלפת dir כדי שהמסך
 * כולו יתהפך בלי גיליון סגנונות שני.
 */
export function applyLang(lang: Lang) {
  current = lang
  const root = document.documentElement
  root.lang = lang
  root.dir = dirOf(lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // אחסון חסום — הבחירה תקפה עד לרענון
  }
  for (const listener of listeners) listener()
}

export function setLang(lang: Lang) {
  if (lang === current) return
  applyLang(lang)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** קורא את השפה הפעילה ומרנדר מחדש כשהיא מתחלפת */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => DEFAULT_LANG)
}

/**
 * מתרגם מחרוזת.
 *
 * המפתח הוא הטקסט העברי עצמו ולא מזהה מומצא. זה מוותר על שכבת שמות שאיש
 * אינו זוכר, ומשאיר את הקוד קריא בשפה שהוא נכתב בה. מחרוזת שאין לה תרגום
 * חוזרת כמות שהיא, ולכן תרגום חלקי מציג עברית במקום מפתח שבור.
 */
export function tr(hebrew: string): string {
  if (current === 'he') return hebrew
  return EN[hebrew] ?? hebrew
}

/** גרסת תבנית: trf('נמצאו {n} עסקאות', { n: 12 }) */
export function trf(hebrew: string, vars: Record<string, string | number>): string {
  return tr(hebrew).replace(/\{(\w+)\}/g, (whole, key) =>
    key in vars ? String(vars[key]) : whole,
  )
}
