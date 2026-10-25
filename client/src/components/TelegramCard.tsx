import { useEffect, useState } from 'react'
import type { AgentsTelegram } from '../types'
import { api } from '../lib/api'
import { getLang, tr, trf } from '../lib/i18n'

interface Props {
  householdId: string
  isOwner: boolean
  telegram: AgentsTelegram
  onChanged: () => Promise<void> | void
}

/**
 * הודעות מהסוכנים בטלגרם.
 *
 * הקישור בלי להקליד מזהה צ'אט: המסך מציג קוד חד-פעמי, שולחים אותו לבוט,
 * ושירות הסוכנים מזהה אותו. הטוקן של הבוט נמצא רק בשרת, בקונטיינר הסוכנים.
 */
export default function TelegramCard({ householdId, isOwner, telegram, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = telegram.pending

  // בזמן שיש קוד פתוח — טוענים מחדש עד שהקישור נקלט
  useEffect(() => {
    if (!pending || telegram.linked) return
    const poll = setInterval(() => void onChanged(), 10_000)
    return () => clearInterval(poll)
  }, [pending, telegram.linked, onChanged])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-title">{tr('הודעות בטלגרם')}</div>
      <div className="card-sub">
        {tr('הסוכנים שולחים לכם הודעה כשהם מוצאים משהו — לפי הגדרת ההודעות של כל סוכן.')}
      </div>

      {!telegram.bot ? (
        <p className="dim">
          {tr('לא הוגדר בוט בשרת. יוצרים בוט ב-@BotFather ומדביקים את הטוקן שלו ל-.env כ-TELEGRAM_BOT_TOKEN — ההוראות ב-docs/agents-setup.md.')}
        </p>
      ) : telegram.linked ? (
        <>
          <p>
            {trf('מחובר ל-{name} דרך @{bot}.', { name: telegram.linked.name || tr('הצ׳אט שלכם'), bot: telegram.bot })}
          </p>
          {isOwner && (
            <div className="agent-slot-actions">
              <label className="agent-inline">
                {tr('שפת ההודעות')}
                <select
                  value={telegram.linked.lang}
                  disabled={busy}
                  onChange={(e) => void run(() => api.setTelegramLang(householdId, e.target.value as 'he' | 'en'))}
                >
                  <option value="he">עברית</option>
                  <option value="en">English</option>
                </select>
              </label>
              <button
                className="btn sm ghost"
                disabled={busy}
                onClick={() => window.confirm(tr('לנתק את הטלגרם? הסוכנים יפסיקו לשלוח הודעות.')) && void run(() => api.unlinkTelegram(householdId))}
              >
                {tr('ניתוק')}
              </button>
            </div>
          )}
        </>
      ) : pending ? (
        <>
          <p>
            {trf('שלחו לבוט @{bot} את הקוד:', { bot: telegram.bot })} <strong className="telegram-code">{pending.code}</strong>
          </p>
          <p className="dim">
            {trf('הקוד תקף עד {time}. המסך יתעדכן לבד כשהקישור ייקלט.', {
              time: new Date(pending.expiresAt).toLocaleTimeString(getLang() === 'he' ? 'he-IL' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
          <a className="btn sm" href={`https://t.me/${telegram.bot}?start=${pending.code}`} target="_blank" rel="noreferrer">
            {tr('פתיחת הבוט בטלגרם')}
          </a>
        </>
      ) : isOwner ? (
        <button className="btn" disabled={busy} onClick={() => void run(() => api.telegramLinkCode(householdId, getLang()))}>
          {trf('חיבור ל-@{bot}', { bot: telegram.bot })}
        </button>
      ) : (
        <p className="dim">{tr('רק בעלים של משק הבית יכולים לחבר טלגרם.')}</p>
      )}

      {error && (
        <div className="notice warn" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
