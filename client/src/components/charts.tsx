import type { Necessity } from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { ils, monthLabelShort, pct } from '../lib/format'
import { tr, trf } from '../lib/i18n'

export const NECESSITY_VAR: Record<Necessity, string> = {
  mandatory: 'var(--viz-mandatory)',
  semi: 'var(--viz-semi)',
  optional: 'var(--viz-optional)',
}

const NECESSITY_ORDER: Necessity[] = ['mandatory', 'semi', 'optional']

/**
 * שמונה גוונים בסדר קבוע. הסדר עצמו הוא מנגנון הבטיחות:
 * הוא נבדק כך שכל שתי פרוסות סמוכות נבדלות זו מזו גם בשלושת סוגי עיוורון הצבעים.
 * לעולם לא ממחזרים את הסדר — פרוסה תשיעית מתקפלת ל"אחר".
 */
export const SERIES_VARS = [
  'var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)',
  'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)',
]

export const MAX_SLICES = SERIES_VARS.length

export interface Slice {
  key: string
  label: string
  emoji?: string
  value: number
  color?: string
}

/**
 * גרף עוגה (טבעת). הפרוסות מסודרות מהגדולה לקטנה כדי שההשוואה
 * בין שכנות תהיה קלה, ולכל פרוסה יש שורה במקרא עם הסכום והאחוז —
 * כך שהזיהוי לעולם לא נשען על הצבע בלבד.
 */
export function DonutChart({
  slices,
  size = 190,
  centerValue,
  centerLabel,
}: {
  slices: Slice[]
  size?: number
  centerValue: string
  centerLabel: string
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!total) return null

  const stroke = Math.round(size * 0.19)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // רווח דק בין פרוסות — מפריד אותן גם כשהגוונים קרובים
  const gap = slices.length > 1 ? 2 : 0

  let offset = 0

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
          {/* הסיבוב על הקבוצה כולה — כך הפרוסה הראשונה מתחילה בשעה 12 */}
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((slice, i) => {
              const length = (slice.value / total) * circumference
              const dash = Math.max(0.5, length - gap)
              const el = (
                <circle
                  key={slice.key}
                  className="donut-slice"
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color ?? SERIES_VARS[i % MAX_SLICES]}
                  color={slice.color ?? SERIES_VARS[i % MAX_SLICES]}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                >
                  <title>{`${slice.label}: ${ils(slice.value)} (${pct(slice.value, total)}%)`}</title>
                </circle>
              )
              offset += length
              return el
            })}
          </g>
        </svg>
        <div className="donut-center">
          <div className="v">{centerValue}</div>
          <div className="k">{centerLabel}</div>
        </div>
      </div>

      <div className="donut-legend">
        {slices.map((slice, i) => (
          <div className="donut-legend-row" key={slice.key}>
            <span className="dot" style={{ background: slice.color ?? SERIES_VARS[i % MAX_SLICES] }} />
            <span className="lbl">
              {slice.emoji && <span aria-hidden>{slice.emoji} </span>}
              {slice.label}
            </span>
            <span className="val">
              {ils(slice.value)}
              <small>{pct(slice.value, total)}%</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * מקפל את הזנב הארוך לפרוסה אחת בשם "אחר".
 * בלי זה העוגה מתמלאת בפרוסות דקות שאי אפשר לקרוא, ובצבעים שחוזרים על עצמם.
 */
export function foldSlices(items: Slice[], max = MAX_SLICES): Slice[] {
  if (items.length <= max) return items
  const head = items.slice(0, max - 1)
  const tail = items.slice(max - 1)
  return [
    ...head,
    {
      key: '__rest',
      label: trf('אחר ({n})', { n: tail.length }),
      emoji: '➕',
      value: tail.reduce((s, x) => s + x.value, 0),
      color: SERIES_VARS[max - 1],
    },
  ]
}

export interface RankItem {
  key: string
  label: string
  emoji?: string
  value: number
  meta?: string
  /** צבע הקטגוריה — בית עסק נצבע לפי מה שהוא, לא לפי מקומו בדירוג */
  color?: string
}

/**
 * גרף עמודות מדורג — עדיף על גרף עוגה כשמשווים גדלים,
 * והתווית לצד כל עמודה מייתרת מקרא ומחזיקה את הקריאות גם בעברית.
 */
export function RankedBars({ items, max }: { items: RankItem[]; max?: number }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  const total = items.reduce((s, i) => s + i.value, 0)

  return (
    <div>
      {items.map((item) => (
        <div className="rank-row" key={item.key} title={`${item.label}: ${ils(item.value)}`}>
          <div className="name">
            {item.emoji && <span aria-hidden>{item.emoji}</span>}
            <span>{item.label}</span>
          </div>
          <div className="rank-track">
            <div className="rank-fill" style={{ background: item.color, width: `${Math.max(1, (item.value / top) * 100)}%` }} />
          </div>
          <div className="rank-value">
            {ils(item.value)}
            <small>{item.meta ?? `${pct(item.value, total)}%`}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

/** פס יחיד המחלק את ההוצאה החודשית לחובה / חצי-חובה / מותרות */
export function NecessityBar({ byNecessity }: { byNecessity: Record<Necessity, number> }) {
  const total = NECESSITY_ORDER.reduce((s, n) => s + byNecessity[n], 0)
  if (!total) return null

  return (
    <div>
      <div className="split-bar">
        {NECESSITY_ORDER.map((n) =>
          byNecessity[n] > 0 ? (
            <div
              key={n}
              style={{
                width: `${(byNecessity[n] / total) * 100}%`,
                background: NECESSITY_VAR[n],
                boxShadow: 'inset 2px 0 0 var(--surface)',
              }}
              title={`${tr(NECESSITY_LABEL[n])}: ${ils(byNecessity[n])}`}
            />
          ) : null,
        )}
      </div>
      <div className="legend">
        {NECESSITY_ORDER.map((n) => (
          <div className="legend-item" key={n}>
            <span className="dot" style={{ background: NECESSITY_VAR[n] }} />
            <span>
              {tr(NECESSITY_LABEL[n])} — <strong>{ils(byNecessity[n])}</strong>{' '}
              <span className="dim">({pct(byNecessity[n], total)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface TrendPoint {
  month: string
  byNecessity: Record<Necessity, number>
  total: number
  /** חודש שאין לו כיסוי מלא — מוצג בשקיפות כדי שלא ייקרא כירידה בהוצאות */
  partial?: boolean
}

/** מגמה חודשית — כל עמודה מפוצלת לפי נחיצות כדי לראות מה באמת גדל */
/**
 * הכנסה מול הוצאה לאורך חודשים, כשהחודש הפעיל מסומן.
 *
 * שתי סדרות זו לצד זו ולא מוערמות: השאלה היא מי גדול ממי, וערימה
 * מסתירה בדיוק את זה.
 */
export function IncomeExpenseChart({
  points,
  current,
}: {
  points: Array<{ month: string; income: number; expense: number }>
  current: string
}) {
  const top = Math.max(...points.flatMap((p) => [p.income, p.expense]), 1)
  return (
    <div>
      <div className="trend">
        {points.map((p) => {
          const net = p.income - p.expense
          return (
            <div className={`trend-col ${p.month === current ? 'current' : ''}`} key={p.month}>
              <div className="ie-pair">
                <div
                  className="ie-bar income"
                  style={{ height: `${(p.income / top) * 100}%` }}
                  title={`${monthLabelShort(p.month)} · ${tr('הכנסות')}: ${ils(p.income)}`}
                />
                <div
                  className="ie-bar expense"
                  style={{ height: `${(p.expense / top) * 100}%` }}
                  title={`${monthLabelShort(p.month)} · ${tr('הוצאות')}: ${ils(p.expense)}`}
                />
              </div>
              <div className={`trend-label ${net < 0 ? 'negative' : ''}`}>
                {monthLabelShort(p.month)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <div className="legend-item">
          <span className="dot" style={{ background: 'var(--ok)' }} />
          <span>{tr('הכנסות')}</span>
        </div>
        <div className="legend-item">
          <span className="dot" style={{ background: 'var(--danger)' }} />
          <span>{tr('הוצאות')}</span>
        </div>
      </div>
    </div>
  )
}

export function TrendChart({ points, current }: { points: TrendPoint[]; current: string }) {
  const top = Math.max(...points.map((p) => p.total), 1)

  return (
    <div>
      <div className="trend">
        {points.map((p) => (
          <div className={`trend-col ${p.month === current ? 'current' : ''}`} key={p.month}>
            <div
              className="trend-stack"
              style={{ height: `${(p.total / top) * 100}%`, opacity: p.partial ? 0.4 : 1 }}
            >
              <div className="trend-total">
                {ils(p.total)}
                {p.partial && ' ⚠'}
              </div>
              {NECESSITY_ORDER.map((n) =>
                p.byNecessity[n] > 0 ? (
                  <div
                    key={n}
                    className="trend-seg"
                    style={{
                      height: `${(p.byNecessity[n] / p.total) * 100}%`,
                      background: NECESSITY_VAR[n],
                    }}
                    title={`${monthLabelShort(p.month)} · ${tr(NECESSITY_LABEL[n])}: ${ils(p.byNecessity[n])}`}
                  />
                ) : null,
              )}
            </div>
            <div className="trend-label" title={p.partial ? tr('חודש חלקי — לא יובא קובץ מלא עבורו') : undefined}>
              {monthLabelShort(p.month)}
            </div>
          </div>
        ))}
      </div>
      <div className="legend">
        {NECESSITY_ORDER.map((n) => (
          <div className="legend-item" key={n}>
            <span className="dot" style={{ background: NECESSITY_VAR[n] }} />
            <span>{tr(NECESSITY_LABEL[n])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const TREND_WINDOWS = [3, 6, 12, 24] as const
export type TrendWindow = (typeof TREND_WINDOWS)[number]

const WINDOW_LABEL: Record<TrendWindow, string> = {
  3: '3 חודשים',
  6: '6 חודשים',
  12: 'שנה',
  24: '2 שנים',
}

/**
 * מגמת נחיצות — שלוש העמודות של כל חודש זו לצד זו ולא מוערמות.
 *
 * בערימה רואים סכום, אבל לא רואים מי מהשלוש גדלה: הפס העליון זז גם כשרק
 * התחתון השתנה. זו לצד זו כל רמה נמדדת מאותו בסיס, וההשוואה בין חודשים ישירה.
 * החלון נגמר בחודש הפעיל, כך שבורר החודשים בכותרת מזיז גם את הגרף.
 */
export function NecessityTrendChart({
  points,
  current,
  window,
  onWindow,
}: {
  points: TrendPoint[]
  current: string
  window: TrendWindow
  onWindow: (w: TrendWindow) => void
}) {
  const upto = points.filter((p) => p.month <= current)
  const slice = upto.slice(-window)
  const top = Math.max(...slice.flatMap((p) => NECESSITY_ORDER.map((n) => p.byNecessity[n])), 1)
  const sums = NECESSITY_ORDER.map((n) => slice.reduce((s, p) => s + p.byNecessity[n], 0))
  const size = window <= 3 ? 'w3' : window <= 6 ? 'w6' : window <= 12 ? 'w12' : 'w24'

  return (
    <div>
      <div className="card-head">
        <div>
          <div className="card-title">{tr('מגמה חודשית')}</div>
          <div className="card-sub">
            {tr('שלוש רמות הנחיצות זו לצד זו, לא מוערמות — כך רואים מי גדל. חודשים חלקיים מסומנים ⚠.')}
          </div>
        </div>
        <div className="seg" role="group" aria-label={tr('טווח הגרף')}>
          {TREND_WINDOWS.map((w) => (
            <button key={w} className={w === window ? 'on' : ''} aria-pressed={w === window} onClick={() => onWindow(w)}>
              {tr(WINDOW_LABEL[w])}
            </button>
          ))}
        </div>
      </div>

      <div className={`ntrend ${size}`}>
        {slice.map((p) => {
          const isCurrent = p.month === current
          return (
            <div
              key={p.month}
              className={`ntrend-col ${isCurrent ? 'current' : ''} ${p.partial ? 'partial' : ''}`}
              title={`${monthLabelShort(p.month)} · ${ils(p.total)}${p.partial ? ` · ${tr('חודש חלקי — לא יובא קובץ מלא עבורו')}` : ''}`}
            >
              <div className="ntrend-bars">
                {NECESSITY_ORDER.map((n, i) => (
                  <div
                    key={n}
                    className="ntrend-bar"
                    style={{
                      height: `${(p.byNecessity[n] / top) * 100}%`,
                      background: NECESSITY_VAR[n],
                      animationDelay: `${i * 60}ms`,
                    }}
                    title={`${monthLabelShort(p.month)} · ${tr(NECESSITY_LABEL[n])}: ${ils(p.byNecessity[n])}`}
                  >
                    {i === 0 && (
                      <span className="ntrend-total">
                        {window <= 6 ? ils(p.total) : ''}
                        {p.partial ? ' ⚠' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="ntrend-label">{monthLabelShort(p.month)}</div>
            </div>
          )
        })}
      </div>

      <div className="legend legend-rule">
        {NECESSITY_ORDER.map((n, i) => (
          <div className="legend-item" key={n}>
            <span className="dot" style={{ background: NECESSITY_VAR[n] }} />
            <span>{tr(NECESSITY_LABEL[n])}</span>
            <span className="dim">{ils(sums[i])}</span>
          </div>
        ))}
        <div className="legend-item spacer dim">
          {trf('{n} חודשים אחרונים · לפי תאריך החיוב', { n: slice.length })}
        </div>
      </div>
    </div>
  )
}
