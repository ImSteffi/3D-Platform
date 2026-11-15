import type { ReactNode } from 'react'
import './StatusPill.css'

export type StatusTone = 'neutral' | 'amber' | 'green' | 'red'
export type StatusPillProps = {
 /** neutral by default. amber = your move, green = done, red = retake or error. */
 tone?: StatusTone
 /** Show the leading dot. Default true. */
 dot?: boolean
 children: ReactNode
 className?: string
}

export default function StatusPill({ tone = 'neutral', dot = true, children, className = '' }: StatusPillProps) {
 return <span className={`pill pill--${tone} ${dot ? '' : 'pill--plain'} ${className}`.trim()}>{dot && <i aria-hidden="true" />}{children}</span>
}
