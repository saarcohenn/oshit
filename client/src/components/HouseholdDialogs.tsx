import { useState, type FormEvent } from 'react'
import { api, type AcceptedInvite, type Household, type HouseholdKind, type InviteInfo, type Member } from '../lib/api'
import { HOUSEHOLD_COLORS, ROLE_LABEL, parseInviteInput } from '../lib/households'
import { tr, trf } from '../lib/i18n'
import Modal from './Modal'
import { HouseholdIcon } from './Voxel'

/* ---------------- משק בית חדש ---------------- */

export function NewHouseholdDialog({
  usedColors,
  onCreate,
  onClose,
}: {
  usedColors: string[]
  onCreate: (input: { name: string; kind: HouseholdKind; color: string }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<HouseholdKind>('home')
  const [color, setColor] = useState<string>(
    () => HOUSEHOLD_COLORS.find((c) => !usedColors.includes(c)) ?? HOUSEHOLD_COLORS[0],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(tr('חסר שם למשק הבית'))
      return
    }
    setBusy(true)
    try {
      await onCreate({ name: trimmed, kind, color })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const kinds: Array<{ id: HouseholdKind; title: string; hint: string }> = [
    { id: 'home', title: tr('משק בית'), hint: tr('בית, זוג, הורים — קטגוריות של הוצאות הבית') },
    { id: 'business', title: tr('עסק קטן'), hint: tr('קליניקה, סטודיו, עצמאי — מיסים, ציוד, שיווק ועוד') },
  ]

  return (
    <Modal
      title={tr('משק בית חדש')}
      subtitle={tr('נפרד לגמרי: עסקאות, תקציבים, חברים וסוכנים משלו')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {tr('ביטול')}
          </button>
          <button type="submit" form="new-household" className="btn" disabled={busy}>
            {busy ? tr('יוצרים…') : tr('יצירה')}
          </button>
        </>
      }
    >
      <form id="new-household" className="dialog-form" onSubmit={submit}>
        {error && <div className="notice danger">{error}</div>}
        <label className="auth-field">
          <span>{tr('שם')}</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            placeholder={kind === 'business' ? tr('למשל: הקליניקה') : tr('למשל: הבית שלנו')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="choice-group">
          <legend>{tr('סוג')}</legend>
          <div className="kind-choices">
            {kinds.map((k) => (
              <label key={k.id} className={`kind-choice ${kind === k.id ? 'on' : ''}`}>
                <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
                <span className="kind-art">
                  <HouseholdIcon household={{ kind: k.id, color }} unit={7.5} width={62} height={58} />
                </span>
                <span className="kind-text">
                  <b>{k.title}</b>
                  <small>{k.hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <ColorPicker value={color} onChange={setColor} />
      </form>
    </Modal>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <fieldset className="choice-group">
      <legend>{tr('צבע')}</legend>
      <div className="hh-swatches">
        {HOUSEHOLD_COLORS.map((c, i) => (
          <label key={c} className="hh-swatch" style={{ background: c }}>
            <input
              type="radio"
              name="household-color"
              value={c}
              checked={value.toLowerCase() === c}
              onChange={() => onChange(c)}
              aria-label={trf('צבע {n}', { n: i + 1 })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/* ---------------- הצטרפות בקוד הזמנה ---------------- */

/**
 * הצטרפות למשק בית של מישהו אחר.
 *
 * מגיעים לכאן משני מקומות: הכפתור במסך משקי הבית, וקישור הזמנה שנפתח
 * כשכבר מחוברים. במקרה השני ההזמנה כבר מזוהה ומוצגת, ונשאר רק לאשר.
 */
export function JoinDialog({
  invite,
  onJoined,
  onClose,
}: {
  invite?: InviteInfo | null
  onJoined: (result: AcceptedInvite) => Promise<void> | void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = invite?.code ?? parseInviteInput(text)
    if (!code) {
      setError(tr('זה לא נראה כמו קישור או קוד הזמנה'))
      return
    }
    setBusy(true)
    try {
      await onJoined(await api.acceptInvite(code))
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={invite ? tr('הזמנה למשק בית') : tr('הצטרפות בקוד הזמנה')}
      subtitle={invite ? undefined : tr('הדביקו את הקישור שקיבלתם, או רק את הקוד שבסופו')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {invite ? tr('לא עכשיו') : tr('ביטול')}
          </button>
          <button type="submit" form="join-household" className="btn" disabled={busy}>
            {busy ? tr('מצרפים…') : tr('הצטרפות')}
          </button>
        </>
      }
    >
      <form id="join-household" className="dialog-form" onSubmit={submit}>
        {error && <div className="notice danger">{error}</div>}
        {invite ? (
          <div className="invite-card">
            <span className="invite-tile" style={{ background: invite.householdColor ?? 'var(--accent)' }} aria-hidden>
              {invite.householdEmoji}
            </span>
            <div>
              <b>{invite.householdName}</b>
              <p className="dim">
                {invite.invitedBy
                  ? trf('הזמנה מאת {who} · הרשאה: {role}', { who: invite.invitedBy, role: tr(ROLE_LABEL[invite.role]) })
                  : trf('הזמנה להצטרף · הרשאה: {role}', { role: tr(ROLE_LABEL[invite.role]) })}
              </p>
            </div>
          </div>
        ) : (
          <label className="auth-field">
            <span>{tr('קישור או קוד')}</span>
            <input
              type="text"
              dir="ltr"
              value={text}
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…/?invite=…"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        <p className="dim tiny">{tr('ההזמנה פותחת רק את משק הבית הזה. שאר משקי הבית שלכם נשארים פרטיים.')}</p>
      </form>
    </Modal>
  )
}

/* ---------------- העברת בעלות ---------------- */

export function TransferDialog({
  household,
  members,
  onTransfer,
  onClose,
}: {
  household: Household
  members: Member[]
  onTransfer: (userId: string) => Promise<void>
  onClose: () => void
}) {
  const others = members.filter((m) => !m.isSelf)
  const [target, setTarget] = useState(others[0]?.userId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!target) return
    setBusy(true)
    try {
      await onTransfer(target)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={tr('העברת בעלות')}
      subtitle={household.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {tr('ביטול')}
          </button>
          <button type="submit" form="transfer-household" className="btn" disabled={busy || !target}>
            {tr('העברת בעלות')}
          </button>
        </>
      }
    >
      <form id="transfer-household" className="dialog-form" onSubmit={submit}>
        {error && <div className="notice danger">{error}</div>}
        {others.length === 0 ? (
          <p className="dim">{tr('אין עוד חברים במשק הבית, ולכן אין למי להעביר את הבעלות. שלחו קודם קישור הזמנה.')}</p>
        ) : (
          <>
            <label className="auth-field">
              <span>{tr('למי')}</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {others.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {tr(ROLE_LABEL[m.role])}
                  </option>
                ))}
              </select>
            </label>
            <p className="dim">{tr('עם הבעלות עוברות כל ההרשאות: שיתוף, סוכנים ומחיקה. אתם תישארו במשק הבית עם הרשאת עריכה.')}</p>
          </>
        )}
      </form>
    </Modal>
  )
}

/* ---------------- מחיקה ---------------- */

/** מחיקה לצמיתות. מאשרים בהקלדת השם — לחיצה אחת בטעות לא מוחקת שנה של נתונים */
export function DeleteDialog({
  household,
  onDelete,
  onClose,
}: {
  household: Household
  onDelete: () => Promise<void>
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim() === household.name

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!matches) return
    setBusy(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={trf('מחיקת "{name}"', { name: household.name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {tr('ביטול')}
          </button>
          <button type="submit" form="delete-household" className="btn danger" disabled={busy || !matches}>
            {tr('מחיקה לצמיתות')}
          </button>
        </>
      }
    >
      <form id="delete-household" className="dialog-form" onSubmit={submit}>
        {error && <div className="notice danger">{error}</div>}
        <p>
          {household.memberCount > 1
            ? trf('כל העסקאות, הקטגוריות, התקציבים והסוכנים יימחקו — גם אצל {n} החברים האחרים. אין דרך לשחזר.', {
                n: household.memberCount - 1,
              })
            : tr('כל העסקאות, הקטגוריות, התקציבים והסוכנים יימחקו. אין דרך לשחזר.')}
        </p>
        <p className="dim tiny">{tr('כדאי לייצא גיבוי JSON לפני כן.')}</p>
        <label className="auth-field">
          <span>{trf('כדי לאשר, הקלידו "{name}"', { name: household.name })}</span>
          <input type="text" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </label>
      </form>
    </Modal>
  )
}

/* ---------------- אישור כללי ---------------- */

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {tr('ביטול')}
          </button>
          <button type="button" className={`btn ${danger ? 'danger' : ''}`} disabled={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {error && <div className="notice danger">{error}</div>}
      <p>{body}</p>
    </Modal>
  )
}
