import { useEffect, useState } from 'react'
import type { AgentHolding, AgentPortfolio, AgentSymbolCheck, AgentVersion, AgentWatchItem } from '../types'
import { api } from '../lib/api'
import { getLang, tr, trf } from '../lib/i18n'

interface Props {
  householdId: string
  isOwner: boolean
  portfolio: AgentPortfolio | null
  symbolCheck: AgentSymbolCheck | null
  serviceAlive: boolean
  onChanged: () => Promise<void> | void
}

const EMPTY: AgentPortfolio = {
  benchmark: { name: 'S&P 500', symbol: '^GSPC' },
  holdings: [],
  watchlist: [],
  rules: '',
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(getLang() === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })

/** מספר משדה טקסט: ריק — אין ערך, לא אפס */
const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

/**
 * התיק של סער: נכסים וסטופים, רשימת מעקב, והכללים — מה שסוכני השוק והמחקר
 * עובדים מולו. נשמר במסד של Osh.it ולא במאגר הציבורי, וכל שמירה היא גרסה.
 *
 * הסמלים נבדקים בשירות הסוכנים — רק לו יש גישה החוצה למקור המחירים — והתוצאה
 * מוצגת כאן ליד כל סמל.
 */
export default function PortfolioEditor({ householdId, isOwner, portfolio, symbolCheck, serviceAlive, onChanged }: Props) {
  const [draft, setDraft] = useState<AgentPortfolio>(portfolio ?? EMPTY)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [versions, setVersions] = useState<Array<AgentVersion & { portfolio: AgentPortfolio }> | null>(null)
  const [checkPending, setCheckPending] = useState(false)

  // נתונים חדשים מהשרת מחליפים את הטיוטה רק כשאין בה שינויים שלא נשמרו
  useEffect(() => {
    if (!dirty) setDraft(portfolio ?? EMPTY)
  }, [portfolio, dirty])

  useEffect(() => {
    if (symbolCheck) setCheckPending(false)
  }, [symbolCheck?.checkedAt])

  const update = (next: AgentPortfolio) => {
    setDraft(next)
    setDirty(true)
  }

  const setHolding = (i: number, patch: Partial<AgentHolding>) =>
    update({ ...draft, holdings: draft.holdings.map((h, j) => (j === i ? { ...h, ...patch } : h)) })
  const setWatch = (i: number, patch: Partial<AgentWatchItem>) =>
    update({ ...draft, watchlist: draft.watchlist.map((w, j) => (j === i ? { ...w, ...patch } : w)) })

  const checkOf = (symbol: string | null) => (symbol ? symbolCheck?.results.find((r) => r.symbol === symbol) : undefined)

  function SymbolStatus({ symbol }: { symbol: string | null }) {
    const r = checkOf(symbol)
    if (!r) return null
    return (
      <span className={r.ok ? 'symbol-ok' : 'symbol-bad'} title={r.error}>
        {r.ok ? `✓ ${r.currency ?? ''}` : '✗'}
      </span>
    )
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setDirty(false)
      await onChanged()
      setNotice(done)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = () => run(() => api.savePortfolio(householdId, draft), tr('התיק נשמר. הסוכנים יעבדו מולו מהריצה הבאה.'))

  async function check() {
    setError('')
    try {
      await api.checkSymbols(householdId)
      setCheckPending(true)
      // התוצאה מגיעה אחרי שהשירות משך את הבקשה — עד 20 שניות, ועוד זמן המשיכה
      for (const delay of [8000, 15000, 25000, 40000]) setTimeout(() => void onChanged(), delay)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="card">
      <div className="card-title">{tr('התיק, רשימת המעקב והכללים')}</div>
      <div className="card-sub">
        {tr('מה שסוכני השוק והמחקר עובדים מולו. נשמר במסד של Osh.it בשרת שלכם, לא במאגר הקוד. כמויות ושווי לא נכנסים לכאן.')}
      </div>
      {!portfolio && (
        <div className="notice">{tr('עדיין לא הוגדר תיק. אם יש קובץ portfolio.json בשרת, שירות הסוכנים ייבא אותו בהפעלה הבאה.')}</div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <fieldset disabled={!isOwner || busy}>
          <div className="agent-editor-grid">
            <label>
              {tr('מדד ייחוס')}
              <input type="text"
                value={draft.benchmark.name}
                onChange={(e) => update({ ...draft, benchmark: { ...draft.benchmark, name: e.target.value } })}
                required
              />
            </label>
            <label>
              {tr('סמל')} <SymbolStatus symbol={draft.benchmark.symbol} />
              <input type="text"
                value={draft.benchmark.symbol}
                onChange={(e) => update({ ...draft, benchmark: { ...draft.benchmark, symbol: e.target.value.trim() } })}
                dir="ltr"
                required
              />
            </label>
          </div>

          <div className="agent-editor-label">{tr('נכסים בתיק')}</div>
          <div className="table-wrap">
            <table className="responsive portfolio-table">
              <thead>
                <tr>
                  <th>{tr('שם')}</th>
                  <th>{tr('סמל')}</th>
                  <th>{tr('מטבע')}</th>
                  <th>{tr('סטופ')}</th>
                  <th>{tr('לימיט')}</th>
                  <th>{tr('הערה')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.holdings.map((h, i) => (
                  <tr key={i}>
                    <td data-label={tr('שם')}>
                      <input type="text" value={h.name} onChange={(e) => setHolding(i, { name: e.target.value })} required />
                    </td>
                    <td data-label={tr('סמל')}>
                      <input type="text"
                        value={h.symbol ?? ''}
                        onChange={(e) => setHolding(i, { symbol: e.target.value.trim() || null })}
                        placeholder={tr('אין')}
                        dir="ltr"
                        style={{ width: 100 }}
                      />{' '}
                      <SymbolStatus symbol={h.symbol} />
                    </td>
                    <td data-label={tr('מטבע')}>
                      <input type="text"
                        value={h.currency}
                        onChange={(e) => setHolding(i, { currency: e.target.value.toUpperCase() })}
                        maxLength={3}
                        dir="ltr"
                        style={{ width: 60 }}
                        required
                      />
                    </td>
                    <td data-label={tr('סטופ')}>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={h.stop ?? ''}
                        onChange={(e) => setHolding(i, { stop: num(e.target.value) })}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td data-label={tr('לימיט')}>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={h.stopLimit ?? ''}
                        onChange={(e) => setHolding(i, { stopLimit: num(e.target.value) })}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td data-label={tr('הערה')}>
                      <input type="text" value={h.note ?? ''} onChange={(e) => setHolding(i, { note: e.target.value || undefined })} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={trf('הסרת {name}', { name: h.name })}
                        onClick={() => update({ ...draft, holdings: draft.holdings.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => update({ ...draft, holdings: [...draft.holdings, { name: '', symbol: null, currency: 'USD' }] })}
          >
            {tr('הוספת נכס')}
          </button>

          <div className="agent-editor-label">{tr('רשימת מעקב')}</div>
          <p className="dim">{tr('נכסים שאתם עוקבים אחריהם ועוד לא מחזיקים. הסוכנים סורקים אותם מול הכללים שלכם — הם לא מוסיפים לרשימה נכסים משלהם.')}</p>
          <div className="table-wrap">
            <table className="responsive portfolio-table">
              <thead>
                <tr>
                  <th>{tr('שם')}</th>
                  <th>{tr('סמל')}</th>
                  <th>{tr('הערה')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.watchlist.map((w, i) => (
                  <tr key={i}>
                    <td data-label={tr('שם')}>
                      <input type="text" value={w.name} onChange={(e) => setWatch(i, { name: e.target.value })} required />
                    </td>
                    <td data-label={tr('סמל')}>
                      <input type="text"
                        value={w.symbol}
                        onChange={(e) => setWatch(i, { symbol: e.target.value.trim() })}
                        dir="ltr"
                        style={{ width: 100 }}
                        required
                      />{' '}
                      <SymbolStatus symbol={w.symbol} />
                    </td>
                    <td data-label={tr('הערה')}>
                      <input type="text" value={w.note ?? ''} onChange={(e) => setWatch(i, { note: e.target.value || undefined })} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={trf('הסרת {name}', { name: w.name })}
                        onClick={() => update({ ...draft, watchlist: draft.watchlist.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => update({ ...draft, watchlist: [...draft.watchlist, { name: '', symbol: '' }] })}
          >
            {tr('הוספה לרשימת המעקב')}
          </button>

          <label className="agent-editor-block">
            {tr('הכללים שלכם')}
            <textarea value={draft.rules} onChange={(e) => update({ ...draft, rules: e.target.value })} rows={10} maxLength={8000} />
            <span className="mini-label">{tr('הסוכנים משווים את העובדות לכללים כפי שהם כתובים כאן. הם לא מנסחים כללים חדשים.')}</span>
          </label>
        </fieldset>

        {error && (
          <div className="notice warn" role="alert">
            {error}
          </div>
        )}
        {notice && <div className="notice">{notice}</div>}

        {isOwner && (
          <div className="agent-slot-actions">
            <button className="btn" type="submit" disabled={busy || !dirty}>
              {busy ? tr('שומר…') : tr('שמירת התיק')}
            </button>
            {dirty && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setDraft(portfolio ?? EMPTY)
                  setDirty(false)
                }}
              >
                {tr('ביטול השינויים')}
              </button>
            )}
            <button
              className="btn ghost"
              type="button"
              onClick={() => void check()}
              disabled={!serviceAlive || checkPending || dirty}
              title={dirty ? tr('שמרו קודם — הבדיקה רצה על התיק השמור') : undefined}
            >
              {checkPending ? tr('בודק סמלים…') : tr('בדיקת סמלים')}
            </button>
            <button className="btn ghost" type="button" onClick={() => void api.portfolioVersions(householdId).then(setVersions, (e) => setError(e.message))}>
              {tr('היסטוריית התיק')}
            </button>
          </div>
        )}
        {symbolCheck && (
          <p className="dim">
            {trf('בדיקת סמלים אחרונה: {time} · {bad} מתוך {n} לא נמצאו', {
              time: dateTime(symbolCheck.checkedAt),
              bad: symbolCheck.results.filter((r) => !r.ok).length,
              n: symbolCheck.results.length,
            })}
          </p>
        )}
      </form>

      {versions && (
        <ul className="agent-versions">
          {versions.length === 0 && <li className="dim">{tr('אין עדיין גרסאות')}</li>}
          {versions.map((v) => (
            <li key={v.seq}>
              <span>{dateTime(v.savedAt)}</span>
              <span className="dim">{v.savedBy === 'import' ? tr('יובא מהקובץ') : v.savedBy}</span>
              <span className="dim">
                {trf('{h} נכסים · {w} במעקב', { h: v.portfolio.holdings.length, w: v.portfolio.watchlist.length })}
              </span>
              {isOwner && (
                <button
                  className="btn sm ghost"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.revertPortfolio(householdId, v.seq)
                      setVersions(null)
                    }, tr('הגרסה שוחזרה.'))
                  }
                >
                  {tr('שחזור')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
