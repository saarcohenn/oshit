/**
 * ערכת הקטגוריות שכל משק בית חדש מתחיל איתה.
 *
 * מרגע היצירה הן שורות רגילות בבסיס הנתונים — אפשר לשנות שם, אימוג׳י, צבע,
 * נחיצות, סדר ומילות מפתח, וגם למחוק. היחידה שאי אפשר למחוק היא 'other',
 * שמשמשת עוגן לעסקאות שהקטגוריה שלהן נמחקה.
 *
 * מילות המפתח משמשות לזיהוי אוטומטי לפי שם בית העסק. הסדר קובע קדימות:
 * הקטגוריה הראשונה שמילת מפתח שלה מוכלת בשם בית העסק מנצחת.
 */
export interface DefaultCategory {
  id: string
  name: string
  emoji: string
  color: string
  necessity: 'mandatory' | 'semi' | 'optional'
  keywords: string[]
  isFallback?: boolean
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // חריגים שנבדקים ראשונים: שמות שמכילים "חשמל" או "מים" אך אינם חשבון תשתיות
  {
    id: 'shopping', name: 'קניות וכלבו', emoji: '🛍️', color: '#c9457f', necessity: 'optional',
    keywords: ['חשמל ומיז', 'רשת חשמל', 'חשמל ואלק', 'אלקטרו', 'מחסני חשמל', 'שקם אלקטריק', 'aliexpress', 'amazon', 'ebay', 'shein', 'temu', 'asos', 'zara', 'castro', 'fox', 'h&m', 'american eagle', 'terminal x', 'ksp', 'קי אס פי', 'איקאה', 'ikea', 'ace', 'אייס', 'הום סנטר', 'ורדינון', 'מקס סטוק', 'max stock', 'לאסט פרייס', 'סגול', 'מנירול', 'אופנה', 'נעלי'],
  },
  {
    id: 'rent', name: 'שכר דירה ומשכנתא', emoji: '🔑', color: '#3f5bd6', necessity: 'mandatory',
    keywords: ['שכר דירה', 'שכ"ד', 'משכנתא', 'משכנתה', 'דמי שכירות', 'שכירות'],
  },
  {
    id: 'loans', name: 'הלוואות והחזרים', emoji: '💳', color: '#7a5bc4', necessity: 'mandatory',
    keywords: ['הלוואה', 'הלוואות', 'החזר הלוואה', 'פירעון הלוואה', 'אשראי חוץ בנקאי'],
  },
  {
    id: 'utilities', name: 'חשמל, מים וגז', emoji: '💡', color: '#3aa0a8', necessity: 'mandatory',
    keywords: ['חשמל', 'מקורות', 'מי אביבים', 'הגיחון', 'עירית', 'עיריית', 'תאגיד המים', 'מי שקמה', 'מים', 'סופרגז', 'אמישרגז', 'פזגז', 'פז גז', 'אמגז', 'דורגז'],
  },
  {
    id: 'housing', name: 'ארנונה וועד בית', emoji: '🏠', color: '#4f6bed', necessity: 'mandatory',
    keywords: ['ארנונה', 'ועד בית', 'דמי ניהול', 'איתוראן', 'פוינטר'],
  },
  {
    id: 'insurance', name: 'ביטוחים', emoji: '🛡️', color: '#6b78a8', necessity: 'mandatory',
    keywords: ['ביטוח', 'הראל', 'כלל ביטוח', 'מנורה', 'הפניקס', 'איילון', 'ליברה', 'שירביט', 'ווישור', 'ביטוח ישיר', 'פספורטכארד'],
  },
  {
    id: 'transport', name: 'תחבורה וחניה', emoji: '🚌', color: '#d18f2e', necessity: 'semi',
    keywords: ['חניון', 'חניה', 'חני', 'פנגו', 'cellopark', 'סלופארק', 'רב קו', 'אגד', 'רכבת', 'gett', 'uber', 'מונית', 'כביש 6', 'קווים', 'מוביט'],
  },
  {
    id: 'health', name: 'בריאות ותרופות', emoji: '⚕️', color: '#5aa2e0', necessity: 'mandatory',
    keywords: ['מכבי', 'כללית', 'מאוחדת', 'לאומית', 'בית מרקחת', 'סופר פארם', 'סופרפארם', 'ניו פארם', 'רופא', 'מרפאה', 'שיניים', 'אופטיק', 'טרם', 'פיזיותרפיה', 'קופת חולים'],
  },
  {
    id: 'communication', name: 'תקשורת ואינטרנט', emoji: '📱', color: '#8a6bd1', necessity: 'mandatory',
    keywords: ['פרטנר', 'סלקום', 'פלאפון', 'הוט', 'yes', 'בזק', 'גולן טלקום', '019', '012', 'triple c'],
  },
  {
    id: 'subscriptions', name: 'מנויים דיגיטליים', emoji: '📺', color: '#b455a8', necessity: 'optional',
    keywords: ['netflix', 'spotify', 'youtube', 'google one', 'apple.com', 'itunes', 'icloud', 'disney', 'amazon prime', 'hbo', 'openai', 'chatgpt', 'anthropic', 'claude', 'openrouter', 'microsoft', 'adobe', 'dropbox', 'canva', 'audible', 'duolingo', 'פרי טיוי', 'playstation', 'xbox', 'steam'],
  },
  {
    id: 'groceries', name: 'סופר ומזון לבית', emoji: '🛒', color: '#2e9e6b', necessity: 'mandatory',
    keywords: ['שטראוס מים', 'תמי 4', 'מי עדן', 'נביעות', 'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'טיב טעם', 'חצי חינם', 'אושר עד', 'מגה', 'יינות ביתן', 'סופר', 'מכולת', 'am:pm', 'מאפיית', 'מאפייה', 'קצביית', 'קצב', 'עוף', 'ירקות', 'פירות', 'שוק ', 'סרור', 'דגים', 'מעדניה', 'חלב'],
  },
  {
    id: 'car', name: 'רכב ודלק', emoji: '⛽', color: '#c1642c', necessity: 'semi',
    keywords: ['דלק', 'פז ', 'סונול', 'דור אלון', 'מנטה', 'yellow', 'מוסך', 'צמיג', 'רחיצה', 'שטיפת', 'טסט', 'רישוי', 'חלפים', 'מרכבה', 'ליסינג'],
  },
  {
    id: 'kids', name: 'ילדים וחינוך', emoji: '🧸', color: '#39937f', necessity: 'mandatory',
    keywords: ['גן ילדים', 'גנון', 'צהרון', 'בית ספר', 'מעון', 'חוג', 'קייטנה', 'ועד הורים', 'שילב', 'בייבי', 'baby', 'מטרנה', 'פמפרס'],
  },
  {
    id: 'travel', name: 'טיולים וחופשות', emoji: '✈️', color: '#2f7fb5', necessity: 'optional',
    keywords: ['booking', 'bkg*', 'airbnb', 'expedia', 'agoda', 'klook', 'getyourguide', 'טיסה', 'אל על', 'elal', 'ryanair', 'wizz', 'issta', 'rent a car', 'rent a', 'hertz', 'avis', 'sixt', 'k-eta', 'esta', 'מלון', 'hotel', 'צימר', 'partners on bo'],
  },
  {
    id: 'dining', name: 'מסעדות ובתי קפה', emoji: '🍽️', color: '#d94f70', necessity: 'optional',
    keywords: ['מסעד', 'קפה', 'coffee', 'cofix', 'קופי', 'ארומה', 'לנדוור', 'רולדין', 'פיצה', 'pizza', 'בורגר', 'burger', 'מקדונלד', 'סושי', 'ווק', 'פלאפל', 'חומוס', 'שווארמה', 'wolt', 'וולט', '10bis', 'תן ביס', 'מזון', 'פאב', 'מקסיקני', 'שיפודי', 'גריל', 'בייגל', 'גלידה', 'אווז', 'אלכוהול', 'יין ', 'משקאות', 'נאייקס'],
  },
  {
    id: 'entertainment', name: 'בילויים ופנאי', emoji: '🎬', color: '#e0654a', necessity: 'optional',
    keywords: ['סינמה', 'יס פלאנט', 'רב חן', 'קולנוע', 'סינמטק', 'הבימה', 'תיאטרון', 'הופע', 'כרטיסים', 'ticket', 'אייקון', 'הוואנה', 'מוזיק', 'music', 'ספורט', 'holmes place', 'גימבורי', 'בריכ', 'ספא', 'עיסוי', 'מספרה', 'g2a'],
  },
  {
    id: 'transfers', name: 'העברות ומזומן', emoji: '💸', color: '#7d8794', necessity: 'semi',
    keywords: ['bit', 'ביט', 'paybox', 'פייבוקס', 'העברה', 'משיכת מזומן', 'מזומן', 'paypal', 'פייפאל'],
  },
  {
    id: 'fees', name: 'עמלות ובנק', emoji: '🏦', color: '#8a8577', necessity: 'mandatory',
    keywords: ['דמי כרטיס', 'עמלה', 'עמלת', 'ריבית', 'דמי חבר'],
  },
  {
    id: 'other', name: 'שונות', emoji: '❓', color: '#9aa0a6', necessity: 'semi',
    keywords: [], isFallback: true,
  },
]

/**
 * ערכת הקטגוריות של עסק קטן — קליניקה, סטודיו, עצמאי.
 *
 * המזהים rent, utilities, insurance, communication, subscriptions, car, fees,
 * transfers ו-other משותפים לערכה הביתית, כדי שהמסכים שמזהים מנויים
 * וביטוחים לפי מזהה יעבדו גם כאן, וכדי שמשק בית שהופך לעסק יקבל רק את
 * מה שחסר לו בלי כפילויות.
 *
 * הסדר חשוב כמו בערכה הביתית: "ביטוח לאומי" חייב להיתפס במיסים לפני
 * שהמילה "ביטוח" תשלח אותו לביטוחים, ו-"google ads" בשיווק לפני "google".
 */
export const BUSINESS_CATEGORIES: DefaultCategory[] = [
  {
    id: 'equipment', name: 'ציוד ומכשור', emoji: '🧰', color: '#c9457f', necessity: 'semi',
    keywords: ['ציוד', 'מכשור', 'אורתופד', 'מחסני חשמל', 'אלקטרו', 'ksp', 'קי אס פי', 'איקאה', 'ikea', 'אייס', 'amazon', 'aliexpress', 'ebay', 'temu'],
  },
  {
    id: 'taxes', name: 'מיסים וביטוח לאומי', emoji: '🏛️', color: '#4f6bed', necessity: 'mandatory',
    keywords: ['מס הכנסה', 'מע"מ', 'מעמ', 'ביטוח לאומי', 'מקדמות', 'רשות המסים', 'ארנונה', 'עירית', 'עיריית'],
  },
  {
    id: 'rent', name: 'שכירות ומשרד', emoji: '🏢', color: '#3f5bd6', necessity: 'mandatory',
    keywords: ['שכר דירה', 'שכ"ד', 'דמי שכירות', 'שכירות', 'חדר טיפולים', 'משרדים', 'wework'],
  },
  {
    id: 'utilities', name: 'חשמל, מים וגז', emoji: '💡', color: '#3aa0a8', necessity: 'mandatory',
    keywords: ['חשמל', 'מקורות', 'מי אביבים', 'הגיחון', 'תאגיד המים', 'מי שקמה', 'מים', 'סופרגז', 'אמישרגז', 'פזגז'],
  },
  {
    id: 'insurance', name: 'ביטוחים', emoji: '🛡️', color: '#6b78a8', necessity: 'mandatory',
    keywords: ['ביטוח', 'אחריות מקצועית', 'הראל', 'כלל ביטוח', 'מנורה', 'הפניקס', 'איילון', 'מגדל', 'שירביט'],
  },
  {
    id: 'communication', name: 'טלפון ואינטרנט', emoji: '📱', color: '#8a6bd1', necessity: 'mandatory',
    keywords: ['פרטנר', 'סלקום', 'פלאפון', 'הוט', 'בזק', 'גולן טלקום', '019', '012', 'triple c'],
  },
  {
    id: 'marketing', name: 'שיווק ופרסום', emoji: '📣', color: '#e0654a', necessity: 'optional',
    keywords: ['google ads', 'google*ads', 'facebk', 'facebook', 'instagram', 'linkedin', 'tiktok', 'פרסום', 'שיווק', 'דפוס', 'b144', 'דפי זהב'],
  },
  {
    id: 'subscriptions', name: 'תוכנה ומנויים', emoji: '💻', color: '#b455a8', necessity: 'semi',
    keywords: ['google', 'microsoft', 'office 365', 'adobe', 'dropbox', 'canva', 'zoom', 'calendly', 'wix', 'monday', 'notion', 'מורנינג', 'morning', 'חשבונית ירוקה', 'icount', 'ריווחית', 'openai', 'chatgpt', 'anthropic', 'claude', 'apple.com', 'icloud'],
  },
  {
    id: 'professional', name: 'רואה חשבון וייעוץ', emoji: '🧾', color: '#7a5bc4', necessity: 'mandatory',
    keywords: ['רואה חשבון', 'רו"ח', 'הנהלת חשבונות', 'יועץ מס', 'עורך דין', 'עו"ד', 'ייעוץ', 'יעוץ'],
  },
  {
    id: 'supplies', name: 'חומרים וחד-פעמי', emoji: '🧴', color: '#2e9e6b', necessity: 'semi',
    keywords: ['סופר פארם', 'סופרפארם', 'ניו פארם', 'בית מרקחת', 'חד פעמי', 'חומרי', 'מקס סטוק', 'max stock', 'שופרסל', 'רמי לוי', 'אושר עד', 'יוחננוף', 'ויקטורי'],
  },
  {
    id: 'training', name: 'השתלמויות ואיגודים', emoji: '🎓', color: '#39937f', necessity: 'semi',
    keywords: ['השתלמות', 'קורס', 'כנס', 'סדנה', 'סדנא', 'איגוד', 'עמותה', 'הסתדרות', 'משרד הבריאות', 'udemy', 'coursera'],
  },
  {
    id: 'car', name: 'רכב ונסיעות', emoji: '🚗', color: '#d18f2e', necessity: 'semi',
    keywords: ['דלק', 'פז ', 'סונול', 'דור אלון', 'מנטה', 'yellow', 'מוסך', 'צמיג', 'טסט', 'רישוי', 'ליסינג', 'חניון', 'חניה', 'פנגו', 'cellopark', 'סלופארק', 'כביש 6', 'gett', 'uber', 'מונית', 'רב קו', 'רכבת', 'מוביט'],
  },
  {
    id: 'meals', name: 'כיבוד וארוחות עבודה', emoji: '☕', color: '#d94f70', necessity: 'optional',
    keywords: ['קפה', 'coffee', 'cofix', 'קופי', 'ארומה', 'לנדוור', 'רולדין', 'מסעד', 'wolt', 'וולט', '10bis', 'תן ביס', 'פיצה', 'pizza', 'בורגר', 'burger', 'מאפי'],
  },
  {
    id: 'fees', name: 'עמלות, בנק וסליקה', emoji: '🏦', color: '#8a8577', necessity: 'mandatory',
    keywords: ['דמי כרטיס', 'עמלה', 'עמלת', 'ריבית', 'סליקה', 'דמי ניהול'],
  },
  {
    id: 'transfers', name: 'העברות ומזומן', emoji: '💸', color: '#7d8794', necessity: 'semi',
    keywords: ['bit', 'ביט', 'paybox', 'פייבוקס', 'העברה', 'משיכת מזומן', 'מזומן', 'paypal', 'פייפאל'],
  },
  {
    id: 'other', name: 'שונות', emoji: '❓', color: '#9aa0a6', necessity: 'semi',
    keywords: [], isFallback: true,
  },
]
