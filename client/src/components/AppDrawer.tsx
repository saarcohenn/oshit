import { useEffect, useRef } from 'react'
import type { AuthUser, Household } from '../lib/api'
import { THEME_LABEL, type Theme } from '../lib/theme'
import { LANGS, setLang, tr, trf, useLang } from '../lib/i18n'
import {
  IconAuto,
  IconBrandOutline,
  IconClose,
  IconLogout,
  IconMoon,
  IconPlus,
  IconShare,
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
  onCreateHousehold: (name: string, emoji: string) => void
  onRenameHousehold: (id: string, name: string, emoji: string) => void
  onDeleteHousehold: (id: string) => void
  onShareHousehold: (id: string) => void

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
  onRenameHousehold,
  onDeleteHousehold,
  onShareHousehold,
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

  function create() {
    const name = prompt(tr('שם משק הבית החדש:'), tr('משק בית נוסף'))
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) return
    const emoji = prompt(tr('אימוג׳י (אפשר להשאיר ריק):'), '🏡') ?? '🏡'
    onCreateHousehold(trimmed, emoji.trim() || '🏡')
  }

  function rename(h: Household) {
    const name = prompt(tr('שם משק הבית:'), h.name)
    if (name === null) return
    const emoji = prompt(tr('אימוג׳י:'), h.emoji) ?? h.emoji
    onRenameHousehold(h.id, name.trim() || h.name, emoji.trim() || h.emoji)
  }

  function remove(h: Household) {
    const typed = prompt(
      `${trf('מחיקת "{name}" תמחק לצמיתות את כל העסקאות, הקטגוריות והיעדים שלו.', {
        name: h.name,
      })}\n` + tr('אין דרך לשחזר. כדי לאשר, הקלידו את שם משק הבית:'),
    )
    if (typed === null) return
    if (typed.trim() !== h.name) {
      alert(tr('השם לא תואם — לא נמחק דבר.'))
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
                {/* חיווי שקט שהנתונים כאן אינם פרטיים לחשבון הזה */}
                {h.memberCount > 1 && (
                  <span className="shared-badge" title={trf('{n} אנשים', { n: h.memberCount })}>
                    <IconShare size={13} />
                    {h.memberCount}
                  </span>
                )}
                <span className="dim tiny">{h.transactionCount}</span>
              </button>
              <div className="drawer-household-actions">
                <button className="link-btn" onClick={() => onShareHousehold(h.id)}>
                  {h.role === 'owner' ? tr('שיתוף') : tr('מי רואה')}
                </button>
                {/* שינוי שם ומחיקה שמורים לבעלים — חבר משתף בנתונים, לא בשליטה */}
                {h.role === 'owner' && (
                  <>
                    <button className="link-btn" onClick={() => rename(h)}>
                      {tr('שינוי שם')}
                    </button>
                    {households.length > 1 && (
                      <button className="link-btn danger-link" onClick={() => remove(h)}>
                        {tr('מחיקה')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <button className="drawer-item ghost" onClick={create}>
            <IconPlus size={17} />
            <span>{tr('משק בית חדש')}</span>
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
