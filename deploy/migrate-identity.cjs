#!/usr/bin/env node
/*
 * הגירה חד-פעמית: חישוב מחדש של מזהי העסקאות.
 *
 * המזהה כלל עד עכשיו את שם בית העסק, והשם הזה תלוי-מקור — הבנק מקצר אותו
 * ל-14 תווים וכאל לא. התוצאה הייתה שאותה קנייה קיבלה שני מזהים שונים משני
 * הקבצים ונספרה פעמיים. נמדד מול הנתונים האמיתיים: 49 מתוך 73.
 *
 * המזהה החדש נגזר רק ממה ששני המקורות מסכימים עליו: ארבע ספרות הכרטיס,
 * התאריך, המטבע, הסכום ומספר החזרה. ראו docs/adr/001.
 *
 * ההרצה בטוחה לחזרה: מזהה שכבר חושב מחדש יֵצא זהה, ולא ישתנה דבר.
 *
 *   docker exec oshit node /app/migrate-identity.cjs [--apply]
 *
 * בלי --apply רק מדווח מה היה קורה.
 */

const Database = require('better-sqlite3')

const DB_PATH = process.env.DB_PATH || '/app/data/oshit.db'
const APPLY = process.argv.includes('--apply')

/* ---- הזהות. שכפול מכוון של client/src/lib/identity.ts ----
   שתי החבילות אינן חולקות מודולים, וזו הגירה חד-פעמית. כל שינוי כאן
   חייב להישאר תואם לקובץ ההוא, אחרת הייבוא הבא ייצור כפילויות. */

function cardLast4(card) {
  const digits = String(card ?? '').replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(-4)
  return String(card ?? '').trim().toLowerCase()
}

function identityKey(t) {
  const amount = t.currency === 'ILS' ? t.amount : t.originalAmount
  return [cardLast4(t.card), t.date, t.currency, amount].join('|')
}

function hash(raw) {
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = (h << 5) - h + raw.charCodeAt(i)
    h |= 0
  }
  return `t${(h >>> 0).toString(36)}_${Math.abs(h % 9973)}`
}

const makeId = (t, occurrence) => hash(`${identityKey(t)}|${occurrence}`)

/* ---------------------------------------------------------------- */

const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

/*
 * כל המשפטים מוכנים פעם אחת.
 * הכנה בתוך הלולאה יצרה מאות אובייקטי Statement שנאספו בזמן פירוק
 * הסביבה, וזה הפיל את node באסרשן נייטיב באמצע ההגירה.
 */
const S = {
  households: db.prepare('SELECT id, name FROM households'),
  rows: db.prepare(
    `SELECT id, card, date, merchant, amount, original_amount AS originalAmount,
            currency, installment_current AS ic
     FROM transactions WHERE household_id = ? ORDER BY rowid ASC`,
  ),
  del: db.prepare('DELETE FROM transactions WHERE household_id = ? AND id = ?'),
  toTemp: db.prepare('UPDATE transactions SET id = ? WHERE household_id = ? AND id = ?'),
  fromTemp: db.prepare(
    "UPDATE transactions SET id = REPLACE(id, '__mig__', '') WHERE household_id = ? AND id LIKE '__mig__%'",
  ),
  anns: db.prepare('SELECT transaction_id AS id FROM annotations WHERE household_id = ?'),
  annExists: db.prepare(
    'SELECT 1 AS x FROM annotations WHERE household_id = ? AND transaction_id = ?',
  ),
  annDel: db.prepare('DELETE FROM annotations WHERE household_id = ? AND transaction_id = ?'),
  annToTemp: db.prepare(
    'UPDATE annotations SET transaction_id = ? WHERE household_id = ? AND transaction_id = ?',
  ),
  annFromTemp: db.prepare(
    "UPDATE annotations SET transaction_id = REPLACE(transaction_id, '__mig__', '') WHERE household_id = ? AND transaction_id LIKE '__mig__%'",
  ),
}

const plan = (householdId) => {
  const rows = S.rows.all(householdId)
  const seen = new Map()
  const newIdFor = new Map()
  const claimed = new Set()
  const merges = []

  for (const r of rows) {
    const parts = {
      card: r.card,
      date: r.date,
      currency: r.currency || 'ILS',
      amount: r.amount,
      originalAmount: r.originalAmount || r.amount,
    }
    const key = identityKey(parts)
    // תשלום שמספרו ידוע נשען עליו במקום על מונה החזרות — כך תשלום 4
    // שהגיע בקובץ אחר מקבל מזהה משלו ולא נבלע בתשלום 3
    const index = r.ic ? r.ic - 1 : (seen.get(key) ?? 0)
    if (!r.ic) seen.set(key, index + 1)

    const nid = makeId(parts, index)
    newIdFor.set(r.id, nid)
    if (claimed.has(nid)) merges.push({ id: r.id, merchant: r.merchant, date: r.date, amount: r.amount })
    else claimed.add(nid)
  }
  return { rows, newIdFor, merges }
}

let totalChanged = 0
let totalMerged = 0
let totalAnnotations = 0

const apply = db.transaction((householdId, plan) => {
  const dropped = new Set(plan.merges.map((m) => m.id))

  /*
   * מעבר דרך מזהה זמני. עדכון ישיר היה מתנגש בשורה שעדיין נושאת את
   * המזהה החדש כמזהה הישן שלה, וה-UNIQUE היה נופל באמצע.
   */
  for (const id of dropped) S.del.run(householdId, id)

  for (const [oldId, nid] of plan.newIdFor) {
    if (dropped.has(oldId) || oldId === nid) continue
    S.toTemp.run(`__mig__${nid}`, householdId, oldId)
  }
  S.fromTemp.run(householdId)

  /*
   * ההערות מפתחן הוא מזהה העסקה. בלי מיפוי שלהן, כל אסמכתא, הערה חופשית
   * ושיוך ליעד היו מתנתקים מהעסקה שלהם — וזו בדיוק העבודה הידנית
   * שאי אפשר לשחזר מהבנק.
   */
  for (const a of S.anns.all(householdId)) {
    const nid = plan.newIdFor.get(a.id)
    if (!nid || nid === a.id) continue
    if (S.annExists.get(householdId, nid)) {
      // שתי הערות שהתלכדו על אותה עסקה — הראשונה נשמרת
      S.annDel.run(householdId, a.id)
    } else {
      S.annToTemp.run(`__mig__${nid}`, householdId, a.id)
    }
    totalAnnotations++
  }
  S.annFromTemp.run(householdId)
})

for (const h of S.households.all()) {
  const p = plan(h.id)
  const changed = [...p.newIdFor.entries()].filter(([oldId, nid]) => oldId !== nid).length
  console.log(`\n== ${h.name} (${h.id})`)
  console.log(`   עסקאות: ${p.rows.length}`)
  console.log(`   מזהים שמשתנים: ${changed}`)
  console.log(`   שורות שמתמזגות: ${p.merges.length}`)
  for (const m of p.merges.slice(0, 10)) {
    console.log(`      מיזוג: ${m.date} ₪${m.amount} "${m.merchant}"`)
  }
  totalChanged += changed
  totalMerged += p.merges.length
  if (APPLY) apply(h.id, p)
}

console.log('\n----------------------------------------')
console.log(`סה״כ מזהים ששונו : ${totalChanged}`)
console.log(`סה״כ שורות שמוזגו: ${totalMerged}`)
console.log(`הערות שמופו      : ${totalAnnotations}`)
console.log(APPLY ? 'המצב נכתב.' : 'הרצה יבשה — לא נכתב דבר. הוסיפו --apply.')
