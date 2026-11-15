import type { CSSProperties, ReactNode } from 'react'
import './Skeleton.css'

export type SkeletonProps = {
 /** CSS width, for example 120 or '60%'. Default 100%. */
 width?: number | string
 /** CSS height. Default 14 (one line of text). */
 height?: number | string
 /** Corner radius. Default 8; use 999 for pills and circles. */
 radius?: number | string
 /** Place in the wave: shapes further along start their shimmer a little later, so one wave travels left to right across a group. */
 index?: number
 className?: string
 style?: CSSProperties
}

/** A placeholder shape for content that is loading. A light band sweeps across it from left to right. Hidden from screen readers; wrap a group in `SkeletonGroup` for the announcement. */
export default function Skeleton({ width = '100%', height = 14, radius = 8, index = 0, className = '', style }: SkeletonProps) {
 return <span aria-hidden="true" className={`skeleton ${className}`.trim()}
  style={{ width, height, borderRadius: radius, '--i': index, ...style } as CSSProperties} />
}

export type SkeletonGroupProps = {
 /** Read to screen readers while loading, for example "Loading your spaces". */
 label: string
 className?: string
 children: ReactNode
}

/** Wraps the skeleton shapes of one loading area and announces it once. */
export function SkeletonGroup({ label, className = '', children }: SkeletonGroupProps) {
 return <div className={`skeleton-group ${className}`.trim()} role="status" aria-busy="true">
  <span className="visually-hidden">{label}</span>
  {children}
 </div>
}
