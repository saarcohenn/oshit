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
            <div className="rank-fill" style={{ width: `${Math.max(1, (item.value / top) * 100)}%` }} />
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
