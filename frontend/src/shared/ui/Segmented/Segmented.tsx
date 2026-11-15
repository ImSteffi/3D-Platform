import type { ReactNode } from 'react'
import './Segmented.css'

export type SegmentedOption<T extends string | number = string> = {
 value: T
 label: ReactNode
 /** Optional counted number shown after the label in mono. */
 count?: number
 disabled?: boolean
}
export type SegmentedProps<T extends string | number = string> = {
 options: SegmentedOption<T>[]
 value: T
 onChange: (value: T) => void
 /** Names the group for screen readers. */
 'aria-label'?: string
 /** Stretch options to fill the container width. */
 block?: boolean
 className?: string
}

export default function Segmented<T extends string | number = string>({ options, value, onChange, 'aria-label': ariaLabel, block = false, className = '' }: SegmentedProps<T>) {
 return <div className={`segmented ${block ? 'segmented--block' : ''} ${className}`.trim()} role="group" aria-label={ariaLabel}>
  {options.map(option => <button key={option.value} type="button" className="segmented-option" aria-pressed={option.value === value}
   disabled={option.disabled} onClick={() => { if (option.value !== value) onChange(option.value) }}>
   {option.label}{option.count !== undefined && <span className="segmented-count">{option.count}</span>}
  </button>)}
 </div>
}
