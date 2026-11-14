import { useEffect, useId, useRef, type ReactNode } from 'react'
import { tr } from '../lib/i18n'
import { IconClose } from './Icons'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  /** כפתורי הפעולה בתחתית */
  footer?: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * חלון צף אחד לכל הדיאלוגים.
 *
 * המיקוד נכנס לשדה הראשון, נשאר כלוא בתוך החלון בזמן ש-Tab מסתובב, וחוזר
 * לכפתור שפתח אותו כשהחלון נסגר. Escape סוגר. onClose נקרא דרך ref —
 * אחרת כל רינדור של ההורה היה מריץ את האפקט מחדש ומחזיר את המיקוד
 * לשדה הראשון באמצע הקלדה.
 */
export default function Modal({ title, subtitle, onClose, children, footer }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = panel.current
    const first = root?.querySelector<HTMLElement>('input, select, textarea') ?? root?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? root)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const head = items[0]
      const tail = items[items.length - 1]
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [])

  return (
    <>
      <div className="drawer-scrim open" onClick={() => close.current()} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <small className="dim">{subtitle}</small>}
          </div>
          <button className="icon-btn sm" onClick={() => close.current()} aria-label={tr('סגירה')}>
            <IconClose size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  )
}
