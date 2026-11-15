import { useState, type CSSProperties } from 'react'
import type { TourPoint } from '../../../tours/api/tourRequests'

type Props = {
 /** The area's plan image, or null when the area has none. */
 src: string | null
 alt: string
 points: TourPoint[]
 currentId: number
 /** The expanded sheet: bigger markers, numbered. */
 large?: boolean
 /** The number shown for a point: its place in the whole space, so it matches the Space page. */
 numberOf?: (point: TourPoint) => number
}

/**
 * A flat, top-down plan with the current point as an amber disc and an arrow for the direction to face
 * (degrees, 0 = up, clockwise). The other points are small and grey. Fills its parent, which sets the size.
 */
export default function MiniPlan({ src, alt, points, currentId, large = false, numberOf = point => point.seq }: Props) {
 const [loaded, setLoaded] = useState<{ src: string; ratio: number } | null>(null)
 const [failed, setFailed] = useState('')
 const current = points.find(point => point.id === currentId)
 if (!src || failed === src) return <span className="mini mini--empty"><span className="num">{current ? numberOf(current) : ''}</span></span>
 const ratio = loaded?.src === src ? loaded.ratio : null
 const at = (point: TourPoint): CSSProperties => ({ left: point.x * 100 + '%', top: point.y * 100 + '%' })
 return <span className={'mini' + (large ? ' mini--large' : '')}>
  <span className="mini-fit" style={{ '--ratio': ratio ?? 1, opacity: ratio === null ? 0 : 1 } as CSSProperties}>
   <img src={src} alt={alt} draggable={false}
    onLoad={event => setLoaded({ src, ratio: event.currentTarget.naturalWidth / event.currentTarget.naturalHeight || 1 })}
    onError={() => setFailed(src)} />
   {points.filter(point => point.id !== currentId).map(point =>
    <span key={point.id} className="mini-other num" style={at(point)} aria-hidden="true">{large ? numberOf(point) : null}</span>)}
   {current && <span className="mini-here" style={at(current)} aria-hidden="true">
    <svg viewBox="-20 -20 40 40">
     <g transform={`rotate(${current.direction})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path className="mini-arrow-halo" d="M0 -7V-17M-4.500 -12.500 0 -17.500 4.500 -12.500" />
      <path className="mini-arrow" d="M0 -7V-17M-4.500 -12.500 0 -17.500 4.500 -12.500" />
     </g>
     <circle className="mini-disc" r="6" />
    </svg>
    {large && <span className="mini-number num">{numberOf(current)}</span>}
   </span>}
  </span>
 </span>
}
