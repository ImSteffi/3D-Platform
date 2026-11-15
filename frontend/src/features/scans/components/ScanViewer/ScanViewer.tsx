import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../../../shared/ui/Icon/Icon'
import { ScanViewerContext, type ViewerScan } from './ScanViewerContext'
import SplatScene from './SplatScene'
import './ScanViewer.css'

type Selection = { scan: ViewerScan; trigger: HTMLButtonElement; origin: DOMRect }
export default function ScanViewer({ children }: { children: ReactNode }) {
 const [selection, setSelection] = useState<Selection | null>(null)
 const [closing, setClosing] = useState(false)
 const panel = useRef<HTMLDivElement>(null)
 const closeButton = useRef<HTMLButtonElement>(null)
 const open = useCallback((scan: ViewerScan, trigger: HTMLButtonElement) => {
  setClosing(false)
  setSelection({ scan, trigger, origin: (trigger.parentElement ?? trigger).getBoundingClientRect() })
 }, [])
 const close = useCallback(() => setClosing(true), [])

 // Lens: the tour takes the whole viewport. It grows out of the card it was opened from and shrinks back into it.
 useLayoutEffect(() => {
  if (!selection || !panel.current) return
  const element = panel.current
  const bounds = element.getBoundingClientRect()
  const origin = selection.origin
  const collapsed = {
   transform: 'translate(' + (origin.left - bounds.left) + 'px, ' + (origin.top - bounds.top) + 'px) scale(' + origin.width / bounds.width + ', ' + origin.height / bounds.height + ')',
   borderRadius: '20px',
   opacity: 0.5,
  }
  const expanded = { transform: 'translate(0, 0) scale(1, 1)', borderRadius: '0px', opacity: 1 }
  const animation = element.animate(closing ? [expanded, collapsed] : [collapsed, expanded], {
   duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360,
   easing: 'cubic-bezier(.22,1,.36,1)',
   fill: 'both',
  })
  void animation.finished.then(() => {
   if (closing) {
    setSelection(null)
    setClosing(false)
    requestAnimationFrame(() => { if (selection.trigger.isConnected) selection.trigger.focus({ preventScroll: true }) })
   } else closeButton.current?.focus({ preventScroll: true })
  }).catch(() => {})
  return () => { animation.cancel() }
 }, [selection, closing])

 useEffect(() => {
  if (!selection) return
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  let lastUnlock = -Infinity
  const onPointerLock = () => { if (!document.pointerLockElement) lastUnlock = performance.now() }
  document.addEventListener('pointerlockchange', onPointerLock)
  const onKey = (event: KeyboardEvent) => {
   // First Escape releases the walk controls so the admin can reach the save button.
   if (event.defaultPrevented || document.pointerLockElement || performance.now() - lastUnlock < 250) return
   if (event.key === 'Escape') { event.preventDefault(); close() }
  }
  window.addEventListener('keydown', onKey)
  return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onKey); document.removeEventListener('pointerlockchange', onPointerLock) }
 }, [selection, close])

 return <ScanViewerContext.Provider value={open}>
  <div>
   <div inert={!!selection} aria-hidden={!!selection} style={selection ? { visibility: 'hidden' } : undefined}>{children}</div>
  </div>
  {selection && createPortal(<div ref={panel} className="scan-viewer on-dark" role="dialog" aria-modal="true" aria-label={'Tour: ' + selection.scan.name}>
   <button ref={closeButton} className="scan-viewer-close" type="button" aria-label="Close tour" title="Close tour" onClick={close} disabled={closing}><Icon name="close" size={22} /></button>
   <SplatScene key={selection.scan.id} scanId={selection.scan.id} name={selection.scan.name} />
  </div>, document.body)}
 </ScanViewerContext.Provider>
}
