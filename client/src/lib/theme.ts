export type Theme = 'light' | 'dark' | 'auto'

const KEY = 'oshit.theme'
const LEGACY_KEY = 'kaspit.theme'

export const THEME_LABEL: Record<Theme, string> = {
  light: 'בהיר',
  dark: 'כהה',
  auto: 'לפי המערכת',
}

export function loadTheme(): Theme {
  const saved = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
}

/**
 * מסמן את המצב על אלמנט השורש. במצב 'auto' הסימון מוסר לגמרי,
 * כך ששאילתת prefers-color-scheme חוזרת לשלוט.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  localStorage.setItem(KEY, theme)
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
}
