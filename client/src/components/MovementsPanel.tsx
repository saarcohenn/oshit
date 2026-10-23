import { useMemo, useState } from 'react'
import type { AccountMovement, MovementKind } from '../types'
import { countsAsExpense, countsAsIncome, countsInTrend } from '../types'
import { ils, monthLabel } from '../lib/format'
import { tr, trf } from '../lib/i18n'

interface Props {
  movements: AccountMovement[]
  /** בני הבית שאפשר לשייך אליהם תנועה */
  people: string[]
  onSetOneOff: (id: string, oneOff: boolean) => void
  onSetPerson: (id: string, person: string) => void
}

const KIND_LABEL: Record<MovementKind, string> = {
  card_settlement: 'חיוב כרטיס',
  salary: 'משכורת',
  transfer: 'העברה פנימית',
  investment: 'השקעה',
  fee: 'עמלה',
  cash: 'מזומן',
  cheque: 'שיק',
  income: 'הכנסה',
  expense: 'הוצאה',
}

/**
 * סוגים שאינם כסף שיצא או נכנס באמת.
 *
 * מוצגים מעומעמים כדי שיהיה ברור שהם נקראו ונשמרו, אבל אינם נספרים —
 * אחרת המשתמש רואה "חיוב כרטיס 8,285" ולא מבין למה הסיכום לא כולל אותו.
 */
const NEUTRAL: MovementKind[] = ['card_settlement', 'transfer', 'investment']

export default function MovementsPanel({ movements, people, onSetOneOff, onSetPerson }: Props) {
  const [month, setMonth] = useState('')
  const [hideNeutral, setHideNeutral] = useState(false)

  const months = useMemo(
    () => [...new Set(movements.map((m) => m.date.slice(0, 7)))].sort().reverse(),
    [movements],
  )

  const shown = useMemo(() => {
    let list = movements
    if (month) list = list.filter((m) => m.date.slice(0, 7) === month)
    if (hideNeutral) list = list.filter((m) => !NEUTRAL.includes(m.kind))
    return list
  }, [movements, month, hideNeutral])

  const totals = useMemo(() => {
    const scope = month ? movements.filter((m) => m.date.slice(0, 7) === month) : movements
    const sum = (list: AccountMovement[]) => list.reduce((s, m) => s + Math.abs(m.amount), 0)
    return {
      expense: sum(scope.filter(countsAsExpense)),
      income: sum(scope.filter(countsAsIncome)),
      // מה שנחסך מספירה כפולה: חיובי כרטיס, העברות פנימיות והשקעות
      neutral: sum(scope.filter((m) => !m.pending && NEUTRAL.includes(m.kind))),
      oneOff: sum(scope.filter((m) => m.oneOff && !m.pending)),
      trendExpense: sum(scope.filter((m) => countsInTrend(m) && m.amount < 0)),
    }
  }, [movements, month])

  if (!movements.length) {
    return (
      <div className="card">
        <div className="card-title">{tr('עובר ושב')}</div>
        <p className="dim">
          {tr('עדיין לא יובא קובץ עובר ושב. הורידו אותו מאתר הבנק וגררו אותו במסך הייבוא.')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="card-title">{tr('עובר ושב')}</div>

        <div className="row gap wrap">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">{tr('כל החודשים')}</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <label className="row gap">
            <input
              type="checkbox"
              checked={hideNeutral}
              onChange={(e) => setHideNeutral(e.target.checked)}
            />
            {tr('הסתרת תנועות שאינן נספרות')}
          </label>
        </div>

        <ul className="import-summary">
          <li>💸 {tr('הוצאות בפועל')}: <strong>{ils(totals.expense)}</strong></li>
          <li>💰 {tr('הכנסות בפועל')}: <strong>{ils(totals.income)}</strong></li>
          {totals.oneOff > 0 && (
            <li>
              ⭐ {tr('מתוכן חד-פעמי')}: <strong>{ils(totals.oneOff)}</strong>{' '}
              <span className="dim">{trf('— ההוצאה השוטפת היא {n}', { n: ils(totals.trendExpense) })}</span>
            </li>
          )}
          <li className="dim">
            🔁 {tr('לא נספר')}: {ils(totals.neutral)}{' '}
            {tr('— חיובי כרטיס, העברות פנימיות והשקעות. חיוב הכרטיס כבר נספר כעסקאות מקובץ הכרטיס.')}
          </li>
        </ul>
      </div>

      <div className="card">
        <datalist id="movement-people">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <table className="table">
          <thead>
            <tr>
              <th>{tr('תאריך')}</th>
              <th>{tr('תיאור')}</th>
              <th>{tr('סוג')}</th>
              <th>{tr('סכום')}</th>
              <th>{tr('חד-פעמי')}</th>
              <th>{tr('שייך ל')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const neutral = NEUTRAL.includes(m.kind)
              return (
                <tr key={m.id} className={neutral || m.pending ? 'dim' : ''}>
                  <td>
                    {m.date}
                    {m.pending && <> · <span className="dim">{tr('עתידי')}</span></>}
                  </td>
                  <td>{m.description}</td>
                  <td>{tr(KIND_LABEL[m.kind] ?? m.kind)}</td>
                  <td className={m.amount < 0 ? 'neg' : 'pos'}>{ils(m.amount)}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!m.oneOff}
                      onChange={(e) => onSetOneOff(m.id, e.target.checked)}
                      aria-label={tr('סימון כחד-פעמי')}
                      title={tr('אירוע חד-פעמי — נספר בחודש שלו, אך לא בממוצעים ובמגמה')}
                    />
                  </td>
                  <td>
                    {/* טקסט חופשי עם השלמה, כמו שדה "של מי" בהכנסות — רשימה
                        סגורה הייתה ריקה עד שמוגדר בן בית ראשון */}
                    <input
                      type="text"
                      list="movement-people"
                      value={m.person ?? ''}
                      placeholder={tr('אני / בת הזוג')}
                      onChange={(e) => onSetPerson(m.id, e.target.value)}
                      aria-label={tr('שיוך לבן בית')}
                      style={{ width: 110 }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!shown.length && <p className="dim">{tr('אין תנועות להצגה בסינון הנוכחי.')}</p>}
      </div>
    </div>
  )
}
