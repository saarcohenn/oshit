import { useMemo } from 'react'
import type { Income, Transaction } from '../types'
import { incomeForMonth } from '../lib/plan'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { availableMonths, monthlySeries, partialMonths, summarize, topMerchants } from '../lib/analytics'
import { ils, monthLabel, pct, txCount } from '../lib/format'
import { DonutChart, foldSlices, NECESSITY_VAR, NecessityBar, RankedBars, TrendChart } from './charts'

export default function Dashboard({
  transactions,
  month,
  incomes,
  onGoToPlan,
}: {
  transactions: Transaction[]
  month: string
  incomes: Income[]
  onGoToPlan: () => void
}) {
  const cats = useCategories()
  const summary = useMemo(() => summarize(transactions, month), [transactions, month])
  const series = useMemo(() => monthlySeries(transactions), [transactions])
  const merchants = useMemo(() => topMerchants(transactions, month, 8), [transactions, month])

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

  const categoryItems = summary.byCategory.map((c) => ({
    key: c.category,
    label: cats.byId(c.category).name,
    emoji: cats.byId(c.category).emoji,
    value: c.total,
    meta: `${pct(c.total, summary.total)}% · ${txCount(c.count)}`,
  }))

  const categorySlices = foldSlices(
    summary.byCategory.map((c) => ({
      key: c.category,
      label: cats.byId(c.category).name,
      emoji: cats.byId(c.category).emoji,
      value: c.total,
    })),
  )

  const necessitySlices = (['mandatory', 'semi', 'optional'] as const)
    .filter((n) => summary.byNecessity[n] > 0)
    .map((n) => ({
      key: n,
      label: NECESSITY_LABEL[n],
      value: summary.byNecessity[n],
      color: NECESSITY_VAR[n],
    }))

  return (
    <div className="grid">
      {monthIsPartial && (
        <div className="notice warn">
          ל{monthLabel(month)} יש רק {txCount(summary.count)} — כנראה עסקאות חו"ל שחויבו מיידית, ולא חודש
          שלם. ייבאו את קובץ הבנק של אותו חודש כדי לראות תמונה מלאה.
        </div>
      )}

      {income > 0 ? (
        <div className="card">
          <div className="grid cols-4" style={{ alignItems: 'center' }}>
            <div>
              <div className="stat-label">הכנסות</div>
              <div className="stat-value tinted" style={{ color: 'var(--ok)' }}>
                {ils(income)}
              </div>
            </div>
            <div>
              <div className="stat-label">הוצאות</div>
              <div className="stat-value tinted" style={{ color: 'var(--danger)' }}>
                {ils(summary.total)}
              </div>
            </div>
            <div>
              <div className="stat-label">נשאר בסוף החודש</div>
              <div
                className="stat-value tinted"
                style={{ color: net >= 0 ? 'var(--ok)' : 'var(--danger)' }}
              >
                {net >= 0 ? '' : '−'}
                {ils(Math.abs(net))}
              </div>
            </div>
            <div>
              <div className="stat-label">שיעור חיסכון</div>
              <div
                className="stat-value tinted"
                style={{ color: net >= 0 ? 'var(--ok)' : 'var(--danger)' }}
              >
                {Math.round((net / income) * 100)}%
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="notice">
          כדי לדעת כמה באמת נחסך בסוף החודש צריך להזין הכנסות — קובץ האשראי מכיל הוצאות בלבד.{' '}
          <button className="link-btn" onClick={onGoToPlan}>
            מעבר להכנסות ויעדים ←
          </button>
        </div>
      )}

      <div className="grid cols-4">
        <div className="card">
          <div className="stat-label">סך ההוצאות — {monthLabel(month)}</div>
          <div className="stat-value">{ils(summary.total)}</div>
          <div className="stat-note">{txCount(summary.count)}</div>
        </div>

        <div className="card">
          <div className="stat-label">שינוי מהחודש הקודם</div>
          <div
            className="stat-value tinted"
            style={{ color: !prev ? undefined : delta > 0 ? 'var(--danger)' : 'var(--ok)' }}
          >
            {prev ? `${delta > 0 ? '+' : ''}${ils(delta)}` : '—'}
          </div>
          <div className="stat-note">
            {prev
              ? `${deltaPct > 0 ? '+' : ''}${deltaPct}% לעומת ${monthLabel(prevMonth!)}`
              : 'ייבאו חודש מלא נוסף כדי להשוות'}
          </div>
        </div>

        <div className="card">
          <div className="stat-label">הוצאות חובה</div>
          <div className="stat-value tinted" style={{ color: 'var(--viz-mandatory)' }}>
            {ils(summary.byNecessity.mandatory)}
          </div>
          <div className="stat-note">
            {pct(summary.byNecessity.mandatory, summary.total)}% מההוצאות — לא נוגעים בזה
          </div>
        </div>

        <div className="card">
          <div className="stat-label">פוטנציאל קיצוץ</div>
          <div className="stat-value tinted" style={{ color: 'var(--viz-optional)' }}>
            {ils(cuttable)}
          </div>
          <div className="stat-note">מותרות + 30% מהחצי-חובה</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">🥧 ההוצאות לפי קטגוריה</div>
          <div className="card-sub">{monthLabel(month)} — הקטגוריות הקטנות מקובצות ל"אחר"</div>
          <DonutChart
            slices={categorySlices}
            centerValue={ils(summary.total)}
            centerLabel="סך החודש"
          />
        </div>

        <div className="card">
          <div className="card-title">כמה מההוצאות באמת הכרחיות?</div>
          <div className="card-sub">
            החלוקה נקבעת לפי הקטגוריה. אפשר לשנות אותה לכל בית עסק בלשונית "בתי עסק".
          </div>
          <DonutChart
            slices={necessitySlices}
            centerValue={`${pct(summary.byNecessity.mandatory, summary.total)}%`}
            centerLabel="חובה"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-title">אותה חלוקה, כפס אחד</div>
        <div className="card-sub">נוח להשוואה מהירה בין חודשים</div>
        <NecessityBar byNecessity={summary.byNecessity} />
      </div>

      {series.length > 1 && (
        <div className="card">
          <div className="card-title">מגמה חודשית</div>
          <div className="card-sub">
            העסקאות משויכות לחודש לפי תאריך החיוב — זה הכסף שיוצא מהחשבון בפועל.
            חודשים מסומנים ב-⚠ הם חלקיים.
          </div>
          <TrendChart
            points={series.map((s) => ({
              month: s.month,
              byNecessity: s.byNecessity,
              total: s.total,
              partial: partial.has(s.month),
            }))}
            current={month}
          />
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">כל הקטגוריות, מדורגות</div>
          <div className="card-sub">השוואת גדלים מדויקת יותר מאשר בעוגה</div>
          <RankedBars items={categoryItems} />
        </div>

        <div className="card">
          <div className="card-title">בתי העסק הגדולים</div>
          <div className="card-sub">איפה רוב הכסף התרכז החודש</div>
          <RankedBars
            items={merchants.map((m) => ({
              key: m.merchantKey,
              label: m.merchant,
              emoji: cats.byId(m.category).emoji,
              value: m.total,
              meta: txCount(m.count),
            }))}
          />
        </div>
      </div>
    </div>
  )
}
