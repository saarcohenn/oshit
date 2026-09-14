/**
 * מילון אנגלית.
 *
 * המפתח הוא המחרוזת העברית כפי שהיא מופיעה בקוד. מחרוזת שאין לה כאן ערך
 * מוצגת בעברית — תרגום חלקי נראה כמו טקסט מעורב, לא כמו מפתח שבור.
 *
 * שמות קטגוריות, שמות בתי עסק וכותרות העמודות בקבצי הבנק אינם מתורגמים:
 * הם נתונים של משק הבית ושל הבנק, ולא טקסט של הממשק.
 */
export const EN: Record<string, string> = {
  /* ---------- ניווט ומעטפת ---------- */
  'סקירה': 'Overview',
  'הכנסות ויעדים': 'Income & goals',
  'תקציבים': 'Budgets',
  'חיובים קבועים': 'Recurring',
  'איפה לחסוך': 'Where to save',
  'עסקאות': 'Transactions',
  'בתי עסק': 'Merchants',
  'קטגוריות': 'Categories',
  'ייבוא': 'Import',
  'מסכים': 'Screens',
  'הגדרות ונתונים': 'Settings & data',
  'לאן הלך העו״ש': 'Where the money went',
  'תפריט': 'Menu',
  'תפריט ראשי': 'Main menu',
  'פתיחת התפריט': 'Open menu',
  'סגירת התפריט': 'Close menu',
  'משקי בית': 'Households',
  'משק בית חדש': 'New household',
  'משק בית נוסף': 'Add household',
  'משק הבית שלי': 'My household',
  'מצב תצוגה': 'Appearance',
  'בהיר': 'Light',
  'כהה': 'Dark',
  'לפי המערכת': 'System',
  'יציאה': 'Sign out',
  'בחירת חודש': 'Select month',

  /* ---------- מצבי טעינה, חיבור ושמירה ---------- */
  'טוען…': 'Loading…',
  'מתחבר לשרת של Osh.it': 'Connecting to the Osh.it server',
  'אין חיבור לשרת': 'No connection to the server',
  'ודאו שהשרת רץ, ונסו לרענן.': 'Make sure the server is running, then refresh.',
  'רענון': 'Refresh',
  'נשמר': 'Saved',
  'שומר…': 'Saving…',
  'אין חיבור': 'Offline',
  'שמירה נכשלה': 'Save failed',
  'שמירת הנתונים נכשלה': 'Saving the data failed',
  'עודכן ממכשיר אחר': 'Updated from another device',
  'הנתונים עודכנו ממכשיר אחר — נטען מחדש': 'Data changed on another device — reloading',
  'הנתונים שונו ממכשיר אחר': 'Data changed on another device',
  'נדרשת התחברות': 'Sign-in required',
  'רישום ה-service worker נכשל': 'Service worker registration failed',
  'רגע…': 'One moment…',

  /* ---------- מצבים ריקים ---------- */
  'עוד אין נתונים': 'No data yet',
  'ייבאו את קובץ האקסל של פירוט כרטיסי האשראי כדי להתחיל.':
    'Import your credit-card statement to get started.',
  'מעבר לייבוא': 'Go to import',
  'אין לכם משק בית': 'You have no household',
  'צרו משק בית חדש, או בקשו קישור הזמנה ממי שכבר מנהל אחד.':
    'Create a household, or ask someone who already runs one for an invite link.',
  'יצירת משק בית': 'Create household',

  /* ---------- הזדהות ---------- */
  'ברוכים הבאים ל-Osh.it': 'Welcome to Osh.it',
  'שמחים לראות אתכם שוב.': 'Good to see you again.',
  'זו ההתקנה הראשונה. החשבון שתיצרו כאן יהיה הבעלים של הנתונים.':
    'This is the first install. The account you create here will own the data.',
  'ההרשמה סגורה. כדי להצטרף, בקשו קישור הזמנה ממי שכבר משתמש.':
    'Registration is closed. To join, ask an existing user for an invite link.',
  'החשבון נשמר על השרת שלכם בלבד.': 'The account lives only on your own server.',
  'דוא״ל': 'Email',
  'סיסמה': 'Password',
  'שם': 'Name',
  '8 תווים לפחות': 'At least 8 characters',
  'כניסה': 'Sign in',
  'לכניסה': 'Sign in',
  'יצירת חשבון': 'Create account',
  'ליצירת חשבון': 'Create an account',
  'יצירת החשבון': 'Create account',
  'הצטרפות': 'Join',
  'הזמנה לנהל יחד את התקציב.': 'An invitation to manage the budget together.',

  /* ---------- שיתוף ---------- */
  'שיתוף משק בית': 'Share household',
  'שיתוף עם בן/בת זוג או שותף': 'Share with a partner or housemate',
  'מי רואה את הנתונים': 'Who can see the data',
  'קישורי הזמנה': 'Invite links',
  'קישור הזמנה חדש': 'New invite link',
  'ביטול ההזמנות הפתוחות': 'Revoke open invites',
  'העתקה': 'Copy',
  'הועתק': 'Copied',
  'העתקת הקישור': 'Copy link',
  'בעלים': 'Owner',
  'חבר': 'Member',
  '(אתם)': '(you)',
  'הסרה': 'Remove',
  'עזיבה': 'Leave',
  'אין הזמנות פתוחות. צרו קישור ושלחו אותו — מי שיפתח אותו יצטרף למשק הבית הזה.':
    'No open invites. Create a link and send it — whoever opens it joins this household.',
  'הקישור תקף שבעה ימים ומתבטל אחרי שמישהו הצטרף באמצעותו. כל מי שמצטרף רואה ועורך את כל נתוני משק הבית הזה.':
    'The link is valid for seven days and stops working once someone joins with it. Anyone who joins can see and edit all of this household’s data.',
  'רק בעלים של משק הבית יכול להזמין אנשים נוספים.':
    'Only a household owner can invite other people.',
  'לא הצלחנו להעתיק. סמנו את הקישור והעתיקו ידנית':
    'Copy failed. Select the link and copy it manually.',

  /* ---------- סקירה ---------- */
  'כמה מההוצאות באמת הכרחיות?': 'How much of this is actually essential?',
  'הוצאות': 'Spending',
  'הוצאה בפועל': 'Actual spending',
  'הוצאות בחודש': 'Spending this month',
  'הכנסות בחודש': 'Income this month',
  'נשאר בסוף החודש': 'Left at month end',
  'שיעור חיסכון': 'Savings rate',
  'סך החודש': 'Month total',
  'שינוי מהחודש הקודם': 'Change from last month',
  'ייבאו חודש מלא נוסף כדי להשוות': 'Import another full month to compare',
  'איפה רוב הכסף התרכז החודש': 'Where most of the money went this month',
  'בתי העסק הגדולים': 'Biggest merchants',
  'מגמה חודשית': 'Monthly trend',
  'נוח להשוואה מהירה בין חודשים': 'Good for a quick month-to-month comparison',
  'הוצאות חובה': 'Essential spending',
  'מתוך ההוצאה החודשית': 'of monthly spending',
  'הזינו הכנסות למטה': 'Enter income below',
  'צריך הכנסות כדי לחשב': 'Income is needed to calculate this',
  'מעבר להכנסות ויעדים ←': 'Go to income & goals →',
  'הוצאתם': 'You spent',
  'החלוקה נקבעת לפי הקטגוריה. אפשר לשנות אותה לכל בית עסק בלשונית "בתי עסק".':
    'The split follows the category. You can change it per merchant on the Merchants tab.',
  'אותה חלוקה, כפס אחד': 'The same split, as a single bar',
  'השוואת גדלים מדויקת יותר מאשר בעוגה': 'Easier to compare sizes than a pie',
  'אחר': 'Other',

  /* ---------- נחיצות ---------- */
  'חובה': 'Essential',
  'חצי-חובה': 'Semi-essential',
  'מותרות': 'Discretionary',
  'נחיצות': 'Necessity',
  'כל רמות הנחיצות': 'All necessity levels',
  'לא חובה': 'Non-essential',

  /* ---------- תקציבים ---------- */
  'תקציב': 'Budget',
  'ניצול': 'Used',
  'נוצל מתוך התקציב': 'used of budget',
  'סך התקציב שהוגדר': 'Total budget set',
  'חריגות': 'Over budget',
  'הכול בתוך התקציב': 'All within budget',
  'ממוצע חודשי': 'Monthly average',
  '✨ הצעה לפי הממוצע שלכם': '✨ Suggest from your average',
  'קבעו תקרה לכל קטגוריה. הפס מראה כמה כבר נוצל בחודש הנבחר. "ממוצע חודשי" מחושב מהחודשים המלאים שיובאו בלבד.':
    'Set a ceiling per category. The bar shows how much of it the selected month has used. The monthly average uses only full imported months.',

  /* ---------- חיובים קבועים ---------- */
  '🔁 חיובים חוזרים': '🔁 Recurring charges',
  'חיובים בסכום יציב': 'Charges with a stable amount',
  'רק חיובים יציבים': 'Stable charges only',
  'יציב': 'Stable',
  'עלות לחודש': 'Cost per month',
  'עלות שנתית': 'Yearly cost',
  'חיוב החודש': 'Charged this month',
  'החיוב הבא': 'Next charge',
  'תדירות': 'Frequency',
  'כל כמה זמן מחייבים': 'How often it charges',
  'חיובים קבועים בחודש': 'Recurring per month',
  'מועמדים לחיוב קבוע': 'Likely subscriptions',
  'מנויים שאפשר לבטל': 'Subscriptions you could cancel',
  'חיובים בקטגוריות שהן כמעט תמיד הוראת קבע. עברו עליהם ובדקו מה עדיין בשימוש.':
    'Charges in categories that are almost always standing orders. Go through them and check what you still use.',
  '💳 תשלומים פתוחים': '💳 Open installments',
  'התחייבויות בתשלומים': 'Installment commitments',
  'עסקאות שנפרסו לתשלומים וממשיכות לחייב אתכם בחודשים הבאים. זה כסף שכבר "הוצאתם" אבל עוד לא שילמתם.':
    'Purchases split into instalments that keep charging you in the coming months. Money you have already spent but not yet paid.',
  'אין עסקאות בתשלומים פתוחות.': 'No open instalments.',
  'לא נמצאו חיובים חוזרים בנתונים שיובאו.': 'No recurring charges found in the imported data.',
  'יתרה לתשלום': 'Left to pay',
  'עוד צריך לשלם': 'Still to pay',
  'תחזית קדימה': 'Looking ahead',
  'חוזרים ביותר מחודש': 'Recurring in more than one month',
  'סך הכל': 'Total',
  'בחודש': 'per month',
  'בשנה': 'per year',
  'מנורמל — חיוב דו-חודשי נספר כמחצית':
    'Normalised — a bi-monthly charge counts as half',

  /* ---------- תדירות ---------- */
  'חודשי': 'Monthly',
  'דו-חודשי': 'Bi-monthly',
  'רבעוני': 'Quarterly',
  'חצי-שנתי': 'Semi-annual',
  'שנתי': 'Yearly',
  'חד-פעמי': 'One-off',
  'כל חודש': 'Every month',
  'כל חודשיים': 'Every two months',
  'כל שלושה חודשים': 'Every three months',
  'כל חצי שנה': 'Every six months',
  'פעם בשנה': 'Once a year',

  /* ---------- איפה לחסוך ---------- */
  'חיסכון אפשרי בחודש': 'Possible monthly saving',
  'חיסכון אפשרי בשנה': 'Possible yearly saving',
  'חיסכון חודשי': 'Monthly saving',
  'אם תיישמו את כל ההצעות למטה': 'If you apply every suggestion below',
  'אותו קצב, שנים עשר חודשים': 'The same rate, twelve months',
  'פוטנציאל קיצוץ': 'Cut potential',
  'מותרות + 30% מהחצי-חובה': 'Discretionary + 30% of semi-essential',
  'השפעה גדולה': 'High impact',
  'השפעה בינונית': 'Medium impact',
  'השפעה קטנה': 'Low impact',
  'הוצאות קטנות שמצטברות': 'Small charges that add up',
  'לא נמצאו הצעות חיסכון מובהקות בחודש הזה. נסו לייבא עוד חודשים כדי לזהות מנויים וחיובים חוזרים.':
    'No clear savings found for this month. Import more months to spot subscriptions and recurring charges.',
  'ההצעות מבוססות על ההוצאות שלכם בפועל, ואף אחת מהן לא נוגעת בהוצאות שסומנו כ"חובה". אם משהו כאן מסווג לא נכון — שנו את הסיווג בלשונית "עסקאות" והרשימה תתעדכן.':
    'Suggestions are based on your actual spending, and none of them touch anything marked essential. If something is classified wrongly, change it on the Transactions tab and the list updates.',

  /* ---------- עסקאות ---------- */
  'תאריך': 'Date',
  'תאריך עסקה': 'Transaction date',
  'תאריך חיוב': 'Charge date',
  'סכום': 'Amount',
  'סכום החיוב': 'Charged amount',
  'סכום מקורי': 'Original amount',
  'קטגוריה': 'Category',
  'כל הקטגוריות': 'All categories',
  'בית עסק': 'Merchant',
  'בית העסק': 'the merchant',
  'שם בית העסק': 'Merchant name',
  'השם בבנק': 'Name at the bank',
  'שם תצוגה': 'Display name',
  'כרטיס': 'Card',
  'מקור': 'Source',
  'סוג': 'Type',
  'הערה': 'Note',
  'ידני': 'Manual',
  'חודש': 'Month',
  'חודשים': 'months',
  'כל החודשים': 'All months',
  'כל החודשים יחד': 'All months together',
  'בחרו חודש': 'Choose a month',
  'חיפוש בית עסק, אסמכתא או הערה…': 'Search merchant, reference or note…',
  'חיפוש בית עסק…': 'Search merchant…',
  'ניקוי הסינון': 'Clear filters',
  'לא נמצאו עסקאות מתאימות לסינון.': 'No transactions match the filter.',
  'לא נמצאו בתי עסק מתאימים לסינון.': 'No merchants match the filter.',
  'מיון: תאריך': 'Sort: date',
  'מיון: סכום': 'Sort: amount',
  'מיון: שם בית עסק': 'Sort: merchant',
  'פתיחת הכול': 'Expand all',
  'סגירת הכול': 'Collapse all',
  'פתיחת הפרטים': 'Show details',
  'סגירת הפרטים': 'Hide details',
  'עסקאות שמורות': 'Stored transactions',
  'לחיצה על שורה פותחת אותה: אסמכתא, הערה חופשית, שיוך ליעד ופרטי החיוב המלאים. ✏️ ליד שם בית העסק משנה את השם':
    'Click a row to open it: reference, free note, goal link and the full charge details. The ✏️ next to a merchant name renames it',
  'בכל העסקאות שלו': 'across all of its transactions',
  'לעסקה הבודדת': 'to that single transaction',
  ', ואילו האסמכתא וההערה שייכות': ', while the reference and note belong',
  'העסקאות משויכות לחודש לפי תאריך החיוב — זה הכסף שיוצא מהחשבון בפועל. חודשים מסומנים ב-⚠ הם חלקיים.':
    'Transactions belong to the month of their charge date — that is the money actually leaving the account. Months marked ⚠ are partial.',
  '📌 אסמכתא — למה היה התשלום הזה': '📌 Reference — what this payment was for',
  '💬 הערה': '💬 Note',
  '🏔️ שיוך להוצאה גדולה': '🏔️ Link to a big expense',
  'בלי שיוך ליעד': 'Not linked to a goal',
  'כל מה שתרצו לזכור על העסקה הזו': 'Anything you want to remember about this transaction',
  'למשל: מקדמה לצלם החתונה': 'e.g. deposit for the wedding photographer',
  'מוצגות ההוצאות המשויכות ל': 'Showing spending linked to',
  '— כל החודשים, מכל הקטגוריות. סך הכול': '— all months, all categories. Total',
  'תשלומים': 'instalments',
  'שולם מחוץ לכרטיס': 'Paid outside the card',
  'חודש חלקי — לא יובא קובץ מלא עבורו': 'Partial month — no full file imported for it',

  /* ---------- תשלום ידני ---------- */
  '+ תשלום שלא בכרטיס': '+ Payment not on the card',
  '➕ הוספת תשלום שלא מופיע בכרטיס': '➕ Add a payment that is not on the card',
  '✏️ עריכת תשלום ידני': '✏️ Edit manual payment',
  'עריכת התשלום': 'Edit payment',
  'הוספת התשלום': 'Add payment',
  'תשלום ידני': 'Manual payment',
  'לתשלומים שיוצאים מהחשבון אבל לא דרך כרטיס האשראי — העברה לאמא על החשמל, מזומן, הוראת קבע בבנק, או צ׳ק.':
    'For money that leaves the account but not through the credit card — a transfer to your mother for the electricity, cash, a bank standing order, or a cheque.',
  'על מה שילמתם': 'What you paid for',
  'דרך מי שולם': 'Paid via',
  'למשל: חשמל': 'e.g. electricity',
  'למשל: אמא (העברתי לה)': 'e.g. Mum (I transferred it to her)',
  'למשל: מוסך של אבי': "e.g. Avi's garage",
  'צריך שם, סכום ותאריך': 'Name, amount and date are required',
  'שמירה': 'Save',
  'ביטול': 'Cancel',
  'שמירת השינויים': 'Save changes',
  'מחיקה': 'Delete',
  'סגירה': 'Close',
  'שינוי': 'Change',
  'שינוי שם': 'Rename',
  '✏️ שינוי': '✏️ Change',
  '✏️ תנו שם': '✏️ Name it',

  /* ---------- בתי עסק ---------- */
  'הבנק מקצר שמות של בתי עסק ל-14 תווים, ולכן "מרכבה a45 (חצי" או "אחים סרור - ב." לא תמיד אומרים משהו. תנו כאן שם שאתם מזהים — הוא יחליף את השם המקוצר בכל האפליקציה, בכל החודשים, וגם בקבצים שתייבאו בעתיד.':
    'The bank truncates merchant names to 14 characters, so entries like "מרכבה a45 (חצי" rarely mean anything. Give each one a name you recognise — it replaces the truncated name everywhere in the app, across every month, and in files you import later.',
  'רק כאלה שעוד לא נתתי להם שם': 'Only ones I have not named yet',
  'קיבלו שם מוכר': 'Given a familiar name',
  'בתי עסק שסיווגתם בעצמכם': 'Merchants you classified yourself',
  'שיוכים ידניים': 'Manual overrides',
  'בכל החודשים שיובאו': 'across all imported months',

  /* ---------- קטגוריות ---------- */
  '🏷️ קטגוריות': '🏷️ Categories',
  '+ קטגוריה חדשה': '+ New category',
  'שם הקטגוריה החדשה:': 'Name of the new category:',
  'הקטגוריות שייכות למשק הבית הזה בלבד וניתנות לעריכה מלאה — שם, אימוג׳י, צבע, נחיצות וסדר.':
    'Categories belong to this household alone and are fully editable — name, emoji, colour, necessity and order.',
  'הסדר קובע קדימות בזיהוי האוטומטי:': 'Order decides priority in automatic matching:',
  'הקטגוריה הראשונה שאחת ממילות המפתח שלה מופיעה בשם בית העסק מנצחת. לכן חריגים ("חשמל ומיזוג" — חנות) צריכים לשבת מעל כללים רחבים ("חשמל" — חשבון).':
    'The first category with a keyword contained in the merchant name wins. So exceptions (an appliance shop) must sit above broad rules (the electricity bill).',
  'מילות מפתח לזיהוי אוטומטי — מופרדות בפסיק. די בכך שהמילה מוכלת בשם בית העסק.':
    'Keywords for automatic matching, comma separated. It is enough for the word to appear inside the merchant name.',
  'קטגוריית ברירת המחדל — לא ניתן למחוק אותה': 'The fallback category — it cannot be deleted',
  'אימוג׳י': 'Emoji',
  'אימוג׳י:': 'Emoji:',
  'אימוג׳י (אפשר להשאיר ריק):': 'Emoji (optional):',
  'צבע': 'Colour',
  'סדר': 'Order',
  'למעלה': 'Up',
  'למטה': 'Down',
  'בשימוש': 'in use',
  'לאן להעביר אותן? הקלידו שם קטגוריה קיימת, או השאירו ריק כדי להעביר ל"שונות".':
    'Where should they go? Type an existing category name, or leave blank to move them to Misc.',

  /* ---------- הכנסות ויעדים ---------- */
  '💼 הכנסות': '💼 Income',
  'הכנסות': 'Income',
  'הוספת הכנסה': 'Add income',
  'עוד לא הוזנו הכנסות.': 'No income entered yet.',
  'קובץ האשראי מכיל רק הוצאות, ולכן את ההכנסות מזינים כאן. בלעדיהן אי אפשר לדעת כמה באמת נשאר בסוף החודש.':
    'The card file contains expenses only, so income is entered here. Without it there is no way to know what is actually left at the end of the month.',
  'קבועה כל חודש': 'Every month',
  'חד-פעמית': 'One-off',
  'של מי': 'Whose',
  'אני / בת הזוג': 'Me / partner',
  'משכורת': 'Salary',
  'מחיקת ההכנסה': 'Delete income',
  'הכנסה צפויה': 'Expected income',

  '🏔️ הוצאות גדולות שבדרך': '🏔️ Big expenses coming up',
  'הוצאה גדולה חדשה': 'New big expense',
  'הוספת יעד': 'Add goal',
  'עוד לא הוגדרו הוצאות גדולות.': 'No big expenses defined yet.',
  'לכל יעד: כמה הוא עולה, כמה כבר שולם, ומתי הוא. האפליקציה מחשבת כמה צריך להפריש כל חודש. תשלומים שכבר בוצעו בכרטיס נספרים אוטומטית לפי הקטגוריה המקושרת.':
    'For each goal: what it costs, what is already paid, and when it happens. The app works out how much to set aside each month. Payments already made on the card are counted automatically through the linked category.',
  'שם היעד': 'Goal name',
  'עלות כוללת': 'Total cost',
  'סוג המועד': 'Date type',
  'חודש היעד': 'Target month',
  'תאריך מדויק': 'Exact date',
  'תאריך היעד': 'Target date',
  'מועד היעד': 'Target',
  'בלי מועד': 'No date',
  'קטגוריה מקושרת': 'Linked category',
  'אין — ספירה ידנית בלבד': 'None — manual count only',
  'שולם מחוץ לכרטיס ': 'Paid outside the card ',
  'התקדמות': 'Progress',
  'הפרשה חודשית נדרשת': 'Required monthly set-aside',
  'תשלום חודשי': 'Monthly payment',
  'הפרשה ליעדים': 'Set aside for goals',
  'אחרי הפרשה ליעדים': 'After setting aside for goals',
  'אחרי מה שכבר שולם': 'After what is already paid',
  'סך היעדים': 'Total goals',
  'עוד לא הוזנה עלות': 'No cost entered yet',
  'סמנו כשהיעד סגור — יעבור לארכיון': 'Tick when the goal is done — it moves to the archive',
  'הושלם': 'Done',
  '✅ בארכיון': '✅ Archived',
  'ארכיון — יעדים שהושלמו': 'Archive — completed goals',
  'כל היעדים הושלמו ועברו לארכיון.': 'All goals are complete and archived.',
  'היעדים האלה אינם נספרים בהפרשה החודשית, אבל הנתונים שלהם נשמרים במלואם. ביטול הסימון מחזיר יעד לרשימה הפעילה.':
    'Archived goals are excluded from the monthly set-aside, but all of their data is kept. Unticking one returns it to the active list.',
  '✅ היעד מכוסה במלואו.': '✅ This goal is fully covered.',
  '✏️ מלאו את העלות הכוללת ואת המועד כדי שנחשב כמה להפריש בחודש.':
    '✏️ Enter the total cost and the date so we can work out the monthly set-aside.',
  'מכוסה': 'Covered',
  'באיחור': 'Overdue',
  'היום': 'Today',
  'מתי': 'When',
  'מעבר למסך העסקאות עם סינון לפי היעד': 'Open the transactions screen filtered to this goal',
  'בקצב הנוכחי חסרים': 'At the current rate you are short',
  'כדי לעמוד בכל חודשי היעד': 'to meet every target month',

  '🔀 שינויים מתוכננים בהוצאות קבועות': '🔀 Planned changes to recurring costs',
  'הוצאה קבועה שמשתנה': 'A recurring cost that changes',
  'הוצאה קבועה שאתם כבר יודעים שתשתנה בתאריך מסוים — הפסקת מנוי, הוזלה, סיום התחייבות.':
    'A recurring cost you already know will change on a given date — a subscription ending, a price drop, a commitment finishing.',
  'הוספת שינוי': 'Add change',
  'לא הוגדרו שינויים מתוכננים.': 'No planned changes defined.',
  'שינויים בהוצאות': 'Spending changes',
  'מה משתנה': 'What changes',
  'אחרי השינוי': 'After the change',
  'מחיקת השינוי': 'Delete change',

  '🗓️ מחזור החיוב': '🗓️ Billing cycle',
  'המחזור מתחיל ביום': 'The cycle starts on day',
  '1 — חודש קלנדרי רגיל': '1 — a normal calendar month',
  'המחזור הנוכחי:': 'Current cycle:',
  'כרגע החישוב לפי חודשים קלנדריים.': 'Currently calculated by calendar months.',
  'חיוב שמתבצע לפני היום הזה נספר עדיין למחזור הקודם.':
    'A charge before this day still counts towards the previous cycle.',
  'אם המשכורות נכנסות בתחילת החודש והאשראי נגבה ב-10, חודש קלנדרי חותך את התקופה באמצע. כאן קובעים באיזה יום נפתח מחזור חדש, וכל החישובים — סיכומים, תקציבים, מגמה והשוואות — עוברים לפיו.':
    'If salaries arrive at the start of the month and the card is charged on the 10th, a calendar month cuts the period in half. Set the day a new cycle opens here, and every calculation — totals, budgets, trend and comparisons — follows it.',

  /* ---------- ייבוא ---------- */
  '📥 גררו לכאן את קובץ האקסל': '📥 Drag your Excel file here',
  'נתמכים שני קבצים: "פירוט עסקאות — כרטיסי אשראי" מאתר הבנק, ו"פירוט עסקאות וזיכויים" מאתר כאל (xlsx). קובץ כאל מגיע עם היסטוריה ארוכה בבת אחת.':
    'Two files are supported: "Transaction detail — credit cards" from your bank, and "Transactions and credits" from CAL (xlsx). The CAL file comes with a long history in one go.',
  'לכל כרטיס יש קובץ משלו — הורידו קובץ לכל בעל כרטיס וגררו את שניהם יחד.':
    'Each card has its own file — download one per cardholder and drag them in together.',
  'אפשר לגרור כמה קבצים יחד — חודש אחורה בכל פעם — כדי לראות מגמה.':
    'You can drag several files at once — a month back at a time — to see a trend.',
  'אפשר לייבא את אותו חודש שוב בעוד כמה ימים': 'You can import the same month again a few days later',
  '— המערכת תזהה ותוסיף רק את העסקאות שהתווספו מאז, בלי לשכפל דבר.':
    ' — the app detects it and adds only what appeared since, without duplicating anything.',
  'בחירת קבצים': 'Choose files',
  'קורא את הקובץ…': 'Reading the file…',
  'קורא ומנתח את הקובץ…': 'Reading and analysing the file…',
  'תוצאות הייבוא': 'Import results',
  'קובץ הבנק': 'bank file',
  'קובץ כאל': 'CAL file',
  'עסקאות קיימות עודכנו (סכום או תאריך חיוב סופי)':
    'existing transactions updated (final amount or charge date)',
  'כבר היו במערכת ולא שונו': 'were already stored and unchanged',
  'לא נמצאו עסקאות בקובץ. ודאו שזה "פירוט עסקאות — כרטיסי אשראי" מאתר הבנק, או "פירוט עסקאות וזיכויים" מאתר כאל.':
    'No transactions found in the file. Make sure it is "Transaction detail — credit cards" from your bank, or "Transactions and credits" from CAL.',
  'לצפייה בסקירה ←': 'View the overview →',
  '📅 אילו חודשים כבר נטענו': '📅 Which months are loaded',
  'החודש המוקדם ביותר שיש עליו נתונים הוא': 'The earliest month with data is',
  'מסומנים כחלקיים:': 'Marked partial:',
  'אין נתונים כלל עבור:': 'No data at all for:',
  'קבצים שיובאו': 'Imported files',
  'סך הכל נקלט': 'Total imported',
  'ייצוא גיבוי (JSON)': 'Export backup (JSON)',
  'מחיקת כל הנתונים': 'Delete all data',
  '🔒 הנתונים נשארים אצלכם': '🔒 Your data stays with you',
  'העלאה למשק הבית הפעיל ←': 'Upload to the active household →',

  /* ---------- גרפים ---------- */
  '🥧 ההוצאות לפי קטגוריה': '🥧 Spending by category',
  'כל הקטגוריות, מדורגות': 'Every category, ranked',
  'הוצאה מסווגת': 'classified expense',
  'הוצאות מסווגות': 'classified expenses',
  'הוראת קבע': 'standing order',

  /* ---------- תבניות עם ערכים מוזרקים ---------- */
  '{n} אנשים': '{n} people',
  '{sum} ב{month}': '{sum} in {month}',
  '{sum} בשנה': '{sum} per year',
  '{n} שורות דולגו — שורות סיכום וחיובי 0':
    '{n} rows skipped — summary rows and ₪0 charges',
  'נקראו {n} מהקובץ.': 'read {n} from the file.',
  'הבקשה נכשלה ({status})': 'The request failed ({status})',
  'שגיאה בקריאת הקובץ: {msg}': 'Error reading the file: {msg}',
  'טעינת מנוע קריאת האקסל נכשלה: {msg}': 'Loading the Excel reader failed: {msg}',
  'מצב סנכרון: {text}': 'Sync status: {text}',
  'נמצאו {n} עסקאות': '{n} transactions found',
  'נמצאו נתונים שנשמרו בדפדפן מגרסה קודמת ({n} עסקאות).':
    'Found data saved in this browser by an earlier version ({n} transactions).',
  'להסיר את {who} מ"{house}"?': 'Remove {who} from "{house}"?',
  'לעזוב את "{name}"?': 'Leave "{name}"?',
  'מחיקת "{name}" תמחק לצמיתות את כל העסקאות, הקטגוריות והיעדים שלו.':
    'Deleting "{name}" permanently removes all of its transactions, categories and goals.',

  /* ---------- אישורים והודעות ---------- */
  'אין דרך לשחזר. כדי לאשר, הקלידו את שם משק הבית:':
    'There is no way to undo this. To confirm, type the household name:',
  'השם לא תואם — לא נמחק דבר.': 'The name does not match — nothing was deleted.',
  'הנתונים יישארו אצל שאר החברים, ואתם תאבדו את הגישה אליהם.':
    'The data stays with the other members, and you lose access to it.',
  'למחוק את כל העסקאות, התקציבים והיעדים של משק הבית הזה? הפעולה אינה הפיכה.':
    'Delete every transaction, budget and goal in this household? This cannot be undone.',
  'להעלות אותם למשק הבית הפעיל? הנתונים הקיימים בו יוחלפו.':
    'Upload them to the active household? Its current data will be replaced.',
  'נמצאו נתונים ששמרתם בדפדפן לפני שהאפליקציה עברה לשרת.':
    'Found data you saved in the browser before the app moved to a server.',
  'לא הצלחנו להגיע ל-API של Osh.it.': 'Could not reach the Osh.it API.',
  'שם משק הבית החדש:': 'Name of the new household:',
  'שם משק הבית:': 'Household name:',
  'מחיקת היעד': 'Delete goal',
  'שיתוף': 'Share',
  'מי רואה': 'Who can see',
  'ניווט ראשי': 'Main navigation',
  'שפה': 'Language',

  /* ---------- כיסוי חודשים ---------- */
  'לא יובא': 'Not imported',
  'חסר': 'Missing',
  'חלקי': 'Partial',
  ' — חודש חלקי': ' — partial month',
  '. כל מה שקדם לו פשוט לא יובא עדיין — הורידו מהבנק קובץ לכל חודש חסר וגררו אותם לכאן יחד.':
    '. Anything earlier simply has not been imported yet — download a file for each missing month and drag them in together.',
  'עסקאות חדשות נוספו': 'new transactions added',

  /* ---------- הסברים ארוכים ---------- */
  'בית עסק שחייב אתכם בשני חודשים או יותר. "יציב" = הסכום כמעט זהה בכל מחזור — כמעט תמיד מנוי או הוראת קבע. חיוב שסימנתם כלא-חודשי (חשמל, מים, ארנונה) נכנס לרשימה כבר מהופעה ראשונה, ו"עלות לחודש" מחלקת אותו על פני התקופה.':
    'A merchant that charged you in two or more months. "Stable" means the amount is almost identical every cycle — nearly always a subscription or standing order. A charge you marked as non-monthly (electricity, water, city tax) enters the list from its first appearance, and "cost per month" spreads it across the period.',
  'יובא חודש מלא אחד בלבד. זיהוי חיובים חוזרים נהיה הרבה יותר מדויק אחרי ייבוא של 2–3 חודשים נוספים — בינתיים מוצגים החיובים שנראים כמו מנוי לפי הקטגוריה שלהם.':
    'Only one full month has been imported. Recurring-charge detection gets much more accurate after another 2–3 months — for now these are charges that look like subscriptions based on their category.',
  'בחודש כדי לעמוד בכל היעדים בזמן. אפשר לדחות חודש יעד, להוריד סכום יעד, או לקצץ בהוצאות — ראו "איפה לחסוך".':
    'per month to meet every goal on time. You can push back a target month, lower a target amount, or cut spending — see "Where to save".',
  'הגדירו יעדים בלשונית "הכנסות ויעדים"': 'Set goals on the Income & goals tab',
  'הכנסה חד-פעמית בלי חודש אינה נספרת': 'A one-off income without a month is not counted',
  'חשמל, מים וארנונה מגיעים בדרך כלל אחת לחודשיים':
    'Electricity, water and city tax usually arrive every two months',
  'זה לא מנוי — סימון כחד-פעמי': 'Not a subscription — mark as one-off',
  'סימון כחד-פעמי — החיוב יוסר מרשימת החיובים הקבועים':
    'Mark as one-off — the charge leaves the recurring list',
  'הוצאה שאי אפשר לוותר עליה — שכר דירה, חשבונות, ביטוח, מזון בסיסי':
    'Spending you cannot avoid — rent, bills, insurance, basic food',
  'הוצאה נחוצה שאפשר להוזיל — דלק, חניה, קניות שוטפות':
    'Necessary spending you can make cheaper — fuel, parking, everyday shopping',
  'הוצאה שאפשר לוותר עליה או לצמצם — מסעדות, מנויים, בילויים':
    'Spending you could drop or cut back — restaurants, subscriptions, going out',
  'שופרסל, רמי לוי, מכולת': 'Shufersal, Rami Levy, corner shop',
  'איך לקרוא לכם': 'What to call you',
  'לא הוגדר': 'Not set',
  'נותרו': 'left',
  'נשאר': 'left',
  'כמותרות': 'as discretionary',
  'בשנה —': 'per year —',
  'הכול נשמר מקומית בדפדפן הזה בלבד. שום נתון פיננסי לא נשלח לשום שרת. מומלץ לייצא גיבוי מדי פעם — ניקוי היסטוריית הדפדפן ימחק את הנתונים.':
    'Everything is stored on your own server. No financial data is sent anywhere else. Exporting a backup now and then is still worth doing.',

  /* ---------- הזדהות והזמנות ---------- */
  'הוזמנתם ל{house}': 'You have been invited to {house}',
  'הזמנה מ{who} לנהל יחד את התקציב.': 'An invitation from {who} to manage the budget together.',
  'כבר יש לכם חשבון?': 'Already have an account?',
  'אין לכם עדיין חשבון?': 'No account yet?',

  /* ---------- עסקאות: ריבוי ותבניות ---------- */
  'תשלום ידני אחד': 'one manual payment',
  '{n} תשלומים ידניים': '{n} manual payments',
  'תשלום קודם אחד': 'One earlier instalment',
  '{n} תשלומים קודמים': '{n} earlier instalments',
  'חיוב אחד שאינו חודשי': 'one non-monthly charge',
  '{n} חיובים שאינם חודשיים': '{n} non-monthly charges',
  'תשלום {cur}/{total}': 'payment {cur}/{total}',
  'שולם דרך {who}': 'Paid via {who}',
  'אחר ({n})': 'Other ({n})',
  'ברשימה יש': 'This list contains',
  '(חשמל, מים, ארנונה וכדומה). מנורמל לחודש, הסכום המוצג שווה ל-':
    '(electricity, water, city tax and the like). Normalised per month, the figure shown equals',
  'בחודש במקום {sum} — זה המספר להשוואה מול תקציב חודשי.':
    'per month instead of {sum} — that is the number to compare against a monthly budget.',
  'איך קוראים ל"{name}"?': 'What do you call "{name}"?',
  'השם יחליף את השם מהבנק בכל העסקאות של בית העסק.':
    'The name replaces the bank’s name across every transaction from this merchant.',
  'למחוק את התשלום "{name}" על {sum}?': 'Delete the payment "{name}" for {sum}?',
  'מ-{n} קבצים': 'from {n} files',
  'נראו כאן גם ממקור אחר — לא נספרו פעמיים':
    'also seen here from another source — not counted twice',
  'יש בהם רק עסקאות בודדות שחויבו מיידית, ולא את החודש המלא.':
    'They hold only a few immediately-charged transactions, not the full month.',
  'חודשים אלה אינם נכנסים לחישובי ממוצע ולהשוואות, כדי שלא יעוותו את התמונה.':
    'These months are excluded from averages and comparisons so they do not distort the picture.',

  /* ---------- סקירה ---------- */
  'סך ההוצאות — {month}': 'Total spending — {month}',
  'לעומת {month}': 'vs {month}',
  'מההוצאות — לא נוגעים בזה': 'of spending — untouchable',
  '{month} — הקטגוריות הקטנות מקובצות ל"אחר"':
    '{month} — small categories are grouped into "Other"',
  'ל{month} יש רק {count} — כנראה עסקאות חו"ל שחויבו מיידית, ולא חודש שלם. ייבאו את קובץ הבנק של אותו חודש כדי לראות תמונה מלאה.':
    '{month} has only {count} — probably foreign purchases charged immediately rather than a full month. Import that month’s file to see the whole picture.',
  'כדי לדעת כמה באמת נחסך בסוף החודש צריך להזין הכנסות — קובץ האשראי מכיל הוצאות בלבד.':
    'To know what is actually left at the end of the month you need to enter income — the card file contains expenses only.',

  /* ---------- v2 ---------- */
  'חודש קודם': 'Previous month',
  'חודש הבא': 'Next month',
  'חיפוש': 'Search',
  'חיפוש בית עסק, אסמכתא או הערה': 'Search merchant, reference or note',
  'ייבוא דוח': 'Import statement',
  'הגדרות': 'Settings',
  'משק בית': 'Household',
  'משקי בית ושיתוף': 'Households & sharing',
  '{n} עסקאות': '{n} transactions',
  'ניקוי החיפוש': 'Clear search',
  'טווח הגרף': 'Chart range',
  '3 חודשים': '3 months',
  '6 חודשים': '6 months',
  'שנה': 'Year',
  '2 שנים': '2 years',
  'שלוש רמות הנחיצות זו לצד זו, לא מוערמות — כך רואים מי גדל. חודשים חלקיים מסומנים ⚠.': 'The three necessity levels side by side, not stacked — so you can see which one grew. Partial months are marked ⚠.',
  '{n} חודשים אחרונים · לפי תאריך החיוב': 'Last {n} months · by charge date',
  'ההוצאות לפי קטגוריה': 'Spending by category',
  'הסתרת הפירוט': 'Hide breakdown',
  'כל {n} הקטגוריות, מדורגות': 'All {n} categories, ranked',
  'החלוקה נקבעת לפי הקטגוריה, וניתן לשנות אותה לכל בית עסק.': 'The split follows the category, and can be changed for any merchant.',
  '{p}% מההוצאות עדיין ב״{cat}״.': '{p}% of spending is still in “{cat}”.',
  'שיוך {n} מבתי העסק הגדולים לקטגוריה אמיתית יסדר את רוב החודש.': 'Assigning {n} of the top merchants to a real category will sort out most of the month.',
  'שיוך בתי העסק שלהם לקטגוריה אמיתית יחדד את כל הגרפים.': 'Assigning those merchants to a real category will sharpen every chart.',
  'היעד הקרוב': 'Next goal',
  'מתוך {sum}': 'of {sum}',
  'מחר': 'Tomorrow',
  'עוד יומיים': 'In 2 days',
  'עוד {n} ימים': 'In {n} days',
  'נותרו {sum}': '{sum} left',
  'לכל היעדים': 'All goals',
  'עוד אין יעדים': 'No goals yet',
  'חתונה, טיול, רכב — הגדירו הוצאה גדולה שבדרך, והאפליקציה תחשב כמה להפריש בכל חודש.': 'A wedding, a trip, a car — add a big expense that’s coming, and the app works out how much to set aside each month.',
  'תשלום {cur} מתוך {total} — עוד {sum} מחויבים ולא שולמו. מופיע גם בלשונית חיובים קבועים.': 'Payment {cur} of {total} — {sum} still committed and unpaid. Also listed under Recurring.',
  'עדיין ב״{cat}״. שינוי הקטגוריה יחול על כל העסקאות של בית העסק הזה, כולל ייבוא עתידי.': 'Still in “{cat}”. Changing the category applies to every transaction from this merchant, including future imports.',
  'ייתכן שזה שם מקוצר מהבנק. תנו לו שם שאתם מזהים — הוא יוחלף בכל החודשים ובכל ייבוא עתידי.': 'This may be a name the bank truncated. Give it one you recognise — it will be replaced in every month and future import.',
  'עסקה במטבע חוץ: {amount} {cur}, חויבה בשקלים לפי השער ביום החיוב.': 'Foreign-currency purchase: {amount} {cur}, charged in shekels at the rate on the charge date.',
  'חיוב {freq}. במקביל לחודש זה שווה ל-{sum} — המספר שמשווים מול תקציב.': '{freq} charge. Per month that equals {sum} — the number to compare against a budget.',
  'הוצאה חד־פעמית — לא נספרת בזיהוי חיובים קבועים.': 'One-off expense — not counted when detecting recurring charges.',
  'סימון תדירות נכון מונע מחודש עם חיוב גדול להיראות כמו חריגה.': 'Setting the right frequency keeps a month with a big charge from looking like an overrun.',
  '{p}% מהתקציב': '{p}% of budget',
  'מנויים והוראות קבע שזוהו אוטומטית, והתשלומים שעוד פתוחים': 'Subscriptions and standing orders detected automatically, plus open installments',
  'הצעות נוגעות רק במה שלא סומן כחובה': 'Suggestions only touch what isn’t marked essential',
  'הצעה אחת': 'One suggestion',
  '{n} הצעות': '{n} suggestions',
  'ללא נגיעה בהוצאות החובה': 'without touching essentials',
  'הוצאות {month}': '{month} spending',
  'יעדים פעילים': 'active goals',
  'בארכיון': 'archived',
}
