import { useId, type HTMLInputTypeAttribute, type ReactNode } from 'react'
import './Field.css'

export type FieldProps = {
 /** Text shown above the control. */
 label: string
 /** Helper line under the control. */
 hint?: ReactNode
 /** Error line under the control; also marks the built-in control invalid. */
 error?: ReactNode
 /** Id of the control. Generated when omitted. With custom children, give your control this same id. */
 id?: string
 /** A custom control (select, file input, a group). When omitted, Field renders its own input or textarea from the props below. */
 children?: ReactNode
 /** Built-in control: 'input' (default) or 'textarea'. */
 as?: 'input' | 'textarea'
 name?: string
 type?: HTMLInputTypeAttribute
 value?: string
 /** Receives the new text, not the event. */
 onChange?: (value: string) => void
 placeholder?: string
 autoComplete?: string
 inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search'
 required?: boolean
 disabled?: boolean
 readOnly?: boolean
 autoFocus?: boolean
 maxLength?: number
 /** Textarea rows. Default 3. */
 rows?: number
 /** Adds "optional" after the label. */
 optional?: boolean
 className?: string
}

export default function Field({ label, hint, error, id, children, as = 'input', name, type = 'text', value, onChange, placeholder,
 autoComplete, inputMode, required, disabled, readOnly, autoFocus, maxLength, rows = 3, optional, className = '' }: FieldProps) {
 const generated = useId()
 const controlId = id ?? generated
 const hintId = hint ? controlId + '-hint' : undefined
 const errorId = error ? controlId + '-error' : undefined
 const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
 const shared = {
  id: controlId, name, value, placeholder, autoComplete, required, disabled, readOnly, autoFocus, maxLength,
  'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy,
 }
 return <div className={`field ${error ? 'field--invalid' : ''} ${className}`.trim()}>
  <label htmlFor={controlId}>{label}{optional && <span className="field-optional"> (optional)</span>}</label>
  {children ?? (as === 'textarea'
   ? <textarea {...shared} rows={rows} onChange={event => onChange?.(event.target.value)} />
   : <input {...shared} type={type} inputMode={inputMode} onChange={event => onChange?.(event.target.value)} />)}
  {error && <p id={errorId} className="field-message field-message--error" role="alert">{error}</p>}
  {hint && <p id={hintId} className="field-message">{hint}</p>}
 </div>
}
