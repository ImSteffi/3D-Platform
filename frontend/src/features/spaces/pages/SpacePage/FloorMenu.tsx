import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../../../shared/ui'

type Props = {
 label: string
 /** A labelled button (for example "Download 3DGS"); without it the toggle is the "more" icon alone. */
 text?: string
 /** Opens above the button: for menus at the bottom of a box that clips what sticks out. */
 up?: boolean
 children: ReactNode
}

/** A small list of a floor's actions under one button. Closes on a pick, a click outside, or Escape. */
export default function FloorMenu({ label, text, up = false, children }: Props) {
 const [open, setOpen] = useState(false)
 const root = useRef<HTMLDivElement>(null)
 useEffect(() => {
  if (!open) return
  const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus() } }
  document.addEventListener('pointerdown', close)
  document.addEventListener('keydown', escape)
  return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
 }, [open])
 return <div className={`area-menu${up ? ' area-menu--up' : ''}`} ref={root}>
  {text
   ? <Button variant="secondary" icon="download" className="area-menu-button" aria-expanded={open} onClick={() => setOpen(current => !current)}>{text}</Button>
   : <Button variant="quiet" icon="more" className="area-menu-toggle" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(current => !current)} />}
  {/* A click on an item runs it, then the list closes. The list stays in the page while closed, so a file picker
      opened from it still delivers its file. */}
  <div className="area-menu-list" role="group" aria-label={label} hidden={!open} onClick={() => setOpen(false)}>{children}</div>
 </div>
}
