import { useRef, useState } from 'react'
import type { AppState, Transaction } from '../types'
import type { ImportSummary } from '../App'
import { monthCoverage } from '../lib/coverage'
import { ils, monthLabel, monthLabelShort, txCount } from '../lib/format'
import { tr, trf } from '../lib/i18n'

interface Props {
  state: AppState
  onImport: (transactions: Transaction[], fileName: string) => ImportSummary
  onExport: () => void
  onReset: () => void
  onDone: () => void
}

interface ImportLog {
  fileName: string
  summary?: ImportSummary
  read: number
  skipped: number
  /** הפורמט שזוהה — מוצג כדי שיהיה ברור מה נקרא, במיוחד כשמייבאים שני מקורות */
  format?: 'bank' | 'cal' | 'unknown'
  error?: string
}

const FORMAT_LABEL: Record<string, string> = {
  bank: 'קובץ הבנק',
  cal: 'קובץ כאל',
}

export default function ImportPanel({ state, onImport, onExport, onReset, onDone }: Props) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<ImportLog[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return

    /*
     * הרשימה מועתקת מיד, לפני כל await.
     * FileList של אלמנט input הוא אובייקט חי: איפוס ה-input אחרי הבחירה
     * (כדי שאפשר יהיה לבחור שוב את אותו קובץ) מרוקן אותו. כשהעתקה נעשתה
     * אחרי await, הקריאה חזרה לרשימה ריקה והייבוא נכשל בשקט.
     */
    const selected = Array.from(files)
    const results: ImportLog[] = []
    setBusy(true)
    setLogs([])

    try {
      // ספריית קריאת האקסל כבדה ונחוצה רק כאן — נטענת רק כשבאמת מייבאים קובץ
      const { parseCreditCardXlsx } = await import('../lib/parseExcel')

      for (const file of selected) {
        try {
          const buffer = await file.arrayBuffer()
          const { transactions, skipped, format } = parseCreditCardXlsx(
            buffer,
            file.name,
            state.categories,
          )
          if (!transactions.length) {
            results.push({
              fileName: file.name,
              read: 0,
              skipped,
              format,
              error:
                tr('לא נמצאו עסקאות בקובץ. ודאו שזה "פירוט עסקאות — כרטיסי אשראי" מאתר הבנק, או "פירוט עסקאות וזיכויים" מאתר כאל.'),
            })
            continue
          }
          const summary = onImport(transactions, file.name)
          results.push({ fileName: file.name, read: transactions.length, skipped, format, summary })
        } catch (err) {
          results.push({
            fileName: file.name,
            read: 0,
            skipped: 0,
            error: trf('שגיאה בקריאת הקובץ: {msg}', { msg: (err as Error).message }),
          })
        }
      }
    } catch (err) {
      // כשל בטעינת מנוע הקריאה עצמו — בלי זה המשתמש היה נשאר בלי שום הודעה
      results.push({
        fileName: selected.map((f) => f.name).join(', '),
        read: 0,
        skipped: 0,
        error: trf('טעינת מנוע קריאת האקסל נכשלה: {msg}', { msg: (err as Error).message }),
      })
    } finally {
      setBusy(false)
    }

    setLogs(results)
  }

  const total = state.transactions.reduce((sum, t) => sum + t.amount, 0)
  const coverage = monthCoverage(state.transactions)

  return (
    <div className="grid">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!busy) void handleFiles(e.dataTransfer.files)
        }}
      >
        <h3>{tr('📥 גררו לכאן את קובץ האקסל')}</h3>
        <p>{tr('נתמכים שני קבצים: "פירוט עסקאות — כרטיסי אשראי" מאתר הבנק, ו"פירוט עסקאות וזיכויים" מאתר כאל (xlsx). קובץ כאל מגיע עם היסטוריה ארוכה בבת אחת.')}<br />{tr('לכל כרטיס יש קובץ משלו — הורידו קובץ לכל בעל כרטיס וגררו את שניהם יחד.')}<br />{tr('אפשר לגרור כמה קבצים יחד — חודש אחורה בכל פעם — כדי לראות מגמה.')}<br />
          <strong>{tr('אפשר לייבא את אותו חודש שוב בעוד כמה ימים')}</strong>{tr('— המערכת תזהה ותוסיף רק את העסקאות שהתווספו מאז, בלי לשכפל דבר.')}</p>
        <button className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? tr('קורא את הקובץ…') : tr('בחירת קבצים')}
        </button>
        {busy && (
          <div className="import-busy" role="status" aria-live="polite">
            <span className="spinner" aria-hidden />{tr('קורא ומנתח את הקובץ…')}</div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {logs.length > 0 && (
        <div className="card">
          <div className="card-title">{tr('תוצאות הייבוא')}</div>
          {logs.map((log) => (
            <div key={log.fileName} className={`notice ${log.error ? 'warn' : ''}`}>
              <strong>{log.fileName}</strong>
              {log.error ? (
                ` — ${log.error}`
              ) : (
                <>
                  {' '}— {log.format && FORMAT_LABEL[log.format] ? `${tr(FORMAT_LABEL[log.format])}, ` : ''}
                  {trf('נקראו {n} מהקובץ.', { n: txCount(log.read) })}
                  <ul className="import-summary">
                    <li>
                      ✅ <strong>{log.summary!.added}</strong> {tr('עסקאות חדשות נוספו')}
                      {log.summary!.added > 0 && <> · {ils(log.summary!.newTotal)}</>}
                    </li>
                    <li>
                      🔄 <strong>{log.summary!.updated}</strong>{' '}
                      {tr('עסקאות קיימות עודכנו (סכום או תאריך חיוב סופי)')}
                    </li>
                    <li>
                      ⏭️ <strong>{log.summary!.unchanged}</strong>{' '}
                      {tr('כבר היו במערכת ולא שונו')}
                    </li>
                    {log.summary!.alsoSeen > 0 && (
                      <li>
                        🔗 <strong>{log.summary!.alsoSeen}</strong>{' '}
                        {tr('נראו כאן גם ממקור אחר — לא נספרו פעמיים')}
                      </li>
                    )}
                    <li className="dim">
                      {trf('{n} שורות דולגו — שורות סיכום וחיובי 0', { n: log.skipped })}
                    </li>
                  </ul>
                </>
              )}
            </div>
          ))}
          {logs.some((l) => (l.summary?.added ?? 0) > 0 || (l.summary?.updated ?? 0) > 0) && (
            <button className="btn" onClick={onDone}>{tr('לצפייה בסקירה ←')}</button>
          )}
        </div>
      )}

      {coverage.months.length > 0 && (
        <div className="card">
          <div className="card-title">{tr('📅 אילו חודשים כבר נטענו')}</div>
          <div className="card-sub">
            {tr('החודש המוקדם ביותר שיש עליו נתונים הוא')}{' '}
            <strong>{monthLabel(coverage.earliest!)}</strong>
            {tr('. כל מה שקדם לו פשוט לא יובא עדיין — הורידו מהבנק קובץ לכל חודש חסר וגררו אותם לכאן יחד.')}
          </div>

          <div className="coverage">
            {coverage.months.map((m) => (
              <div
                key={m.month}
                className={`cov-month ${m.status}`}
                title={
                  m.status === 'missing'
                    ? tr('לא יובא')
                    : `${txCount(m.count)} · ${ils(m.total)}${m.status === 'partial' ? tr(' — חודש חלקי') : ''}`
                }
              >
                <div className="m">{monthLabelShort(m.month)}</div>
                <div className="v">
                  {m.status === 'missing' ? tr('חסר') : m.status === 'partial' ? tr('חלקי') : ils(m.total)}
                </div>
              </div>
            ))}
          </div>

          {(coverage.missing.length > 0 || coverage.partial.length > 0) && (
            <div className="notice warn" style={{ marginTop: 14 }}>
              {coverage.missing.length > 0 && (
                <>
                  {tr('אין נתונים כלל עבור:')}{' '}
                  <strong>{coverage.missing.map(monthLabel).join(', ')}</strong>.{' '}
                </>
              )}
              {coverage.partial.length > 0 && (
                <>
                  {tr('מסומנים כחלקיים:')}{' '}
                  <strong>{coverage.partial.map(monthLabel).join(', ')}</strong> —{' '}
                  {tr('יש בהם רק עסקאות בודדות שחויבו מיידית, ולא את החודש המלא.')}{' '}
                </>
              )}
              {tr('חודשים אלה אינם נכנסים לחישובי ממוצע ולהשוואות, כדי שלא יעוותו את התמונה.')}
            </div>
          )}
        </div>
      )}

      <div className="grid cols-3">
        <div className="card">
          <div className="stat-label">{tr('עסקאות שמורות')}</div>
          <div className="stat-value">{state.transactions.length.toLocaleString()}</div>
          <div className="stat-note">
            {trf('מ-{n} קבצים', { n: state.importedFiles.length })}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('סך הכל נקלט')}</div>
          <div className="stat-value">{ils(total)}</div>
          <div className="stat-note">{tr('כל החודשים יחד')}</div>
        </div>
        <div className="card">
          <div className="stat-label">{tr('שיוכים ידניים')}</div>
          <div className="stat-value">{state.merchantRules.length}</div>
          <div className="stat-note">{tr('בתי עסק שסיווגתם בעצמכם')}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{tr('🔒 הנתונים נשארים אצלכם')}</div>
        <div className="card-sub">{tr('הכול נשמר מקומית בדפדפן הזה בלבד. שום נתון פיננסי לא נשלח לשום שרת. מומלץ לייצא גיבוי מדי פעם — ניקוי היסטוריית הדפדפן ימחק את הנתונים.')}</div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn ghost" onClick={onExport}>{tr('ייצוא גיבוי (JSON)')}</button>
          <button className="btn danger" onClick={onReset}>{tr('מחיקת כל הנתונים')}</button>
        </div>
      </div>

      {state.importedFiles.length > 0 && (
        <div className="card">
          <div className="card-title">{tr('קבצים שיובאו')}</div>
          <div className="chip-row">
            {state.importedFiles.map((f) => (
              <span key={f} className="chip">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
