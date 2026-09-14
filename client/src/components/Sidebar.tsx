import type { AuthUser, Household } from '../lib/api'
import { tr, trf, useLang } from '../lib/i18n'
import { IconBrand, IconLogout, IconSettings } from './Icons'

export interface SidebarTab<T extends string> {
  id: T
  label: string
  Icon: (p: { size?: number }) => JSX.Element
  /** מספר קטן ליד השם — חריגות בתקציב, עסקאות בחודש */
  badge?: { value: number; tone: 'alert' | 'quiet' }
}

interface Props<T extends string> {
  groups: Array<{ title: string; tabs: SidebarTab<T>[] }>
  activeTab: T
  onSelectTab: (id: T) => void
  household: Household | null
  user: AuthUser
  onOpenSettings: () => void
  onLogout: () => void
}

/**
 * סרגל הצד במסך רחב.
 *
 * כל המסכים גלויים כל הזמן, ולכן אין צורך לפתוח תפריט כדי לעבור מסך.
 * ניהול משקי בית, שיתוף, שפה ומצב "לפי המערכת" נשארים במגירה — הם נדירים,
 * והכרטיס של משק הבית בתחתית הוא הדלת אליה.
 */
export default function Sidebar<T extends string>({
  groups,
  activeTab,
  onSelectTab,
  household,
  user,
  onOpenSettings,
  onLogout,
}: Props<T>) {
  useLang()
  const initial = (user.name || user.email || '?').trim().charAt(0)

  return (
    <aside className="sidebar" aria-label={tr('ניווט ראשי')}>
      <div className="sidebar-brand">
        <IconBrand size={32} />
        <div>
          <b>Osh.it</b>
          <small>{tr('לאן הלך העו״ש')}</small>
        </div>
      </div>

      {groups.map((group) => (
        <nav className="sidebar-group" key={group.title} aria-label={tr(group.title)}>
          <div className="sidebar-group-title">{tr(group.title)}</div>
          {group.tabs.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              className={`sidebar-item ${activeTab === id ? 'active' : ''}`}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => onSelectTab(id)}
            >
              <Icon size={17} />
              <span>{tr(label)}</span>
              {badge && badge.value > 0 && (
                <span className={`sidebar-badge ${badge.tone}`}>{badge.value.toLocaleString('en-US')}</span>
              )}
            </button>
          ))}
        </nav>
      ))}

      <div className="sidebar-foot">
        {household && (
          <button className="sidebar-household" onClick={onOpenSettings} title={tr('משקי בית ושיתוף')}>
            <span className="dim tiny">{tr('משק בית')}</span>
            <span className="sidebar-household-row">
              <b>
                <span aria-hidden>{household.emoji} </span>
                {household.name}
              </b>
              <span className="dim tiny">
                {trf('{n} עסקאות', { n: household.transactionCount.toLocaleString('en-US') })}
              </span>
            </span>
          </button>
        )}
        <div className="sidebar-user">
          <span className="sidebar-avatar" aria-hidden>
            {initial}
          </span>
          <span className="sidebar-user-who">
            <b>{user.name}</b>
            <small dir="ltr">{user.email}</small>
          </span>
          <button className="icon-btn sm ghost" onClick={onOpenSettings} title={tr('הגדרות')} aria-label={tr('הגדרות')}>
            <IconSettings size={16} />
          </button>
          <button className="icon-btn sm ghost" onClick={onLogout} title={tr('יציאה')} aria-label={tr('יציאה')}>
            <IconLogout size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
