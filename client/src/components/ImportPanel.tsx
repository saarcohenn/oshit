import { useRef, useState } from 'react'
import type { AppState, Transaction } from '../types'
import type { ImportSummary } from '../App'
import { monthCoverage } from '../lib/coverage'
import { ils, monthLabel, monthLabelShort, txCount } from '../lib/format'

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
  error?: string
}

export default function ImportPanel({ state, onImport, onExport, onReset, onDone }: Props) {
  const [over, setOver] = useState(false)
  const [logs, setLogs] = useState<ImportLog[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const results: ImportLog[] = []
    // ספריית קריאת האקסל כבדה ונחוצה רק כאן — נטענת רק כשבאמת מייבאים קובץ
    const { parseCreditCardXlsx } = await import('../lib/parseExcel')

    for (const file of Array.from(files)) {
      try {
        const buffer = await file.arrayBuffer()
        const { transactions, skipped } = parseCreditCardXlsx(buffer, file.name, state.categories)
        if (!transactions.length) {
          results.push({
            fileName: file.name,
            read: 0,
            skipped,
            error: 'לא נמצאו עסקאות בקובץ. ודאו שזה קובץ פירוט כרטיסי אשראי מהבנק.',
          })
          continue
        }
        const summary = onImport(transactions, file.name)
        results.push({ fileName: file.name, read: transactions.length, skipped, summary })
      } catch (err) {
        results.push({
          fileName: file.name,
          read: 0,
          skipped: 0,
          error: `שגיאה בקריאת הקובץ: ${(err as Error).message}`,
        })
      }
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
          void handleFiles(e.dataTransfer.files)
        }}
      >
        <h3>📥 גררו לכאן את קובץ האקסל מהבנק</h3>
        <p>
          הקובץ הוא "פירוט עסקאות — כרטיסי אשראי" שמורידים מאתר הבנק (xlsx).
          <br />
          אפשר לגרור כמה קבצים יחד — חודש אחורה בכל פעם — כדי לראות מגמה.
          <br />
          <strong>אפשר לייבא את אותו חודש שוב בעוד כמה ימים</strong> — המערכת תזהה ותוסיף רק את
          העסקאות שהתווספו מאז, בלי לשכפל דבר.
        </p>
        <button className="btn" onClick={() => inputRef.current?.click()}>
          בחירת קבצים
        </button>
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
          <div className="card-title">תוצאות הייבוא</div>
          {logs.map((log) => (
            <div key={log.fileName} className={`notice ${log.error ? 'warn' : ''}`}>
              <strong>{log.fileName}</strong>
              {log.error ? (
                ` — ${log.error}`
              ) : (
                <>
                  {' '}— נקראו {txCount(log.read)} מהקובץ.
                  <ul className="import-summary">
                    <li>
                      ✅ <strong>{log.summary!.added}</strong> עסקאות חדשות נוספו
                      {log.summary!.added > 0 && <> · {ils(log.summary!.newTotal)}</>}
                    </li>
                    <li>
                      🔄 <strong>{log.summary!.updated}</strong> עסקאות קיימות עודכנו (סכום או תאריך
                      חיוב סופי)
                    </li>
                    <li>
                      ⏭️ <strong>{log.summary!.unchanged}</strong> כבר היו במערכת ולא שונו
                    </li>
                    <li className="dim">
                      {log.skipped} שורות דולגו — שורות סיכום וחיובי 0
                    </li>
                  </ul>
                </>
              )}
            </div>
          ))}
          {logs.some((l) => (l.summary?.added ?? 0) > 0 || (l.summary?.updated ?? 0) > 0) && (
            <button className="btn" onClick={onDone}>
              לצפייה בסקירה ←
            </button>
          )}
        </div>
      )}

      {coverage.months.length > 0 && (
        <div className="card">
          <div className="card-title">📅 אילו חודשים כבר נטענו</div>
          <div className="card-sub">
            החודש המוקדם ביותר שיש עליו נתונים הוא <strong>{monthLabel(coverage.earliest!)}</strong>.
            כל מה שקדם לו פשוט לא יובא עדיין — הורידו מהבנק קובץ לכל חודש חסר וגררו אותם לכאן יחד.
          </div>

          <div className="coverage">
            {coverage.months.map((m) => (
              <div
                key={m.month}
                className={`cov-month ${m.status}`}
                title={
                  m.status === 'missing'
                    ? 'לא יובא'
                    : `${txCount(m.count)} · ${ils(m.total)}${m.status === 'partial' ? ' — חודש חלקי' : ''}`
                }
              >
                <div className="m">{monthLabelShort(m.month)}</div>
                <div className="v">
                  {m.status === 'missing' ? 'חסר' : m.status === 'partial' ? 'חלקי' : ils(m.total)}
                </div>
              </div>
            ))}
          </div>

          {(coverage.missing.length > 0 || coverage.partial.length > 0) && (
            <div className="notice warn" style={{ marginTop: 14 }}>
              {coverage.missing.length > 0 && (
                <>
                  אין נתונים כלל עבור: <strong>{coverage.missing.map(monthLabel).join(', ')}</strong>.{' '}
                </>
              )}
              {coverage.partial.length > 0 && (
                <>
                  מסומנים כחלקיים: <strong>{coverage.partial.map(monthLabel).join(', ')}</strong> —
                  יש בהם רק עסקאות בודדות שחויבו מיידית, ולא את החודש המלא.{' '}
                </>
              )}
              חודשים אלה אינם נכנסים לחישובי ממוצע ולהשוואות, כדי שלא יעוותו את התמונה.
            </div>
          )}
        </div>
      )}

      <div className="grid cols-3">
        <div className="card">
          <div className="stat-label">עסקאות שמורות</div>
          <div className="stat-value">{state.transactions.length.toLocaleString('he-IL')}</div>
          <div className="stat-note">מ-{state.importedFiles.length} קבצים</div>
        </div>
        <div className="card">
          <div className="stat-label">סך הכל נקלט</div>
          <div className="stat-value">{ils(total)}</div>
          <div className="stat-note">כל החודשים יחד</div>
        </div>
        <div className="card">
          <div className="stat-label">שיוכים ידניים</div>
          <div className="stat-value">{state.merchantRules.length}</div>
          <div className="stat-note">בתי עסק שסיווגתם בעצמכם</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🔒 הנתונים נשארים אצלכם</div>
        <div className="card-sub">
          הכול נשמר מקומית בדפדפן הזה בלבד. שום נתון פיננסי לא נשלח לשום שרת.
          מומלץ לייצא גיבוי מדי פעם — ניקוי היסטוריית הדפדפן ימחק את הנתונים.
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn ghost" onClick={onExport}>
            ייצוא גיבוי (JSON)
          </button>
          <button className="btn danger" onClick={onReset}>
            מחיקת כל הנתונים
          </button>
        </div>
      </div>

      {state.importedFiles.length > 0 && (
        <div className="card">
          <div className="card-title">קבצים שיובאו</div>
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
