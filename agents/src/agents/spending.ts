import type { AgentTool } from '../claude.js'

/**
 * כלי ההוצאות.
 *
 * ההקשר מגיע מ-GET /api/agents/context, שמחזיר סיכומים בלבד — זו החלטה של
 * סער, והגבול נאכף ונבדק בשרת (server/src/agentContext.ts), לא כאן.
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

/**
 * שלושת הכלים הם פרוסות של אותה תשובה, כדי שהמודל יבקש רק את מה שהוא צריך.
 * ההקשר נמשך פעם אחת לריצה, בקריאה הראשונה לאחד מהם.
 */
export function spendingTools(context: () => Promise<SpendingContext>): AgentTool[] {
  return [
    {
      name: 'get_spending_summary',
      description:
        'סכומי הוצאה לפי חודש (עד שישה אחרונים): סך חיובי כרטיס, חד-פעמיים, פירוט לפי קטגוריה עם תקציב, והוצאות והכנסות מהעו"ש. בנוסף, קטגוריות שעברו 90% מהתקציב בחודש האחרון.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      label: 'מסכם הוצאות לפי קטגוריה',
      labelEn: 'Summing spending by category',
      run: async () => {
        const c = await context()
        return { latestMonth: c.latestMonth, months: c.months, budgets: c.budgets }
      },
    },
    {
      name: 'get_flagged_items',
      description:
        'פריטים חריגים מהחודשיים האחרונים לפי כללים קבועים: large (גדול פי 3 מהחציון של הקטגוריה ולפחות 1,000 ₪) או new_merchant (בית עסק שלא הופיע קודם, מעל 300 ₪). חיובים שסומנו חד-פעמיים אינם נכללים.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      label: 'מחפש חיובים חריגים',
      labelEn: 'Looking for unusual charges',
      run: async () => ({ flagged: (await context()).flagged }),
    },
    {
      name: 'get_reconciliation',
      description:
        'התאמה בין כל חיוב כרטיס בעו"ש (לפי ארבע ספרות אחרונות) לבין סכום העסקאות של אותו כרטיס סביב אותו תאריך. status: matched, mismatch, או no_card_data כשקובץ הכרטיס לא יובא.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      label: 'מתאים חיובי כרטיס מול העו"ש',
      labelEn: 'Matching card charges to the checking account',
      run: async () => ({ reconciliation: (await context()).reconciliation }),
    },
  ]
}
