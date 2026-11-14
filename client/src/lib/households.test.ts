import { describe, expect, it } from 'vitest'
import type { Household } from './api'
import {
  agentsSummary,
  avatarColor,
  canEdit,
  dataSummary,
  inkOn,
  membersSummary,
  parseInviteInput,
  sourcesSummary,
} from './households'

const CODE = 'Ab3_dEf-9hIjKlMnOpQrStUv'

const household = (patch: Partial<Household> = {}): Household => ({
  id: 'h_1',
  name: 'בית',
  emoji: '🏡',
  kind: 'home',
  color: '#35c4b5',
  createdAt: '2025-01-01 00:00:00',
  role: 'owner',
  memberCount: 1,
  memberNames: ['דנה'],
  transactionCount: 0,
  movementCount: 0,
  firstDate: null,
  cardCount: 0,
  agentCount: 0,
  agentsLive: false,
  ...patch,
})

describe('קוד הזמנה מתוך מה שהודבק', () => {
  it('קישור מלא, קישור בלי https, וקוד לבד', () => {
    expect(parseInviteInput(`https://oshit.example.com/?invite=${CODE}`)).toBe(CODE)
    expect(parseInviteInput(`oshit.example.com/?lang=he&invite=${CODE}#x`)).toBe(CODE)
    expect(parseInviteInput(`  ${CODE}  `)).toBe(CODE)
  })

  it('דוחה טקסט שאינו קוד', () => {
    expect(parseInviteInput('')).toBeNull()
    expect(parseInviteInput('שלום')).toBeNull()
    expect(parseInviteInput('short')).toBeNull()
    expect(parseInviteInput('https://oshit.example.com/?invite=<script>')).toBeNull()
    expect(parseInviteInput('https://oshit.example.com/?invite=%E0%A4%A')).toBeNull()
  })
})

describe('הרשאות', () => {
  it('רק בעלים ועריכה כותבים', () => {
    expect(canEdit('owner')).toBe(true)
    expect(canEdit('editor')).toBe(true)
    expect(canEdit('viewer')).toBe(false)
    expect(canEdit(null)).toBe(false)
  })
})

describe('צבעים', () => {
  it('דיו כהה על טורקיז בהיר, לבן על כתום עמוק', () => {
    expect(inkOn('#35c4b5')).toBe('#04201d')
    expect(inkOn('#b03323')).toBe('#ffffff')
    expect(inkOn('not-a-color')).toBe('#ffffff')
  })

  it('לאותו שם תמיד אותו צבע', () => {
    expect(avatarColor('דנה')).toBe(avatarColor('דנה'))
  })
})

describe('שורות הכרטיס', () => {
  it('בית ריק אומר שהוא ממתין לקובץ ראשון', () => {
    const h = household()
    expect(dataSummary(h)).toBe('אין עדיין · ממתין לקובץ ראשון')
    expect(sourcesSummary(h)).toBe('עוד לא חובר')
    expect(agentsSummary(h)).toBe('כבוי')
    expect(membersSummary(h)).toBe('רק אתם')
  })

  it('בית עם נתונים: כמויות, חודש ראשון ומקורות', () => {
    const h = household({ transactionCount: 1206, movementCount: 40, firstDate: '2025-01-14', cardCount: 2 })
    expect(dataSummary(h)).toBe('1,206 עסקאות · 40 תנועות עו״ש · מינואר 2025')
    expect(sourcesSummary(h)).toBe('2 כרטיסים · חשבון עו״ש')
  })

  it('סוכנים פעילים רק כשהשירות באמת מדווח', () => {
    expect(agentsSummary(household({ agentCount: 3 }))).toBe('כבוי')
    expect(agentsSummary(household({ agentCount: 3, agentsLive: true }))).toBe('פעיל · 3 סוכנים')
  })

  it('בית משותף מציג את שמות החברים', () => {
    expect(membersSummary(household({ memberCount: 2, memberNames: ['דנה', 'יואב'] }))).toBe('דנה, יואב')
  })
})
