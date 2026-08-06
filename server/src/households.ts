import { db, uid } from './db.js'
import { DEFAULT_CATEGORIES } from './defaultCategories.js'

export interface Household {
  id: string
  name: string
  emoji: string
  createdAt: string
  transactionCount: number
}

const insertCategory = db.prepare(`
  INSERT INTO categories (id, household_id, name, emoji, color, necessity, sort_order, keywords, is_fallback)
  VALUES (@id, @householdId, @name, @emoji, @color, @necessity, @sortOrder, @keywords, @isFallback)
`)

/** יוצר משק בית חדש ומאכלס אותו בערכת קטגוריות ברירת המחדל */
export const createHousehold = db.transaction((name: string, emoji: string): string => {
  const id = uid('h_')
  db.prepare('INSERT INTO households (id, name, emoji) VALUES (?, ?, ?)').run(id, name, emoji)
  DEFAULT_CATEGORIES.forEach((c, i) => {
    insertCategory.run({
      id: c.id,
      householdId: id,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      necessity: c.necessity,
      sortOrder: i,
      keywords: c.keywords.join(','),
      isFallback: c.isFallback ? 1 : 0,
    })
  })
  return id
})

export function listHouseholds(): Household[] {
  return db
    .prepare(
      `SELECT h.id, h.name, h.emoji, h.created_at AS createdAt,
              (SELECT COUNT(*) FROM transactions t WHERE t.household_id = h.id) AS transactionCount
       FROM households h
       ORDER BY h.created_at ASC`,
    )
    .all() as Household[]
}

export function householdExists(id: string): boolean {
  return !!db.prepare('SELECT 1 FROM households WHERE id = ?').get(id)
}

/**
 * מוודא שקיים לפחות משק בית אחד, כדי שהאפליקציה תעלה עם משהו לעבוד איתו
 * גם בהתקנה חדשה לגמרי.
 */
export function ensureDefaultHousehold(): string {
  const existing = listHouseholds()
  if (existing.length) return existing[0].id
  return createHousehold('משק הבית שלי', '🏡')
}
