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

/**
 * סמל האפליקציה — אותו ציור כמו אייקון ה-PWA.
 *
 * ה-O של Osh.it היא טבעת של שלוש רמות הנחיצות, באותם צבעים של הגרפים,
 * והנקודה במרכז היא הנקודה של ‎.it‎. הצבעים קבועים ולא נגזרים מהערכה:
 * זה סימן מסחרי, והוא צריך להיראות אותו דבר על כל רקע.
 */
export const IconBrand = ({ size = 32, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    aria-hidden
    focusable="false"
    className={className}
  >
    <rect width="512" height="512" rx="118" fill="#0C3B3A" />
    <g transform="rotate(-90 256 256)" fill="none" strokeWidth="58">
      <circle cx="256" cy="256" r="140" stroke="#16A96F" strokeDasharray="469 410.6" />
      <circle cx="256" cy="256" r="140" stroke="#E0A21A" strokeDasharray="268 611.6" strokeDashoffset="-483" />
      <circle cx="256" cy="256" r="140" stroke="#E4568F" strokeDasharray="100 779.6" strokeDashoffset="-765" />
    </g>
    <circle cx="256" cy="256" r="34" fill="#F2FBFA" />
  </svg>
)

/**
 * הגרסה החד-צבעית של הסימן — טבעת בלי ריבוע רקע, לכותרת בנייד ולמגירה.
 * שם הריבוע הירוק כבד מדי ליד כפתור התפריט. הצבעים נגזרים מהערכה כדי
 * שהטבעת תישאר קריאה גם על רקע כהה.
 */
export const IconBrandOutline = ({ size = 32, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    aria-hidden
    focusable="false"
    className={className}
  >
    <g transform="rotate(-90 256 256)" fill="none" strokeWidth="58">
      <circle cx="256" cy="256" r="140" stroke="var(--brand-ring-1)" strokeDasharray="469 410.6" />
      <circle cx="256" cy="256" r="140" stroke="var(--brand-ring-2)" strokeDasharray="268 611.6" strokeDashoffset="-483" />
      <circle cx="256" cy="256" r="140" stroke="var(--brand-ring-3)" strokeDasharray="100 779.6" strokeDashoffset="-765" />
    </g>
    <circle cx="256" cy="256" r="34" fill="var(--brand-ring-1)" />
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

/** משתמש בודד — חשבון ההזדהות */
export const IconUser = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
  </svg>
)

/** שיתוף — שני אנשים חולקים משק בית */
export const IconShare = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 19.5c0-3.1 2.9-5.2 6.5-5.2s6.5 2.1 6.5 5.2" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6" />
    <path d="M18 14.6c2.1.6 3.5 2.1 3.5 4.1" />
  </svg>
)

/** יציאה מהחשבון */
export const IconLogout = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M14.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5" />
    <path d="M10 8.5 6.5 12l3.5 3.5" />
    <path d="M6.5 12H15" />
  </svg>
)

/** העתקה ללוח */
export const IconCopy = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </svg>
)

/** חץ פתיחה/סגירה לכרטיס מתקפל */
export const IconChevron = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 9.5 12 15l6-5.5" />
  </svg>
)

/** ארכיון — קופסה סגורה */
export const IconArchive = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.2" />
    <path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10" />
    <path d="M10 12.5h4" />
  </svg>
)

/** הגדרות — גלגל שיניים */
export const IconSettings = ({ size = 17, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
)

/** חיפוש — זכוכית מגדלת */
export const IconSearch = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
)
