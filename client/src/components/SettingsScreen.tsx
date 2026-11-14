// ‎@types/react‎ 19 הסיר את מרחב השמות הגלובלי JSX, והוא מיובא מפורשות
import { useState, type ComponentProps, type FormEvent, type JSX } from 'react'
import { api, type AuthUser } from '../lib/api'
import { THEME_LABEL, type Theme } from '../lib/theme'
import { LANGS, setLang, tr, trf, useLang } from '../lib/i18n'
import HouseholdsSettings from './HouseholdsSettings'
import { IconArrowBack, IconAuto, IconHome, IconLang, IconLogout, IconMoon, IconSun, IconUser } from './Icons'

export type SettingsSection = 'account' | 'households' | 'display'

const SECTIONS: Array<{ id: SettingsSection; label: string; Icon: (p: { size?: number }) => JSX.Element }> = [
  { id: 'account', label: 'חשבון ואבטחה', Icon: IconUser },
  { id: 'households', label: 'משקי בית', Icon: IconHome },
  { id: 'display', label: 'שפה ותצוגה', Icon: IconLang },
]

interface Props {
  section: SettingsSection
  onSection: (section: SettingsSection) => void
  onBack: () => void
  user: AuthUser
  onLogout: () => void
  theme: Theme
  onSetTheme: (theme: Theme) => void
  households: ComponentProps<typeof HouseholdsSettings>
}

/**
 * מסך ההגדרות: סרגל אזורים בצד ותוכן במרכז, כמו בעיצוב v3.
 *
 * מחליף את האפליקציה כולה בזמן שהוא פתוח, ולא נפתח כחלון: יש בו הרבה
 * מה לקרוא, והטלפון צריך את כל הרוחב. "חזרה לאפליקציה" מחזיר בדיוק
 * לאותו מסך ולאותו חודש.
 */
export default function SettingsScreen({ section, onSection, onBack, user, onLogout, theme, onSetTheme, households }: Props) {
  useLang()
  return (
    <div className="settings">
      <aside className="settings-aside" aria-label={tr('הגדרות')}>
        <button type="button" className="settings-nav back" onClick={onBack}>
          <IconArrowBack size={18} />
          <span>{tr('חזרה לאפליקציה')}</span>
        </button>
        <div className="settings-title">
          <h1>{tr('הגדרות')}</h1>
          <p className="dim" dir="auto">
            {trf('השרת הזה · {host}', { host: location.host })}
          </p>
        </div>
        <nav className="settings-navlist" aria-label={tr('אזורי הגדרות')}>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`settings-nav ${section === id ? 'on' : ''}`}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => onSection(id)}
            >
              <Icon size={18} />
              <span>{tr(label)}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="settings-main">
        {section === 'households' && <HouseholdsSettings {...households} />}
        {section === 'account' && <AccountSection user={user} onLogout={onLogout} />}
        {section === 'display' && <DisplaySection theme={theme} onSetTheme={onSetTheme} />}
      </main>
    </div>
  )
}

const MIN_PASSWORD = 8

function AccountSection({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next.length < MIN_PASSWORD) {
      setMessage({ ok: false, text: trf('הסיסמה צריכה להיות באורך {n} תווים לפחות', { n: MIN_PASSWORD }) })
      return
    }
    if (next !== confirm) {
      setMessage({ ok: false, text: tr('שתי הסיסמאות החדשות לא תואמות') })
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setMessage({ ok: true, text: tr('הסיסמה עודכנה, וכל שאר המכשירים נותקו.') })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-stack">
      <header className="settings-head">
        <h2>{tr('חשבון ואבטחה')}</h2>
        <p className="dim">{tr('החשבון שלכם בשרת הזה. הוא משותף לכל משקי הבית שאתם חברים בהם.')}</p>
      </header>

      <section className="card settings-card">
        <div className="account-row">
          <span className="sidebar-avatar account-avatar" aria-hidden>
            {(user.name || user.email || '?').trim().charAt(0)}
          </span>
          <div className="grow">
            <b>{user.name}</b>
            <div className="dim" dir="ltr">
              {user.email}
            </div>
          </div>
          <button type="button" className="btn ghost" onClick={onLogout}>
            <IconLogout size={16} />
            {tr('יציאה')}
          </button>
        </div>
      </section>

      <section className="card settings-card" aria-labelledby="pw-h">
        <h3 id="pw-h">{tr('החלפת סיסמה')}</h3>
        <p className="dim tiny">{tr('אחרי ההחלפה כל שאר המכשירים מתנתקים, והמכשיר הזה נשאר מחובר.')}</p>
        <form className="dialog-form narrow" onSubmit={submit}>
          {message && (
            <div className={`notice ${message.ok ? 'ok' : 'danger'}`} role="status">
              {message.text}
            </div>
          )}
          <label className="auth-field">
            <span>{tr('הסיסמה הנוכחית')}</span>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="auth-field">
            <span>{tr('סיסמה חדשה')}</span>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className="auth-field">
            <span>{tr('שוב, לאימות')}</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <div>
            <button type="submit" className="btn" disabled={busy || !current || !next}>
              {busy ? tr('שומר…') : tr('החלפת סיסמה')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

const THEMES: Array<{ id: Theme; Icon: (p: { size?: number }) => JSX.Element }> = [
  { id: 'light', Icon: IconSun },
  { id: 'dark', Icon: IconMoon },
  { id: 'auto', Icon: IconAuto },
]

function DisplaySection({ theme, onSetTheme }: { theme: Theme; onSetTheme: (theme: Theme) => void }) {
  const lang = useLang()
  return (
    <div className="settings-stack">
      <header className="settings-head">
        <h2>{tr('שפה ותצוגה')}</h2>
        <p className="dim">{tr('נשמר במכשיר הזה בלבד — בכל מכשיר אפשר לבחור אחרת.')}</p>
      </header>

      <section className="card settings-card" aria-labelledby="lang-h">
        <h3 id="lang-h">{tr('שפה')}</h3>
        <div className="theme-switch wide" role="group" aria-labelledby="lang-h">
          {LANGS.map(({ id, label }) => (
            <button key={id} type="button" className={lang === id ? 'on' : ''} aria-pressed={lang === id} lang={id} onClick={() => setLang(id)}>
              <span>{tr(label)}</span>
            </button>
          ))}
        </div>
        <p className="dim tiny">{tr('שמות קטגוריות ובתי עסק נשארים כפי שהוזנו — הם נתונים של משק הבית, לא טקסט של הממשק.')}</p>
      </section>

      <section className="card settings-card" aria-labelledby="theme-h">
        <h3 id="theme-h">{tr('מצב תצוגה')}</h3>
        <div className="theme-switch wide" role="group" aria-labelledby="theme-h">
          {THEMES.map(({ id, Icon }) => (
            <button key={id} type="button" className={theme === id ? 'on' : ''} aria-pressed={theme === id} onClick={() => onSetTheme(id)}>
              <Icon size={16} />
              <span>{tr(THEME_LABEL[id])}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
