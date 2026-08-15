import { useMemo } from 'react'
import type { Frequency, Transaction } from '../types'
import { savingIdeas, summarize } from '../lib/analytics'
import { useCategories } from '../lib/categoryContext'
import { ils, monthLabel } from '../lib/format'
import { tr, trf } from '../lib/i18n'

const SEVERITY_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'השפעה גדולה',
  medium: 'השפעה בינונית',
  low: 'השפעה קטנה',
}

export default function SavingsPanel({
  transactions,
  month,
  frequencies,
}: {
  transactions: Transaction[]
  month: string
  /** כללי התדירות ממסך העסקאות — בית עסק שסומן כחד-פעמי אינו מועמד לביטול */
  frequencies: Record<string, Frequency>
}) {
  const cats = useCategories()
  const ideas = useMemo(
    () => savingIdeas(transactions, month, cats, frequencies),
    [transactions, month, cats, frequencies],
  )
  const summary = useMemo(() => summarize(transactions, month), [transactions, month])

  const monthlyTotal = ideas.reduce((s, i) => s + i.monthlySaving, 0)
  const yearlyTotal = ideas.reduce((s, i) => s + i.yearlySaving, 0)

  return (
    <div className="grid">
      <div className="grid cols-3">
        <div className="card">
          <div className="stat-label">{tr('חיסכון אפשרי בחודש')}</div>
          <div className="stat-value tinted" style={{ color: 'var(--ok)' }}>
            {ils(monthlyTotal)}
          </div>
          <div className="stat-note">{tr('אם תיישמו את כל ההצעות למטה')}</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('חיסכון אפשרי בשנה')}</div>
          <div className="stat-value tinted" style={{ color: 'var(--ok)' }}>
            {ils(yearlyTotal)}
          </div>
          <div className="stat-note">{tr('אותו קצב, שנים עשר חודשים')}</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('מתוך ההוצאה החודשית')}</div>
          <div className="stat-value">
            {summary.total ? Math.round((monthlyTotal / summary.total) * 100) : 0}%
          </div>
          <div className="stat-note">{trf("{sum} ב{month}", { sum: ils(summary.total), month: monthLabel(month) })}</div>
        </div>
      </div>

      <div className="notice">{tr('ההצעות מבוססות על ההוצאות שלכם בפועל, ואף אחת מהן לא נוגעת בהוצאות שסומנו כ"חובה". אם משהו כאן מסווג לא נכון — שנו את הסיווג בלשונית "עסקאות" והרשימה תתעדכן.')}</div>

      {ideas.length === 0 ? (
        <div className="card">
          <p className="dim">{tr('לא נמצאו הצעות חיסכון מובהקות בחודש הזה. נסו לייבא עוד חודשים כדי לזהות מנויים וחיובים חוזרים.')}</p>
        </div>
      ) : (
        <div className="grid cols-2">
          {ideas.map((idea, i) => (
            <div className="card saving-card" key={i}>
              <div className="saving-amount">
                <div className="big">{ils(idea.monthlySaving)}</div>
                <div className="small">{tr('בחודש')}</div>
                <div className="small" style={{ marginTop: 6 }}>
                  {trf("{sum} בשנה", { sum: ils(idea.yearlySaving) })}
                </div>
              </div>
              <div>
                <div className="card-title">{idea.title}</div>
                <div className="card-sub" style={{ marginBottom: 8 }}>
                  {idea.detail}
                </div>
                {idea.severity === 'low' ? (
                  <span className="chip">{SEVERITY_LABEL.low}</span>
                ) : (
                  <span className={`pill ${idea.severity === 'high' ? 'mandatory' : 'semi'}`}>
                    {tr(SEVERITY_LABEL[idea.severity])}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
