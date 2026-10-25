import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentDef, AgentEvent, AgentId, AgentRun, AgentsSnapshot } from '../types'
import { api } from '../lib/api'
import { getLang, tr, trf, useLang } from '../lib/i18n'
import VoxelFigure, { type FigureState } from './VoxelFigure'
import AgentsBudget from './AgentsBudget'
import AgentManager from './AgentManager'
import PortfolioEditor from './PortfolioEditor'
import TelegramCard from './TelegramCard'

interface Props {
  householdId: string
  isOwner: boolean
  subscribe: (listener: (event: AgentEvent) => void) => () => void
}

type Catalog = AgentsSnapshot['catalog']

/** שם בשפת המסך. ריצה של סוכן שנמחק עדיין מוצגת — עם המזהה שלו */
const nameOf = (defs: AgentDef[], id: AgentId) => {
  const def = defs.find((d) => d.id === id)
  return def ? pick(def.name, def.nameEn) : id
}

const colorOf = (defs: AgentDef[], id: AgentId) => defs.find((d) => d.id === id)?.color ?? '#8a949b'

const TYPE_ICON: Record<AgentEvent['type'], string> = {
  start: '▶️',
  thinking: '💭',
  tool_call: '🔧',
  finding: '💡',
  alert: '⚠️',
  memory: '🧠',
  done: '✅',
  error: '❌',
}

/**
 * מחירון Claude Opus 5.5 לכל מיליון טוקנים — רק לריצות שקדמו לרישום העלות.
 * ריצה חדשה מגיעה עם העלות שחושבה בשירות, לפי המודל שענה בפועל.
 */
const PRICE_PER_MTOK = { input: 4, output: 20 }

/** גדלי היומן. 50 מוצגים תמיד; השאר נטענים מהשרת לפי בקשה */
const LOG_SIZES = [250, 1000] as const
const LOG_TAIL = 50

/**
 * טקסט של סוכן בשפת המסך. בלי אנגלית — מחרוזת קבועה עוברת דרך tr, וטקסט
 * חופשי של המודל מוצג בעברית: עדיף מאשר שורה ריקה.
 */
function pick(he: string | null | undefined, en: string | null | undefined): string {
  if (getLang() === 'en' && en) return en
  return he ? tr(he) : ''
}

/** כמה זמן מצב רגעי (ממצא, התראה, סיום) נשאר על הדמות לפני שהיא חוזרת לשגרה */
const MOMENT_MS = 6000

/** ריצה שלא שלחה דבר זמן כזה כנראה נקטעה בלי לדווח על שגיאה */
const STALE_MS = 10 * 60_000

/** שירות שלא משך בקשות בזמן הזה נחשב מנותק. הוא מושך כל 20 שניות */
const SERVICE_ALIVE_MS = 90_000

function toolText(e: AgentEvent, catalog: Catalog): string {
  const info = e.tool ? catalog[e.tool as keyof Catalog] : undefined
  const label = info ? pick(info.label, info.labelEn) : (e.tool ?? '')
  const text = pick(e.text, e.textEn)
  return text ? `${label} · ${text}` : label
}

function describe(e: AgentEvent, catalog: Catalog): string {
  switch (e.type) {
    case 'tool_call':
      return toolText(e, catalog)
    case 'thinking':
      return tr('חושב…')
    default:
      return pick(e.text, e.textEn) || tr(e.type === 'start' ? 'מתחיל' : e.type === 'done' ? 'סיים' : '')
  }
}

/**
 * מצב הדמות נגזר מהצעד האחרון של הריצה האחרונה.
 *
 * רגעים — ממצא, התראה, סיום — נשארים על המסך כמה שניות ואז מתחלפים, כדי
 * שקפיצה של ממצא לא תימשך לנצח אם זה היה הצעד האחרון שנשמר.
 */
function figureOf(run: AgentRun | undefined, now: number, catalog: Catalog): { state: FigureState; bubble?: string } {
  const last = run?.events[run.events.length - 1]
  if (!run || !last) return { state: 'idle' }
  const age = now - Date.parse(last.at)

  if (run.status === 'running' && age > STALE_MS) {
    return { state: 'error', bubble: tr('הריצה נקטעה בלי דיווח') }
  }
  switch (last.type) {
    case 'start':
      return { state: 'thinking', bubble: pick(last.text, last.textEn) || tr('מתחיל…') }
    case 'thinking':
      return { state: 'thinking', bubble: tr('חושב…') }
    case 'tool_call':
      return { state: 'working', bubble: toolText(last, catalog) }
    case 'memory':
      return { state: 'working', bubble: `🧠 ${pick(last.text, last.textEn)}` }
    case 'finding':
      return { state: age < MOMENT_MS ? 'finding' : 'thinking', bubble: pick(last.text, last.textEn) }
    case 'alert':
      return { state: age < MOMENT_MS ? 'alert' : 'thinking', bubble: pick(last.text, last.textEn) }
    case 'done':
      return age < MOMENT_MS ? { state: 'done', bubble: pick(last.text, last.textEn) } : { state: 'idle' }
    case 'error':
      return { state: 'error', bubble: pick(last.text, last.textEn) || tr('שגיאה') }
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
      summaryEn: terminal ? (e.textEn ?? null) : null,
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
          ...(terminal
            ? { status: e.type as 'done' | 'error', finishedAt: e.at, summary: e.text ?? null, summaryEn: e.textEn ?? null }
            : {}),
        },
  )
}

function costOf(run: AgentRun): string | null {
  if (run.costUsd != null) return `$${run.costUsd.toFixed(3)}`
  if (run.inputTokens == null || run.outputTokens == null) return null
  const usd =
    (run.inputTokens * PRICE_PER_MTOK.input + run.outputTokens * PRICE_PER_MTOK.output) / 1_000_000
  return `$${usd.toFixed(3)}`
}

/** claude-opus-5-5 → Opus 5.5 */
function modelName(model: string | null | undefined): string {
  const m = model?.match(/^claude-([a-z]+)-(\d+)-(\d+)/)
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : (model ?? '')
}

/** אירוע זהה מגיע פעמיים כשהיומן המורחב נטען בזמן ריצה — מפתח לסינון */
const eventKey = (e: AgentEvent) => `${e.runId}|${e.at}|${e.type}|${e.tool ?? ''}`

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
  /** יומן מורחב (250 או 1000) שנטען מהשרת. ‏null — מוצג הזנב מתוך הריצות */
  const [longLog, setLongLog] = useState<{ size: number; events: AgentEvent[] } | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  const lang = useLang()

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
        // היומן המורחב ממשיך לקבל צעדים חיים למעלה, בלי לגדול מעבר לגודל שנבחר
        setLongLog((prev) => (prev ? { ...prev, events: [event, ...prev.events].slice(0, prev.size) } : prev))
        const current = snapRef.current
        if (current) setAnnounce(`${nameOf(current.defs, event.agent)}: ${describe(event, current.catalog)}`)
        // הסוכן עדכן את הזיכרון — טוענים, כדי שהעורך יציג את הגרסה החדשה
        if (event.type === 'memory') setTimeout(() => void load(), 700)
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

  // הקריאה החיה מגיעה מחוץ לרינדור; ה-ref נותן לה את השמות והקטלוג העדכניים
  const snapRef = useRef(snapshot)
  useEffect(() => {
    snapRef.current = snapshot
  }, [snapshot])

  const runs = snapshot?.runs ?? []
  const defs = snapshot?.defs ?? []
  const catalog = (snapshot?.catalog ?? {}) as Catalog
  const agents = defs.filter((d) => d.enabled)
  const latest = useMemo(() => {
    const map = new Map<AgentId, AgentRun>()
    for (const run of runs) if (!map.has(run.agent)) map.set(run.agent, run)
    return map
  }, [runs])

  const feed = useMemo(() => {
    if (longLog) {
      const seen = new Set<string>()
      return longLog.events.filter((e) => !seen.has(eventKey(e)) && seen.add(eventKey(e)))
    }
    // כל ריצה מהסוף להתחלה, ואז מיון יציב לפי זמן: צעדים באותה אלפית שנייה
    // נשארים בסדר שבו קרו, ולא מתערבבים
    return runs
      .flatMap((run) => [...run.events].reverse().map((e) => ({ ...e, demo: run.demo })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, LOG_TAIL)
  }, [runs, longLog])

  async function showLog(size: (typeof LOG_SIZES)[number] | null) {
    if (size == null) return setLongLog(null)
    setLogLoading(true)
    try {
      setLongLog({ size, events: await api.agentsLog(householdId, size) })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLogLoading(false)
    }
  }

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
          ? trf('{name} כבר בתור — הוא יתחיל בסבב הבא.', { name: nameOf(defs, agent) })
          : trf('{name} יתחיל תוך כ-20 שניות.', { name: nameOf(defs, agent) }),
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
          {tr('סוכני Claude שרצים על השרת שלכם. הם מנתחים ומסכמים — לעולם לא מבצעים פעולה, ואין להם גישה לחשבון המסחר.')}
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
          {agents.map((def) => {
            const agent = def.id
            const run = latest.get(agent)
            const figure = figureOf(run, now, catalog)
            const busy = run?.status === 'running'
            const name = pick(def.name, def.nameEn)
            return (
              <div className="agent-slot" key={agent}>
                <VoxelFigure
                  color={def.color}
                  emoji={def.emoji}
                  state={figure.state}
                  bubble={figure.bubble}
                  label={trf('{name} — {state}', { name, state: tr(STATE_LABEL[figure.state]) })}
                />
                <div className="agent-slot-name">
                  {name}
                  {/* גם אחרי הסיום: הבועה עדיין מציגה ערכים לדוגמה, ואסור שייראו אמיתיים */}
                  {run?.demo && <span className="demo-tag">{tr('הדגמה')}</span>}
                </div>
                <div className="agent-slot-role">{pick(def.role, def.roleEn)}</div>
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
          {agents.map((def) => {
            const agent = def.id
            const run = latest.get(agent)
            const cost = run ? costOf(run) : null
            return (
              <div className="agent-run" key={agent}>
                <div className="agent-run-head">
                  <span className="agent-swatch" style={{ background: def.color }} />
                  {pick(def.name, def.nameEn)}
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
                    {run.summary && <p>{pick(run.summary, run.summaryEn)}</p>}
                    {cost && run.inputTokens != null && run.outputTokens != null && (
                      <p className="dim">
                        {trf('{input} טוקנים נכנסים · {output} יוצאים · כ-{cost}', {
                          input: run.inputTokens.toLocaleString(),
                          output: run.outputTokens.toLocaleString(),
                          cost,
                        })}
                        {run.model && ` · ${modelName(run.model)}`}
                        {!!run.searches && ` · ${trf('{n} חיפושים', { n: run.searches })}`}
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {snapshot && (
        <AgentsBudget
          householdId={householdId}
          isOwner={isOwner}
          budget={snapshot.budget}
          agentName={(agent) => nameOf(defs, agent)}
          agentColor={(agent) => colorOf(defs, agent)}
          onChange={(budget) => setSnapshot((prev) => (prev ? { ...prev, budget } : prev))}
        />
      )}

      <div className="card">
        <div className="agent-log-head">
          <div className="card-title">{tr('יומן חי')}</div>
          <span className="dim">
            {longLog
              ? trf('{n} הצעדים האחרונים', { n: longLog.size })
              : trf('{n} הצעדים האחרונים', { n: LOG_TAIL })}
          </span>
        </div>
        <div className="agent-log-actions">
          {LOG_SIZES.map((size) => (
            <button
              key={size}
              className={`btn sm${longLog?.size === size ? '' : ' ghost'}`}
              onClick={() => void showLog(size)}
              disabled={logLoading}
              aria-pressed={longLog?.size === size}
            >
              {trf('הצג {n}', { n: size })}
            </button>
          ))}
          {longLog && (
            <button className="btn sm ghost" onClick={() => void showLog(null)}>
              {trf('חזרה ל-{n}', { n: LOG_TAIL })}
            </button>
          )}
          <a className="btn sm ghost" href={api.agentsLogUrl(householdId, lang)} download>
            {tr('הורדת היומן המלא')}
          </a>
        </div>
        {feed.length ? (
          <ul className="agent-feed agent-feed-scroll" aria-busy={logLoading}>
            {feed.map((e, i) => (
              <li key={`${eventKey(e)}-${i}`}>
                <time dateTime={e.at}>{timeOf(e.at)}</time>
                <span className="agent-feed-who">
                  <span className="agent-swatch" style={{ background: colorOf(defs, e.agent) }} />
                  {nameOf(defs, e.agent)}
                </span>
                <span className="agent-feed-text">
                  <span aria-hidden="true">{TYPE_ICON[e.type]} </span>
                  {describe(e, catalog)}
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
          {agents.map((def) => (
            <li key={def.id}>
              <strong>{pick(def.name, def.nameEn)}</strong>
              {def.tools.length ? (
                <ul>
                  {def.tools.map((t) => (
                    <li key={t}>
                      {catalog[t] ? `${pick(catalog[t].label, catalog[t].labelEn)}: ${pick(catalog[t].sends, catalog[t].sendsEn)}` : t}
                    </li>
                  ))}
                </ul>
              ) : (
                ` — ${tr('בלי כלים: רק ההנחיות שלו')}`
              )}
            </li>
          ))}
        </ul>
      </div>

      {snapshot && (
        <>
          <AgentManager
            householdId={householdId}
            isOwner={isOwner}
            defs={defs}
            catalog={catalog}
            memory={snapshot.memory}
            onChanged={load}
          />
          <PortfolioEditor
            householdId={householdId}
            isOwner={isOwner}
            portfolio={snapshot.portfolio}
            symbolCheck={snapshot.symbolCheck}
            serviceAlive={alive}
            onChanged={load}
          />
          <TelegramCard householdId={householdId} isOwner={isOwner} telegram={snapshot.telegram} onChanged={load} />
        </>
      )}
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
