import type { MouseEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import Icon from '../Icon/Icon'

/** Goes back to the page you came from. `to` is only used when the page was opened directly (no history in the app). */
export default function BackLink({ to, children = 'Back', className = 'desk-back' }: { to: string; children?: ReactNode; className?: string }) {
 const navigate = useNavigate()
 const location = useLocation()
 const hasHistory = location.key !== 'default'
 function onClick(event: MouseEvent<HTMLAnchorElement>) {
  if (!hasHistory || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  navigate(-1)
 }
 return <Link className={className} to={to} onClick={onClick}><Icon name="back" size={16} />{children}</Link>
}
