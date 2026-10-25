import type { Sighting } from './lib/identity'

/** רמת נחיצות של הוצאה — הלב של האפליקציה: מה באמת חובה ומה אפשר לקצץ */
export type Necessity = 'mandatory' | 'semi' | 'optional'

/**
 * מזהה קטגוריה. אינו איחוד סגור יותר: כל משק בית עורך את הרשימה שלו,
 * ולכן המזהים הם נתונים ולא קבועים בקוד.
 */
export type CategoryId = string

export interface Category {
  id: CategoryId
  name: string
  emoji: string
  color: string
  /** ברירת מחדל לנחיצות — ניתן לדריסה לכל בית עסק */
  necessity: Necessity
  /** מילות מפתח לזיהוי אוטומטי לפי שם בית העסק */
  keywords: string[]
  sortOrder: number
  /** הקטגוריה שאליה נופלות עסקאות שקטגוריית המקור שלהן נמחקה. אי אפשר למחוק אותה */
  isFallback?: boolean
}

/** חלוקה לתשלומים: 3/10 => current=3, total=10 */
export interface Installment {
  current: number
  total: number
}

/**
 * כל חיוב אינו בהכרח חודשי. חשמל, מים וארנונה בישראל מגיעים בדרך כלל
 * אחת לחודשיים, ובלי הסימון הזה חודש עם חשבון חשמל נראה כמו חריגה
 * וחודש בלעדיו נראה כמו חיסכון.
 */
export type Frequency =
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'yearly'
  | 'oneoff'

export interface Transaction {
  /** מזהה יציב הנגזר מתוכן העסקה — מונע כפילויות בייבוא חוזר */
  id: string
  card: string
  /** השם להצגה — הכינוי שהמשתמש נתן, או השם מהבנק אם לא ניתן כינוי */
  merchant: string
  /** השם המקוצר כפי שהבנק שלח אותו. קיים רק כשמוצג כינוי במקומו */
  bankName?: string
  /** שם בית עסק מנורמל — משמש לקיבוץ, לכללי קטגוריה ולזיהוי מנויים */
  merchantKey: string
  /** תאריך העסקה (ISO) */
  date: string
  /** תאריך החיוב בפועל (ISO) — לפיו משויכת העסקה לחודש */
  chargeDate: string
  /** סכום החיוב בשקלים */
  amount: number
  /** סכום העסקה במטבע המקורי */
  originalAmount: number
  currency: string
  /** סוג העסקה כפי שדווח על ידי חברת האשראי */
  kind: string
  installment: Installment | null
  /** שיוך אוטומטי לפי שם בית העסק — דריסות ידניות נשמרות ב-MerchantRule */
  category: CategoryId
  necessity: Necessity
  source: string
  /**
   * מאיפה העסקה הגיעה, ובכמה מקורות היא נראתה.
   * נצבר ואינו נדרס: אותה קנייה מופיעה גם בקובץ הבנק וגם בקובץ כאל,
   * וכדאי שיהיה אפשר לדעת את זה במקום לנחש.
   */
  sightings?: Sighting[]
  /** עסקה שהוזנה ידנית ואינה מגיעה מקובץ הבנק — ניתנת לעריכה ולמחיקה */
  manual?: boolean
  /** מי שילם בפועל כשהכסף עובר דרך מישהו אחר, למשל "אמא" */
  paidVia?: string
  /**
   * אירוע חד-פעמי שאינו מייצג התנהלות שוטפת.
   *
   * חייב להתקיים גם כאן ולא רק על תנועת חשבון: חתונה משולמת מהחשבון,
   * אבל טיסות ומלונות עוברים בכרטיס. העסקה קרתה והכסף יצא — היא פשוט
   * אינה נספרת בממוצעים ובמגמה.
   */
  oneOff?: boolean
  /** בן הבית שההוצאה או ההכנסה שייכת לו */
  person?: string
}

/**
 * סוג תנועה בחשבון העו"ש.
 *
 * הסיווג אינו קוסמטי: שלושה מהסוגים מתארים כסף שכבר נספר במקום אחר, או
 * כסף שלא יצא מהכיס בכלל, ולכן אסור שייכנסו לסך ההוצאות.
 */
export type MovementKind =
  /**
   * ההתחשבנות החודשית מול חברת האשראי ("חיוב לכרטיס ויזה 9687").
   *
   * זו השורה הנפוצה ביותר בקובץ, ואותו כסף כבר קיים כעסקאות פרטניות
   * מקובץ הכרטיס. ספירה שלה כהוצאה מכפילה כל שקל שהוצא בכרטיס.
   */
  | 'card_settlement'
  | 'salary'
  /** העברה בין חשבונות של אותו משק בית — הכסף זז, לא נעלם */
  | 'transfer'
  /** הפקדה לברוקר או קנייה ומכירה של ניירות ערך — זה חיסכון, לא הוצאה */
  | 'investment'
  | 'fee'
  /** משיכת מזומן. נספרת כהוצאה, כי לאן שהמזומן הלך אין לנו רישום */
  | 'cash'
  | 'cheque'
  | 'income'
  | 'expense'

/**
 * תנועה בחשבון העו"ש.
 *
 * ישות נפרדת מ-Transaction במתכוון: לתנועת בנק אין כרטיס, בית עסק,
 * תאריך חיוב או תשלומים, ו-analytics מתייחס לכל Transaction כהוצאה.
 */
export interface AccountMovement {
  id: string
  /** תאריך התנועה (ISO) */
  date: string
  /** יום ערך (ISO) — התאריך שלפיו הבנק מחשב ריבית, ולעיתים שונה מהתאריך */
  valueDate: string
  description: string
  /** חתום: שלילי הוא חובה, חיובי הוא זכות */
  amount: number
  /** היתרה אחרי התנועה. ריקה בשורה האחרונה של המקטע העתידי */
  balance: number | null
  /** אסמכתה — ייחודית בקובץ, ולכן הבסיס לזהות */
  reference: string
  channel: string
  kind: MovementKind
  /** תנועה עתידית שטרם בוצעה, מתוך מקטע "תנועות עתידיות" */
  pending: boolean
  /**
   * אירוע חד-פעמי שאינו מייצג התנהלות שוטפת — חתונה, ירח דבש, חל"ת.
   *
   * הסימון אינו טוען שהתנועה לא קרתה, ולכן הוא נפרד מ-countsAsExpense:
   * הכסף יצא, הוא פשוט אינו נספר בממוצעים ובמגמה. בלי זה חודש אחד
   * בסדר גודל אחר בולע את כל השאר בכל גרף.
   */
  oneOff?: boolean
  /** בן הבית שההוצאה או ההכנסה שייכת לו */
  person?: string
  importedAt: string
  sourceFile: string
}

/**
 * האם התנועה נספרת כהוצאה בפועל.
 *
 * תנועה עתידית אינה נספרת כי הכסף עוד לא יצא, והסוגים שמוחרגים מתארים
 * כסף שכבר נספר כעסקאות כרטיס, או שרק עבר בין חשבונות.
 */
export function countsAsExpense(m: AccountMovement): boolean {
  if (m.pending || m.amount >= 0) return false
  return !['card_settlement', 'transfer', 'investment'].includes(m.kind)
}

/** האם התנועה נספרת כהכנסה בפועל */
export function countsAsIncome(m: AccountMovement): boolean {
  if (m.pending || m.amount <= 0) return false
  return !['card_settlement', 'transfer', 'investment'].includes(m.kind)
}

/**
 * האם התנועה נכנסת למגמה ולממוצעים.
 *
 * נפרד מ-countsAsExpense במתכוון: הוצאה חד-פעמית היא כסף שבאמת יצא,
 * והיא חייבת להופיע בסיכום של אותו חודש. היא רק לא אמורה לקבוע את
 * הממוצע שלפיו מתכננים את החודש הבא.
 */
export function countsInTrend(m: AccountMovement): boolean {
  if (m.oneOff) return false
  return countsAsExpense(m) || countsAsIncome(m)
}

export interface Budget {
  category: CategoryId
  /** תקציב חודשי בשקלים */
  limit: number
}

/** דריסה ידנית ברמת בית עסק — חלה על כל העסקאות שלו, גם בייבוא עתידי */
export interface MerchantRule {
  merchantKey: string
  category?: CategoryId
  necessity?: Necessity
  /** שם תצוגה נוח שהמשתמש בחר במקום השם המקוצר של הבנק */
  alias?: string
  /** כל כמה זמן בית העסק הזה מחייב. ברירת המחדל היא חודשי */
  frequency?: Frequency
}

/**
 * הערה על עסקה בודדת — להבדיל מ-MerchantRule שחל על כל בית העסק.
 * כאן נרשם מה הייתה *העסקה הזו* בפרט: "מקדמה לצלם", "מתנה לחתונה של דני".
 */
export interface TxAnnotation {
  /** תיוג קצר שמוצג בטבלה לצד העסקה */
  reference?: string
  /** הערה חופשית, ארוכה יותר */
  note?: string
  /** שיוך ליעד גדול (ירח דבש, אירוע) */
  goalId?: string
}

export interface Income {
  id: string
  name: string
  amount: number
  /** קבועה = חוזרת בכל חודש; חד-פעמית = נכנסת בחודש אחד בלבד */
  kind: 'recurring' | 'oneoff'
  /** רלוונטי רק להכנסה חד-פעמית */
  month?: string
  /**
   * מאיזה חודש ההכנסה הקבועה קיימת, ועד מתי.
   * בלי זה משכורת שהתחילה השנה נספרה גם בכל חודש היסטורי, וכל גרף
   * לאחור הראה הכנסה שלא הייתה.
   */
  fromMonth?: string
  toMonth?: string
  owner?: string
}

/** הוצאה גדולה וידועה מראש שצריך לחסוך לקראתה */
export interface Goal {
  id: string
  name: string
  emoji: string
  targetAmount: number
  /** תשלומים שכבר בוצעו ואינם מופיעים בנתוני האשראי (מזומן, העברה, חשבון אחר) */
  paidManual: number
  /** קטגוריה שממנה נספרים תשלומים אוטומטית מתוך העסקאות בפועל */
  linkedCategory?: CategoryId
  /** חודש היעד בפורמט YYYY-MM */
  targetMonth?: string
  /**
   * תאריך מדויק (YYYY-MM-DD) כשהוא ידוע — חתונה, טיסה, מועד תשלום.
   * גובר על חודש היעד; החישוב החודשי נגזר מהחודש שלו.
   */
  targetDate?: string
  note?: string
  /** סומן כהושלם — עובר לארכיון ויוצא מחישוב ההפרשה החודשית */
  done?: boolean
}

/** שינוי מתוכנן בהוצאה קבועה — למשל הפסקת מנוי בתאריך ידוע */
export interface PlannedChange {
  id: string
  name: string
  currentMonthly: number
  futureMonthly: number
  /** מהחודש הזה ואילך יחול הסכום החדש */
  fromMonth: string
  note?: string
}

export interface HouseholdSettings {
  /** היום בחודש שבו נפתח מחזור חיוב חדש. 1 = חודש קלנדרי */
  cycleStartDay: number
}

export interface AppState {
  settings: HouseholdSettings
  /** ערכת הקטגוריות של משק הבית — ניתנת לעריכה מלאה */
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  merchantRules: MerchantRule[]
  importedFiles: string[]
  /** הערות לפי מזהה עסקה */
  annotations: Record<string, TxAnnotation>
  incomes: Income[]
  goals: Goal[]
  plannedChanges: PlannedChange[]
  /** תנועות עובר ושב — ישות נפרדת מעסקאות הכרטיס */
  accountMovements: AccountMovement[]
}

/* ---------------- סוכנים ---------------- */

/** שלושת הסוכנים. רשימה סגורה גם בשרת — סוכן לא מוכר נדחה שם */
export type AgentId = 'market' | 'spending' | 'research'

/**
 * צעד של סוכן. אין כאן סוג של ביצוע או מסחר במכוון: הסוכנים מנתחים
 * וממליצים, ומי שמבצע הוא האדם.
 */
export type AgentEventType = 'start' | 'thinking' | 'tool_call' | 'finding' | 'alert' | 'done' | 'error'

export interface AgentEvent {
  runId: string
  agent: AgentId
  type: AgentEventType
  /** ISO */
  at: string
  text?: string
  /** אותו טקסט באנגלית. בלעדיו המסך מציג את העברית גם באנגלית */
  textEn?: string
  tool?: string
  data?: unknown
  /** הדגמה מהממשק — ערכים לדוגמה, לא מצב אמיתי */
  demo?: boolean
}

export interface AgentRun {
  id: string
  agent: AgentId
  status: 'running' | 'done' | 'error'
  startedAt: string
  finishedAt: string | null
  summary: string | null
  summaryEn?: string | null
  inputTokens: number | null
  outputTokens: number | null
  /** העלות כפי שחושבה בשירות הסוכנים. ‏null בריצות שקדמו לרישום העלות */
  costUsd?: number | null
  model?: string | null
  searches?: number | null
  demo: boolean
  events: AgentEvent[]
}

export interface AgentsBudget {
  /** ‏null — לא הוגדר תקציב */
  budgetUsd: number | null
  spentUsd: number
  /** ISO — תחילת החודש לפי שעון ישראל */
  monthStart: string
  byAgent: Array<{ agent: AgentId; usd: number; runs: number }>
  byModel: Array<{ model: string; usd: number; runs: number }>
}

export interface AgentsSnapshot {
  /** האם השרת הוגדר עם שירות סוכנים (AGENTS_TOKEN) */
  configured: boolean
  /** מתי השירות משך בקשות לאחרונה — סימן חיים */
  serviceSeenAt: string | null
  runs: AgentRun[]
  budget: AgentsBudget
}
