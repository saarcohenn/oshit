import type { Category, CategoryId, Necessity } from '../types'

export const NECESSITY_LABEL: Record<Necessity, string> = {
  mandatory: 'חובה',
  semi: 'חצי-חובה',
  optional: 'מותרות',
}

export const NECESSITY_COLOR: Record<Necessity, string> = {
  mandatory: '#2e9e6b',
  semi: '#d18f2e',
  optional: '#d94f70',
}

export const NECESSITY_HELP: Record<Necessity, string> = {
  mandatory: 'הוצאה שאי אפשר לוותר עליה — שכר דירה, חשבונות, ביטוח, מזון בסיסי',
  semi: 'הוצאה נחוצה שאפשר להוזיל — דלק, חניה, קניות שוטפות',
  optional: 'הוצאה שאפשר לוותר עליה או לצמצם — מסעדות, מנויים, בילויים',
}

export const NECESSITIES: Necessity[] = ['mandatory', 'semi', 'optional']

/** הקטגוריה שאליה נופלות עסקאות שקטגוריית המקור שלהן נמחקה */
export const FALLBACK_CATEGORY: CategoryId = 'other'

/** ממלא מקום לקטגוריה שנמחקה, כדי שעסקה ישנה לא תפיל את המסך */
export function unknownCategory(id: CategoryId): Category {
  return {
    id,
    name: id === FALLBACK_CATEGORY ? 'שונות' : `קטגוריה שנמחקה (${id})`,
    emoji: '❓',
    color: '#9aa0a6',
    necessity: 'semi',
    keywords: [],
    sortOrder: 999,
  }
}

export interface CategoryIndex {
  /** הקטגוריות לפי סדר התצוגה שנקבע */
  list: Category[]
  byId: (id: CategoryId) => Category
}

export function buildCategoryIndex(categories: Category[]): CategoryIndex {
  const map = new Map(categories.map((c) => [c.id, c]))
  return {
    list: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    byId: (id) => map.get(id) ?? map.get(FALLBACK_CATEGORY) ?? unknownCategory(id),
  }
}

/**
 * מזהה קטגוריה לפי שם בית העסק.
 * סדר התצוגה קובע גם קדימות: הקטגוריה הראשונה שאחת ממילות המפתח שלה מוכלת
 * בשם בית העסק מנצחת. כך אפשר להציב חריגים לפני כללים רחבים — למשל
 * "חשמל ומיזוג" (חנות) לפני "חשמל" (חשבון התשתית).
 */
export function guessCategory(merchant: string, categories: Category[]): CategoryId {
  const m = merchant.toLowerCase().trim()
  const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const category of ordered) {
    for (const keyword of category.keywords) {
      const needle = keyword.trim().toLowerCase()
      if (needle && m.includes(needle)) return category.id
    }
  }
  return FALLBACK_CATEGORY
}
