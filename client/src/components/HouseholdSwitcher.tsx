import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Household } from '../lib/api'
import { KIND_LABEL, ROLE_LABEL, inkOn } from '../lib/households'
import { tr, useLang } from '../lib/i18n'
import { IconBuilding, IconCheck, IconChevron, IconHome, IconPlus, IconSettings } from './Icons'
import { HouseholdIcon } from './Voxel'

interface Props {
  households: Household[]
  activeId: string | null
  onSwitch: (id: string) => void
  onCreate: () => void
  onManage: () => void
}

/** אריח צבעוני עם אייקון הסוג — במתג, במגירה ובכל מקום שצריך לזהות בית במבט */
export function HouseholdTile({ household, size = 34 }: { household: Household; size?: number }) {
  const Icon = household.kind === 'business' ? IconBuilding : IconHome
  return (
    <span
      className="hh-tile"
      style={{ width: size, height: size, background: household.color, color: inkOn(household.color) }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  )
}

/**
 * המתג שבראש הסרגל: איזה משק בית פתוח, ומעבר לאחר בלחיצה אחת.
 *
 * תפריט ARIA מלא: חיצים, Home/End, Escape מחזיר את המיקוד לכפתור, ולחיצה
 * מחוץ לתפריט סוגרת אותו. כל בית מזוהה בצבע ובסוג שלו, ולא רק בשם.
 */
export default function HouseholdSwitcher({ households, activeId, onSwitch, onCreate, onManage }: Props) {
  useLang()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const active = households.find((h) => h.id === activeId) ?? null

  useEffect(() => {
    if (!open) return
    const root = menu.current
    ;(root?.querySelector<HTMLElement>('[aria-checked="true"]') ?? root?.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!root?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function close(refocus = true) {
    setOpen(false)
    if (refocus) button.current?.focus()
  }

  function onMenuKey(e: KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => items[(i + items.length) % items.length]?.focus()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      go(at + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      go(at - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(items.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="hh-switch">
      <button
        ref={button}
        type="button"
        className="hh-switch-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {active && (
          <span className="hh-switch-art">
            <HouseholdIcon household={active} lit unit={6.2} width={48} height={44} />
          </span>
        )}
        <span className="hh-switch-text">
          <small>{active ? tr(KIND_LABEL[active.kind]) : tr('משק בית')}</small>
          <b>{active?.name ?? tr('אין משק בית')}</b>
        </span>
        <IconChevron size={16} className={`hh-chevron ${open ? 'up' : ''}`} />
      </button>

      {open && (
        <div ref={menu} id={menuId} className="hh-menu" role="menu" aria-label={tr('משקי בית')} onKeyDown={onMenuKey}>
          {households.map((h) => (
            <button
              key={h.id}
              type="button"
              role="menuitemradio"
              aria-checked={h.id === activeId}
              tabIndex={-1}
              className="hh-opt"
              onClick={() => {
                close()
                if (h.id !== activeId) onSwitch(h.id)
              }}
            >
              <HouseholdTile household={h} />
              <span className="hh-opt-text">
                <b>{h.name}</b>
                <small>
                  {tr(KIND_LABEL[h.kind])} · {tr(ROLE_LABEL[h.role])}
                </small>
              </span>
              {h.id === activeId && <IconCheck size={17} className="hh-check" />}
            </button>
          ))}
          <div className="hh-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="hh-opt accent"
            onClick={() => {
              close(false)
              onCreate()
            }}
          >
            <IconPlus size={17} />
            <span>{tr('משק בית חדש')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="hh-opt"
            onClick={() => {
              close(false)
              onManage()
            }}
          >
            <IconSettings size={17} />
            <span>{tr('ניהול משקי בית')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
