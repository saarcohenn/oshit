import { useCallback, useEffect, useState } from 'react'
import { api, type Household, type Member, type PendingInvite } from '../lib/api'
import { IconClose, IconCopy, IconPlus } from './Icons'
import { tr, trf } from '../lib/i18n'

interface Props {
  household: Household
  onClose: () => void
  /** נקרא אחרי שינוי שמשפיע על הרשימה הראשית, למשל עזיבת משק בית */
  onChanged: () => void
}

const ROLE_LABEL: Record<'owner' | 'member', string> = {
  owner: 'בעלים',
  member: 'חבר',
}

/**
 * ניהול השיתוף של משק בית אחד.
 *
 * השיתוף עצמו הוא קישור הזמנה ולא הזמנה בדוא״ל: לשרת ביתי אין שרת דואר,
 * והוספת אחד רק כדי לשלוח שורה אחת הייתה תלות מיותרת. הקישור נשלח בכל
 * דרך שנוחה, תקף לשבוע, ומתבטל ברגע שמומש.
 */
export default function ShareDialog({ household, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const isOwner = household.role === 'owner'

  const load = useCallback(async () => {
    try {
      const data = await api.members(household.id)
      setMembers(data.members)
      setInvites(data.invites)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [household.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const inviteLink = (code: string) => `${location.origin}/?invite=${encodeURIComponent(code)}`

  async function run(fn: () => Promise<unknown>, after: 'reload' | 'close' = 'reload') {
    try {
      await fn()
      if (after === 'close') {
        onChanged()
        onClose()
      } else {
        await load()
        onChanged()
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function copy(code: string) {
    const link = inviteLink(code)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code)
      setTimeout(() => setCopied(null), 2200)
    } catch {
      // דפדפן שחוסם גישה ללוח — הקישור מוצג ממילא וניתן לסימון ידני
      setError(tr('לא הצלחנו להעתיק. סמנו את הקישור והעתיקו ידנית'))
    }
  }

  function leave() {
    const me = members.find((m) => m.isSelf)
    if (!me) return
    if (
      !confirm(
        `${trf('לעזוב את "{name}"?', { name: household.name })}\n` +
          tr('הנתונים יישארו אצל שאר החברים, ואתם תאבדו את הגישה אליהם.'),
      )
    )
      return
    void run(() => api.removeMember(household.id, me.userId), 'close')
  }

  function remove(m: Member) {
    if (!confirm(trf('להסיר את {who} מ"{house}"?', { who: m.name, house: household.name })))
      return
    void run(() => api.removeMember(household.id, m.userId))
  }

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={tr('שיתוף משק בית')}>
        <div className="modal-head">
          <div>
            <h3>
              {household.emoji} {household.name}
            </h3>
            <small className="dim">{tr('שיתוף עם בן/בת זוג או שותף')}</small>
          </div>
          <button className="icon-btn sm" onClick={onClose} aria-label={tr('סגירה')}>
            <IconClose size={17} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="notice danger">{error}</div>}
          {loading ? (
            <p className="dim">{tr('טוען…')}</p>
          ) : (
            <>
              <div className="share-group-title">{tr('מי רואה את הנתונים')}</div>
              <ul className="member-list">
                {members.map((m) => (
                  <li key={m.userId}>
                    <div className="member-who">
                      <b>
                        {m.name}
                        {m.isSelf && <span className="dim tiny">{tr('(אתם)')}</span>}
                      </b>
                      <span className="dim tiny" dir="ltr">
                        {m.email}
                      </span>
                    </div>
                    <span className={`role-pill ${m.role}`}>{tr(ROLE_LABEL[m.role])}</span>
                    {m.isSelf ? (
                      // הבעלים היחיד אינו יכול לעזוב — לא היה נשאר אף אחד
                      members.length > 1 && (
                        <button className="link-btn danger-link" onClick={leave}>{tr('עזיבה')}</button>
                      )
                    ) : isOwner ? (
                      <button className="link-btn danger-link" onClick={() => remove(m)}>{tr('הסרה')}</button>
                    ) : null}
                  </li>
                ))}
              </ul>

              {isOwner ? (
                <>
                  <div className="share-group-title">{tr('קישורי הזמנה')}</div>
                  {invites.length === 0 && (
                    <p className="dim tiny">{tr('אין הזמנות פתוחות. צרו קישור ושלחו אותו — מי שיפתח אותו יצטרף למשק הבית הזה.')}</p>
                  )}
                  {invites.map((inv) => (
                    <div className="invite-row" key={inv.code}>
                      <input
                        readOnly
                        dir="ltr"
                        value={inviteLink(inv.code)}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        className="btn sm"
                        onClick={() => void copy(inv.code)}
                        title={tr('העתקת הקישור')}
                      >
                        <IconCopy size={15} />
                        {copied === inv.code ? tr('הועתק') : tr('העתקה')}
                      </button>
                    </div>
                  ))}
                  <div className="invite-actions">
                    <button className="btn sm" onClick={() => void run(() => api.createInvite(household.id))}>
                      <IconPlus size={15} />{tr('קישור הזמנה חדש')}</button>
                    {invites.length > 0 && (
                      <button
                        className="link-btn danger-link"
                        onClick={() => void run(() => api.revokeInvites(household.id))}
                      >{tr('ביטול ההזמנות הפתוחות')}</button>
                    )}
                  </div>
                  <p className="dim tiny share-note">{tr('הקישור תקף שבעה ימים ומתבטל אחרי שמישהו הצטרף באמצעותו. כל מי שמצטרף רואה ועורך את כל נתוני משק הבית הזה.')}</p>
                </>
              ) : (
                <p className="dim tiny share-note">{tr('רק בעלים של משק הבית יכול להזמין אנשים נוספים.')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
