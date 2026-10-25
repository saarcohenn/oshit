import type { AgentDefinition } from '../claude.js'
import { GUARDRAILS } from './common.js'

/**
 * סוכן ההוצאות.
 *
 * ההקשר מגיע מ-GET /api/agents/context, שמחזיר סיכומים בלבד — זו החלטה של
 * סער, והגבול נאכף ונבדק בשרת (server/src/agentContext.ts), לא כאן. שלושת
 * הכלים הם פרוסות של אותה תשובה, כדי שהמודל יבקש רק את מה שהוא צריך.
 */

/** הצורה שהשרת מחזיר. מוגדרת כאן במינימום שהסוכן צריך */
export interface SpendingContext {
  version: number
  latestMonth: string | null
  months: unknown[]
  budgets: unknown[]
  flagged: unknown[]
  reconciliation: unknown[]
}

export function spendingAgent(context: SpendingContext): AgentDefinition {
  return {
    system: `${GUARDRAILS}

התפקיד שלך: סוכן ההוצאות. אתה מקבל סיכומי הוצאות של משק הבית — סכומים לפי קטגוריה וחודש, חריגות מתקציב, פריטים חריגים, והתאמה בין חיובי הכרטיס בעו"ש לסכום העסקאות בקובץ הכרטיס.

מה חשוב לסער:
- קטגוריה שעברה או מתקרבת לתקציב בחודש הנוכחי.
- שינוי בולט מול החודשים הקודמים באותה קטגוריה.
- פריט חריג (חיוב גדול, בית עסק חדש) — לציין אותו, לא לשפוט אותו.
- חיוב כרטיס שלא תואם את סכום העסקאות. "no_card_data" אינו אי-התאמה: זה קובץ כרטיס שעוד לא יובא.

אין לך את רשימת העסקאות, וזה מכוון. אל תבקש אותה ואל תנחש מה יש בה.`,
    prompt: `בדוק את מצב ההוצאות. החודש האחרון עם נתונים: ${context.latestMonth ?? 'אין נתונים'}.`,
    tools: [
      {
        name: 'get_spending_summary',
        description:
          'סכומי הוצאה לפי חודש (עד שישה אחרונים): סך חיובי כרטיס, חד-פעמיים, פירוט לפי קטגוריה עם תקציב, והוצאות והכנסות מהעו"ש. בנוסף, קטגוריות שעברו 90% מהתקציב בחודש האחרון.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        label: 'מסכם הוצאות לפי קטגוריה',
        run: async () => ({ latestMonth: context.latestMonth, months: context.months, budgets: context.budgets }),
      },
      {
        name: 'get_flagged_items',
        description:
          'פריטים חריגים מהחודשיים האחרונים לפי כללים קבועים: large (גדול פי 3 מהחציון של הקטגוריה ולפחות 1,000 ₪) או new_merchant (בית עסק שלא הופיע קודם, מעל 300 ₪). חיובים שסומנו חד-פעמיים אינם נכללים.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        label: 'מחפש חיובים חריגים',
        run: async () => ({ flagged: context.flagged }),
      },
      {
        name: 'get_reconciliation',
        description:
          'התאמה בין כל חיוב כרטיס בעו"ש (לפי ארבע ספרות אחרונות) לבין סכום העסקאות של אותו כרטיס סביב אותו תאריך. status: matched, mismatch, או no_card_data כשקובץ הכרטיס לא יובא.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        label: 'מתאים חיובי כרטיס מול העו"ש',
        run: async () => ({ reconciliation: context.reconciliation }),
      },
    ],
  }
}
