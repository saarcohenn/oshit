import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentEvent, AgentId, AgentRun, AgentsSnapshot } from '../types'
import { api } from '../lib/api'
import { getLang, tr, trf } from '../lib/i18n'
import VoxelFigure, { type FigureState } from './VoxelFigure'

interface Props {
  householdId: string
  isOwner: boolean
  subscribe: (listener: (event: AgentEvent) => void) => () => void
}

const AGENTS: AgentId[] = ['market', 'spending', 'research']

const NAME: Record<AgentId, string> = {
  market: 'סוכן השוק',
  spending: 'סוכן ההוצאות',
  research: 'סוכן המחקר',
}

const ROLE: Record<AgentId, string> = {
  market: 'מחירים, ממוצעים, סטופים ורשימת המעקב — מול הכללים שלך',
  spending: 'תקציבים, חריגות והתאמת חיובי כרטיס',
  research: 'חדשות ודוחות קרובים לתיק ולרשימת המעקב',
}

/**
 * מה כל סוכן שולח ל-Anthropic.
 *
 * גלוי במסך ולא קבור בתיעוד: האפליקציה הבטיחה שנתונים פיננסיים לא יוצאים
 * מהשרת, והסוכנים הם החריג היחיד — אז המשתמש צריך לראות בדיוק מה עובר.
 */
const SENDS: Record<AgentId, string> = {
  market: 'מחירים ציבוריים, שמות הנכסים ורשימת המעקב, והסטופים והכללים שהגדרת. לא כמויות ולא שווי.',
  spending:
    'סכומים לפי קטגוריה וחודש, סכום החיוב לכל כרטיס (ארבע ספרות אחרונות), ופריטים חריגים בלבד (בית עסק וסכום). רשימת העסקאות עצמה לא נשלחת.',
  research:
    'שמות הנכסים שבתיק וברשימת המעקב, לחיפוש חדשות. הסוכן קורא דפי אינטרנט שעלולים להכיל טקסט מטעה — ולכן אין לו שום כלי שמבצע פעולה.',
}

const TOOL_LABEL: Record<string, string> = {
  get_market_snapshot: 'נתוני שוק',
  screen_watchlist: 'רשימת מעקב',
  get_spending_summary: 'סיכום הוצאות',
  get_flagged_items: 'פריטים חריגים',
  get_reconciliation: 'התאמת כרטיסים',
  get_holdings: 'נכסי התיק',
  web_search: 'חיפוש ברשת',
}

const TYPE_ICON: Record<AgentEvent['type'], string> = {
  start: '▶️',
  thinking: '💭',
  tool_call: '🔧',
  finding: '💡',
  alert: '⚠️',
  done: '✅',
  error: '❌',
}

/** מחירון Claude Opus 5.5 לכל מיליון טוקנים. הערכה — החשבון האמיתי ב-Console */
const PRICE_PER_MTOK = { input: 4, output: 20 }

/** כמה זמן מצב רגעי (ממצא, התראה, סיום) נשאר על הדמות לפני שהיא חוזרת לשגרה */
const MOMENT_MS = 6000

/** ריצה שלא שלחה דבר זמן כזה כנראה נקטעה בלי לדווח על שגיאה */
const STALE_MS = 10 * 60_000

/** שירות שלא משך בקשות בזמן הזה נחשב מנותק. הוא מושך כל 20 שניות */
const SERVICE_ALIVE_MS = 90_000

function toolText(e: AgentEvent): string {
  const label = e.tool ? tr(TOOL_LABEL[e.tool] ?? e.tool) : ''
  return e.text ? `${label} · ${e.text}` : label
}

function describe(e: AgentEvent): string {
  switch (e.type) {
    case 'tool_call':
      return toolText(e)
    case 'thinking':
      return tr('חושב…')
    default:
      return e.text ?? tr(e.type === 'start' ? 'מתחיל' : e.type === 'done' ? 'סיים' : '')
  }
}

/**
 * מצב הדמות נגזר מהצעד האחרון של הריצה האחרונה.
 *
 * רגעים — ממצא, התראה, סיום — נשארים על המסך כמה שניות ואז מתחלפים, כדי
 * שקפיצה של ממצא לא תימשך לנצח אם זה היה הצעד האחרון שנשמר.
 */
function figureOf(run: AgentRun | undefined, now: number): { state: FigureState; bubble?: string } {
  const last = run?.events[run.events.length - 1]
  if (!run || !last) return { state: 'idle' }
  const age = now - Date.parse(last.at)

  if (run.status === 'running' && age > STALE_MS) {
    return { state: 'error', bubble: tr('הריצה נקטעה בלי דיווח') }
  }
  switch (last.type) {
    case 'start':
      return { state: 'thinking', bubble: last.text ?? tr('מתחיל…') }
    case 'thinking':
      return { state: 'thinking', bubble: tr('חושב…') }
    case 'tool_call':
      return { state: 'working', bubble: toolText(last) }
    case 'finding':
      return { state: age < MOMENT_MS ? 'finding' : 'thinking', bubble: last.text }
    case 'alert':
      return { state: age < MOMENT_MS ? 'alert' : 'thinking', bubble: last.text }
    case 'done':
      return age < MOMENT_MS ? { state: 'done', bubble: last.text } : { state: 'idle' }
    case 'error':
      return { state: 'error', bubble: last.text ?? tr('שגיאה') }
  }
}

/** מוסיף צעד חי לרשימת הריצות. ריצה חדשה נכנסת ראשונה — הרשימה ממוינת מהחדשה */
function mergeEvent(runs: AgentRun[], e: AgentEvent): AgentRun[] {
  const index = runs.findIndex((r) => r.id === e.runId)
  const terminal = e.type === 'done' || e.type === 'error'
  if (index === -1) {
    const fresh: AgentRun = {
      id: e.runId,
      agent: e.agent,
      status: terminal ? (e.type as 'done' | 'error') : 'running',
      startedAt: e.at,
      finishedAt: terminal ? e.at : null,
      summary: terminal ? (e.text ?? null) : null,
      inputTokens: null,
      outputTokens: null,
      demo: !!e.demo,
      events: [e],
    }
    return [fresh, ...runs]
  }
  return runs.map((r, i) =>
    i !== index
      ? r
      : {
          ...r,
          events: [...r.events, e],
          ...(terminal ? { status: e.type as 'done' | 'error', finishedAt: e.at, summary: e.text ?? null } : {}),
        },
  )
}

function costOf(run: AgentRun): string | null {
  if (run.inputTokens == null || run.outputTokens == null) return null
  const usd =
    (run.inputTokens * PRICE_PER_MTOK.input + run.outputTokens * PRICE_PER_MTOK.output) / 1_000_000
  return `$${usd.toFixed(3)}`
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(getLang() === 'he' ? 'he-IL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

export default function AgentsPanel({ householdId, isOwner, subscribe }: Props) {
  const [snapshot, setSnapshot] = useState<AgentsSnapshot | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [announce, setAnnounce] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setSnapshot(await api.agents(householdId))
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }, [householdId])

  useEffect(() => {
    void load()
    // מצב החיבור של השירות מתיישן — הוא נקבע לפי מתי השירות משך בקשות
    const refresh = setInterval(() => void load(), 60_000)
    return () => clearInterval(refresh)
  }, [load])

  useEffect(
    () =>
      subscribe((event) => {
        setSnapshot((prev) => (prev ? { ...prev, runs: mergeEvent(prev.runs, event) } : prev))
        setAnnounce(`${tr(NAME[event.agent])}: ${describe(event)}`)
        /*
         * בסוף ריצה טוענים מחדש: הטוקנים לא עוברים בשידור החי, וצעדים
         * שהוחמצו בזמן ניתוק של הזרם נאספים כאן.
         */
        if (event.type === 'done' || event.type === 'error') setTimeout(() => void load(), 700)
      }),
    [subscribe, load],
  )

  // שעון שמניע את המעבר מרגע (קפיצה, רעד) חזרה לשגרה
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const runs = snapshot?.runs ?? []
  const latest = useMemo(() => {
    const map = new Map<AgentId, AgentRun>()
    for (const run of runs) if (!map.has(run.agent)) map.set(run.agent, run)
    return map
  }, [runs])

  const feed = useMemo(
    () =>
      runs
        .flatMap((run) => run.events.map((e) => ({ ...e, demo: run.demo })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 40),
    [runs],
  )

  const demoActive = runs.some((r) => r.demo && r.status === 'running')
  const configured = snapshot?.configured ?? false
  const alive =
    !!snapshot?.serviceSeenAt && now - Date.parse(snapshot.serviceSeenAt) < SERVICE_ALIVE_MS

  async function runDemo() {
    setNotice('')
    try {
      const result = await api.agentsDemo(householdId)
      if (result.alreadyRunning) setNotice(tr('הדגמה כבר רצה — הדמויות כבר בדרך.'))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function runNow(agent: AgentId) {
    setNotice('')
    try {
      const result = await api.runAgent(householdId, agent)
      setNotice(
        result.existing
          ? trf('{name} כבר בתור — הוא יתחיל בסבב הבא.', { name: tr(NAME[agent]) })
          : trf('{name} יתחיל תוך כ-20 שניות.', { name: tr(NAME[agent]) }),
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="card-title">{tr('סוכנים')}</div>
        <div className="card-sub">
          {tr('שלושה סוכני Claude שרצים על השרת שלכם. הם מנתחים ומסכמים — לעולם לא מבצעים פעולה, ואין להם גישה לחשבון המסחר.')}
        </div>

        <div className="agents-status" role="status">
          {!configured ? (
            <>
              <span className="agents-dot" />
              {tr('שירות הסוכנים עוד לא הוגדר בשרת. ההדגמה עובדת גם בלעדיו — היא לא פונה למודל.')}
            </>
          ) : alive ? (
            <>
              <span className="agents-dot on" />
              {tr('שירות הסוכנים מחובר')}
            </>
          ) : (
            <>
              <span className="agents-dot off" />
              {tr('שירות הסוכנים לא מחובר — בדקו שהקונטיינר oshit-agents רץ.')}
            </>
          )}
        </div>

        {error && <div className="notice warn" role="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        <div className="agents-stage" style={{ marginTop: 14 }}>
          {AGENTS.map((agent) => {
            const run = latest.get(agent)
            const figure = figureOf(run, now)
            const busy = run?.status === 'running'
            return (
              <div className="agent-slot" key={agent}>
                <VoxelFigure
                  agent={agent}
                  state={figure.state}
                  bubble={figure.bubble}
                  label={trf('{name} — {state}', { name: tr(NAME[agent]), state: tr(STATE_LABEL[figure.state]) })}
                />
                <div className="agent-slot-name">
                  {tr(NAME[agent])}
                  {/* גם אחרי הסיום: הבועה עדיין מציגה ערכים לדוגמה, ואסור שייראו אמיתיים */}
                  {run?.demo && <span className="demo-tag">{tr('הדגמה')}</span>}
                </div>
                <div className="agent-slot-role">{tr(ROLE[agent])}</div>
                {isOwner && (
                  <div className="agent-slot-actions">
                    <button
                      className="btn sm"
                      onClick={() => void runNow(agent)}
                      disabled={!configured || busy}
                      title={!configured ? tr('שירות הסוכנים לא מוגדר בשרת') : undefined}
                    >
                      {tr('הרץ עכשיו')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="agent-slot-actions" style={{ marginTop: 14 }}>
          {isOwner ? (
            <button className="btn ghost" onClick={() => void runDemo()} disabled={demoActive}>
              {demoActive ? tr('הדגמה רצה…') : tr('הדגמה')}
            </button>
          ) : (
            <span className="dim">{tr('רק בעלים של משק הבית יכולים להפעיל סוכנים.')}</span>
          )}
        </div>

        {/* הכרזה לקוראי מסך על כל צעד חי — הדמויות עצמן הן תמונה */}
        <div className="sr-only" aria-live="polite">
          {announce}
        </div>
      </div>

      <div className="card">
        <div className="card-title">{tr('ריצה אחרונה')}</div>
        <div className="agent-runs">
          {AGENTS.map((agent) => {
            const run = latest.get(agent)
            const cost = run ? costOf(run) : null
            return (
              <div className="agent-run" key={agent}>
                <div className="agent-run-head">
                  <span className={`agent-swatch ${agent}`} />
                  {tr(NAME[agent])}
                  {run?.demo && <span className="demo-tag">{tr('הדגמה')}</span>}
                </div>
                {!run ? (
                  <p className="dim">{tr('עוד לא רץ')}</p>
                ) : (
                  <>
                    <p className="dim">
                      {run.status === 'running'
                        ? tr('רץ עכשיו')
                        : trf('{status} · {time}', {
                            status: tr(run.status === 'done' ? 'הסתיים' : 'נכשל'),
                            time: timeOf(run.finishedAt ?? run.startedAt),
                          })}
                    </p>
                    {run.summary && <p>{run.summary}</p>}
                    {cost && (
                      <p className="dim">
                        {trf('{input} טוקנים נכנסים · {output} יוצאים · כ-{cost}', {
                          input: run.inputTokens!.toLocaleString(),
                          output: run.outputTokens!.toLocaleString(),
                          cost,
                        })}
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">{tr('יומן חי')}</div>
        {feed.length ? (
          <ul className="agent-feed">
            {feed.map((e, i) => (
              <li key={`${e.runId}-${e.at}-${i}`}>
                <time dateTime={e.at}>{timeOf(e.at)}</time>
                <span className="agent-feed-who">
                  <span className={`agent-swatch ${e.agent}`} />
                  {tr(NAME[e.agent])}
                </span>
                <span className="agent-feed-text">
                  <span aria-hidden="true">{TYPE_ICON[e.type]} </span>
                  {describe(e)}
                  {e.demo && <span className="demo-tag">{tr('הדגמה')}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim">{tr('עוד אין צעדים. לחצו "הדגמה" כדי לראות את הסוכנים בפעולה.')}</p>
        )}
      </div>

      <div className="card">
        <div className="card-title">{tr('מה נשלח ל-Anthropic')}</div>
        <div className="card-sub">
          {tr('כדי לנתח, כל סוכן שולח למודל רק את מה שמפורט כאן. ההחלטה מה לעשות עם הממצאים — שלכם.')}
        </div>
        <ul className="import-summary">
          {AGENTS.map((agent) => (
            <li key={agent}>
              <strong>{tr(NAME[agent])}</strong> — {tr(SENDS[agent])}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const STATE_LABEL: Record<FigureState, string> = {
  idle: 'ממתין',
  thinking: 'חושב',
  working: 'עובד',
  finding: 'מצא משהו',
  alert: 'התראה',
  done: 'סיים',
  error: 'שגיאה',
}
