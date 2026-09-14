import { useMemo, useState } from 'react'
import type { Goal, Income, Transaction, TxAnnotation } from '../types'
import { goalDueMonth, goalProgress, incomeForMonth } from '../lib/plan'
import { NECESSITIES, NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { availableMonths, monthlySeries, partialMonths, summarize, topMerchants } from '../lib/analytics'
import { ils, monthLabel, pct, shortDate, txCount } from '../lib/format'
import {
  DonutChart,
  foldSlices,
  NECESSITY_VAR,
  NecessityTrendChart,
  RankedBars,
  type TrendWindow,
} from './charts'
import { tr, trf } from '../lib/i18n'

const WINDOW_KEY = 'oshit.trendWindow'

function loadWindow(): TrendWindow {
  try {
    const v = Number(localStorage.getItem(WINDOW_KEY))
    return v === 3 || v === 6 || v === 12 || v === 24 ? v : 12
  } catch {
    return 12
  }
}

export default function Dashboard({
  transactions,
  month,
  incomes,
  goals,
  annotations,
  onGoToPlan,
}: {
  transactions: Transaction[]
  month: string
  incomes: Income[]
  goals: Goal[]
  annotations: Record<string, TxAnnotation>
  onGoToPlan: () => void
}) {
  const cats = useCategories()
  const summary = useMemo(() => summarize(transactions, month), [transactions, month])
  const series = useMemo(() => monthlySeries(transactions), [transactions])
  const merchants = useMemo(() => topMerchants(transactions, month, 6), [transactions, month])
  const [window, setWindowState] = useState<TrendWindow>(loadWindow)
  const [allCategories, setAllCategories] = useState(false)

  const setWindow = (w: TrendWindow) => {
    setWindowState(w)
    try {
      localStorage.setItem(WINDOW_KEY, String(w))
    } catch {
      /* העדפת תצוגה בלבד — בלי אחסון פשוט לא נזכרים בה */
    }
  }

  const months = availableMonths(transactions)
  const partial = useMemo(() => partialMonths(transactions), [transactions])

  // השוואה נעשית רק מול חודש מלא — חודש חלקי היה מייצר קפיצה חסרת משמעות
  const prevMonth = months.slice(months.indexOf(month) + 1).find((m) => !partial.has(m))
  const prev = useMemo(
    () => (prevMonth ? summarize(transactions, prevMonth) : null),
    [transactions, prevMonth],
  )

  const delta = prev ? summary.total - prev.total : 0
  const deltaPct = prev && prev.total ? Math.round((delta / prev.total) * 100) : 0
  const monthIsPartial = partial.has(month)
  const cuttable = summary.byNecessity.optional + summary.byNecessity.semi * 0.3

  const income = incomeForMonth(incomes, month)
  const net = income - summary.total

  const fallback = cats.list.find((c) => c.isFallback)
  const fallbackTotal = fallback
    ? (summary.byCategory.find((c) => c.category === fallback.id)?.total ?? 0)
    : 0
  // כמה מבתי העסק הגדולים של החודש יושבים בקטגוריית "שונות" — שם התיקון משתלם
  const fallbackMerchants = fallback ? merchants.filter((m) => m.category === fallback.id).length : 0

  const categorySlices = foldSlices(
    summary.byCategory.map((c) => ({
      key: c.category,
      label: cats.byId(c.category).name,
      emoji: cats.byId(c.category).emoji,
      value: c.total,
      color: cats.byId(c.category).color,
    })),
  )

  /*
   * היעד הקרוב: הפעיל שהמועד שלו הכי קרוב ועוד לא עבר. יעד בלי מועד
   * מוצג רק אם אין אף אחד עם מועד — הוא פחות דחוף מכל יעד מתוארך.
   */
  const nearest = useMemo(() => {
    const goalIdByTx: Record<string, string | undefined> = {}
    for (const [id, a] of Object.entries(annotations)) goalIdByTx[id] = a.goalId
    const active = goals.filter((g) => !g.done && g.targetAmount > 0)
    const dated = active
      .filter((g) => (goalDueMonth(g) ?? '') >= month)
      .sort((a, b) => (a.targetDate ?? `${goalDueMonth(a)}-28`).localeCompare(b.targetDate ?? `${goalDueMonth(b)}-28`))
    const pick = dated[0] ?? active.find((g) => !goalDueMonth(g))
    return pick ? goalProgress(pick, transactions, goalIdByTx, month) : null
  }, [goals, annotations, transactions, month])

  const daysLeft = nearest?.goal.targetDate
    ? Math.ceil((new Date(nearest.goal.targetDate).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="grid">
      {monthIsPartial && (
        <div className="notice warn">
          {trf(
            'ל{month} יש רק {count} — כנראה עסקאות חו"ל שחויבו מיידית, ולא חודש שלם. ייבאו את קובץ הבנק של אותו חודש כדי לראות תמונה מלאה.',
            { month: monthLabel(month), count: txCount(summary.count) },
          )}
        </div>
      )}

      <div className="kpis">
        <div className="card kpi">
          <div className="stat-label">{trf('סך ההוצאות — {month}', { month: monthLabel(month) })}</div>
          <div className="stat-value big">{ils(summary.total)}</div>
          <div className="stat-note">{txCount(summary.count)}</div>
        </div>

        <div className="card kpi">
          <div className="stat-label">{tr('שינוי מהחודש הקודם')}</div>
          <div
            className="stat-value big"
            style={{ color: !prev ? undefined : delta > 0 ? 'var(--danger)' : 'var(--ok)' }}
          >
            {prev ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${ils(Math.abs(delta))}` : '—'}
          </div>
          <div className="stat-note">
            {prev
              ? `${deltaPct > 0 ? '+' : ''}${deltaPct}% ${trf('לעומת {month}', { month: monthLabel(prevMonth!) })}`
              : tr('ייבאו חודש מלא נוסף כדי להשוות')}
          </div>
        </div>

        <div className="card kpi">
          <div className="stat-label">{tr('הוצאות חובה')}</div>
          <div className="stat-value big" style={{ color: 'var(--ok)' }}>
            {ils(summary.byNecessity.mandatory)}
          </div>
          <div className="stat-note">
            {pct(summary.byNecessity.mandatory, summary.total)}% {tr('מההוצאות — לא נוגעים בזה')}
          </div>
        </div>

        <div className="card kpi">
          <div className="stat-label">{tr('פוטנציאל קיצוץ')}</div>
          <div className="stat-value big" style={{ color: 'var(--danger)' }}>
            {ils(cuttable)}
          </div>
          <div className="stat-note">{tr('מותרות + 30% מהחצי-חובה')}</div>
        </div>
      </div>

      {income > 0 ? (
        <div className="card month-picture">
          <div>
            <div className="stat-label">{tr('הכנסות')}</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{ils(income)}</div>
          </div>
          <div>
            <div className="stat-label">{tr('הוצאות')}</div>
            <div className="stat-value">{ils(summary.total)}</div>
          </div>
          <div>
            <div className="stat-label">{tr('נשאר בסוף החודש')}</div>
            <div className="stat-value" style={{ color: net >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              {net >= 0 ? '' : '−'}
              {ils(Math.abs(net))}
            </div>
          </div>
          <div>
            <div className="stat-label">{tr('שיעור חיסכון')}</div>
            <div className="stat-value" style={{ color: net >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              {Math.round((net / income) * 100)}%
            </div>
          </div>
        </div>
      ) : (
        <div className="notice">
          {tr(
            'כדי לדעת כמה באמת נחסך בסוף החודש צריך להזין הכנסות — קובץ האשראי מכיל הוצאות בלבד.',
          )}{' '}
          <button className="link-btn" onClick={onGoToPlan}>{tr('מעבר להכנסות ויעדים ←')}</button>
        </div>
      )}

      {series.length > 1 && (
        <div className="card rise">
          <NecessityTrendChart
            points={series.map((s) => ({
              month: s.month,
              byNecessity: s.byNecessity,
              total: s.total,
              partial: partial.has(s.month),
            }))}
            current={month}
            window={window}
            onWindow={setWindow}
          />
        </div>
      )}

      <div className="grid cols-2">
        <div className="card rise">
          <div className="card-title">{tr('ההוצאות לפי קטגוריה')}</div>
          <div className="card-sub">
            {trf('{month} — הקטגוריות הקטנות מקובצות ל"אחר"', { month: monthLabel(month) })}
          </div>
          <DonutChart
            slices={categorySlices}
            size={160}
            centerValue={ils(summary.total)}
            centerLabel={tr('סך החודש')}
          />
          {summary.byCategory.length > categorySlices.length && (
            <>
              <button className="link-btn strong-link" style={{ marginTop: 14 }} onClick={() => setAllCategories((v) => !v)}>
                {allCategories ? tr('הסתרת הפירוט') : trf('כל {n} הקטגוריות, מדורגות', { n: summary.byCategory.length })}
              </button>
              {allCategories && (
                <div style={{ marginTop: 12 }}>
                  <RankedBars
                    items={summary.byCategory.map((c) => ({
                      key: c.category,
                      label: cats.byId(c.category).name,
                      emoji: cats.byId(c.category).emoji,
                      value: c.total,
                      color: cats.byId(c.category).color,
                      meta: `${pct(c.total, summary.total)}% · ${txCount(c.count)}`,
                    }))}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="card rise necessity-card">
          <div>
            <div className="card-title">{tr('כמה מההוצאות באמת הכרחיות?')}</div>
            <div className="card-sub">{tr('החלוקה נקבעת לפי הקטגוריה, וניתן לשנות אותה לכל בית עסק.')}</div>
          </div>
          <div className="split-bar">
            {NECESSITIES.map((n) =>
              summary.byNecessity[n] > 0 ? (
                <div
                  key={n}
                  style={{
                    width: `${(summary.byNecessity[n] / (summary.total || 1)) * 100}%`,
                    background: NECESSITY_VAR[n],
                    boxShadow: 'inset 2px 0 0 var(--surface)',
                  }}
                  title={`${tr(NECESSITY_LABEL[n])}: ${ils(summary.byNecessity[n])}`}
                />
              ) : null,
            )}
          </div>
          <div className="necessity-rows">
            {NECESSITIES.map((n) => (
              <div key={n} className={`necessity-row ${summary.byNecessity[n] ? '' : 'dim'}`}>
                <span className="dot" style={{ background: NECESSITY_VAR[n] }} />
                <span className="grow">{tr(NECESSITY_LABEL[n])}</span>
                <span className="figure">{ils(summary.byNecessity[n])}</span>
                <span className="dim tiny">{pct(summary.byNecessity[n], summary.total)}%</span>
              </div>
            ))}
          </div>
          {fallback && fallbackTotal > 0 && (
            <div className="insight">
              {trf('{p}% מההוצאות עדיין ב״{cat}״.', { p: pct(fallbackTotal, summary.total), cat: fallback.name })}{' '}
              {fallbackMerchants > 0
                ? trf('שיוך {n} מבתי העסק הגדולים לקטגוריה אמיתית יסדר את רוב החודש.', { n: fallbackMerchants })
                : tr('שיוך בתי העסק שלהם לקטגוריה אמיתית יחדד את כל הגרפים.')}
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card rise">
          <div className="card-title">{tr('בתי העסק הגדולים')}</div>
          <div className="card-sub">{tr('איפה רוב הכסף התרכז החודש')}</div>
          <RankedBars
            items={merchants.map((m) => ({
              key: m.merchantKey,
              label: m.merchant,
              emoji: cats.byId(m.category).emoji,
              value: m.total,
              color: cats.byId(m.category).color,
              meta: txCount(m.count),
            }))}
          />
        </div>

        <div className="hero-card rise">
          {nearest ? (
            <>
              <div className="hero-top">
                <div>
                  <div className="hero-eyebrow">{tr('היעד הקרוב')}</div>
                  <div className="hero-name">
                    <span aria-hidden>{nearest.goal.emoji} </span>
                    {nearest.goal.name}
                  </div>
                </div>
                <span className="hero-chip">{nearest.percent}%</span>
              </div>
              <div className="hero-figure">
                <b>{ils(nearest.paid)}</b>
                <span>{trf('מתוך {sum}', { sum: ils(nearest.goal.targetAmount) })}</span>
              </div>
              <div className="hero-bar">
                <span style={{ width: `${Math.max(2, nearest.percent)}%` }} />
              </div>
              <div className="hero-meta">
                <span>
                  {nearest.goal.targetDate
                    ? shortDate(nearest.goal.targetDate)
                    : goalDueMonth(nearest.goal)
                      ? monthLabel(goalDueMonth(nearest.goal)!)
                      : tr('בלי מועד')}
                  {daysLeft !== null && daysLeft >= 0 && (
                    <>
                      {' · '}
                      {daysLeft === 0
                        ? tr('היום')
                        : daysLeft === 1
                          ? tr('מחר')
                          : daysLeft === 2
                            ? tr('עוד יומיים')
                            : trf('עוד {n} ימים', { n: daysLeft })}
                    </>
                  )}
                </span>
                <span>{trf('נותרו {sum}', { sum: ils(nearest.remaining) })}</span>
              </div>
              <button className="hero-action" onClick={onGoToPlan}>
                {tr('לכל היעדים')}
              </button>
            </>
          ) : (
            <>
              <div className="hero-eyebrow">{tr('היעד הקרוב')}</div>
              <div className="hero-name">{tr('עוד אין יעדים')}</div>
              <p className="hero-text">
                {tr('חתונה, טיול, רכב — הגדירו הוצאה גדולה שבדרך, והאפליקציה תחשב כמה להפריש בכל חודש.')}
              </p>
              <button className="hero-action" onClick={onGoToPlan}>
                {tr('הוספת יעד')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
