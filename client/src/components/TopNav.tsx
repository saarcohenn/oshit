import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface NavTab<T extends string> {
  id: T
  label: string
  Icon: (p: { size?: number }) => JSX.Element
}

interface Props<T extends string> {
  tabs: NavTab<T>[]
  activeTab: T
  onSelect: (id: T) => void
  /** מדווח אילו לשוניות לא נכנסו לשורה, כדי שהן יוצגו במגירה */
  onOverflow: (ids: T[]) => void
}

/**
 * שורת ניווט שמתכווצת לפי המקום שיש לה בפועל.
 *
 * במסך רחב כל הלשוניות גלויות ואין צורך לפתוח תפריט כדי לעבור מסך.
 * ככל שהחלון מצטמצם, הלשוניות האחרונות ברשימה נושרות אל המגירה — ולכן
 * הסדר כאן הוא סדר עדיפות: מסכי היום-יום ראשונים, מסכי ההגדרות אחרונים.
 * בטלפון לא נכנסת אף אחת, והתפריט חוזר להיות מה שהיה.
 *
 * המדידה נעשית על שורת צל שמכילה תמיד את כל הלשוניות ברוחב המלא שלהן.
 * בלעדיה היינו מודדים את מה שכבר הסתרנו, והחישוב היה מתנדנד בין שני מצבים.
 */
export default function TopNav<T extends string>({ tabs, activeTab, onSelect, onOverflow }: Props<T>) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tabs.length)

  // ההודעה להורה נשלחת מתוך אפקט, ולכן הפונקציה נשמרת ב-ref
  // כדי שהורה שמעביר פונקציה חדשה בכל רינדור לא יריץ אותו שוב ושוב
  const notify = useRef(onOverflow)
  notify.current = onOverflow

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    const ghost = ghostRef.current
    if (!wrap || !ghost) return

    const available = wrap.getBoundingClientRect().width
    const gap = parseFloat(getComputedStyle(ghost).columnGap) || 0

    let used = 0
    let fits = 0
    for (const child of Array.from(ghost.children)) {
      const w = (child as HTMLElement).getBoundingClientRect().width
      const next = used + (fits === 0 ? 0 : gap) + w
      // חצי פיקסל של סובלנות: רוחב שנמדד בשבר עלול "לא להיכנס" בטעות
      if (next > available + 0.5) break
      used = next
      fits++
    }
    setVisibleCount(fits)
  }, [])

  useLayoutEffect(() => {
    measure()
    const wrap = wrapRef.current
    const ghost = ghostRef.current
    if (!wrap || !ghost) return

    // גם שורת הצל נמדדת: כשגופן נטען מאוחר, רוחב הטקסט משתנה
    // בלי ששום דבר אחר בעמוד זז, ובלי זה החישוב היה נשאר על ערך ישן
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(ghost)
    return () => ro.disconnect()
  }, [measure, tabs])

  useEffect(() => {
    notify.current(tabs.slice(visibleCount).map((t) => t.id))
  }, [tabs, visibleCount])

  return (
    <nav className="topnav" ref={wrapRef} aria-label="ניווט ראשי">
      <div className="topnav-ghost" ref={ghostRef} aria-hidden>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className="topnav-btn" tabIndex={-1}>
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="topnav-list">
        {tabs.slice(0, visibleCount).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`topnav-btn ${activeTab === id ? 'active' : ''}`}
            aria-current={activeTab === id ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
