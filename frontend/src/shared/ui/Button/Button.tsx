import './Button.css'
import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import Icon, { type IconName } from '../Icon/Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'md' | 'lg'
export type ButtonProps = {
  children?: ReactNode
  /** primary: ink pill, one per view. secondary: light pill. quiet: text only. danger: destructive. 'ghost' is a legacy alias of secondary. */
  variant?: ButtonVariant | 'ghost'
  /** md 44px (default), lg 50px. */
  size?: ButtonSize
  /** Icon drawn before the label. */
  icon?: IconName
  /** Icon drawn after the label. */
  iconAfter?: IconName
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: (event: MouseEvent<HTMLElement>) => void
  /** Router path: renders a link with the same look. */
  to?: string
  /** Plain URL: renders an anchor with the same look (downloads, external pages). */
  href?: string
  target?: string
  download?: string | boolean
  /** Stretch to the container width. */
  block?: boolean
  className?: string
  title?: string
  autoFocus?: boolean
  'aria-label'?: string
}

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  loading = false,
  disabled = false,
  onClick,
  to,
  href,
  target,
  download,
  block = false,
  className = '',
  title,
  autoFocus,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const inactive = disabled || loading
  const iconSize = size === 'lg' ? 18 : 17
  const classes = `btn btn-${variant === 'ghost' ? 'secondary' : variant}${size === 'lg' ? ' btn-lg' : ''}${block ? ' btn-block' : ''}${children == null ? ' btn-icon-only' : ''}${loading ? ' btn-loading' : ''} ${className}`.trim()
  const content = (
    <>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={iconSize} />}
      {children != null && <span className="btn-label">{children}</span>}
      {iconAfter && <Icon name={iconAfter} size={iconSize} />}
    </>
  )
  if ((to || href) && inactive) {
    return <span className={classes} aria-disabled="true" aria-label={ariaLabel} title={title}>{content}</span>
  }
  if (to) {
    return <Link to={to} className={classes} onClick={onClick} aria-label={ariaLabel} title={title} autoFocus={autoFocus}>{content}</Link>
  }
  if (href) {
    return <a href={href} target={target} rel={target === '_blank' ? 'noreferrer' : undefined} download={download} className={classes} onClick={onClick} aria-label={ariaLabel} title={title}>{content}</a>
  }
  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} aria-disabled={loading || undefined} aria-busy={loading || undefined}
      aria-label={ariaLabel} title={title} autoFocus={autoFocus}
      {...(loading ? { onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault() } : {})}>
      {content}
    </button>
  )
}
