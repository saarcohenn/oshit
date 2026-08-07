import { useEffect, useRef } from 'react'
import type { Household } from '../lib/api'
import { THEME_LABEL, type Theme } from '../lib/theme'
import {
  IconAuto,
  IconBrand,
  IconClose,
  IconMoon,
  IconPlus,
  IconSun,
} from './Icons'

export interface DrawerTab<T extends string> {
  id: T
  label: string
  Icon: (p: { size?: number }) => JSX.Element
}

interface Props<T extends string> {
  open: boolean
  onClose: () => void

  groups: Array<{ title: string; tabs: DrawerTab<T>[] }>
  activeTab: T
  onSelectTab: (id: T) => void

  households: Household[]
  activeHouseholdId: string | null
  onSwitchHousehold: (id: string) => void
  onCreateHousehold: (name: string, emoji: string) => void
  onRenameHousehold: (id: string, name: string, emoji: string) => void
  onDeleteHousehold: (id: string) => void

  theme: Theme
  onSetTheme: (t: Theme) => void
}

const THEMES: Array<{ id: Theme; Icon: (p: { size?: number }) => JSX.Element }> = [
  { id: 'light', Icon: IconSun },
  { id: 'dark', Icon: IconMoon },
  { id: 'auto', Icon: IconAuto },
]

/**
 * מגירת הניווט.
 *
 * הכול שהיה קודם פרוס על שלוש שורות בכותרת יושב כאן: הלשוניות, משקי הבית
 * ומצב התצוגה. הכותרת נשארת עם שורה אחת, וזה מרוויח גובה אמיתי בנייד.
 */
export default function AppDrawer<T extends string>({
  open,
  onClose,
  groups,
  activeTab,
  onSelectTab,
  households,
  activeHouseholdId,
  onSwitchHousehold,
  onCreateHousehold,
  onRenameHousehold,
  onDeleteHousehold,
  theme,
  onSetTheme,
}: Props<T>) {
  const panelRef = useRef<HTMLDivElement>(null)

  // סגירה ב-Escape, ונעילת גלילת הרקע כל עוד המגירה פתוחה
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  function create() {
    const name = prompt('שם משק הבית החדש:', 'משק בית נוסף')
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) return
    const emoji = prompt('אימוג׳י (אפשר להשאיר ריק):', '🏡') ?? '🏡'
    onCreateHousehold(trimmed, emoji.trim() || '🏡')
  }

  function rename(h: Household) {
    const name = prompt('שם משק הבית:', h.name)
    if (name === null) return
    const emoji = prompt('אימוג׳י:', h.emoji) ?? h.emoji
    onRenameHousehold(h.id, name.trim() || h.name, emoji.trim() || h.emoji)
  }

  function remove(h: Household) {
    const typed = prompt(
      `מחיקת "${h.name}" תמחק לצמיתות את כל העסקאות, הקטגוריות והיעדים שלו.\n` +
        `אין דרך לשחזר. כדי לאשר, הקלידו את שם משק הבית:`,
    )
    if (typed === null) return
    if (typed.trim() !== h.name) {
      alert('השם לא תואם — לא נמחק דבר.')
      return
    }
    onDeleteHousehold(h.id)
  }

  return (
    <>
      <div
        className={`drawer-scrim ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="תפריט ראשי"
        aria-hidden={!open}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="drawer-head">
          <span className="logo-mark" aria-hidden>
            <IconBrand size={20} />
          </span>
          <div className="logo-text">
            <b>
              Osh<span className="dot">.</span>it
            </b>
            <small>לאן הלך העו״ש</small>
          </div>
          <button className="icon-btn sm spacer" onClick={onClose} aria-label="סגירת התפריט">
            <IconClose size={17} />
          </button>
        </div>

        <nav className="drawer-nav" aria-label="ניווט ראשי">
          {groups.map((group) => (
            <div className="drawer-group" key={group.title}>
              <div className="drawer-group-title">{group.title}</div>
              {group.tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`drawer-item ${activeTab === id ? 'active' : ''}`}
                  aria-current={activeTab === id ? 'page' : undefined}
                  onClick={() => {
                    onSelectTab(id)
                    onClose()
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="drawer-section">
          <div className="drawer-group-title">משקי בית</div>
          {households.map((h) => (
            <div className="drawer-household" key={h.id}>
              <button
                className={`drawer-item ${h.id === activeHouseholdId ? 'active' : ''}`}
                onClick={() => {
                  if (h.id !== activeHouseholdId) onSwitchHousehold(h.id)
                  onClose()
                }}
              >
                <span aria-hidden>{h.emoji}</span>
                <span className="grow">{h.name}</span>
                <span className="dim tiny">{h.transactionCount}</span>
              </button>
              <div className="drawer-household-actions">
                <button className="link-btn" onClick={() => rename(h)}>
                  שינוי שם
                </button>
                {households.length > 1 && (
                  <button className="link-btn danger-link" onClick={() => remove(h)}>
                    מחיקה
                  </button>
                )}
              </div>
            </div>
          ))}
          <button className="drawer-item ghost" onClick={create}>
            <IconPlus size={17} />
            <span>משק בית חדש</span>
          </button>
        </div>

        <div className="drawer-foot">
          <div className="drawer-group-title">מצב תצוגה</div>
          <div className="theme-switch" role="group" aria-label="מצב תצוגה">
            {THEMES.map(({ id, Icon }) => (
              <button
                key={id}
                className={theme === id ? 'on' : ''}
                onClick={() => onSetTheme(id)}
                aria-pressed={theme === id}
                title={THEME_LABEL[id]}
              >
                <Icon size={16} />
                <span>{THEME_LABEL[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
