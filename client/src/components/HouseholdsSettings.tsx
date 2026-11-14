import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { api, type Household, type HouseholdKind, type Member, type PendingInvite, type Role } from '../lib/api'
import { monthLabel } from '../lib/format'
import {
  KIND_LABEL,
  ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  agentsSummary,
  avatarColor,
  dataSummary,
  initialOf,
  inkOn,
  kindSummary,
  membersSummary,
  sourcesSummary,
} from '../lib/households'
import { getLang, tr, trf, useLang } from '../lib/i18n'
import { ColorPicker, ConfirmDialog, DeleteDialog, TransferDialog } from './HouseholdDialogs'
import { IconCopy, IconDownload, IconEnter, IconLink, IconPlus, IconTrash } from './Icons'
import { HouseholdIcon, HouseholdVillage } from './Voxel'

type Patch = Partial<{ name: string; kind: HouseholdKind; color: string }>

interface Props {
  households: Household[]
  activeId: string | null
  onSwitch: (id: string) => Promise<void> | void
  onNew: () => void
  onJoin: () => void
  onUpdate: (id: string, patch: Patch) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRefresh: () => Promise<unknown>
}

type Dialog = { kind: 'transfer' } | { kind: 'delete' } | { kind: 'leave' } | { kind: 'remove'; member: Member }

const inviteLink = (code: string) => `${location.origin}/?invite=${encodeURIComponent(code)}`

/** ‎'2026-11-21 10:00:00'‎ (UTC מהמסד) ← "21 בנוב׳" / "21 Nov" */
function shortDay(sqlTime: string): string {
  const date = new Date(`${sqlTime.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return sqlTime.slice(0, 10)
  return date.toLocaleDateString(getLang() === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })
}

/**
 * הגדרות · משקי בית.
 *
 * למעלה כל הבתים של המשתמש, כל אחד בכרטיס עם בית voxel בצבע שלו. מתחת
 * — ניהול של משק הבית הפעיל: חברים והרשאות, הזמנות, פרטים, ייצוא, ומה
 * שמסוכן (העברת בעלות, עזיבה, מחיקה). כדי לנהל בית אחר עוברים אליו —
 * כך אין ספק על איזה בית כל כפתור פועל.
 */
export default function HouseholdsSettings({ households, activeId, onSwitch, onNew, onJoin, onUpdate, onDelete, onRefresh }: Props) {
  useLang()
  const active = households.find((h) => h.id === activeId) ?? null
  const isOwner = active?.role === 'owner'

  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<Role>('viewer')
  const [copied, setCopied] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!activeId) return
    let alive = true
    api
      .members(activeId)
      .then((data) => {
        if (!alive) return
        setMembers(data.members)
        setInvites(data.invites)
        setError(null)
      })
      .catch((err) => alive && setError((err as Error).message))
    return () => {
      alive = false
    }
  }, [activeId, reloadKey])

  // בית אחר — רשימה אחרת. בלי האיפוס, החברים של הבית הקודם מהבהבים לרגע
  useEffect(() => {
    setMembers([])
    setInvites([])
    setDialog(null)
  }, [activeId])

  const reload = () => setReloadKey((k) => k + 1)

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      setError(null)
      reload()
      await onRefresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function copy(code: string, quiet = false) {
    try {
      await navigator.clipboard.writeText(inviteLink(code))
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2200)
    } catch {
      // אחרי בקשה לשרת הדפדפן כבר לא תמיד מתיר גישה ללוח — הקישור גלוי ממילא
      if (!quiet) setError(tr('לא הצלחנו להעתיק. סמנו את הקישור והעתיקו ידנית'))
    }
  }

  async function createInvite() {
    if (!activeId) return
    try {
      const invite = await api.createInvite(activeId, inviteRole)
      reload()
      await copy(invite.code, true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function exportExcel() {
    if (!active) return
    setExporting(true)
    try {
      const [{ version: _version, ...state }, { exportHouseholdExcel }] = await Promise.all([
        api.getState(active.id),
        import('../lib/exportExcel'),
      ])
      exportHouseholdExcel(state, active.name)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const me = members.find((m) => m.isSelf)
  const ownerCount = members.filter((m) => m.role === 'owner').length
  // הבעלים היחיד לא יכול לעזוב — לא היה נשאר מי שרשאי לנהל
  const canLeave = !!me && members.length > 1 && (me.role !== 'owner' || ownerCount > 1)
  const canDelete = isOwner && households.length > 1

  const subtitle = (h: Household) => (h.id === activeId ? tr('פעיל עכשיו') : tr(ROLE_LABEL[h.role]))

  return (
    <div className="hh-settings">
      <section className="hh-hero">
        <div className="hh-hero-text">
          <span className="hh-eyebrow">
            {households.length === 1 ? tr('משקי בית · אחד שלכם') : trf('משקי בית · {n} שלכם', { n: households.length })}
          </span>
          <h2>{tr('כמה בתים, שרת אחד')}</h2>
          <p>
            {tr(
              'כל משק בית נפרד לגמרי: עסקאות, תקציבים, חברים, סוכנים ותקרת Claude. עוברים ביניהם מהכרטיס שבראש הסרגל, ורואים רק את מה שהוזמנתם אליו.',
            )}
          </p>
          <div className="hh-hero-actions">
            <button type="button" className="btn hero-primary" onClick={onNew}>
              <IconPlus size={17} />
              {tr('משק בית חדש')}
            </button>
            <button type="button" className="btn onhero" onClick={onJoin}>
              <IconEnter size={16} />
              {tr('הצטרפות בקוד הזמנה')}
            </button>
          </div>
        </div>
        <div className="hh-hero-art">
          <HouseholdVillage households={households} activeId={activeId} subtitle={subtitle} />
        </div>
      </section>

      <section className="hh-cards" aria-label={tr('משקי הבית')}>
        {households.map((h) => (
          <HouseholdCard
            key={h.id}
            household={h}
            active={h.id === activeId}
            onSwitch={() => void onSwitch(h.id)}
            onManage={() => document.getElementById('hh-members')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        ))}
        <button type="button" className="hh-new-tile" onClick={onNew}>
          <span className="hh-new-plus" aria-hidden>
            <IconPlus size={20} />
          </span>
          <b>{tr('משק בית חדש')}</b>
          <small>{tr('בית, הורים, או עסק קטן עם קטגוריות עסקיות מוכנות')}</small>
        </button>
      </section>

      {active && (
        <>
          {error && <div className="notice danger hh-error">{error}</div>}

          <div className="hh-manage">
            <section className="card hh-members" id="hh-members" aria-labelledby="hh-members-h">
              <div className="hh-section-head">
                <div>
                  <h2 id="hh-members-h">{trf('החברים של {name}', { name: active.name })}</h2>
                  <p className="dim">
                    {members.length <= 1 ? tr('רק אתם') : trf('{n} חברים', { n: members.length })}
                    {isOwner && invites.length > 0 &&
                      ` · ${invites.length === 1 ? tr('הזמנה אחת ממתינה') : trf('{n} הזמנות ממתינות', { n: invites.length })}`}
                  </p>
                </div>
                {isOwner && (
                  <div className="hh-invite-actions">
                    <select
                      aria-label={tr('הרשאה להזמנה')}
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {trf('הרשאה: {role}', { role: tr(ROLE_LABEL[r]) })}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn sm" onClick={() => void createInvite()}>
                      <IconLink size={16} />
                      {tr('יצירת קישור הזמנה')}
                    </button>
                  </div>
                )}
              </div>

              <ul className="hh-member-list">
                {members.map((m) => (
                  <li key={m.userId} className="hh-member">
                    <Avatar name={m.name} large />
                    <span className="hh-member-who">
                      <span className="hh-member-name">
                        <b>{m.name}</b>
                        {m.isSelf && <span className="hh-tag">{tr('אתם')}</span>}
                      </span>
                      <span className="dim hh-member-mail" dir="ltr">
                        {m.email}
                      </span>
                    </span>
                    <span className="hh-member-since dim">
                      {trf('הצטרפות: {date}', { date: monthLabel(m.createdAt.slice(0, 7)) })}
                    </span>
                    <span className="hh-member-role">
                      {isOwner && !m.isSelf ? (
                        <>
                          <select
                            aria-label={trf('הרשאה של {name}', { name: m.name })}
                            value={m.role}
                            onChange={(e) => void run(() => api.setMemberRole(active.id, m.userId, e.target.value as Role))}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {tr(ROLE_LABEL[r])}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="icon-btn sm ghost danger"
                            aria-label={trf('הסרת {name}', { name: m.name })}
                            title={trf('הסרת {name}', { name: m.name })}
                            onClick={() => setDialog({ kind: 'remove', member: m })}
                          >
                            <IconTrash size={16} />
                          </button>
                        </>
                      ) : (
                        <span className={`role-pill ${m.role}`}>{tr(ROLE_LABEL[m.role])}</span>
                      )}
                    </span>
                  </li>
                ))}

                {isOwner &&
                  invites.map((inv) => (
                    <li key={inv.code} className="hh-member invite">
                      <span className="av lg invite-av" aria-hidden>
                        <IconLink size={17} />
                      </span>
                      <span className="hh-member-who">
                        <b>{tr('הזמנה בקישור')}</b>
                        <input
                          readOnly
                          dir="ltr"
                          className="hh-invite-link"
                          value={inviteLink(inv.code)}
                          aria-label={tr('קישור ההזמנה')}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </span>
                      <span className="hh-member-since dim">{trf('בתוקף עד {date}', { date: shortDay(inv.expiresAt) })}</span>
                      <span className="hh-member-role">
                        <span className={`role-pill ${inv.role}`}>{tr(ROLE_LABEL[inv.role])}</span>
                        <button type="button" className="btn sm ghost" onClick={() => void copy(inv.code)}>
                          <IconCopy size={15} />
                          {copied === inv.code ? tr('הועתק') : tr('העתקה')}
                        </button>
                        <button
                          type="button"
                          className="icon-btn sm ghost danger"
                          aria-label={tr('ביטול ההזמנה')}
                          title={tr('ביטול ההזמנה')}
                          onClick={() => void run(() => api.revokeInvite(active.id, inv.code))}
                        >
                          <IconTrash size={16} />
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>

              <div className="hh-legend">
                {ROLES.map((r) => (
                  <span key={r}>
                    <b>{tr(ROLE_LABEL[r])}</b> · {tr(ROLE_HINT[r])}
                  </span>
                ))}
              </div>
              {isOwner && <p className="dim tiny">{tr('קישור תקף שבעה ימים, ונשרף אחרי הצטרפות אחת.')}</p>}
            </section>

            {isOwner ? (
              <DetailsCard key={active.id} household={active} onSave={(patch) => onUpdate(active.id, patch)} />
            ) : (
              <section className="card hh-details" aria-labelledby="hh-details-h">
                <h2 id="hh-details-h">{tr('ההרשאה שלכם')}</h2>
                <p className="hh-role-big">{tr(ROLE_LABEL[active.role])}</p>
                <p className="dim">{tr(ROLE_HINT[active.role])}</p>
                <p className="dim tiny">{tr('שינוי הרשאות, שם וצבע שמור לבעלים של משק הבית.')}</p>
              </section>
            )}
          </div>

          <section className="card hh-data" aria-labelledby="hh-data-h">
            <div className="hh-data-text">
              <h2 id="hh-data-h">{trf('הנתונים של {name}', { name: active.name })}</h2>
              <p className="dim">
                {tr('שלכם לגמרי. אפשר לייצא הכול בכל רגע ולהעלות לשרת Osh.it אחר, בלי לשאול אף אחד.')}
              </p>
            </div>
            <div className="hh-data-actions">
              <a className="btn ghost" href={api.exportUrl(active.id)} download>
                <IconDownload size={16} />
                {tr('ייצוא מלא (JSON)')}
              </a>
              <button type="button" className="btn ghost" disabled={exporting} onClick={() => void exportExcel()}>
                <IconDownload size={16} />
                {exporting ? tr('מכין…') : tr('עסקאות ל-Excel')}
              </button>
              {isOwner && members.length > 1 && (
                <button type="button" className="btn ghost" onClick={() => setDialog({ kind: 'transfer' })}>
                  {tr('העברת בעלות')}
                </button>
              )}
              {canLeave && (
                <button type="button" className="btn outline-danger" onClick={() => setDialog({ kind: 'leave' })}>
                  {tr('עזיבת משק הבית')}
                </button>
              )}
              {canDelete && (
                <button type="button" className="btn outline-danger" onClick={() => setDialog({ kind: 'delete' })}>
                  <IconTrash size={16} />
                  {tr('מחיקת משק הבית')}
                </button>
              )}
            </div>
          </section>

          {dialog?.kind === 'transfer' && (
            <TransferDialog
              household={active}
              members={members}
              onTransfer={(userId) => run(() => api.transferOwnership(active.id, userId))}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog?.kind === 'delete' && (
            <DeleteDialog household={active} onDelete={() => onDelete(active.id)} onClose={() => setDialog(null)} />
          )}
          {dialog?.kind === 'leave' && me && (
            <ConfirmDialog
              title={trf('לעזוב את "{name}"?', { name: active.name })}
              body={tr('הנתונים יישארו אצל שאר החברים, ואתם תאבדו את הגישה אליהם.')}
              confirmLabel={tr('עזיבה')}
              danger
              onConfirm={async () => {
                await api.removeMember(active.id, me.userId)
                await onRefresh()
              }}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog?.kind === 'remove' && (
            <ConfirmDialog
              title={trf('להסיר את {who}?', { who: dialog.member.name })}
              body={trf('הגישה של {who} ל"{house}" תיסגר. הנתונים נשארים במשק הבית.', {
                who: dialog.member.name,
                house: active.name,
              })}
              confirmLabel={tr('הסרה')}
              danger
              onConfirm={async () => {
                await api.removeMember(active.id, dialog.member.userId)
                reload()
                await onRefresh()
              }}
              onClose={() => setDialog(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const bg = avatarColor(name)
  return (
    <span className={`av ${large ? 'lg' : ''}`} style={{ background: bg, color: inkOn(bg) }} aria-hidden>
      {initialOf(name)}
    </span>
  )
}

function HouseholdCard({
  household: h,
  active,
  onSwitch,
  onManage,
}: {
  household: Household
  active: boolean
  onSwitch: () => void
  onManage: () => void
}) {
  return (
    <article className={`card hh-card ${active ? 'active' : ''}`} style={{ '--hh': h.color } as CSSProperties}>
      <div className="hh-card-head">
        <span className="hh-card-art">
          <HouseholdIcon household={h} lit={active} />
        </span>
        <div className="hh-card-title">
          <h3>{h.name}</h3>
          <span className="dim">{kindSummary(h.kind)}</span>
          {active ? (
            <span className="hh-tag on">{tr('פעיל עכשיו')}</span>
          ) : (
            h.memberCount > 1 && <span className="hh-tag">{trf('משותף · {n}', { n: h.memberCount })}</span>
          )}
        </div>
      </div>
      <dl className="hh-facts">
        <dt>{tr('הרשאה')}</dt>
        <dd>
          <b>{tr(ROLE_LABEL[h.role])}</b>
        </dd>
        <dt>{tr('נתונים')}</dt>
        <dd>{dataSummary(h)}</dd>
        <dt>{tr('מקורות')}</dt>
        <dd>{sourcesSummary(h)}</dd>
        <dt>Claude</dt>
        <dd>{agentsSummary(h)}</dd>
      </dl>
      <div className="hh-card-foot">
        <span className="avatars">
          {h.memberNames.slice(0, 4).map((n, i) => (
            <Avatar key={`${n}-${i}`} name={n} />
          ))}
        </span>
        <span className="dim grow hh-card-members">{membersSummary(h)}</span>
        {active ? (
          <button type="button" className="btn sm ghost" onClick={onManage}>
            {tr('ניהול')}
          </button>
        ) : (
          <button type="button" className="btn sm" onClick={onSwitch}>
            {tr('מעבר למשק הבית')}
          </button>
        )}
      </div>
    </article>
  )
}

/** שם, סוג וצבע. החלפת סוג מוסיפה קטגוריות שחסרות, ולא מוחקת אף אחת */
function DetailsCard({ household, onSave }: { household: Household; onSave: (patch: Patch) => Promise<void> }) {
  const [name, setName] = useState(household.name)
  const [kind, setKind] = useState<HouseholdKind>(household.kind)
  const [color, setColor] = useState(household.color)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    name.trim() !== household.name || kind !== household.kind || color.toLowerCase() !== household.color.toLowerCase()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setBusy(true)
    setNote(null)
    try {
      const kindChanged = kind !== household.kind
      await onSave({ name: name.trim() || household.name, kind, color })
      setError(null)
      setNote(kindChanged ? tr('נשמר. הקטגוריות שחסרו לסוג החדש נוספו, והקיימות לא השתנו.') : tr('נשמר'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card hh-details" aria-labelledby="hh-details-h">
      <h2 id="hh-details-h">{tr('פרטי משק הבית')}</h2>
      <form className="dialog-form" onSubmit={save}>
        {error && <div className="notice danger">{error}</div>}
        <label className="auth-field">
          <span>{tr('שם')}</span>
          <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="choice-group">
          <legend>{tr('סוג')}</legend>
          <div className="seg kind-seg" role="radiogroup" aria-label={tr('סוג')}>
            {(['home', 'business'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={kind === k ? 'on' : ''}
                onClick={() => setKind(k)}
              >
                {tr(KIND_LABEL[k])}
              </button>
            ))}
          </div>
        </fieldset>
        <ColorPicker value={color} onChange={setColor} />
        <div className="hh-details-foot">
          <button type="submit" className="btn" disabled={!dirty || busy}>
            {busy ? tr('שומר…') : tr('שמירה')}
          </button>
          {note && !dirty && (
            <span className="dim tiny" role="status">
              {note}
            </span>
          )}
        </div>
      </form>
    </section>
  )
}
