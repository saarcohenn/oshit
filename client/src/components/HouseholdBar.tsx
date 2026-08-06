import { useState } from 'react'
import type { Household } from '../lib/api'

interface Props {
  households: Household[]
  activeId: string | null
  onSwitch: (id: string) => void
  onCreate: (name: string, emoji: string) => void
  onRename: (id: string, name: string, emoji: string) => void
  onDelete: (id: string) => void
}

/**
 * בורר משק הבית. משקי בית מבודדים לחלוטין זה מזה —
 * עסקאות, קטגוריות, יעדים והכנסות שייכים למשק בית אחד בלבד.
 */
export default function HouseholdBar({
  households,
  activeId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [managing, setManaging] = useState(false)
  const active = households.find((h) => h.id === activeId) ?? null

  function create() {
    const name = prompt('שם משק הבית החדש:', 'משק בית נוסף')
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) return
    const emoji = prompt('אימוג׳י (אפשר להשאיר ריק):', '🏡') ?? '🏡'
    onCreate(trimmed, emoji.trim() || '🏡')
  }

  function rename(h: Household) {
    const name = prompt('שם משק הבית:', h.name)
    if (name === null) return
    const emoji = prompt('אימוג׳י:', h.emoji) ?? h.emoji
    onRename(h.id, name.trim() || h.name, emoji.trim() || h.emoji)
  }

  function remove(h: Household) {
    const typed = prompt(
      `מחיקת "${h.name}" תמחק לצמיתות את כל העסקאות, הקטגוריות והיעדים שלו.\n` +
        `אין דרך לשחזר. כדי לאשר, הקלידו את שם משק הבית:`,
    )
    if (typed === null) return
    if (typed.trim() !== h.name) {
      alert('השם לא תואם — לא נמחק דבר.')
      return
    }
    onDelete(h.id)
  }

  return (
    <div className="household-bar">
      <select
        value={activeId ?? ''}
        onChange={(e) => onSwitch(e.target.value)}
        aria-label="בחירת משק בית"
        className="household-select"
      >
        {households.map((h) => (
          <option key={h.id} value={h.id}>
            {h.emoji} {h.name}
          </option>
        ))}
      </select>

      <button
        className="icon-btn"
        onClick={() => setManaging((v) => !v)}
        title="ניהול משקי הבית"
        aria-label="ניהול משקי הבית"
      >
        ⚙️
      </button>

      {managing && (
        <div className="household-menu">
          <div className="card-title">משקי בית</div>
          <div className="card-sub" style={{ marginBottom: 10 }}>
            כל משק בית הוא עולם נפרד: עסקאות, קטגוריות, תקציבים ויעדים משלו.
          </div>
          {households.map((h) => (
            <div className="household-row" key={h.id}>
              <button
                className={`household-pick ${h.id === activeId ? 'active' : ''}`}
                onClick={() => {
                  onSwitch(h.id)
                  setManaging(false)
                }}
              >
                <span>
                  {h.emoji} {h.name}
                </span>
                <span className="dim">{h.transactionCount} עסקאות</span>
              </button>
              <button className="link-btn" onClick={() => rename(h)}>
                שינוי שם
              </button>
              {households.length > 1 && (
                <button className="link-btn danger-link" onClick={() => remove(h)}>
                  מחיקה
                </button>
              )}
            </div>
          ))}
          <button className="btn sm" style={{ marginTop: 10 }} onClick={create}>
            + משק בית חדש
          </button>
        </div>
      )}

      {active && <span className="sr-only">משק בית פעיל: {active.name}</span>}
    </div>
  )
}
