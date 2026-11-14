/**
 * הצבעים של משקי הבית — אותם צבעים שבעיצוב v3.
 *
 * הצבע מבדיל בין בתים במבט אחד: במתג שבראש הסרגל, בכרטיסים, ובבית
 * ה-voxel של כל משק בית. הקובץ בלי ייבואים, כדי ש-db.ts יוכל להשתמש בו
 * בהגירה בלי מעגל ייבוא.
 */
export const HOUSEHOLD_COLORS = ['#35c4b5', '#3987e5', '#e3703c', '#9085e9', '#e06a95', '#d99a1a'] as const

export const DEFAULT_HOUSEHOLD_COLOR: string = HOUSEHOLD_COLORS[0]

/** רק ‎#rrggbb‎. הערך נכנס ל-style בלקוח, ולכן שום דבר אחר לא עובר */
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
