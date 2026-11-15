import './Spinner.css'

export type SpinnerProps = {
 /** Diameter in px. Default 20. */
 size?: number
 /** Words shown beside the spinner and read to screen readers, for example "Loading your spaces". */
 label?: string
 /** Centre it in a tall block, for whole-page or whole-panel loading. */
 block?: boolean
 className?: string
}

export default function Spinner({ size = 20, label, block = false, className = '' }: SpinnerProps) {
 return <span className={`spinner ${block ? 'spinner--block' : ''} ${className}`.trim()} role="status">
  <i aria-hidden="true" style={{ width: size, height: size }} />
  {label ? <span>{label}</span> : <span className="visually-hidden">Loading</span>}
 </span>
}
