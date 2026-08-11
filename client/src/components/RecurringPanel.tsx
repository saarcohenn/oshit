import { useMemo, useState } from 'react'
import type { Frequency, MerchantRule, Transaction } from '../types'
import { NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { findRecurring, openCommitments, availableMonths, partialMonths, transactionMonth } from '../lib/analytics'
import { FREQUENCIES, FREQUENCY_SHORT, nextChargeMonth } from '../lib/frequency'
import { ils, monthLabel, monthLabelShort, plural } from '../lib/format'
import { IconClose } from './Icons'

export default function RecurringPanel({
  transactions,
  frequencies,
  onSetMerchantRule,
}: {
  transactions: Transaction[]
  frequencies: Record<string, Frequency>
  onSetMerchantRule: (
    merchantKey: string,
    patch: Partial<Omit<MerchantRule, 'merchantKey'>>,
  ) => void
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
      /*
       * החלטת המשתמש גוברת על הניחוש לפי הקטגוריה. בלי הבדיקה הזו בית עסק
       * שסומן כחד-פעמי המשיך להופיע כאן, והסימון נראה כאילו לא נקלט.
       */
      if (frequencies[t.merchantKey] === 'oneoff') continue
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
  }, [transactions, singleMonth, fullMonths, frequencies])

  const likelyYearly = likelySubscriptions.reduce((s, t) => s + t.amount * 12, 0)

  /** סימון בית עסק כחד-פעמי — מוציא אותו מכל רשימות החיובים הקבועים */
  function markOneOff(merchantKey: string, merchant: string) {
    if (
      !confirm(
        `להסיר את "${merchant}" מרשימת החיובים הקבועים?\n` +
          `הוא יסומן כחד-פעמי. העסקאות עצמן נשארות במקומן.`,
      )
    )
      return
    onSetMerchantRule(merchantKey, { frequency: 'oneoff' })
  }

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
            <table className="responsive">
              <thead>
                <tr>
                  <th>בית עסק</th>
                  <th>קטגוריה</th>
                  <th>נחיצות</th>
                  <th className="num">חיוב החודש</th>
                  <th className="num">בשנה</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {likelySubscriptions.map((t) => (
                  <tr key={t.merchantKey}>
                    <td className="strong" data-label="בית עסק">
                      <span className="truncate">{t.merchant}</span>
                    </td>
                    <td data-label="קטגוריה">
                      {cats.byId(t.category).emoji} {cats.byId(t.category).name}
                    </td>
                    <td data-label="נחיצות">
                      <span className={`pill ${t.necessity}`}>{NECESSITY_LABEL[t.necessity]}</span>
                    </td>
                    <td className="num" data-label="חיוב החודש">{ils(t.amount)}</td>
                    <td className="num strong" data-label="בשנה">{ils(t.amount * 12)}</td>
                    <td data-label="">
                      <button
                        className="icon-btn sm danger"
                        title="זה לא מנוי — סימון כחד-פעמי"
                        aria-label={`סימון ${t.merchant} כחד-פעמי`}
                        onClick={() => markOneOff(t.merchantKey, t.merchant)}
                      >
                        <IconClose size={15} />
                      </button>
                    </td>
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
            <table className="responsive">
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.merchantKey}>
                    <td className="strong" data-label="בית עסק">
                      <span className="truncate">{r.merchant}</span>
                      {r.stable && <span className="chip active" style={{ marginInlineStart: 6 }}>יציב</span>}
                    </td>
                    <td data-label="קטגוריה">
                      {cats.byId(r.category).emoji} {cats.byId(r.category).name}
                    </td>
                    <td data-label="נחיצות">
                      <span className={`pill ${r.necessity}`}>{NECESSITY_LABEL[r.necessity]}</span>
                    </td>
                    <td data-label="תדירות">
                      <select
                        value={r.frequency}
                        onChange={(e) =>
                          onSetMerchantRule(r.merchantKey, {
                            frequency: e.target.value as Frequency,
                          })
                        }
                      >
                        {FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {FREQUENCY_SHORT[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num" data-label="סכום החיוב">
                      {ils(r.average)}
                      <div className="mini-label">{r.months.map(monthLabelShort).join(' · ')}</div>
                    </td>
                    <td className="num strong" data-label="עלות לחודש">{ils(r.monthlyCost)}</td>
                    <td className="num" data-label="עלות שנתית">{ils(r.yearly)}</td>
                    <td className="dim" data-label="החיוב הבא" style={{ fontSize: 12.5 }}>
                      {nextChargeMonth(r.lastMonth, r.frequency)
                        ? monthLabel(nextChargeMonth(r.lastMonth, r.frequency)!)
                        : '—'}
                    </td>
                    <td data-label="">
                      <button
                        className="icon-btn sm danger"
                        title="סימון כחד-פעמי — החיוב יוסר מרשימת החיובים הקבועים"
                        aria-label={`הסרת ${r.merchant} מהחיובים הקבועים`}
                        onClick={() => markOneOff(r.merchantKey, r.merchant)}
                      >
                        <IconClose size={15} />
                      </button>
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
            <table className="responsive">
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
                    <td className="strong" data-label="בית עסק">
                      <span className="truncate">{c.merchant}</span>
                      <div className="mini-label">חיוב אחרון: {monthLabel(c.lastChargeMonth)}</div>
                    </td>
                    <td data-label="קטגוריה">
                      {cats.byId(c.category).emoji} {cats.byId(c.category).name}
                    </td>
                    <td className="num" data-label="תשלום חודשי">{ils(c.monthly)}</td>
                    <td data-label="התקדמות" style={{ minWidth: 140 }}>
                      <div className="bar">
                        <span style={{ width: `${(c.paid / c.total) * 100}%`, background: 'var(--viz-bar)' }} />
                      </div>
                      <div className="mini-label">
                        תשלום {c.paid} מתוך {c.total}
                      </div>
                    </td>
                    <td className="num" data-label="נותרו">{c.remaining}</td>
                    <td className="num strong" data-label="יתרה לתשלום">{ils(c.remainingAmount)}</td>
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
