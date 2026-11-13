import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import './PlanView.css'

export type PlanMarker = {
 key: string | number
 label: number
 x: number
 y: number
 direction: number
 /** 'next' is the point to photograph now; 'later' ones come after it. */
 state?: 'pending' | 'done' | 'retake' | 'next' | 'later'
}

type Props = {
 src: string
 alt: string
 markers?: PlanMarker[]
 selected?: string | number | null
 /** Shows each point's number at the end of its direction line. */
 numbered?: boolean
 /** Dot diameter and direction line length, in pixels at a plan width of 800. */
 dotSize?: number
 lineLength?: number
 onSelect?: (key: string | number) => void
 onPlanClick?: (x: number, y: number) => void
 /** Dragging a dot moves the point. */
 onMove?: (key: string | number, x: number, y: number) => void
 /** Dragging a direction line turns it; degrees, 0 = up, clockwise. */
 onRotate?: (key: string | number, direction: number) => void
}

export const DEFAULT_DOT_SIZE = 22
export const DEFAULT_LINE_LENGTH = 26
const clamp = (value: number) => Math.min(1, Math.max(0, value))

export default function PlanView({ src, alt, markers = [], selected, numbered, dotSize = DEFAULT_DOT_SIZE, lineLength = DEFAULT_LINE_LENGTH, onSelect, onPlanClick, onMove, onRotate }: Props) {
 const [failedSrc, setFailedSrc] = useState('')
 const frame = useRef<HTMLDivElement>(null)
 const drag = useRef<{ key: string | number; mode: 'move' | 'rotate' } | null>(null)
 function click(event: MouseEvent<HTMLImageElement>) {
  if (!onPlanClick) return
  const box = event.currentTarget.getBoundingClientRect()
  if (!box.width || !box.height) return
  onPlanClick(clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height))
 }
 function start(event: PointerEvent<HTMLElement>, marker: PlanMarker, mode: 'move' | 'rotate') {
  onSelect?.(marker.key)
  if (mode === 'move' ? !onMove : !onRotate) return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  drag.current = { key: marker.key, mode }
 }
 function track(event: PointerEvent<HTMLElement>, marker: PlanMarker) {
  const active = drag.current
  const box = frame.current?.getBoundingClientRect()
  if (!active || active.key !== marker.key || !box?.width || !box.height) return
  if (active.mode === 'move') {
   onMove?.(marker.key, clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height))
   return
  }
  const dx = event.clientX - (box.left + marker.x * box.width)
  const dy = event.clientY - (box.top + marker.y * box.height)
  if (Math.hypot(dx, dy) < 4) return
  onRotate?.(marker.key, (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360)
 }
 const stop = () => { drag.current = null }
 if (failedSrc === src) return <div className="plan-view plan-view--failed"><p>Could not load this floor plan. Refresh to try again.</p></div>
 const sizes = { '--plan-dot': String(dotSize), '--plan-line': String(lineLength) } as CSSProperties
 const anchor = (marker: PlanMarker, layer: string) => ({
  className: 'plan-marker plan-marker--' + layer + ' plan-marker--' + (marker.state ?? 'pending') + (selected === marker.key ? ' is-selected' : ''),
  style: { left: marker.x * 100 + '%', top: marker.y * 100 + '%' },
 })
 // Two passes: every dot first, then every line, so a line is never hidden under another point's dot.
 return <div ref={frame} className={'plan-view' + (onPlanClick ? ' plan-view--editable' : '')} style={sizes}>
  <img src={src} alt={alt} draggable={false} onClick={click} onError={() => setFailedSrc(src)} />
  {markers.map(marker => {
   const dot = 'plan-dot' + (onMove ? ' plan-dot--movable' : '')
   return <div key={marker.key} {...anchor(marker, 'dot')}>
    {onSelect
     ? <button type="button" className={dot} aria-label={'Point ' + marker.label} aria-pressed={selected === marker.key}
      onClick={() => onSelect(marker.key)} onPointerDown={event => start(event, marker, 'move')}
      onPointerMove={event => track(event, marker)} onPointerUp={stop} onPointerCancel={stop} />
     : <span className={dot} />}
   </div>
  })}
  {markers.map(marker => {
   const radians = marker.direction * Math.PI / 180
   const distance = lineLength + 14
   return <div key={marker.key} {...anchor(marker, 'line')}>
    <span className={'plan-line' + (onRotate ? ' plan-line--turnable' : '')} style={{ transform: `rotate(${marker.direction}deg)` }}
     onPointerDown={onSelect ? event => start(event, marker, 'rotate') : undefined}
     onPointerMove={event => track(event, marker)} onPointerUp={stop} onPointerCancel={stop}>
     {selected === marker.key && onRotate && <span className="plan-line-handle" />}
    </span>
    {numbered && <span className="plan-number" style={{ left: Math.sin(radians) * distance, top: -Math.cos(radians) * distance }}>{marker.label}</span>}
   </div>
  })}
 </div>
}
