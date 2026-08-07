/**
 * ערכת אייקוני קו לניווט.
 *
 * SVG מוטבע ולא ספריית אייקונים: אלה תשעה אייקונים בלבד, וספרייה שלמה הייתה
 * מוסיפה תלות ומשקל בלי צורך. כולם על אותה רשת 24×24, אותו עובי קו ו-currentColor,
 * כך שהם מתחלפים יחד עם מצב התצוגה ולא צריכים גרסה בהירה וכהה.
 */
interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    className,
  }
}

/** סקירה — עמודות גרף במסגרת */
export const IconOverview = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="3.5" />
    <path d="M7.5 16v-4" />
    <path d="M12 16V8" />
    <path d="M16.5 16v-6" />
  </svg>
)

/** הכנסות ויעדים — מטרה */
export const IconGoals = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
)

/** תקציבים — מחווני גבול */
export const IconBudget = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
    <circle cx="9" cy="7" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="7.5" cy="17" r="2" />
  </svg>
)

/** חיובים קבועים — חץ מעגלי */
export const IconRecurring = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3" />
    <path d="M20.5 4.2V9.4h-5.2" />
  </svg>
)

/** איפה לחסוך — נורה, כלומר הצעות */
export const IconSavings = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7v.3h5.6v-.3c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3Z" />
    <path d="M9.8 19h4.4" />
    <path d="M10.6 21.5h2.8" />
  </svg>
)

/** עסקאות — רשימה */
export const IconTransactions = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M8.5 6.5H20" />
    <path d="M8.5 12H20" />
    <path d="M8.5 17.5H20" />
    <path d="M4.2 6.5h.01" />
    <path d="M4.2 12h.01" />
    <path d="M4.2 17.5h.01" />
  </svg>
)

/** בתי עסק — חנות עם סוכך */
export const IconMerchants = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3.5 9.5 5 4h14l1.5 5.5" />
    <path d="M4.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V9.5" />
    <path d="M3.5 9.5h17" />
    <path d="M9.5 20.5v-5h5v5" />
  </svg>
)

/** קטגוריות — תווית */
export const IconCategories = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20.6 13.4 13 21a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.4V4.6a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.6 7.6a2 2 0 0 1 0 2.6Z" />
    <circle cx="7.6" cy="7.6" r="1.4" />
  </svg>
)

/** ייבוא — חץ אל תוך מגש */
export const IconImport = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3.5v11" />
    <path d="m7.5 10 4.5 4.5 4.5-4.5" />
    <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
  </svg>
)

/** סמל האפליקציה — אותה צורה כמו אייקון ה-PWA */
export const IconBrand = ({ size = 22, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
    focusable="false"
    className={className}
  >
    <circle cx="12" cy="10.5" r="6.2" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="20" r="1.5" fill="currentColor" />
  </svg>
)

/** מצב תצוגה בהיר — שמש */
export const IconSun = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
)

/** מצב תצוגה כהה — סהר */
export const IconMoon = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
)

/** מצב תצוגה לפי המערכת — מסך */
export const IconAuto = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
    <path d="M8.5 20.5h7" />
    <path d="M12 17v3.5" />
  </svg>
)

/** פתיחת התפריט */
export const IconMenu = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3.5 6.5h17" />
    <path d="M3.5 12h17" />
    <path d="M3.5 17.5h17" />
  </svg>
)

/** סגירה */
export const IconClose = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </svg>
)

/** הוספה */
export const IconPlus = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
)

/** משק בית */
export const IconHome = ({ size = 19, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5" />
  </svg>
)
