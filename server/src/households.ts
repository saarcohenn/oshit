import { db, uid } from './db.js'
import { BUSINESS_CATEGORIES, DEFAULT_CATEGORIES, type DefaultCategory } from './defaultCategories.js'
import { agentServiceSeenAt } from './agents.js'
import { DEFAULT_HOUSEHOLD_COLOR, HOUSEHOLD_COLORS } from './palette.js'
import { parseRole, type Role } from './users.js'

/** בית רגיל, או עסק קטן עם קטגוריות עסקיות */
export type HouseholdKind = 'home' | 'business'

export const parseKind = (value: unknown): HouseholdKind | null =>
  value === 'home' || value === 'business' ? value : null

export interface Household {
  id: string
  name: string
  emoji: string
  kind: HouseholdKind
  color: string
  createdAt: string
  /** תפקיד המשתמש המבקש במשק הבית הזה */
  role: Role
  /** כמה אנשים חולקים אותו — הבסיס לחיווי "משותף" בממשק */
  memberCount: number
  /** שמות החברים, הבעלים קודם. כל חבר רואה אותם ממילא ברשימת החברים */
  memberNames: string[]
  transactionCount: number
  movementCount: number
  /** התאריך המוקדם ביותר בנתונים — "מינואר 2025" בכרטיס */
  firstDate: string | null
  /** כמה כרטיסים שונים הופיעו בקבצים שיובאו */
  cardCount: number
  /** כמה סוכנים מופעלים בהגדרות */
  agentCount: number
  /** האם שירות הסוכנים דיווח על משק הבית הזה מאז שהשרת עלה */
  agentsLive: boolean
}

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (id, household_id, name, emoji, color, necessity, sort_order, keywords, is_fallback)
  VALUES (@id, @householdId, @name, @emoji, @color, @necessity, @sortOrder, @keywords, @isFallback)
`)

export const categoriesFor = (kind: HouseholdKind): DefaultCategory[] =>
  kind === 'business' ? BUSINESS_CATEGORIES : DEFAULT_CATEGORIES

function seedCategories(householdId: string, list: DefaultCategory[], firstOrder: number): number {
  let added = 0
  list.forEach((c, i) => {
    added += insertCategory.run({
      id: c.id,
      householdId,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      necessity: c.necessity,
      sortOrder: firstOrder + i,
      keywords: c.keywords.join(','),
      isFallback: c.isFallback ? 1 : 0,
    }).changes
  })
  return added
}

/**
 * צבע לבית חדש: הראשון בפלטה שעוד אין למשתמש, כדי שבתים שונים ייראו
 * שונים במתג. כשכל הצבעים תפוסים — לפי הסדר מההתחלה.
 */
function nextColor(userId: string): string {
  const used = new Set(
    (
      db
        .prepare(
          `SELECT h.color FROM households h
           JOIN household_members m ON m.household_id = h.id AND m.user_id = ?`,
        )
        .all(userId) as Array<{ color: string }>
    ).map((r) => r.color.toLowerCase()),
  )
  return (
    HOUSEHOLD_COLORS.find((c) => !used.has(c)) ??
    HOUSEHOLD_COLORS[used.size % HOUSEHOLD_COLORS.length] ??
    DEFAULT_HOUSEHOLD_COLOR
  )
}

/**
 * יוצר משק בית חדש, רושם את מי שיצר אותו כבעלים, ומאכלס אותו בערכת
 * הקטגוריות של הסוג שלו. הבעלות נכתבת באותה עסקה — משק בית בלי חבר
 * אחד לפחות אינו נראה לאיש.
 */
export const createHousehold = db.transaction(
  (
    name: string,
    emoji: string,
    ownerId: string,
    options: { kind?: HouseholdKind; color?: string } = {},
  ): string => {
    const id = uid('h_')
    const kind = options.kind ?? 'home'
    const color = options.color ?? nextColor(ownerId)
    db.prepare('INSERT INTO households (id, name, emoji, kind, color) VALUES (?, ?, ?, ?, ?)').run(
      id,
      name,
      emoji,
      kind,
      color,
    )
    db.prepare(
      "INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')",
    ).run(id, ownerId)
    seedCategories(id, categoriesFor(kind), 0)
    return id
  },
)

/**
 * החלפת סוג. הקטגוריות שכבר קיימות לא נוגעות — רק מה שחסר בערכה של
 * הסוג החדש מתווסף בסוף הרשימה. בית שהופך לעסק מקבל "מיסים" ו"ציוד",
 * ושום עסקה לא מאבדת את הקטגוריה שלה.
 *
 * מחזיר כמה קטגוריות נוספו; הקורא מעלה גרסה ומודיע למכשירים רק אם נוסף משהו.
 */
export const changeKind = db.transaction((householdId: string, kind: HouseholdKind): number => {
  db.prepare('UPDATE households SET kind = ? WHERE id = ?').run(kind, householdId)
  const { last } = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS last FROM categories WHERE household_id = ?')
    .get(householdId) as { last: number }
  const added = seedCategories(householdId, categoriesFor(kind), last + 1)
  if (added) db.prepare('UPDATE households SET version = version + 1 WHERE id = ?').run(householdId)
  return added
})

interface HouseholdRow {
  id: string
  name: string
  emoji: string
  kind: string
  color: string
  createdAt: string
  role: string
  memberCount: number
  transactionCount: number
  movementCount: number
  firstTx: string | null
  firstMv: string | null
  cardCount: number
  agentCount: number
}

/** רק משקי הבית שהמשתמש חבר בהם. אין נתיב שמחזיר את כולם */
export function listHouseholds(userId: string): Household[] {
  const rows = db
    .prepare(
      `SELECT h.id, h.name, h.emoji, h.kind, h.color, h.created_at AS createdAt, m.role,
              (SELECT COUNT(*) FROM household_members m2 WHERE m2.household_id = h.id) AS memberCount,
              (SELECT COUNT(*) FROM transactions t WHERE t.household_id = h.id) AS transactionCount,
              (SELECT COUNT(*) FROM account_movements a WHERE a.household_id = h.id) AS movementCount,
              (SELECT MIN(date) FROM transactions t WHERE t.household_id = h.id) AS firstTx,
              (SELECT MIN(date) FROM account_movements a WHERE a.household_id = h.id) AS firstMv,
              (SELECT COUNT(DISTINCT card) FROM transactions t
                WHERE t.household_id = h.id AND t.manual = 0 AND t.card <> '') AS cardCount,
              (SELECT COUNT(*) FROM agent_defs d
                WHERE d.household_id = h.id AND json_extract(d.def, '$.enabled') = 1) AS agentCount
       FROM households h
       JOIN household_members m ON m.household_id = h.id AND m.user_id = ?
       ORDER BY h.created_at ASC, h.id ASC`,
    )
    .all(userId) as HouseholdRow[]

  // שמות החברים בשאילתה אחת לכל הבתים, ולא שאילתה לכל בית
  const names = new Map<string, string[]>()
  for (const r of db
    .prepare(
      `SELECT m.household_id AS householdId, u.name
       FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id IN (SELECT household_id FROM household_members WHERE user_id = ?)
       ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at ASC`,
    )
    .all(userId) as Array<{ householdId: string; name: string }>) {
    names.set(r.householdId, [...(names.get(r.householdId) ?? []), r.name])
  }

  return rows.map(({ firstTx, firstMv, ...h }) => ({
    ...h,
    kind: parseKind(h.kind) ?? 'home',
    role: parseRole(h.role) ?? 'viewer',
    memberNames: names.get(h.id) ?? [],
    firstDate: [firstTx, firstMv].filter((d): d is string => !!d).sort()[0] ?? null,
    agentsLive: agentServiceSeenAt(h.id) !== null,
  }))
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
