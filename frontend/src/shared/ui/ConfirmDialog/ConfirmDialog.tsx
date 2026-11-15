import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../Button/Button.css'
import './ConfirmDialog.css'

export type ConfirmDialogProps = {
 title: string
 /** What will happen, in plain words. */
 children: ReactNode
 /** Names the action, for example "Delete space". */
 confirmLabel: string
 busy?: boolean
 /** Label shown on the confirm button while busy. Default "Deleting…". */
 busyLabel?: string
 error?: string
 onConfirm: () => void
 onCancel: () => void
}

export default function ConfirmDialog({ title, children, confirmLabel, busy = false, busyLabel = 'Deleting…', error,
 onConfirm, onCancel }: ConfirmDialogProps) {
 const dialog = useRef<HTMLDialogElement>(null)
 const cancel = useRef<HTMLButtonElement>(null)
 const id = useId()
 useEffect(() => {
  const element = dialog.current!
  const previousOverflow = document.body.style.overflow
  element.showModal()
  cancel.current?.focus()
  document.body.style.overflow = 'hidden'
  return () => { element.close(); document.body.style.overflow = previousOverflow }
 }, [])
 return createPortal(<dialog ref={dialog} className="confirm-dialog" role="alertdialog"
  aria-labelledby={id + '-title'} aria-describedby={id + '-description'} aria-busy={busy}
  onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
  <h2 id={id + '-title'}>{title}</h2>
  <div id={id + '-description'} className="confirm-dialog-description">{children}</div>
  {error && <p className="confirm-dialog-error" role="alert">{error}</p>}
  <div className="confirm-dialog-actions">
   <button ref={cancel} type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
   <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</button>
  </div>
 </dialog>, document.body)
}
