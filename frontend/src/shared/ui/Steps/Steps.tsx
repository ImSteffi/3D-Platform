import { Link } from 'react-router'
import Icon from '../Icon/Icon'
import './Steps.css'

export type StepState = 'done' | 'current' | 'later'
export type StepItem = {
 label: string
 /** done: green check. current: ink pill. later: faint. */
 state: StepState
 /** Who does this step. 'team' adds a "team" note so the customer knows it is not theirs. */
 owner?: 'you' | 'team'
 /** Optional router path: makes the step a link (for example a Space tab). */
 to?: string
 /** Marks the step the user is looking at when steps are used as tabs (sets aria-current="page"). */
 selected?: boolean
}
export type StepsProps = {
 items: StepItem[]
 /** Names the list for screen readers. Default "Progress". */
 'aria-label'?: string
 className?: string
}

export default function Steps({ items, 'aria-label': ariaLabel = 'Progress', className = '' }: StepsProps) {
 return <ol className={`steps ${className}`.trim()} aria-label={ariaLabel}>
  {items.map(item => {
   const body = <>
    {item.state === 'done' && <Icon name="check" size={16} />}
    <span>{item.label}</span>
    {item.owner === 'team' && <span className="steps-owner">team</span>}
    <span className="visually-hidden">{item.state === 'done' ? ' (done)' : item.state === 'current' ? ' (current step)' : ' (later)'}</span>
   </>
   const classes = `steps-item steps-item--${item.state}${item.selected ? ' steps-item--selected' : ''}`
   return <li key={item.label}>
    {item.to
     ? <Link to={item.to} className={classes} aria-current={item.selected ? 'page' : item.state === 'current' ? 'step' : undefined}>{body}</Link>
     : <span className={classes} aria-current={item.state === 'current' ? 'step' : undefined}>{body}</span>}
   </li>
  })}
 </ol>
}
