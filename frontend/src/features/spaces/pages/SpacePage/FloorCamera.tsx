import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon, Spinner } from '../../../../shared/ui'
import PhotoTutorial from '../../../learn/components/PhotoTutorial/PhotoTutorial'
// The same dark camera layer as the capture camera (Lens): bars, viewfinder, shutter, thumbnail, flash.
import '../../../capture/components/CaptureSession/CaptureSession.css'
import './FloorCamera.css'

const JPEG_QUALITY = .92

/** True when this browser can show a live camera (needs HTTPS or localhost). */
const floorCameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

function watchVisibility(notify: () => void) {
 document.addEventListener('visibilitychange', notify)
 return () => document.removeEventListener('visibilitychange', notify)
}
const tabVisible = () => document.visibilityState === 'visible'

function cameraProblem(reason: unknown): string {
 const name = reason instanceof DOMException ? reason.name : ''
 if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked for this site. Allow camera access in your browser settings, or close this and use Add photos.'
 if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Close this and use Add photos to choose photos you already took.'
 return 'The camera could not be opened. Close other apps that use it and try again, or close this and use Add photos.'
}

/** 0.5x is the wide lens (sees more of the room); 1x is the main lens (sharper photos). */
type Lens = '0.5' | '1'
const LENS_KEY = 'floor-camera-lens'
function savedLens(): Lens {
 try { return localStorage.getItem(LENS_KEY) === '1' ? '1' : '0.5' } catch { return '0.5' }
}

/** The rear camera (or one camera by id) at the highest resolution it gives. Falls back to any camera if the browser refuses the ask. */
async function openCamera(deviceId?: string): Promise<MediaStream> {
 const size = { width: { ideal: 4032 }, height: { ideal: 3024 } }
 try {
  return await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: 'environment' }, ...size }, audio: false })
 } catch (reason) {
  if (reason instanceof DOMException && reason.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  throw reason
 }
}

/** The zoom range the browser lets us set (Chrome on Android), or null. Below 1 means the wide lens is reached by zooming out. */
function zoomRange(track: MediaStreamTrack | undefined): { min: number; max: number } | null {
 try {
  const zoom = (track?.getCapabilities?.() as { zoom?: { min?: number; max?: number } } | undefined)?.zoom
  return typeof zoom?.min === 'number' && typeof zoom.max === 'number' ? { min: zoom.min, max: zoom.max } : null
 } catch { return null }
}

/** A separate wide camera, as Safari on iPhone lists it ("Back Ultra Wide Camera"); labels show once the camera is allowed. */
async function findWideCamera(): Promise<string | null> {
 try {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.find(device => device.kind === 'videoinput' && /ultra ?wide|0[.,]5/i.test(device.label) && !/front/i.test(device.label))?.deviceId ?? null
 } catch { return null }
}

type Props = {
 /** Floor name, shown in the top bar. */
 title: string
 /** How many more photos this floor can take. */
 room: number
 /** Called once with every photo taken (on Done, or on close unless discarded). */
 onDone: (files: File[]) => void
 onClose: () => void
}

/** A full-screen camera that keeps shooting: tap the shutter for each photo, Done sends them all to the floor. */
export default function FloorCamera({ title, room, onDone, onClose }: Props) {
 const [shots, setShots] = useState<File[]>([])
 const [last, setLast] = useState<string | null>(null)
 const [cameraError, setCameraError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [ready, setReady] = useState(false)
 const [working, setWorking] = useState(false)
 const [flash, setFlash] = useState(0)
 const [error, setError] = useState('')
 const [leaving, setLeaving] = useState(false)
 const [lens, setLens] = useState<Lens>(savedLens)
 const [tutorial, setTutorial] = useState(false)
 // How this phone reaches 0.5x: by zooming out, through its own wide camera, not at all, or not known yet.
 const [wide, setWide] = useState<{ how: 'zoom' } | { how: 'camera'; id: string } | { how: 'none' } | null>(null)
 const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)

 const root = useRef<HTMLDivElement>(null)
 const video = useRef<HTMLVideoElement>(null)
 const track = useRef<MediaStreamTrack | null>(null)
 const alive = useRef(true)
 const lastUrl = useRef<string | null>(null)

 const visible = useSyncExternalStore(watchVisibility, tabVisible, () => true)
 const live = floorCameraSupported && !cameraError
 const full = shots.length >= room
 const wantCamera = live && visible && !leaving
 const wideReady = wide !== null && wide.how !== 'none'
 // The camera to open: the wide one only when 0.5x is chosen and the phone has it as its own camera.
 const cameraId = lens === '0.5' && wide?.how === 'camera' ? wide.id : undefined

 // Full-viewport layer: lock the page behind it, take focus, and hand focus back on the way out.
 useEffect(() => {
  alive.current = true
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  if (root.current && !root.current.contains(document.activeElement)) root.current.focus()
  return () => {
   alive.current = false
   document.body.style.overflow = overflow
   if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
   lastUrl.current = null
   opener?.focus()
  }
 }, [opener])

 // The camera runs only while the layer is open and the tab is shown; it stops on close and unmount.
 useEffect(() => {
  if (!wantCamera) return
  const element = video.current
  let disposed = false
  let media: MediaStream | null = null
  openCamera(cameraId).then(async stream => {
   if (disposed) { stream.getTracks().forEach(item => item.stop()); return }
   media = stream
   track.current = stream.getVideoTracks()[0] ?? null
   // The first time, find out how this phone reaches 0.5x.
   if (wide === null) {
    if ((zoomRange(track.current ?? undefined)?.min ?? 1) < 1) setWide({ how: 'zoom' })
    else {
     const id = await findWideCamera()
     if (!disposed) setWide(id ? { how: 'camera', id } : { how: 'none' })
    }
   }
   if (!element || disposed) return
   element.srcObject = stream
   element.play().catch(() => { if (!disposed) setCameraError('The camera preview could not start. Try again, or close this and use Add photos.') })
  }).catch(reason => { if (!disposed) setCameraError(cameraProblem(reason)) })
  return () => {
   disposed = true
   media?.getTracks().forEach(track => track.stop())
   if (element) element.srcObject = null
  }
 // `wide` is read only to learn it once; a change of it alone needs no new stream unless the camera to open changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [wantCamera, attempt, cameraId])

 // Where 0.5x and 1x are zoom levels of one camera, switching only zooms.
 useEffect(() => {
  if (wide?.how !== 'zoom' || !ready) return
  const range = zoomRange(track.current ?? undefined)
  if (!range || !track.current) return
  const level = lens === '0.5' ? range.min : Math.min(Math.max(1, range.min), range.max)
  void track.current.applyConstraints({ advanced: [{ zoom: level } as MediaTrackConstraintSet] }).catch(() => undefined)
 }, [wide, lens, ready])

 function chooseLens(next: Lens) {
  setLens(next)
  try { localStorage.setItem(LENS_KEY, next) } catch { /* only a preference */ }
 }
 // What the toggle shows as chosen: 1x where this phone has no 0.5x.
 const shownLens: Lens = wide?.how === 'none' ? '1' : lens

 function finish() {
  if (working) return
  if (shots.length) onDone(shots)
  onClose()
 }
 // Closing with photos taken asks first: send them, or throw them away.
 function close() {
  if (working) return
  if (shots.length) setLeaving(true)
  else onClose()
 }

 useEffect(() => {
  function onKey(event: globalThis.KeyboardEvent) {
   if (event.key !== 'Escape') return
   event.preventDefault()
   if (tutorial) setTutorial(false)
   else if (leaving) setLeaving(false)
   else if (shots.length) setLeaving(true)
   else onClose()
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
 }, [tutorial, leaving, shots.length, onClose])

 function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Tab' || !root.current) return
  // With the tutorial open, Tab stays inside it.
  const scope = root.current.querySelector<HTMLElement>('.fcam-tutorial') ?? root.current
  const items = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled), video[controls]')].filter(item => item.getClientRects().length > 0)
  if (!items.length) { event.preventDefault(); return }
  const first = items[0]
  const end = items[items.length - 1]
  const active = document.activeElement
  if (!root.current.contains(active) || (event.shiftKey ? active === first || active === root.current : active === end)) {
   event.preventDefault()
   ;(event.shiftKey ? end : first).focus()
  }
 }

 function capture() {
  const source = video.current
  if (!source || !ready || working || full || leaving) return
  const width = source.videoWidth
  const height = source.videoHeight
  if (!width || !height) return
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return
  context.drawImage(source, 0, 0)
  setWorking(true)
  setFlash(count => count + 1)
  setError('')
  canvas.toBlob(blob => {
   if (!alive.current) return
   setWorking(false)
   if (!blob) { setError('This photo could not be saved. Take it again.'); return }
   const file = new File([blob], `floor-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
   setShots(current => [...current, file])
   // Only the newest photo keeps a preview URL, so a long walk does not hold dozens of them.
   const url = URL.createObjectURL(file)
   if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
   lastUrl.current = url
   setLast(url)
  }, 'image/jpeg', JPEG_QUALITY)
 }

 const count = shots.length
 return createPortal(<div ref={root} className="cap on-dark fcam" role="dialog" aria-modal="true" aria-label={`Take photos: ${title}`} tabIndex={-1} onKeyDown={trapFocus}>
  <header className="cap-top" inert={tutorial}>
   <button type="button" className="cap-close" aria-label="Close the camera" onClick={close}><Icon name="close" size={22} /></button>
   <p className="cap-title">{title}</p>
   <button type="button" className="fcam-tutorial-open" aria-haspopup="dialog" onClick={() => setTutorial(true)}><Icon name="learn" size={16} />Tutorial</button>
   <p className="fcam-count" aria-live="polite"><span className="num">{count}</span> taken</p>
  </header>
  <div className="cap-main" inert={tutorial}>
   <div className="cap-view">
    <video ref={video} className={ready && live ? '' : 'is-hidden'} autoPlay muted playsInline disablePictureInPicture
     onLoadedData={() => setReady(true)} onEmptied={() => setReady(false)} />
    {live && !ready && !leaving && <div className="cap-wait"><Spinner label="Opening the camera" /></div>}
    {!live && <div className="cap-fallback">
     <Icon name="camera" size={28} />
     <p>{cameraError || 'This browser cannot show a live camera here. Close this and use Add photos.'}</p>
     <div className="cap-fallback-actions">
      {floorCameraSupported && <Button size="lg" block onClick={() => { setCameraError(''); setAttempt(value => value + 1) }}>Try the camera again</Button>}
      <Button variant="secondary" size="lg" block onClick={count ? finish : onClose}>{count ? `Send ${count} ${count === 1 ? 'photo' : 'photos'}` : 'Close'}</Button>
     </div>
    </div>}
    {flash > 0 && <span key={flash} className="cap-flash" aria-hidden="true" />}
    {(full || error) && !leaving && <p className="fcam-note" role="status">{error || (room <= 0 ? 'This floor already has the most photos it can take.' : `That is the most this floor can take (${room} more). Tap Done to send them.`)}</p>}
    {leaving && <div className="cap-sheet fcam-leave" role="alertdialog" aria-label="Photos not sent yet">
     <p className="fcam-leave-title">Send the {count} {count === 1 ? 'photo' : 'photos'} you took?</p>
     <p>They are not on the floor yet. Discarded photos cannot be brought back.</p>
     <div className="cap-actions">
      <Button variant="danger" size="lg" onClick={onClose}>Discard {count}</Button>
      <Button size="lg" icon="upload" autoFocus onClick={finish}>Send {count}</Button>
     </div>
     <Button variant="quiet" onClick={() => setLeaving(false)}>Keep shooting</Button>
    </div>}
   </div>
   <div className="cap-side">
    <div className="cap-bottom">
     <div className="cap-bottom-inner cap-bottom-inner--stack">
      <div className="cap-controls">
       <div className="fcam-left">
        {last
         ? <span className="cap-thumb"><img src={last} alt={`Last photo taken, ${count} in all`} draggable={false} /></span>
         : <span className="cap-thumb cap-thumb--empty" aria-hidden="true"><Icon name="image" size={20} /></span>}
        {/* 0.5x sees more of each room; 1x gives sharper photos. Phones without a wide lens only have 1x. */}
        <div className="fcam-lens" role="group" aria-label="Lens">
         <button type="button" aria-pressed={shownLens === '0.5'} disabled={!wideReady || leaving}
          title={wide?.how === 'none' ? 'This phone has no 0.5x lens the browser can use' : 'Wide lens: sees more of the room'}
          onClick={() => chooseLens('0.5')}>0.5×</button>
         <button type="button" aria-pressed={shownLens === '1'} disabled={leaving} title="Main lens: sharper photos" onClick={() => chooseLens('1')}>1×</button>
        </div>
       </div>
       <button type="button" className="cap-shutter" autoFocus aria-label={full ? 'No more photos fit on this floor' : `Take photo ${count + 1}`}
        disabled={!live || !ready || working || full || leaving} onClick={capture} />
       <Button className="fcam-done" size="lg" icon="check" disabled={working || leaving} onClick={finish}>Done</Button>
      </div>
     </div>
    </div>
   </div>
  </div>
  {/* How to take the photos, over the camera. Only the tutorial scrolls; the camera stays as it was underneath. */}
  {tutorial && <div className="fcam-tutorial" role="dialog" aria-modal="true" aria-label="How to take the photos">
   <div className="fcam-tutorial-card">
    <header className="fcam-tutorial-head">
     <h2>How to take the photos</h2>
     <button type="button" className="fcam-tutorial-close" aria-label="Close the tutorial" autoFocus onClick={() => setTutorial(false)}><Icon name="close" size={20} /></button>
    </header>
    <div className="fcam-tutorial-body">
     <PhotoTutorial />
    </div>
   </div>
  </div>}
 </div>, document.body)
}
