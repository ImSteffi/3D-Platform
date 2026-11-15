import type { ReactNode } from 'react'
import Icon from '../Icon/Icon'
import './InlineError.css'

export type InlineErrorProps = {
 /** What went wrong and what to do. Renders nothing when empty. */
 children?: ReactNode
 /** Adds a "Try again" button. */
 onRetry?: () => void
 retryLabel?: string
 className?: string
}

export default function InlineError({ children, onRetry, retryLabel = 'Try again', className = '' }: InlineErrorProps) {
 if (!children) return null
 return <div className={`inline-error ${className}`.trim()} role="alert">
  <Icon name="warning" size={18} />
  <p>{children}</p>
  {onRetry && <button type="button" className="inline-error-retry" onClick={onRetry}>{retryLabel}</button>}
 </div>
}
