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
      <div className="page-head">
        <div>
          <h1 className="page-title">{tr('איפה לחסוך')}</h1>
          <div className="page-sub">{tr('הצעות נוגעות רק במה שלא סומן כחובה')}</div>
        </div>
      </div>

      <div className="hero-card savings-hero">
        <div className="hero-eyebrow">{tr('חיסכון אפשרי בשנה')}</div>
        <div className="hero-big">{ils(yearlyTotal)}</div>
        <div className="hero-text">
          {ideas.length === 1 ? tr('הצעה אחת') : trf('{n} הצעות', { n: ideas.length })} ·{' '}
          {tr('ללא נגיעה בהוצאות החובה')}
        </div>
        <div className="hero-stats">
          <div>
            <span>{tr('בחודש')}</span>
            <b>{ils(monthlyTotal)}</b>
          </div>
          <div>
            <span>{tr('מתוך ההוצאה החודשית')}</span>
            <b>{summary.total ? Math.round((monthlyTotal / summary.total) * 100) : 0}%</b>
          </div>
          <div>
            <span>{trf('הוצאות {month}', { month: monthLabel(month) })}</span>
            <b>{ils(summary.total)}</b>
          </div>
        </div>
      </div>

      <div className="notice">{tr('ההצעות מבוססות על ההוצאות שלכם בפועל, ואף אחת מהן לא נוגעת בהוצאות שסומנו כ"חובה". אם משהו כאן מסווג לא נכון — שנו את הסיווג בלשונית "עסקאות" והרשימה תתעדכן.')}</div>

      {ideas.length === 0 ? (
        <div className="card">
          <p className="dim">{tr('לא נמצאו הצעות חיסכון מובהקות בחודש הזה. נסו לייבא עוד חודשים כדי לזהות מנויים וחיובים חוזרים.')}</p>
        </div>
      ) : (
        <div className="grid">
          {ideas.map((idea, i) => (
            <div className="card saving-card lift" key={i}>
              <span className={`severity ${idea.severity}`}>{tr(SEVERITY_LABEL[idea.severity])}</span>
              <div className="saving-body">
                <div className="saving-title">{idea.title}</div>
                <div className="saving-detail">{idea.detail}</div>
              </div>
              <div className="saving-amount">
                <div className="big">{ils(idea.monthlySaving)}</div>
                <div className="small">{trf('{sum} בשנה', { sum: ils(idea.yearlySaving) })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
