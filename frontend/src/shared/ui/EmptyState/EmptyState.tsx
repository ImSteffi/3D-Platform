import type { ReactNode } from 'react'
import Icon, { type IconName } from '../Icon/Icon'
import './EmptyState.css'

export type EmptyStateProps = {
 icon?: IconName
 title: string
 /** One or two plain sentences: what this is and what to do next. */
 text?: ReactNode
 /** Usually one Button. */
 action?: ReactNode
 /** Heading level for the title. Default 2. */
 level?: 2 | 3
 className?: string
}

/** Has no surface of its own: place it inside a Panel. */
export default function EmptyState({ icon, title, text, action, level = 2, className = '' }: EmptyStateProps) {
 const Heading = level === 2 ? 'h2' : 'h3'
 return <div className={`empty ${className}`.trim()}>
  {icon && <span className="empty-icon"><Icon name={icon} size={22} /></span>}
  <Heading className="empty-title">{title}</Heading>
  {text && <p className="empty-text">{text}</p>}
  {action && <div className="empty-action">{action}</div>}
 </div>
}
