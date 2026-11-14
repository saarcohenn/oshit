import { useMemo, type CSSProperties } from 'react'
import type { Household } from '../lib/api'

/**
 * ערכת ה-voxel של v3: קוביות ב-CSS 3D, בלי ספרייה ובלי canvas.
 *
 * כל קובייה היא שלוש פאות — עליונה, קדמית וימנית — על במה שמסובבת
 * rotateX(60°) rotateZ(45°). ההטלה כאן (pr) היא אותו סיבוב בדיוק, ומשמשת
 * רק כדי למרכז את הסצנה ולמקם תוויות; הדפדפן מצייר את הפאות בעצמו.
 *
 * כללים שהעיצוב נשען עליהם: אין opacity או filter על עטיפה תלת-ממדית
 * (הם משטחים אותה לדו-ממד), והריחוף נעצר כשהמערכת מבקשת פחות תנועה.
 */

export interface Block {
  x: number
  y: number
  z: number
  w: number
  d: number
  h: number
  /** הצבע הבסיסי — הפאה הקדמית. העליונה בהירה ממנו, הימנית כהה ממנו */
  c: string
  t?: string
  l?: string
  r?: string
  /** קווי רשת על הפאה העליונה, ביחידות */
  g?: number
}

export interface SceneLabel {
  t: string
  s: string
  x: number
  y: number
  z: number
}

const hex = (c: string) => {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mix(a: string, b: string, t: number): string {
  const pa = hex(a)
  const pb = hex(b)
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

interface SceneOptions {
  unit: number
  /** מידות הבמה. עם fit הן תקרה, והבמה מתכווצת לגודל הציור */
  width: number
  height: number
  labels?: SceneLabel[]
  shadow?: boolean
  /** שוליים בפיקסלים סביב הציור, כשהבמה מותאמת לו */
  fit?: number
}

/** מעבר אחד על הקוביות: מידות הבמה, מרכוז, פאות, תוויות וצל */
export function buildScene(list: Block[], o: SceneOptions) {
  const u = o.unit
  const C = 0.70711
  const SY = 0.35355
  const SZ = 0.86603
  let W = 0
  let D = 0
  for (const b of list) {
    W = Math.max(W, (b.x + b.w) * u)
    D = Math.max(D, (b.y + b.d) * u)
  }
  const pr = (x: number, y: number, z: number): [number, number] => {
    const vx = x - W / 2
    const vy = y - D / 2
    return [C * (vx - vy), SY * (vx + vy) - SZ * z]
  }
  let x0 = 1e9
  let x1 = -1e9
  let y0 = 1e9
  let y1 = -1e9
  const grow = ([px, py]: [number, number]) => {
    x0 = Math.min(x0, px)
    x1 = Math.max(x1, px)
    y0 = Math.min(y0, py)
    y1 = Math.max(y1, py)
  }
  for (const b of list) {
    for (const x of [b.x * u, (b.x + b.w) * u])
      for (const y of [b.y * u, (b.y + b.d) * u])
        for (const z of [b.z * u, (b.z + b.h) * u]) grow(pr(x, y, z))
  }
  const labels = (o.labels ?? []).map((l) => ({ t: l.t, s: l.s, p: pr(l.x * u, l.y * u, l.z * u) }))
  for (const l of labels) {
    grow([l.p[0] - 48, l.p[1] - 46])
    grow([l.p[0] + 48, l.p[1]])
  }
  // במה מותאמת: הריחוף מרים את הציור ב-6 פיקסלים, ולכן 6 נוספים בגובה
  // והציור יורד ב-3 — השוליים העליונים נשמרים גם בשיא הריחוף
  const fit = o.fit
  const width = fit === undefined ? o.width : Math.min(o.width, Math.ceil(x1 - x0 + fit * 2))
  const height = fit === undefined ? o.height : Math.min(o.height, Math.ceil(y1 - y0 + fit * 2 + 6))
  const cx = width / 2 - (x0 + x1) / 2
  const cy = height / 2 - (y0 + y1) / 2 + (fit === undefined ? 0 : 3)
  const f = (n: number) => Math.round(n * 100) / 100
  const line = (deg: number, gap: number, a: number) =>
    `repeating-linear-gradient(${deg}deg, transparent 0 ${f(gap - 1)}px, rgba(0,0,0,${a}) ${f(gap - 1)}px ${f(gap)}px), `
  const faces = list.map((b) => {
    const w = b.w * u
    const d = b.d * u
    const h = b.h * u
    const g = b.g ? b.g * u : 0
    return {
      x: f(b.x * u),
      y: f(b.y * u),
      z: f(b.z * u),
      w: f(w),
      d: f(d),
      h: f(h),
      rx: f(w - h),
      fy: f(d - h),
      top: (g ? line(90, g, 0.07) + line(0, g, 0.07) : '') + (b.t ?? mix(b.c, '#ffffff', 0.2)),
      front: `linear-gradient(180deg, rgba(255,255,255,.07), rgba(0,0,0,.1)), ${b.l ?? b.c}`,
      right: `linear-gradient(90deg, rgba(255,255,255,.03), rgba(0,0,0,.14)), ${b.r ?? mix(b.c, '#000000', 0.26)}`,
    }
  })
  const sw = o.shadow === false ? 0 : Math.round((x1 - x0) * 0.72)
  const sh = Math.round(sw * 0.2)
  return {
    width,
    height,
    faces,
    W: f(W),
    D: f(D),
    ox: f(cx - W / 2),
    oy: f(cy - D / 2),
    labels: labels.map((l) => ({ t: l.t, s: l.s, lx: Math.round(cx + l.p[0]), ly: Math.round(cy + l.p[1]) })),
    sw,
    sh,
    sx: Math.round(cx - sw / 2),
    sy: Math.round(Math.min(height - sh - 2, cy + y1 - sh * 0.3)),
  }
}

interface SceneProps extends SceneOptions {
  blocks: Block[]
  /** בלי ריחוף — לאייקונים קטנים, שבהם תנועה רק מסיחה */
  still?: boolean
  className?: string
  style?: CSSProperties
}

export function VoxelScene({
  blocks,
  unit,
  width,
  height,
  labels,
  shadow = true,
  fit,
  still = false,
  className,
  style,
}: SceneProps) {
  const s = useMemo(
    () => buildScene(blocks, { unit, width, height, labels, shadow, fit }),
    [blocks, unit, width, height, labels, shadow, fit],
  )
  return (
    <div className={`vscene ${className ?? ''}`} aria-hidden style={{ width: s.width, height: s.height, ...style }}>
      {s.sw > 0 && <div className="vshadow" style={{ left: s.sx, top: s.sy, width: s.sw, height: s.sh }} />}
      <div className={still ? 'vfloat still' : 'vfloat'}>
        <div className="iso" style={{ left: s.ox, top: s.oy, width: s.W, height: s.D }}>
          {s.faces.map((b, i) => (
            <div
              className="bx"
              key={i}
              style={{ left: b.x, top: b.y, width: b.w, height: b.d, transform: `translateZ(${b.z}px)` }}
            >
              <div className="ft" style={{ width: b.w, height: b.d, transform: `translateZ(${b.h}px)`, background: b.top }} />
              <div className="fr" style={{ left: b.rx, width: b.h, height: b.d, background: b.right }} />
              <div className="ff" style={{ top: b.fy, width: b.w, height: b.h, background: b.front }} />
            </div>
          ))}
        </div>
        {s.labels.map((l, i) => (
          <div className="vlabel" key={i} style={{ left: l.lx, top: l.ly }}>
            <b>{l.t}</b>
            <span>{l.s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- הבתים ---------------- */

const plot = (): Block[] => [
  { x: 0.5, y: 0.5, z: -0.5, w: 3, d: 3, h: 0.5, c: '#3f6f67' },
  { x: 0, y: 0, z: 0, w: 4, d: 4, h: 0.5, c: '#5f8f86', t: '#d3e6e1' },
]

const shift = (list: Block[], dx: number, dy: number): Block[] => list.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }))

const BUSH: Block[] = [{ x: 3.15, y: 0.35, z: 0.5, w: 0.55, d: 0.55, h: 0.45, c: '#3f8f5f' }]
const TREE: Block[] = [
  { x: 3.25, y: 0.45, z: 0.5, w: 0.3, d: 0.3, h: 0.8, c: '#8a6a45' },
  { x: 3.0, y: 0.2, z: 1.3, w: 0.8, d: 0.8, h: 0.8, c: '#3f9f6a' },
]

/** בית עם גג מדורג. lit מדליק את החלונות — הבית שפתוח עכשיו */
export function houseBlocks(color: string, lit = false, extra: Block[] = []): Block[] {
  const dark = mix(color, '#000000', 0.38)
  const win = lit ? '#ffd98a' : '#a9bcb9'
  return [
    ...plot(),
    { x: 0.8, y: 0.8, z: 0.5, w: 2.4, d: 2.2, h: 1.5, c: '#e9f1ef' },
    { x: 0.6, y: 0.6, z: 2.0, w: 2.8, d: 2.6, h: 0.45, c: color },
    { x: 1.0, y: 1.0, z: 2.45, w: 2.0, d: 1.8, h: 0.45, c: color },
    { x: 1.4, y: 1.4, z: 2.9, w: 1.2, d: 1.0, h: 0.35, c: color },
    { x: 1.7, y: 3.0, z: 0.5, w: 0.55, d: 0.06, h: 0.9, c: dark },
    { x: 0.95, y: 3.0, z: 1.05, w: 0.45, d: 0.06, h: 0.45, c: win, l: win, t: win },
    { x: 2.5, y: 3.0, z: 1.05, w: 0.45, d: 0.06, h: 0.45, c: win, l: win, t: win },
    ...extra,
  ]
}

/** עסק קטן: גג שטוח, צלב על החזית וארגז ליד הדלת */
export function clinicBlocks(color: string, lit = false): Block[] {
  const dark = mix(color, '#000000', 0.38)
  const win = lit ? '#ffd98a' : '#a9bcb9'
  return [
    ...plot(),
    { x: 0.6, y: 0.7, z: 0.5, w: 2.8, d: 2.4, h: 1.9, c: '#eef3f1' },
    { x: 0.45, y: 0.55, z: 2.4, w: 3.1, d: 2.7, h: 0.3, c: color },
    { x: 1.65, y: 3.1, z: 0.5, w: 0.7, d: 0.06, h: 1.0, c: dark },
    { x: 0.85, y: 3.1, z: 1.2, w: 0.6, d: 0.06, h: 0.5, c: win, l: win, t: win },
    { x: 2.55, y: 3.1, z: 1.2, w: 0.6, d: 0.06, h: 0.5, c: win, l: win, t: win },
    { x: 1.88, y: 3.1, z: 1.62, w: 0.24, d: 0.08, h: 0.6, c: color },
    { x: 1.7, y: 3.1, z: 1.8, w: 0.6, d: 0.08, h: 0.24, c: color },
    { x: 3.0, y: 3.25, z: 0.5, w: 0.6, d: 0.5, h: 0.5, c: '#b08a5a' },
  ]
}

export const householdBlocks = (h: Pick<Household, 'kind' | 'color'>, lit = false, extra: Block[] = []) =>
  h.kind === 'business' ? clinicBlocks(h.color, lit) : houseBlocks(h.color, lit, extra)

/** בית אחד קטן, בלי ריחוף ובלי צל — לכרטיסים ולמתג */
export function HouseholdIcon({
  household,
  lit = false,
  unit = 9,
  width = 76,
  height = 72,
}: {
  household: Pick<Household, 'kind' | 'color'>
  lit?: boolean
  unit?: number
  width?: number
  height?: number
}) {
  const blocks = useMemo(() => householdBlocks(household, lit), [household.kind, household.color, lit])
  return <VoxelScene blocks={blocks} unit={unit} width={width} height={height} shadow={false} still />
}

/**
 * הכפר שבראש מסך משקי הבית: עד שלושה בתים בשורה, הפעיל ראשון.
 * יחידה גדולה יותר כשיש פחות בתים, כדי שבית יחיד לא ייראה אבוד.
 * הבמה מתכווצת לגודל הציור — במה קבועה השאירה רווח ריק סביב הבתים
 * ודחפה את ה-hero לשתי שורות כבר במחשב נייד.
 */
export function HouseholdVillage({
  households,
  activeId,
  subtitle,
  width = 420,
  height = 320,
}: {
  households: Household[]
  activeId: string | null
  subtitle: (h: Household) => string
  width?: number
  height?: number
}) {
  const shown = useMemo(
    () => [...households].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId)).slice(0, 3),
    [households, activeId],
  )
  const { blocks, labels } = useMemo(() => {
    const spots = shown.length === 1 ? [[0, 0]] : shown.length === 2 ? [[5.5, 0.5], [0.5, 5.5]] : [[10.5, 0.5], [5.5, 5.5], [0.5, 10.5]]
    const extras = [BUSH, TREE, []]
    const all: Block[] = []
    const marks: SceneLabel[] = []
    shown.forEach((h, i) => {
      const [dx, dy] = spots[i]
      all.push(...shift(householdBlocks(h, h.id === activeId, extras[i]), dx, dy))
      marks.push({ t: h.name, s: subtitle(h), x: dx + 2, y: dy + 2, z: h.kind === 'business' ? 4.0 : 4.7 })
    })
    return { blocks: all, labels: marks }
  }, [shown, activeId, subtitle])
  if (!shown.length) return null
  const unit = shown.length === 1 ? 26 : shown.length === 2 ? 18 : 14
  return <VoxelScene blocks={blocks} labels={labels} unit={unit} width={width} height={height} fit={16} className="village" />
}
