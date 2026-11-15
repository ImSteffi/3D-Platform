import type { CSSProperties } from 'react'
import './Ticks.css'

export type TickState = 'taken' | 'next' | 'retake' | 'todo'
export type TicksProps = {
 /** One entry per photo, in capture order. ink = taken, amber = next, red = retake, faint = to do. */
 states: TickState[]
 /** When given, each tick is a button; receives the index. */
 onSelect?: (index: number) => void
 /** Index of the tick to mark as selected (only with onSelect). */
 selected?: number
 /** Describes the row for screen readers. Default is built from the counts. */
 'aria-label'?: string
 className?: string
}

const names: Record<TickState, string> = { taken: 'taken', next: 'next', retake: 'needs a retake', todo: 'to do' }

/** Pair it with a mono count next to it, for example <span className="num">9 / 20</span>. */
export default function Ticks({ states, onSelect, selected, 'aria-label': ariaLabel, className = '' }: TicksProps) {
 const taken = states.filter(state => state === 'taken').length
 const retakes = states.filter(state => state === 'retake').length
 const label = ariaLabel ?? `${taken} of ${states.length} photos taken${retakes ? `, ${retakes} to retake` : ''}`
 const style = { '--ticks': Math.max(states.length, 1) } as CSSProperties
 const classes = `ticks ${states.length > 32 ? 'ticks--dense' : ''} ${className}`.trim()
 if (!onSelect) return <div className={classes} style={style} role="img" aria-label={label}>
  {states.map((state, index) => <i key={index} className={`tick tick--${state}`} />)}
 </div>
 return <div className={classes} style={style} role="group" aria-label={label}>
  {states.map((state, index) => <button key={index} type="button" className={`tick tick--${state}`} aria-pressed={selected === index}
   aria-label={`Photo ${index + 1}, ${names[state]}`} onClick={() => onSelect(index)} />)}
 </div>
}
