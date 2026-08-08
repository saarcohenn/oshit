import { useState, type FormEvent } from 'react'
import type { InviteInfo } from '../lib/api'
import { IconBrand } from './Icons'

interface Props {
  /** אין עדיין אף חשבון בשרת — המסך הזה יוצר את הבעלים הראשון */
  needsSetup: boolean
  openRegistration: boolean
  invite: InviteInfo | null
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, name: string, password: string) => Promise<void>
}

/**
 * מסך הכניסה.
 *
 * שלושה מצבים לאותו טופס: התקנה ראשונה (יצירת הבעלים), הצטרפות לפי
 * הזמנה, והתחברות רגילה. הפרדה לשלושה מסכים הייתה מיותרת — ההבדל
 * ביניהם הוא שדה אחד וכותרת.
 */
export default function AuthScreen({
  needsSetup,
  openRegistration,
  invite,
  onLogin,
  onRegister,
}: Props) {
  // מוזמן שעדיין אין לו חשבון פותח ישירות בהרשמה; כל השאר בהתחברות
  const [mode, setMode] = useState<'login' | 'register'>(
    needsSetup || invite ? 'register' : 'login',
  )
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registering = mode === 'register'
  const canRegister = needsSetup || openRegistration || !!invite

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (registering) await onRegister(email, name, password)
      else await onLogin(email, password)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const title = needsSetup
    ? 'ברוכים הבאים ל-Osh.it'
    : invite
      ? `הוזמנתם ל${invite.householdEmoji} ${invite.householdName}`
      : registering
        ? 'יצירת חשבון'
        : 'כניסה'

  const subtitle = needsSetup
    ? 'זו ההתקנה הראשונה. החשבון שתיצרו כאן יהיה הבעלים של הנתונים.'
    : invite
      ? // ניסוח בלי פועל: המערכת אינה יודעת את המגדר של המזמין, וכל
        // בחירה בין "הזמין" ל"הזמינה" הייתה שגויה עבור מחצית מהמשתמשים
        invite.invitedBy
        ? `הזמנה מ${invite.invitedBy} לנהל יחד את התקציב.`
        : 'הזמנה לנהל יחד את התקציב.'
      : registering
        ? 'החשבון נשמר על השרת שלכם בלבד.'
        : 'שמחים לראות אתכם שוב.'

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="logo-mark" aria-hidden>
            <IconBrand size={22} />
          </span>
          <b>
            Osh<span className="dot">.</span>it
          </b>
        </div>

        <h1>{title}</h1>
        <p className="auth-sub">{subtitle}</p>

        {registering && (
          <label className="auth-field">
            <span>שם</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              placeholder="איך לקרוא לכם"
            />
          </label>
        )}

        <label className="auth-field">
          <span>דוא״ל</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            dir="ltr"
            placeholder="you@example.com"
          />
        </label>

        <label className="auth-field">
          <span>סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registering ? 'new-password' : 'current-password'}
            required
            minLength={registering ? 8 : undefined}
            dir="ltr"
            placeholder={registering ? '8 תווים לפחות' : ''}
          />
        </label>

        {error && <div className="notice danger auth-error">{error}</div>}

        <button className="btn auth-submit" type="submit" disabled={busy}>
          {busy ? 'רגע…' : registering ? (needsSetup ? 'יצירת החשבון' : 'הצטרפות') : 'כניסה'}
        </button>

        {/* בהתקנה ראשונה אין למה להתחבר, ולכן אין מה להציע */}
        {!needsSetup && (
          <div className="auth-switch">
            {registering ? (
              <>
                כבר יש לכם חשבון?{' '}
                <button type="button" className="link-btn" onClick={() => setMode('login')}>
                  לכניסה
                </button>
              </>
            ) : canRegister ? (
              <>
                אין לכם עדיין חשבון?{' '}
                <button type="button" className="link-btn" onClick={() => setMode('register')}>
                  ליצירת חשבון
                </button>
              </>
            ) : (
              <span className="dim">
                ההרשמה סגורה. כדי להצטרף, בקשו קישור הזמנה ממי שכבר משתמש.
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
