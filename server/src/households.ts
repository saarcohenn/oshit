import { db, uid } from './db.js'
import { DEFAULT_CATEGORIES } from './defaultCategories.js'

export interface Household {
  id: string
  name: string
  emoji: string
  createdAt: string
  transactionCount: number
  /** תפקיד המשתמש המבקש במשק הבית הזה */
  role: 'owner' | 'member'
  /** כמה אנשים חולקים אותו — הבסיס לחיווי "משותף" בממשק */
  memberCount: number
}

const insertCategory = db.prepare(`
  INSERT INTO categories (id, household_id, name, emoji, color, necessity, sort_order, keywords, is_fallback)
  VALUES (@id, @householdId, @name, @emoji, @color, @necessity, @sortOrder, @keywords, @isFallback)
`)

/**
 * יוצר משק בית חדש, רושם את מי שיצר אותו כבעלים, ומאכלס אותו בערכת
 * קטגוריות ברירת המחדל. הבעלות נכתבת באותה עסקה — משק בית בלי חבר
 * אחד לפחות אינו נראה לאיש.
 */
export const createHousehold = db.transaction((name: string, emoji: string, ownerId: string): string => {
  const id = uid('h_')
  db.prepare('INSERT INTO households (id, name, emoji) VALUES (?, ?, ?)').run(id, name, emoji)
  db.prepare(
    "INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')",
  ).run(id, ownerId)
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

/** רק משקי הבית שהמשתמש חבר בהם. אין נתיב שמחזיר את כולם */
export function listHouseholds(userId: string): Household[] {
  return db
    .prepare(
      `SELECT h.id, h.name, h.emoji, h.created_at AS createdAt, m.role,
              (SELECT COUNT(*) FROM transactions t WHERE t.household_id = h.id) AS transactionCount,
              (SELECT COUNT(*) FROM household_members m2 WHERE m2.household_id = h.id) AS memberCount
       FROM households h
       JOIN household_members m ON m.household_id = h.id AND m.user_id = ?
       ORDER BY h.created_at ASC`,
    )
    .all(userId) as Household[]
}

export function getHousehold(id: string, userId: string): Household | null {
  return listHouseholds(userId).find((h) => h.id === id) ?? null
}

export function householdExists(id: string): boolean {
  return !!db.prepare('SELECT 1 FROM households WHERE id = ?').get(id)
}

/**
 * מוודא שלמשתמש יש לפחות משק בית אחד לעבוד איתו.
 *
 * בעבר זה רץ פעם אחת בעליית השרת; עכשיו זה רץ אחרי הרשמה, כי משק בית
 * ריק בלי בעלים הוא בדיוק מה שהמערכת החדשה לא אמורה לייצר.
 */
export function ensureDefaultHousehold(userId: string): string {
  const existing = listHouseholds(userId)
  if (existing.length) return existing[0].id
  return createHousehold('משק הבית שלי', '🏡', userId)
}
