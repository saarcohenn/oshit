import { existsSync, readFileSync } from 'node:fs'
import type { Portfolio } from './defs.js'

/**
 * הגדרות השירות — מהסביבה בלבד.
 *
 * הסודות (מפתח Anthropic, טוקן השירות, טוקן הבוט) מגיעים מקובץ ה-.env שבשרת.
 * הסוכנים עצמם והתיק נמצאים ב-Osh.it ונערכים במסך. קובץ התיק הישן נקרא רק
 * פעם אחת, לייבוא, אם הוא עדיין מותקן.
 */

export interface Config {
  anthropicKey: string | null
  oshitUrl: string
  token: string
  household: string
  /** קובץ התיק הישן — לייבוא חד-פעמי בלבד */
  portfolioFile: string
  dataDir: string
  /** ‏null — בלי טלגרם; הסוכנים מדווחים רק במסך */
  telegramToken: string | null
  /** הכתובת של Osh.it מבחוץ, לקישור בהודעות. בלעדיה ההודעות בלי קישור */
  publicUrl: string | null
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = ['OSHIT_URL', 'AGENTS_TOKEN', 'HOUSEHOLD_ID'].filter((k) => !env[k])
  if (missing.length) throw new Error(`חסרים משתני סביבה: ${missing.join(', ')}`)
  return {
    anthropicKey: env.ANTHROPIC_API_KEY || null,
    oshitUrl: env.OSHIT_URL!.replace(/\/+$/, ''),
    token: env.AGENTS_TOKEN!,
    household: env.HOUSEHOLD_ID!,
    portfolioFile: env.PORTFOLIO_FILE || '/config/portfolio.json',
    dataDir: env.DATA_DIR || '/data',
    telegramToken: env.TELEGRAM_BOT_TOKEN || null,
    publicUrl: env.OSHIT_PUBLIC_URL ? env.OSHIT_PUBLIC_URL.replace(/\/+$/, '') : null,
  }
}

/** קובץ התיק הישן, אם קיים. השרת בודק אותו בייבוא — כאן רק קוראים */
export function readPortfolioFile(file: string): Portfolio | null {
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Portfolio>
  return {
    benchmark: raw.benchmark ?? { name: 'S&P 500', symbol: '^GSPC' },
    holdings: raw.holdings ?? [],
    watchlist: raw.watchlist ?? [],
    rules: String(raw.rules ?? ''),
  }
}
