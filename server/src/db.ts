import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(join(DATA_DIR, 'oshit.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/**
 * הסכימה.
 *
 * משק בית הוא יחידת הבידוד של הנתונים: כל טבלת תוכן תלויה בו, וכל מחיקה
 * מדורדרת. משתמש אינו הבעלים של נתונים במישרין אלא חבר במשק בית, ולכן
 * שיתוף בין בני זוג הוא שורה בטבלת החברויות ולא העתקה של שום דבר, ולכן גם
 * אין "נתונים אישיים" שצריך למזג כששניים מצטרפים לאותו משק בית.
 *
 * קטגוריות הן שורות ולא קבועים בקוד, כדי שכל משק בית יוכל לערוך אותן במלואן.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  -- נשמר תמיד באותיות קטנות; ההשוואה נעשית על הערך המנורמל בלבד
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

/*
 * הטוקן עצמו לעולם אינו נשמר — רק גיבוב שלו. מי שמשיג עותק של קובץ
 * המסד אינו מקבל איתו חיבורים חיים לחשבונות.
 */
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS households (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🏡',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  -- מונה גרסה לבקרת מקביליות: עולה בכל כתיבה, ומאפשר לדחות כתיבה
  -- שנשענת על מצב ישן במקום לתת לה לדרוס נתונים של מכשיר אחר
  version     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- owner רשאי לשתף, לשנות שם ולמחוק; member רואה ועורך את הנתונים בלבד
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON household_members(user_id);

/*
 * הזמנה לשיתוף. הקוד הוא סוד לשימוש חד-פעמי עם תפוגה — קישור שדלף
 * שבוע אחרי ששימש אינו פותח דבר.
 */
CREATE TABLE IF NOT EXISTS invites (
  code          TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  accepted_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  accepted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_household ON invites(household_id);

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT NOT NULL,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '❓',
  color         TEXT NOT NULL DEFAULT '#9aa0a6',
  necessity     TEXT NOT NULL DEFAULT 'semi',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  -- כללי זיהוי אוטומטי לפי שם בית עסק, מופרדים בפסיק
  keywords      TEXT NOT NULL DEFAULT '',
  -- קטגוריה מובנית שאסור למחוק אותה נשארת כעוגן ל"שונות"
  is_fallback   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id               TEXT NOT NULL,
  household_id     TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  card             TEXT NOT NULL DEFAULT '',
  merchant         TEXT NOT NULL,
  merchant_key     TEXT NOT NULL,
  date             TEXT NOT NULL,
  charge_date      TEXT NOT NULL,
  amount           REAL NOT NULL,
  original_amount  REAL NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'ILS',
  kind             TEXT NOT NULL DEFAULT '',
  installment_current INTEGER,
  installment_total   INTEGER,
  category         TEXT NOT NULL DEFAULT 'other',
  necessity        TEXT NOT NULL DEFAULT 'semi',
  source           TEXT NOT NULL DEFAULT '',
  manual           INTEGER NOT NULL DEFAULT 0,
  paid_via         TEXT,
  PRIMARY KEY (household_id, id)
);
CREATE INDEX IF NOT EXISTS idx_tx_household_charge ON transactions(household_id, charge_date);
CREATE INDEX IF NOT EXISTS idx_tx_household_merchant ON transactions(household_id, merchant_key);

CREATE TABLE IF NOT EXISTS merchant_rules (
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  merchant_key  TEXT NOT NULL,
  category      TEXT,
  necessity     TEXT,
  alias         TEXT,
  frequency     TEXT,
  PRIMARY KEY (household_id, merchant_key)
);

CREATE TABLE IF NOT EXISTS annotations (
  household_id    TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL,
  reference       TEXT,
  note            TEXT,
  goal_id         TEXT,
  PRIMARY KEY (household_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS budgets (
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  limit_amount  REAL NOT NULL,
  PRIMARY KEY (household_id, category)
);

CREATE TABLE IF NOT EXISTS incomes (
  id            TEXT NOT NULL,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL DEFAULT 'recurring',
  month         TEXT,
  owner         TEXT,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS goals (
  id              TEXT NOT NULL,
  household_id    TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '🎁',
  target_amount   REAL NOT NULL DEFAULT 0,
  paid_manual     REAL NOT NULL DEFAULT 0,
  linked_category TEXT,
  target_month    TEXT,
  note            TEXT,
  done            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS planned_changes (
  id               TEXT NOT NULL,
  household_id     TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  current_monthly  REAL NOT NULL DEFAULT 0,
  future_monthly   REAL NOT NULL DEFAULT 0,
  from_month       TEXT NOT NULL,
  note             TEXT,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS imported_files (
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  imported_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, file_name)
);

CREATE TABLE IF NOT EXISTS settings (
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  PRIMARY KEY (household_id, key)
);
`

db.exec(SCHEMA)

// מסד נתונים שנוצר לפני הוספת בקרת המקביליות לא מכיל את העמודה
const householdColumns = (db.prepare('PRAGMA table_info(households)').all() as Array<{ name: string }>)
  .map((c) => c.name)
if (!householdColumns.includes('version')) {
  db.exec('ALTER TABLE households ADD COLUMN version INTEGER NOT NULL DEFAULT 0')
}

/**
 * חותמת זמן בפורמט של SQLite עצמו: 'YYYY-MM-DD HH:MM:SS' ב-UTC.
 *
 * toISOString מחזיר 'YYYY-MM-DDTHH:MM:SS.sssZ', והשוואה מול datetime('now')
 * היא השוואת מחרוזות — התו 'T' גדול מרווח, ולכן כל תפוגה באותו יום הייתה
 * נראית עתידית. תוקף היה פג רק במעבר התאריך, עד יממה באיחור.
 */
export function sqlTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
