import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../../../shared/ui'

type Props = {
 /** Full-size image URL of each photo, in gallery order. */
 urls: string[]
 index: number
 title: string
 /** Shown only when this photo may be deleted. */
 canDelete: boolean
 busy: boolean
 onIndex: (index: number) => void
 onDelete: () => void
 onClose: () => void
}

/** A signed link can fail once right after an upload: try again a moment later. */
function retry(event: SyntheticEvent<HTMLImageElement>) {
 const img = event.currentTarget
 if (img.dataset.retried) return
 img.dataset.retried = '1'
 const src = img.src
 window.setTimeout(() => { img.src = src + (src.includes('?') ? '&' : '?') + 'retry=1' }, 1500)
}

/** One floor photo at a time, large, over a dark backdrop. Arrow keys step, Esc closes. */
export default function FloorPhotoViewer({ urls, index, title, canDelete, busy, onIndex, onDelete, onClose }: Props) {
 const root = useRef<HTMLDivElement>(null)
 const count = urls.length
 const step = (by: number) => { if (count > 1) onIndex((index + by + count) % count) }

 useEffect(() => {
  root.current?.focus()
  const body = document.body.style
  const before = body.overflow
  body.overflow = 'hidden'
  return () => { body.overflow = before }
 }, [])

 // Load the neighbours ahead so stepping feels instant.
 useEffect(() => {
  if (count < 2) return
  for (const near of [index + 1, index - 1]) new Image().src = urls[(near + count) % count]
 }, [urls, index, count])

 function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === 'Escape') { event.preventDefault(); onClose() }
  else if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
  else if (event.key === 'Tab') {
   // Keep focus inside the dialog.
   const items = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
   if (!items.length) return
   const first = items[0], last = items[items.length - 1]
   if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus() }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
 }

 return createPortal(<div ref={root} className="photo-viewer on-dark" role="dialog" aria-modal="true" aria-label={`${title}: photo ${index + 1} of ${count}`} tabIndex={-1}
  onKeyDown={onKeyDown} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
  <div className="photo-viewer-bar">
   <span className="photo-viewer-count" aria-live="polite">{index + 1} / {count}</span>
   <div className="photo-viewer-actions">
    {canDelete && <Button variant="secondary" icon="trash" disabled={busy} onClick={onDelete}>Delete</Button>}
    <Button variant="secondary" icon="close" aria-label="Close" title="Close (Esc)" onClick={onClose} />
   </div>
  </div>
  <div className="photo-viewer-stage" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
   <img key={urls[index]} src={urls[index]} alt={`Photo ${index + 1} of ${count}`} draggable={false} onError={retry} />
  </div>
  {count > 1 && <>
   <Button variant="secondary" icon="chevron" className="photo-viewer-step photo-viewer-prev" aria-label="Previous photo" title="Previous (Left arrow)" onClick={() => step(-1)} />
   <Button variant="secondary" icon="chevron" className="photo-viewer-step photo-viewer-next" aria-label="Next photo" title="Next (Right arrow)" onClick={() => step(1)} />
  </>}
 </div>, document.body)
}
