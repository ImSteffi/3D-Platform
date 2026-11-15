import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import './Panel.css'

export type PanelVariant = 'glass' | 'solid' | 'well'
export type PanelPadding = 'none' | 'sm' | 'md' | 'lg'
export type PanelProps = HTMLAttributes<HTMLElement> & {
 /** glass: frosted content panel (default). solid: opaque surface for plans and photos being judged. well: quiet inset area inside a panel. */
 variant?: PanelVariant
 /** Element to render. Default 'section'. */
 as?: ElementType
 /** none 0, sm 16px, md 24px (default), lg 28px. */
 padding?: PanelPadding
 children?: ReactNode
}

export default function Panel({ variant = 'glass', as: Tag = 'section', padding = 'md', className = '', children, ...rest }: PanelProps) {
 return <Tag className={`panel panel--${variant} panel--pad-${padding} ${className}`.trim()} {...rest}>{children}</Tag>
}
