import { useState } from 'react'
import type { Category, Necessity, Transaction } from '../types'
import { FALLBACK_CATEGORY, NECESSITIES, NECESSITY_LABEL } from '../lib/categories'
import { ils } from '../lib/format'

interface Props {
  categories: Category[]
  transactions: Transaction[]
  onChange: (categories: Category[]) => void
  /** מעביר עסקאות מקטגוריה שנמחקה אל קטגוריה אחרת */
  onReassign: (from: string, to: string) => void
}

const PALETTE = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4',
  '#008300', '#4a3aa7', '#e34948', '#3aa0a8', '#9aa0a6',
]

const slug = (name: string) =>
  'c_' + name.trim().replace(/\s+/g, '_').slice(0, 20) + '_' + Math.random().toString(36).slice(2, 6)

export default function CategoriesPanel({ categories, transactions, onChange, onReassign }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const usage = new Map<string, { count: number; total: number }>()
  for (const t of transactions) {
    const e = usage.get(t.category) ?? { count: 0, total: 0 }
    e.count++
    e.total += t.amount
    usage.set(t.category, e)
  }

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  function patch(id: string, changes: Partial<Category>) {
    onChange(categories.map((c) => (c.id === id ? { ...c, ...changes } : c)))
  }

  function add() {
    const name = prompt('שם הקטגוריה החדשה:')
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) return
    const maxOrder = Math.max(0, ...categories.map((c) => c.sortOrder))
    onChange([
      ...categories,
      {
        id: slug(trimmed),
        name: trimmed,
        emoji: '🏷️',
        color: PALETTE[categories.length % PALETTE.length],
        necessity: 'semi',
        keywords: [],
        // קטגוריה חדשה נכנסת לפני "שונות" כדי שכללי הזיהוי שלה יתפסו
        sortOrder: maxOrder,
      },
    ])
  }

  function move(id: string, direction: -1 | 1) {
    const idx = sorted.findIndex((c) => c.id === id)
    const swapWith = idx + direction
    if (swapWith < 0 || swapWith >= sorted.length) return
    const next = [...sorted]
    ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
    onChange(next.map((c, i) => ({ ...c, sortOrder: i })))
  }

  function remove(cat: Category) {
    if (cat.isFallback) return
    const used = usage.get(cat.id)
    if (used?.count) {
      const target = prompt(
        `ל"${cat.name}" משויכות ${used.count} עסקאות.\n` +
          `לאן להעביר אותן? הקלידו שם קטגוריה קיימת, או השאירו ריק כדי להעביר ל"שונות".`,
        '',
      )
      if (target === null) return
      const match = categories.find(
        (c) => c.id !== cat.id && c.name.trim() === target.trim(),
      )
      onReassign(cat.id, match?.id ?? FALLBACK_CATEGORY)
    } else if (!confirm(`למחוק את הקטגוריה "${cat.name}"?`)) {
      return
    }
    onChange(categories.filter((c) => c.id !== cat.id).map((c, i) => ({ ...c, sortOrder: i })))
  }

  return (
    <div className="grid">
      <div className="notice">
        הקטגוריות שייכות למשק הבית הזה בלבד וניתנות לעריכה מלאה — שם, אימוג׳י, צבע, נחיצות וסדר.
        <strong> הסדר קובע קדימות בזיהוי האוטומטי:</strong> הקטגוריה הראשונה שאחת ממילות המפתח שלה
        מופיעה בשם בית העסק מנצחת. לכן חריגים ("חשמל ומיזוג" — חנות) צריכים לשבת מעל כללים רחבים
        ("חשמל" — חשבון).
      </div>

      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">🏷️ קטגוריות</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              {categories.length} קטגוריות · לחיצה על שורה פותחת את מילות המפתח שלה
            </div>
          </div>
          <button className="btn ghost spacer" onClick={add}>
            + קטגוריה חדשה
          </button>
        </div>

        <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr>
                <th style={{ width: 70 }}>סדר</th>
                <th style={{ minWidth: 200 }}>קטגוריה</th>
                <th>נחיצות</th>
                <th>צבע</th>
                <th className="num">בשימוש</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((cat, i) => {
                const used = usage.get(cat.id)
                const isOpen = expanded === cat.id
                return (
                  <>
                    <tr key={cat.id}>
                      <td data-label="סדר">
                        <div className="order-btns">
                          <button
                            className="link-btn"
                            disabled={i === 0}
                            onClick={() => move(cat.id, -1)}
                            title="למעלה"
                          >
                            ▲
                          </button>
                          <button
                            className="link-btn"
                            disabled={i === sorted.length - 1}
                            onClick={() => move(cat.id, 1)}
                            title="למטה"
                          >
                            ▼
                          </button>
                        </div>
                      </td>
                      <td data-label="קטגוריה">
                        <div className="cat-name-cell">
                          <input
                            className="emoji-input"
                            type="text"
                            value={cat.emoji}
                            onChange={(e) => patch(cat.id, { emoji: e.target.value })}
                            aria-label="אימוג׳י"
                          />
                          <input
                            type="text"
                            value={cat.name}
                            onChange={(e) => patch(cat.id, { name: e.target.value })}
                            style={{ flex: 1, minWidth: 110 }}
                          />
                        </div>
                        {cat.isFallback && (
                          <div className="mini-label">
                            קטגוריית ברירת המחדל — לא ניתן למחוק אותה
                          </div>
                        )}
                      </td>
                      <td data-label="נחיצות">
                        <select
                          value={cat.necessity}
                          onChange={(e) =>
                            patch(cat.id, { necessity: e.target.value as Necessity })
                          }
                        >
                          {NECESSITIES.map((n) => (
                            <option key={n} value={n}>
                              {NECESSITY_LABEL[n]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="צבע">
                        <div className="swatches">
                          {PALETTE.map((c) => (
                            <button
                              key={c}
                              className={`swatch ${cat.color === c ? 'on' : ''}`}
                              style={{ background: c }}
                              onClick={() => patch(cat.id, { color: c })}
                              aria-label={`צבע ${c}`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="num dim" data-label="בשימוש">
                        {used ? `${used.count} · ${ils(used.total)}` : '—'}
                      </td>
                      <td data-label="">
                        <button
                          className="link-btn"
                          onClick={() => setExpanded(isOpen ? null : cat.id)}
                        >
                          {isOpen ? 'סגירה' : `מילות מפתח (${cat.keywords.length})`}
                        </button>
                        {!cat.isFallback && (
                          <button
                            className="link-btn danger-link"
                            style={{ marginInlineStart: 8 }}
                            onClick={() => remove(cat)}
                          >
                            מחיקה
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${cat.id}-kw`}>
                        <td colSpan={6}>
                          <label className="form-field">
                            <span>
                              מילות מפתח לזיהוי אוטומטי — מופרדות בפסיק. די בכך שהמילה מוכלת בשם
                              בית העסק.
                            </span>
                            <textarea
                              rows={3}
                              value={cat.keywords.join(', ')}
                              placeholder="שופרסל, רמי לוי, מכולת"
                              onChange={(e) =>
                                patch(cat.id, {
                                  keywords: e.target.value
                                    .split(',')
                                    .map((k) => k.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          </label>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
