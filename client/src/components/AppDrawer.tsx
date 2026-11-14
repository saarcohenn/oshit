// ‎@types/react‎ 19 הסיר את מרחב השמות הגלובלי JSX, והוא מיובא מפורשות
import { useEffect, useRef, type JSX } from 'react'
import type { AuthUser, Household } from '../lib/api'
import { THEME_LABEL, type Theme } from '../lib/theme'
import { LANGS, setLang, tr, trf, useLang } from '../lib/i18n'
import { KIND_LABEL, ROLE_LABEL } from '../lib/households'
import { HouseholdTile } from './HouseholdSwitcher'
import {
  IconAuto,
  IconBrandOutline,
  IconCheck,
  IconClose,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
  IconUser,
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
  /** פותח את חלון "משק בית חדש" */
  onCreateHousehold: () => void
  /** פותח את מסך ההגדרות — ניהול משקי בית, חברים והרשאות */
  onOpenSettings: () => void

  user: AuthUser | null
  onLogout: () => void

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
  onOpenSettings,
  user,
  onLogout,
  theme,
  onSetTheme,
}: Props<T>) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lang = useLang()

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
        aria-label={tr('תפריט ראשי')}
        aria-hidden={!open}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="drawer-head">
          <span className="logo-mark" aria-hidden>
            <IconBrandOutline size={32} />
          </span>
          <div className="logo-text">
            <b>
              Osh<span className="dot">.</span>it
            </b>
            <small>{tr('לאן הלך העו״ש')}</small>
          </div>
          <button className="icon-btn sm spacer" onClick={onClose} aria-label={tr('סגירת התפריט')}>
            <IconClose size={17} />
          </button>
        </div>

        <nav className="drawer-nav" aria-label={tr('ניווט ראשי')}>
          {groups.map((group) => (
            <div className="drawer-group" key={tr(group.title)}>
              <div className="drawer-group-title">{tr(group.title)}</div>
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
                  <span>{tr(label)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="drawer-section">
          <div className="drawer-group-title">{tr('משקי בית')}</div>
          {households.map((h) => (
            <button
              key={h.id}
              className={`drawer-item drawer-household-item ${h.id === activeHouseholdId ? 'active' : ''}`}
              aria-current={h.id === activeHouseholdId ? 'true' : undefined}
              onClick={() => {
                if (h.id !== activeHouseholdId) onSwitchHousehold(h.id)
                onClose()
              }}
            >
              <HouseholdTile household={h} size={30} />
              <span className="grow drawer-household-text">
                <span>{h.name}</span>
                <small className="dim">
                  {tr(KIND_LABEL[h.kind])} · {tr(ROLE_LABEL[h.role])}
                  {h.memberCount > 1 ? ` · ${trf('{n} אנשים', { n: h.memberCount })}` : ''}
                </small>
              </span>
              {h.id === activeHouseholdId && <IconCheck size={16} />}
            </button>
          ))}
          <button
            className="drawer-item ghost"
            onClick={() => {
              onClose()
              onCreateHousehold()
            }}
          >
            <IconPlus size={17} />
            <span>{tr('משק בית חדש')}</span>
          </button>
          <button
            className="drawer-item ghost"
            onClick={() => {
              onClose()
              onOpenSettings()
            }}
          >
            <IconSettings size={17} />
            <span>{tr('הגדרות, חברים והרשאות')}</span>
          </button>
        </div>

        <div className="drawer-foot">
          {user && (
            <div className="drawer-user">
              <span className="drawer-user-avatar" aria-hidden>
                <IconUser size={16} />
              </span>
              <div className="drawer-user-who">
                <b>{user.name}</b>
                <small className="dim" dir="ltr">
                  {user.email}
                </small>
              </div>
              <button className="icon-btn sm" onClick={onLogout} title={tr('יציאה')} aria-label={tr('יציאה')}>
                <IconLogout size={16} />
              </button>
            </div>
          )}

          <div className="drawer-group-title">{tr('מצב תצוגה')}</div>
          <div className="theme-switch" role="group" aria-label={tr('מצב תצוגה')}>
            {THEMES.map(({ id, Icon }) => (
              <button
                key={id}
                className={theme === id ? 'on' : ''}
                onClick={() => onSetTheme(id)}
                aria-pressed={theme === id}
                title={tr(THEME_LABEL[id])}
              >
                <Icon size={16} />
                <span>{tr(THEME_LABEL[id])}</span>
              </button>
            ))}
          </div>

          <div className="drawer-group-title">{tr('שפה')}</div>
          <div className="theme-switch" role="group" aria-label={tr('שפה')}>
            {LANGS.map(({ id, label }) => (
              <button
                key={id}
                className={lang === id ? 'on' : ''}
                onClick={() => setLang(id)}
                aria-pressed={lang === id}
                lang={id}
              >
                <span>{tr(label)}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
