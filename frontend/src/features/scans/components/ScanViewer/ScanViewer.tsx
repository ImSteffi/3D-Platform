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
 const container = useRef<HTMLDivElement>(null)
 const panel = useRef<HTMLDivElement>(null)
 const closeButton = useRef<HTMLButtonElement>(null)
 const open = useCallback((scan: ViewerScan, trigger: HTMLButtonElement) => {
  setClosing(false)
  setSelection({ scan, trigger, origin: (trigger.parentElement ?? trigger).getBoundingClientRect() })
 }, [])
 const close = useCallback(() => setClosing(true), [])

 useLayoutEffect(() => {
  if (!selection || !panel.current || !container.current) return
  const element = panel.current
  const layout = () => {
   const bounds = container.current!.getBoundingClientRect()
   const header = document.querySelector('.workspace-topbar')?.getBoundingClientRect()
   const contentTop = Math.max(0, header?.bottom ?? bounds.top)
   const availableWidth = window.innerWidth - bounds.left
   const gap = availableWidth < 600 ? 16 : 32
   const width = Math.max(0, Math.min(1280, availableWidth - gap * 2))
   const availableHeight = Math.max(0, window.innerHeight - contentTop - gap * 2)
   const height = availableWidth < 600 ? availableHeight : Math.min(720, width * 9 / 16, availableHeight)
   element.style.left = bounds.left + (availableWidth - width) / 2 + 'px'
   element.style.top = contentTop + gap + 'px'
   element.style.width = width + 'px'
   element.style.height = height + 'px'
  }
  layout()
  window.addEventListener('resize', layout)
  const bounds = element.getBoundingClientRect()
  const origin = selection.origin
  const collapsed = {
   transform: 'translate(' + (origin.left - bounds.left) + 'px, ' + (origin.top - bounds.top) + 'px) scale(' + origin.width / bounds.width + ', ' + origin.height / bounds.height + ')',
   borderRadius: '12px',
   opacity: 0.5,
  }
  const expanded = { transform: 'translate(0, 0) scale(1, 1)', borderRadius: getComputedStyle(element).borderRadius, opacity: 1 }
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
  return () => { animation.cancel(); window.removeEventListener('resize', layout) }
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
  <div ref={container}>
   <div inert={!!selection} aria-hidden={!!selection} style={selection ? { visibility: 'hidden' } : undefined}>{children}</div>
  </div>
  {selection && createPortal(<div ref={panel} className="scan-viewer" role="dialog" aria-label={'3D viewer: ' + selection.scan.name}>
   <button ref={closeButton} className="scan-viewer-close" type="button" aria-label="Close viewer" onClick={close} disabled={closing}><Icon name="close" size={22} /></button>
   <SplatScene key={selection.scan.id} scanId={selection.scan.id} />
  </div>, document.body)}
 </ScanViewerContext.Provider>
}