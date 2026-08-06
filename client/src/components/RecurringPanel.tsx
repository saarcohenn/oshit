import { useMemo, useState } from 'react'
import type { Frequency, Transaction } from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { findRecurring, openCommitments, availableMonths, partialMonths, transactionMonth } from '../lib/analytics'
import { FREQUENCY_SHORT, nextChargeMonth } from '../lib/frequency'
import { ils, monthLabel, monthLabelShort, plural } from '../lib/format'

export default function RecurringPanel({
  transactions,
  frequencies,
}: {
  transactions: Transaction[]
  frequencies: Record<string, Frequency>
}) {
  const cats = useCategories()
  const [onlyStable, setOnlyStable] = useState(true)
  const recurring = useMemo(() => findRecurring(transactions, frequencies), [transactions, frequencies])
  const commitments = useMemo(() => openCommitments(transactions), [transactions])

  const shown = onlyStable ? recurring.filter((r) => r.stable) : recurring
  // הסכום החודשי מנורמל: חיוב דו-חודשי נספר כמחצית בכל חודש
  const stableTotal = recurring.filter((r) => r.stable).reduce((s, r) => s + r.monthlyCost, 0)
  const cancellable = recurring.filter((r) => r.stable && r.necessity === 'optional')
  const cancellableYearly = cancellable.reduce((s, r) => s + r.yearly, 0)
  const commitmentTotal = commitments.reduce((s, c) => s + c.remainingAmount, 0)
  const commitmentMonthly = commitments.reduce((s, c) => s + c.monthly, 0)

  const fullMonths = useMemo(() => {
    const partial = partialMonths(transactions)
    return availableMonths(transactions).filter((m) => !partial.has(m))
  }, [transactions])
  const singleMonth = fullMonths.length < 2

  /**
   * כשיובא חודש אחד בלבד אי אפשר עדיין להוכיח שחיוב חוזר,
   * אבל קטגוריות מסוימות הן מנוי כמעט בהגדרה — ולכן הן מוצגות כבר עכשיו
   * כדי שיהיה מה לעשות עם הקובץ הראשון.
   */
  const likelySubscriptions = useMemo(() => {
    if (!singleMonth) return []
    const latest = fullMonths[0]
    const groups = new Map<string, { merchant: string; category: Transaction['category']; necessity: Transaction['necessity']; amount: number }>()
    for (const t of transactions) {
      if (transactionMonth(t) !== latest || t.installment) continue
      if (t.category !== 'subscriptions' && t.category !== 'communication' && t.category !== 'insurance') continue
      const entry = groups.get(t.merchantKey) ?? {
        merchant: t.merchant,
        category: t.category,
        necessity: t.necessity,
        amount: 0,
      }
      entry.amount += t.amount
      groups.set(t.merchantKey, entry)
    }
    return [...groups.entries()]
      .map(([merchantKey, v]) => ({ merchantKey, ...v }))
      .sort((a, b) => b.amount - a.amount)
  }, [transactions, singleMonth, fullMonths])

  const likelyYearly = likelySubscriptions.reduce((s, t) => s + t.amount * 12, 0)

  return (
    <div className="grid">
      {singleMonth && (
        <div className="notice warn">
          יובא חודש מלא אחד בלבד. זיהוי חיובים חוזרים נהיה הרבה יותר מדויק אחרי ייבוא של 2–3 חודשים נוספים —
          בינתיים מוצגים החיובים שנראים כמו מנוי לפי הקטגוריה שלהם.
        </div>
      )}

      {likelySubscriptions.length > 0 && (
        <div className="card">
          <div className="card-title">🔍 נראים כמו מנוי — {ils(likelyYearly)} בשנה</div>
          <div className="card-sub">
            חיובים בקטגוריות שהן כמעט תמיד הוראת קבע. עברו עליהם ובדקו מה עדיין בשימוש.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>בית עסק</th>
                  <th>קטגוריה</th>
                  <th>נחיצות</th>
                  <th className="num">חיוב החודש</th>
                  <th className="num">בשנה</th>
                </tr>
              </thead>
              <tbody>
                {likelySubscriptions.map((t) => (
                  <tr key={t.merchantKey}>
                    <td className="strong">
                      <span className="truncate">{t.merchant}</span>
                    </td>
                    <td>
                      {cats.byId(t.category).emoji} {cats.byId(t.category).name}
                    </td>
                    <td>
                      <span className={`pill ${t.necessity}`}>{NECESSITY_LABEL[t.necessity]}</span>
                    </td>
                    <td className="num">{ils(t.amount)}</td>
                    <td className="num strong">{ils(t.amount * 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid cols-3">
        <div className="card">
          <div className="stat-label">חיובים קבועים בחודש</div>
          <div className="stat-value">{ils(stableTotal)}</div>
          <div className="mini-label">מנורמל — חיוב דו-חודשי נספר כמחצית</div>
          <div className="stat-note">
            {plural(recurring.filter((r) => r.stable).length, 'הוראת קבע', 'חיובים בסכום יציב')}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">מנויים שאפשר לבטל</div>
          <div className="stat-value tinted" style={{ color: 'var(--viz-optional)' }}>
            {ils(cancellableYearly)}
          </div>
          <div className="stat-note">
            בשנה — {plural(cancellable.length, 'הוצאה מסווגת', 'הוצאות מסווגות')} כמותרות
          </div>
        </div>
        <div className="card">
          <div className="stat-label">התחייבויות בתשלומים</div>
          <div className="stat-value">{ils(commitmentTotal)}</div>
          <div className="stat-note">{ils(commitmentMonthly)} בחודש שכבר "תפוסים"</div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div>
            <div className="card-title">🔁 חיובים חוזרים</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              בית עסק שחייב אתכם בשני חודשים או יותר. "יציב" = הסכום כמעט זהה בכל מחזור — כמעט תמיד
              מנוי או הוראת קבע. חיוב שסימנתם כלא-חודשי (חשמל, מים, ארנונה) נכנס לרשימה כבר מהופעה
              ראשונה, ו"עלות לחודש" מחלקת אותו על פני התקופה.
            </div>
          </div>
          <label className="spacer" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <input
              type="checkbox"
              checked={onlyStable}
              onChange={(e) => setOnlyStable(e.target.checked)}
            />
            רק חיובים יציבים
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="dim">לא נמצאו חיובים חוזרים בנתונים שיובאו.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>בית עסק</th>
                  <th>קטגוריה</th>
                  <th>נחיצות</th>
                  <th>תדירות</th>
                  <th className="num">סכום החיוב</th>
                  <th className="num">עלות לחודש</th>
                  <th className="num">עלות שנתית</th>
                  <th>החיוב הבא</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.merchantKey}>
                    <td className="strong">
                      <span className="truncate">{r.merchant}</span>
                      {r.stable && <span className="chip active" style={{ marginInlineStart: 6 }}>יציב</span>}
                    </td>
                    <td>
                      {cats.byId(r.category).emoji} {cats.byId(r.category).name}
                    </td>
                    <td>
                      <span className={`pill ${r.necessity}`}>{NECESSITY_LABEL[r.necessity]}</span>
                    </td>
                    <td>
                      <span className={`chip ${r.frequency !== 'monthly' ? 'active' : ''}`}>
                        {FREQUENCY_SHORT[r.frequency]}
                      </span>
                    </td>
                    <td className="num">
                      {ils(r.average)}
                      <div className="mini-label">{r.months.map(monthLabelShort).join(' · ')}</div>
                    </td>
                    <td className="num strong">{ils(r.monthlyCost)}</td>
                    <td className="num">{ils(r.yearly)}</td>
                    <td className="dim" style={{ fontSize: 12.5 }}>
                      {nextChargeMonth(r.lastMonth, r.frequency)
                        ? monthLabel(nextChargeMonth(r.lastMonth, r.frequency)!)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">💳 תשלומים פתוחים</div>
        <div className="card-sub">
          עסקאות שנפרסו לתשלומים וממשיכות לחייב אתכם בחודשים הבאים. זה כסף שכבר "הוצאתם" אבל עוד לא שילמתם.
        </div>

        {commitments.length === 0 ? (
          <p className="dim">אין עסקאות בתשלומים פתוחות.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>בית עסק</th>
                  <th>קטגוריה</th>
                  <th className="num">תשלום חודשי</th>
                  <th>התקדמות</th>
                  <th className="num">נותרו</th>
                  <th className="num">יתרה לתשלום</th>
                </tr>
              </thead>
              <tbody>
                {commitments.map((c, i) => (
                  <tr key={`${c.merchant}-${i}`}>
                    <td className="strong">
                      <span className="truncate">{c.merchant}</span>
                      <div className="mini-label">חיוב אחרון: {monthLabel(c.lastChargeMonth)}</div>
                    </td>
                    <td>
                      {cats.byId(c.category).emoji} {cats.byId(c.category).name}
                    </td>
                    <td className="num">{ils(c.monthly)}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="bar">
                        <span style={{ width: `${(c.paid / c.total) * 100}%`, background: 'var(--viz-bar)' }} />
                      </div>
                      <div className="mini-label">
                        תשלום {c.paid} מתוך {c.total}
                      </div>
                    </td>
                    <td className="num">{c.remaining}</td>
                    <td className="num strong">{ils(c.remainingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
