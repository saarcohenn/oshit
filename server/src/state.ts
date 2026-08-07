import { db } from './db.js'

/**
 * הלקוח עובד מול אובייקט מצב אחד לכל משק בית — אותו מבנה שהיה קודם ב-localStorage.
 * כאן הוא נקרא מהטבלאות ונכתב אליהן בעסקה אחת, כדי שהמעבר לשרת לא ידרוש
 * שכתוב של הלוגיקה בצד הלקוח.
 */
export interface HouseholdState {
  categories: unknown[]
  transactions: unknown[]
  budgets: unknown[]
  merchantRules: unknown[]
  importedFiles: string[]
  annotations: Record<string, unknown>
  incomes: unknown[]
  goals: unknown[]
  plannedChanges: unknown[]
}

type Row = Record<string, any>

const nullIfEmpty = (v: unknown) => (v === '' || v === undefined ? null : v)
const bool = (v: unknown) => (v ? 1 : 0)

export function readVersion(householdId: string): number {
  const row = db.prepare('SELECT version FROM households WHERE id = ?').get(householdId) as
    | { version: number }
    | undefined
  return row?.version ?? 0
}

export function readState(householdId: string): HouseholdState {
  const q = (sql: string) => db.prepare(sql).all(householdId) as Row[]

  const categories = q(
    `SELECT id, name, emoji, color, necessity, sort_order AS sortOrder, keywords,
            is_fallback AS isFallback
     FROM categories WHERE household_id = ? ORDER BY sort_order ASC`,
  ).map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    necessity: c.necessity,
    sortOrder: c.sortOrder,
    keywords: c.keywords ? String(c.keywords).split(',').filter(Boolean) : [],
    isFallback: !!c.isFallback,
  }))

  const transactions = q(
    `SELECT id, card, merchant, merchant_key AS merchantKey, date, charge_date AS chargeDate,
            amount, original_amount AS originalAmount, currency, kind,
            installment_current AS ic, installment_total AS it,
            category, necessity, source, manual, paid_via AS paidVia
     FROM transactions WHERE household_id = ?`,
  ).map((t) => ({
    id: t.id,
    card: t.card,
    merchant: t.merchant,
    merchantKey: t.merchantKey,
    date: t.date,
    chargeDate: t.chargeDate,
    amount: t.amount,
    originalAmount: t.originalAmount,
    currency: t.currency,
    kind: t.kind,
    installment: t.it ? { current: t.ic, total: t.it } : null,
    category: t.category,
    necessity: t.necessity,
    source: t.source,
    ...(t.manual ? { manual: true } : {}),
    ...(t.paidVia ? { paidVia: t.paidVia } : {}),
  }))

  const annotations: Record<string, unknown> = {}
  for (const a of q(
    `SELECT transaction_id AS id, reference, note, goal_id AS goalId
     FROM annotations WHERE household_id = ?`,
  )) {
    annotations[a.id] = {
      ...(a.reference ? { reference: a.reference } : {}),
      ...(a.note ? { note: a.note } : {}),
      ...(a.goalId ? { goalId: a.goalId } : {}),
    }
  }

  return {
    categories,
    transactions,
    annotations,
    budgets: q(
      `SELECT category, limit_amount AS "limit" FROM budgets WHERE household_id = ?`,
    ),
    merchantRules: q(
      `SELECT merchant_key AS merchantKey, category, necessity, alias, frequency
       FROM merchant_rules WHERE household_id = ?`,
    ).map((r) => ({
      merchantKey: r.merchantKey,
      ...(r.category ? { category: r.category } : {}),
      ...(r.necessity ? { necessity: r.necessity } : {}),
      ...(r.alias ? { alias: r.alias } : {}),
      ...(r.frequency ? { frequency: r.frequency } : {}),
    })),
    importedFiles: q(
      `SELECT file_name AS name FROM imported_files WHERE household_id = ? ORDER BY imported_at ASC`,
    ).map((f) => f.name),
    incomes: q(
      `SELECT id, name, amount, kind, month, owner FROM incomes WHERE household_id = ?`,
    ).map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.amount,
      kind: i.kind,
      ...(i.month ? { month: i.month } : {}),
      ...(i.owner ? { owner: i.owner } : {}),
    })),
    goals: q(
      `SELECT id, name, emoji, target_amount AS targetAmount, paid_manual AS paidManual,
              linked_category AS linkedCategory, target_month AS targetMonth, note, done
       FROM goals WHERE household_id = ?`,
    ).map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      targetAmount: g.targetAmount,
      paidManual: g.paidManual,
      ...(g.linkedCategory ? { linkedCategory: g.linkedCategory } : {}),
      ...(g.targetMonth ? { targetMonth: g.targetMonth } : {}),
      ...(g.note ? { note: g.note } : {}),
      ...(g.done ? { done: true } : {}),
    })),
    plannedChanges: q(
      `SELECT id, name, current_monthly AS currentMonthly, future_monthly AS futureMonthly,
              from_month AS fromMonth, note
       FROM planned_changes WHERE household_id = ?`,
    ).map((c) => ({
      id: c.id,
      name: c.name,
      currentMonthly: c.currentMonthly,
      futureMonthly: c.futureMonthly,
      fromMonth: c.fromMonth,
      ...(c.note ? { note: c.note } : {}),
    })),
  }
}

/**
 * כותב את מצב משק הבית במלואו.
 * ההחלפה מלאה ובתוך עסקה אחת: או שהכול נשמר או ששום דבר לא משתנה.
 *
 * expectedVersion הוא בקרת המקביליות: הלקוח שולח את הגרסה שעליה הוא נשען,
 * והכתיבה נדחית אם בינתיים מכשיר אחר שינה משהו. בלי זה, לשונית פתוחה
 * במכשיר אחד הייתה דורסת בשקט את מה שנעשה במכשיר השני — בדיוק
 * מה שהופך שיתוף בין מחשב לטלפון לבלתי אפשרי.
 */
export class VersionConflict extends Error {
  constructor(public current: number) {
    super('version conflict')
  }
}

export const writeState = db.transaction((
  householdId: string,
  state: Partial<HouseholdState>,
  expectedVersion?: number,
) => {
  const current = readVersion(householdId)
  if (expectedVersion !== undefined && expectedVersion !== current) {
    throw new VersionConflict(current)
  }
  const del = (table: string) =>
    db.prepare(`DELETE FROM ${table} WHERE household_id = ?`).run(householdId)

  if (state.categories) {
    del('categories')
    const ins = db.prepare(`
      INSERT INTO categories (id, household_id, name, emoji, color, necessity, sort_order, keywords, is_fallback)
      VALUES (@id, @householdId, @name, @emoji, @color, @necessity, @sortOrder, @keywords, @isFallback)`)
    ;(state.categories as Row[]).forEach((c, i) =>
      ins.run({
        id: c.id,
        householdId,
        name: c.name ?? c.id,
        emoji: c.emoji ?? '❓',
        color: c.color ?? '#9aa0a6',
        necessity: c.necessity ?? 'semi',
        sortOrder: c.sortOrder ?? i,
        keywords: Array.isArray(c.keywords) ? c.keywords.join(',') : (c.keywords ?? ''),
        isFallback: bool(c.isFallback),
      }),
    )
  }

  if (state.transactions) {
    del('transactions')
    const ins = db.prepare(`
      INSERT INTO transactions (id, household_id, card, merchant, merchant_key, date, charge_date,
        amount, original_amount, currency, kind, installment_current, installment_total,
        category, necessity, source, manual, paid_via)
      VALUES (@id, @householdId, @card, @merchant, @merchantKey, @date, @chargeDate,
        @amount, @originalAmount, @currency, @kind, @ic, @it,
        @category, @necessity, @source, @manual, @paidVia)`)
    for (const t of state.transactions as Row[]) {
      ins.run({
        id: t.id,
        householdId,
        card: t.card ?? '',
        merchant: t.merchant,
        merchantKey: t.merchantKey,
        date: t.date,
        chargeDate: t.chargeDate ?? t.date,
        amount: t.amount,
        originalAmount: t.originalAmount ?? t.amount,
        currency: t.currency ?? 'ILS',
        kind: t.kind ?? '',
        ic: t.installment?.current ?? null,
        it: t.installment?.total ?? null,
        category: t.category ?? 'other',
        necessity: t.necessity ?? 'semi',
        source: t.source ?? '',
        manual: bool(t.manual),
        paidVia: nullIfEmpty(t.paidVia),
      })
    }
  }

  if (state.annotations) {
    del('annotations')
    const ins = db.prepare(`
      INSERT INTO annotations (household_id, transaction_id, reference, note, goal_id)
      VALUES (?, ?, ?, ?, ?)`)
    for (const [txId, raw] of Object.entries(state.annotations)) {
      const a = raw as Row
      if (!a) continue
      ins.run(householdId, txId, nullIfEmpty(a.reference), nullIfEmpty(a.note), nullIfEmpty(a.goalId))
    }
  }

  if (state.budgets) {
    del('budgets')
    const ins = db.prepare(
      'INSERT INTO budgets (household_id, category, limit_amount) VALUES (?, ?, ?)',
    )
    for (const b of state.budgets as Row[]) ins.run(householdId, b.category, b.limit)
  }

  if (state.merchantRules) {
    del('merchant_rules')
    const ins = db.prepare(`
      INSERT INTO merchant_rules (household_id, merchant_key, category, necessity, alias, frequency)
      VALUES (?, ?, ?, ?, ?, ?)`)
    for (const r of state.merchantRules as Row[])
      ins.run(
        householdId,
        r.merchantKey,
        nullIfEmpty(r.category),
        nullIfEmpty(r.necessity),
        nullIfEmpty(r.alias),
        nullIfEmpty(r.frequency),
      )
  }

  if (state.importedFiles) {
    del('imported_files')
    const ins = db.prepare(
      'INSERT OR IGNORE INTO imported_files (household_id, file_name) VALUES (?, ?)',
    )
    for (const f of state.importedFiles) ins.run(householdId, f)
  }

  if (state.incomes) {
    del('incomes')
    const ins = db.prepare(`
      INSERT INTO incomes (id, household_id, name, amount, kind, month, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    for (const i of state.incomes as Row[])
      ins.run(i.id, householdId, i.name, i.amount ?? 0, i.kind ?? 'recurring', nullIfEmpty(i.month), nullIfEmpty(i.owner))
  }

  if (state.goals) {
    del('goals')
    const ins = db.prepare(`
      INSERT INTO goals (id, household_id, name, emoji, target_amount, paid_manual,
        linked_category, target_month, note, done)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const g of state.goals as Row[])
      ins.run(
        g.id, householdId, g.name, g.emoji ?? '🎁', g.targetAmount ?? 0, g.paidManual ?? 0,
        nullIfEmpty(g.linkedCategory), nullIfEmpty(g.targetMonth), nullIfEmpty(g.note), bool(g.done),
      )
  }

  if (state.plannedChanges) {
    del('planned_changes')
    const ins = db.prepare(`
      INSERT INTO planned_changes (id, household_id, name, current_monthly, future_monthly, from_month, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    for (const c of state.plannedChanges as Row[])
      ins.run(c.id, householdId, c.name, c.currentMonthly ?? 0, c.futureMonthly ?? 0, c.fromMonth, nullIfEmpty(c.note))
  }

  db.prepare('UPDATE households SET version = version + 1 WHERE id = ?').run(householdId)
  return current + 1
})
