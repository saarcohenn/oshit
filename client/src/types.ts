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
  /** עסקה שהוזנה ידנית ואינה מגיעה מקובץ הבנק — ניתנת לעריכה ולמחיקה */
  manual?: boolean
  /** מי שילם בפועל כשהכסף עובר דרך מישהו אחר, למשל "אמא" */
  paidVia?: string
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
  note?: string
  /** סומן כהושלם — יוצא מחישוב ההפרשה החודשית גם אם נותרה יתרה על הנייר */
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

export interface AppState {
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
}
