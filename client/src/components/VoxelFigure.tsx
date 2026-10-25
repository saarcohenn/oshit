import type { CSSProperties, ReactNode } from 'react'

/**
 * דמות "מפוסלת" של סוכן, בסגנון Minecraft — CSS תלת-ממדי בלבד.
 *
 * בלי Three.js במכוון: שלוש דמויות של קופסאות לא מצדיקות מנוע תלת-ממד
 * של מאות קילובייטים, והפרויקט שומר על מעט תלויות. כל חלק הוא קופסה של
 * שש פאות, והצללה שונה לכל פאה היא מה שנותן את המראה המפוסל.
 *
 * המצב מגיע מבחוץ (data-state), והאנימציות כולן ב-CSS — הרכיב לא מחזיק
 * טיימרים ולא מרנדר מחדש בכל פריים.
 */

export type FigureState = 'idle' | 'thinking' | 'working' | 'finding' | 'alert' | 'done' | 'error'

interface BoxProps {
  /** רוחב, גובה ועומק בפיקסלים */
  w: number
  h: number
  d: number
  /** מרכז הקופסה בתוך הדמות */
  x: number
  y: number
  className: string
  /** תוכן הפאה הקדמית — עיניים, סמל על החזה */
  front?: ReactNode
}

function Box({ w, h, d, x, y, className, front }: BoxProps) {
  const face = (fw: number, fh: number, transform: string, side: string, content?: ReactNode) => {
    const style: CSSProperties = {
      width: fw,
      height: fh,
      left: (w - fw) / 2,
      top: (h - fh) / 2,
      transform,
    }
    return (
      <div className={`vx-face vx-${side}`} style={style}>
        {content}
      </div>
    )
  }
  return (
    <div className={`vx-box ${className}`} style={{ width: w, height: h, left: x - w / 2, top: y - h / 2 }}>
      {face(w, h, `translateZ(${d / 2}px)`, 'front', front)}
      {face(w, h, `rotateY(180deg) translateZ(${d / 2}px)`, 'back')}
      {face(d, h, `rotateY(90deg) translateZ(${w / 2}px)`, 'right')}
      {face(d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, 'left')}
      {face(w, d, `rotateX(90deg) translateZ(${h / 2}px)`, 'top')}
      {face(w, d, `rotateX(-90deg) translateZ(${h / 2}px)`, 'bottom')}
    </div>
  )
}

interface Props {
  /** צבע הגוף — מהגדרת הסוכן, כדי שכל סוכן שנוסף במסך ייראה אחרת */
  color: string
  /** הסמל על החזה */
  emoji: string
  state: FigureState
  /** הטקסט בבועה שמעל הראש. ריק — בלי בועה */
  bubble?: string
  /** תיאור לקוראי מסך: שם הסוכן ומצבו */
  label: string
}

export default function VoxelFigure({ color, emoji, state, bubble, label }: Props) {
  /*
   * שלוש שכבות, ולכל אחת תפקיד:
   * vx-wrap — הגודל בפריסה, ומסננים (הילה, אפור). filter על אלמנט תלת-ממדי
   *   משטיח אותו, ולכן הוא יושב מעל הדמות ולא עליה.
   * vx-figure — תזוזה דו-ממדית: נשימה, קפיצה, רעד. הצל נשאר מחוץ לה,
   *   כדי שיישאר על הקרקע ויתכווץ בקפיצה במקום לעוף עם הדמות.
   * voxel — זווית המבט התלת-ממדית, קבועה.
   */
  return (
    <div className="vx-wrap" data-state={state}>
      <div className="vx-inner">
        <div className={`vx-bubble vx-bubble-${state}${bubble ? ' show' : ''}`} aria-hidden="true">
          {bubble}
        </div>
        <div className="vx-shadow" />
        <div
          className="vx-figure"
          data-state={state}
          role="img"
          aria-label={label}
          style={{ '--vx-agent': color } as CSSProperties}
        >
          <div className="voxel">
            {/* מידות בפיקסלים, בפרופורציות של דמות Minecraft: ראש גדול, גוף צר */}
            <Box className="vx-antenna" w={4} h={12} d={4} x={60} y={8} />
            <Box className="vx-antenna-tip" w={9} h={9} d={9} x={60} y={2} />
            <Box
              className="vx-head"
              w={40}
              h={36}
              d={36}
              x={60}
              y={32}
              front={
                <div className="vx-visor">
                  <span className="vx-eye" />
                  <span className="vx-eye" />
                </div>
              }
            />
            <Box
              className="vx-torso"
              w={40}
              h={50}
              d={22}
              x={60}
              y={75}
              front={<span className="vx-badge">{emoji}</span>}
            />
            <Box className="vx-arm vx-arm-l" w={13} h={48} d={13} x={33} y={74} />
            <Box className="vx-arm vx-arm-r" w={13} h={48} d={13} x={87} y={74} />
            <Box className="vx-leg vx-leg-l" w={18} h={42} d={18} x={51} y={121} />
            <Box className="vx-leg vx-leg-r" w={18} h={42} d={18} x={69} y={121} />
          </div>
        </div>
      </div>
    </div>
  )
}
