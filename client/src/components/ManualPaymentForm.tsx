import { useState } from 'react'
import type { CategoryId, Frequency, Necessity, Transaction } from '../types'
import { guessCategory, NECESSITY_LABEL } from '../lib/categories'
import { useCategories } from '../lib/categoryContext'
import { FREQUENCIES, FREQUENCY_LABEL, monthlyEquivalent } from '../lib/frequency'
import { ils } from '../lib/format'

interface Props {
  /** ערכי פתיחה לעריכת תשלום קיים; ריק = הוספה חדשה */
  editing?: Transaction
  defaultDate: string
  onSave: (payment: ManualPaymentDraft, frequency: Frequency) => void
  onCancel: () => void
}

export interface ManualPaymentDraft {
  id?: string
  merchant: string
  amount: number
  date: string
  category: CategoryId
  necessity: Necessity
  paidVia: string
  note: string
}

export default function ManualPaymentForm({ editing, defaultDate, onSave, onCancel }: Props) {
  const cats = useCategories()
  const [merchant, setMerchant] = useState(editing?.merchant ?? '')
  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : '')
  const [date, setDate] = useState(editing?.date ?? defaultDate)
  const [paidVia, setPaidVia] = useState(editing?.paidVia ?? '')
  const [note, setNote] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  // הקטגוריה ננחשת מהשם עד שהמשתמש בוחר בעצמו
  const [category, setCategory] = useState<CategoryId | ''>(editing?.category ?? '')
  const [necessity, setNecessity] = useState<Necessity | ''>(editing?.necessity ?? '')

  const effectiveCategory: CategoryId = category || (merchant ? guessCategory(merchant, cats.list) : 'other')
  const effectiveNecessity: Necessity = necessity || cats.byId(effectiveCategory).necessity
  const numericAmount = Number(amount) || 0
  const valid = merchant.trim().length > 0 && numericAmount > 0 && !!date

  function submit() {
    if (!valid) return
    onSave(
      {
        id: editing?.id,
        merchant: merchant.trim(),
        amount: numericAmount,
        date,
        category: effectiveCategory,
        necessity: effectiveNecessity,
        paidVia: paidVia.trim(),
        note: note.trim(),
      },
      frequency,
    )
  }

  const monthly = monthlyEquivalent(numericAmount, frequency)

  return (
    <div className="card manual-form">
      <div className="card-title">
        {editing ? '✏️ עריכת תשלום ידני' : '➕ הוספת תשלום שלא מופיע בכרטיס'}
      </div>
      <div className="card-sub">
        לתשלומים שיוצאים מהחשבון אבל לא דרך כרטיס האשראי — העברה לאמא על החשמל, מזומן,
        הוראת קבע בבנק, או צ׳ק.
      </div>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <label className="form-field">
          <span>על מה שילמתם</span>
          <input
            type="text"
            autoFocus
            value={merchant}
            placeholder="למשל: חשמל"
            onChange={(e) => setMerchant(e.target.value)}
          />
        </label>

        <label className="form-field">
          <span>דרך מי שולם</span>
          <input
            type="text"
            value={paidVia}
            placeholder="למשל: אמא (העברתי לה)"
            onChange={(e) => setPaidVia(e.target.value)}
          />
        </label>

        <label className="form-field">
          <span>סכום</span>
          <input
            type="number"
            min={0}
            step={10}
            value={amount}
            placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="form-field">
          <span>תאריך</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="form-field">
          <span>קטגוריה</span>
          <select
            value={category || effectiveCategory}
            onChange={(e) => setCategory(e.target.value as CategoryId)}
          >
            {cats.list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>נחיצות</span>
          <select
            value={necessity || effectiveNecessity}
            onChange={(e) => setNecessity(e.target.value as Necessity)}
          >
            {(['mandatory', 'semi', 'optional'] as Necessity[]).map((n) => (
              <option key={n} value={n}>
                {NECESSITY_LABEL[n]}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>כל כמה זמן מחייבים</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>הערה</span>
          <input
            type="text"
            value={note}
            placeholder="לא חובה"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      {frequency !== 'monthly' && frequency !== 'oneoff' && numericAmount > 0 && (
        <div className="notice" style={{ marginTop: 14 }}>
          חיוב של {ils(numericAmount)} {FREQUENCY_LABEL[frequency]} שווה{' '}
          <strong>{ils(monthly)} בחודש</strong> — זה המספר להשוואה מול התקציב החודשי.
          התדירות תישמר גם לחיובים הבאים של "{merchant || 'בית העסק'}".
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
        <button className="btn" disabled={!valid} onClick={submit}>
          {editing ? 'שמירת השינויים' : 'הוספת התשלום'}
        </button>
        <button className="btn ghost" onClick={onCancel}>
          ביטול
        </button>
        {!valid && <span className="dim">צריך שם, סכום ותאריך</span>}
        {valid && !editing && (
          <span className="dim spacer">
            ייווסף כ{cats.byId(effectiveCategory).emoji}{' '}
            {cats.byId(effectiveCategory).name} · {NECESSITY_LABEL[effectiveNecessity]}
          </span>
        )}
      </div>
    </div>
  )
}
