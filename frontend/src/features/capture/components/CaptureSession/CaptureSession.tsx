import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { photoCounts, photoUrl, planUrl, uploadPhoto, validImage, type TourDetail } from '../../../tours/api/tourRequests'
import { Button, Icon, InlineError, Spinner, StatusPill } from '../../../../shared/ui'
import { imageLooksDark } from '../../utils/brightness'
import { isRetake, nextIndex, orderedPoints, pointState, startIndex } from '../../utils/order'
import MiniPlan from './MiniPlan'
import './CaptureSession.css'

const MAX_PHOTO_MB = 30
const JPEG_QUALITY = .92

type Shot = { pointId: number; file: File; url: string; dark: boolean }
type Review = { pointId: number; url: string; title: string }

const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

function watchVisibility(notify: () => void) {
 document.addEventListener('visibilitychange', notify)
 return () => document.removeEventListener('visibilitychange', notify)
}
const tabVisible = () => document.visibilityState === 'visible'

function cameraProblem(reason: unknown): string {
 const name = reason instanceof DOMException ? reason.name : ''
 if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked for this site. Allow camera access in your browser settings, or take the photo with your phone’s own camera.'
 if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Take the photo with your phone’s own camera, or choose one you already took.'
 return 'The camera could not be opened. Close other apps that use it and try again, or take the photo with your phone’s own camera.'
}

/** The guided capture camera (Lens): one photo per numbered point, retakes first. */
export default function CaptureSession(props: { tour: TourDetail; startPointId?: number; onChange: (tour: TourDetail) => void; onClose: () => void }) {
 const { onChange, onClose, startPointId } = props

 // The latest tour: the parent's, or the one an upload just returned if the parent has not passed it back yet.
 const [tour, setTour] = useState(props.tour)
 const [seenTour, setSeenTour] = useState(props.tour)
 if (props.tour !== seenTour) { setSeenTour(props.tour); setTour(props.tour) }

 const list = useMemo(() => orderedPoints(tour), [tour])
 const [currentId, setCurrentId] = useState<number | null>(() => {
  const points = orderedPoints(props.tour)
  return points[startIndex(points, startPointId)]?.point.id ?? null
 })
 const current = currentId === null ? null : list.find(item => item.point.id === currentId) ?? list[startIndex(list)] ?? null

 const [cameraError, setCameraError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [ready, setReady] = useState(false)
 const [working, setWorking] = useState(false)
 const [flash, setFlash] = useState(0)
 const [shot, setShot] = useState<Shot | null>(null)
 const [uploading, setUploading] = useState(false)
 const [error, setError] = useState('')
 const [pickError, setPickError] = useState('')
 const [planOpen, setPlanOpen] = useState(false)
 const [review, setReview] = useState<Review | null>(null)
 const [last, setLast] = useState<{ pointId: number; url: string } | null>(null)
 const [version, setVersion] = useState(() => Date.now())
 const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)

 const root = useRef<HTMLDivElement>(null)
 const video = useRef<HTMLVideoElement>(null)
 const cameraInput = useRef<HTMLInputElement>(null)
 const galleryInput = useRef<HTMLInputElement>(null)
 const planButton = useRef<HTMLButtonElement>(null)
 const alive = useRef(true)
 const urls = useRef<Set<string>>(null)

 const visible = useSyncExternalStore(watchVisibility, tabVisible, () => true)
 const live = cameraSupported && !cameraError
 const wantCamera = live && visible && !!current

 function keepUrl(blob: Blob) {
  const url = URL.createObjectURL(blob)
  ;(urls.current ??= new Set()).add(url)
  return url
 }
 function dropUrl(url: string) {
  URL.revokeObjectURL(url)
  urls.current?.delete(url)
 }
 const resume = () => { void video.current?.play().catch(() => undefined) }
 const closePlan = () => { setPlanOpen(false); planButton.current?.focus() }

 // Full-viewport layer: lock the page behind it, take focus, and hand focus back on the way out.
 useEffect(() => {
  alive.current = true
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  if (root.current && !root.current.contains(document.activeElement)) root.current.focus()
  const held = urls
  return () => {
   alive.current = false
   document.body.style.overflow = overflow
   held.current?.forEach(url => URL.revokeObjectURL(url))
   held.current?.clear()
   opener?.focus()
  }
 }, [opener])

 // The camera runs only while it is needed: not on the finish screen, and not while the tab is hidden.
 useEffect(() => {
  if (!wantCamera) return
  const element = video.current
  let disposed = false
  let media: MediaStream | null = null
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }).then(stream => {
   if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
   media = stream
   if (!element) return
   element.srcObject = stream
   element.play().catch(() => { if (!disposed) setCameraError('The camera preview could not start. Try again, or take the photo with your phone’s own camera.') })
  }).catch(reason => { if (!disposed) setCameraError(cameraProblem(reason)) })
  return () => {
   disposed = true
   media?.getTracks().forEach(track => track.stop())
   if (element) element.srcObject = null
  }
 }, [wantCamera, attempt])

 useEffect(() => {
  function onKey(event: globalThis.KeyboardEvent) {
   if (event.key !== 'Escape') return
   event.preventDefault()
   if (planOpen) { setPlanOpen(false); planButton.current?.focus() }
   else if (review) setReview(null)
   else if (!uploading) onClose()
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
 }, [planOpen, review, uploading, onClose])

 function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Tab' || !root.current) return
  const items = [...root.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].filter(item => item.getClientRects().length > 0)
  if (!items.length) { event.preventDefault(); return }
  const first = items[0]
  const end = items[items.length - 1]
  const active = document.activeElement
  if (!root.current.contains(active) || (event.shiftKey ? active === first || active === root.current : active === end)) {
   event.preventDefault()
   ;(event.shiftKey ? end : first).focus()
  }
 }

 function discardShot() {
  if (shot && shot.url !== last?.url) dropUrl(shot.url)
  setShot(null)
  setError('')
 }

 function goTo(pointId: number) {
  if (uploading) return
  discardShot()
  setReview(null)
  setPlanOpen(false)
  setPickError('')
  setCurrentId(pointId)
  resume()
 }

 function capture() {
  if (!current || shot || working) return
  const source = video.current
  if (!live || !source || !ready) { cameraInput.current?.click(); return }
  const width = source.videoWidth
  const height = source.videoHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context || !width || !height) return
  context.drawImage(source, 0, 0)
  source.pause()
  const dark = imageLooksDark(canvas, width, height)
  const pointId = current.point.id
  setWorking(true)
  setFlash(count => count + 1)
  setError('')
  setReview(null)
  setPlanOpen(false)
  canvas.toBlob(blob => {
   if (!alive.current) return
   setWorking(false)
   const file = blob && new File([blob], 'photo-' + Date.now() + '.jpg', { type: 'image/jpeg' })
   const problem = file ? validImage(file, MAX_PHOTO_MB) : 'This photo could not be saved. Take it again.'
   if (!file || problem) {
    setError(problem ?? '')
    resume()
    return
   }
   setShot({ pointId, file, url: keepUrl(file), dark })
  }, 'image/jpeg', JPEG_QUALITY)
 }

 function pick(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !current || uploading) return
  const problem = validImage(file, MAX_PHOTO_MB)
  if (problem) { setPickError(problem); return }
  setPickError('')
  discardShot()
  const url = keepUrl(file)
  setShot({ pointId: current.point.id, file, url, dark: false })
  const probe = new Image()
  probe.onload = () => {
   if (!alive.current || !imageLooksDark(probe, probe.naturalWidth, probe.naturalHeight)) return
   setShot(now => now?.url === url ? { ...now, dark: true } : now)
  }
  probe.src = url
 }

 async function keepPhoto() {
  if (!shot || uploading) return
  setUploading(true)
  setError('')
  try {
   const updated = await uploadPhoto(tour.id, shot.pointId, shot.file)
   onChange(updated)
   if (!alive.current) return
   const points = orderedPoints(updated)
   const next = nextIndex(points, points.findIndex(item => item.point.id === shot.pointId))
   if (last) dropUrl(last.url)
   setLast({ pointId: shot.pointId, url: shot.url })
   setTour(updated)
   setVersion(count => count + 1)
   setShot(null)
   setCurrentId(points[next]?.point.id ?? null)
   resume()
  } catch (reason) {
   if (alive.current) setError(reason instanceof Error && reason.message ? reason.message : 'The photo could not be sent. Check your connection and try again.')
  } finally {
   if (alive.current) setUploading(false)
  }
 }

 const counts = photoCounts(tour)
 const total = list.length
 const numberOf = (point: { id: number; seq: number }) => (list.find(item => item.point.id === point.id)?.index ?? point.seq - 1) + 1
 const title = (item: { area: { name: string }; point: { id: number; seq: number } }) => `${item.area.name}, point ${numberOf(item.point)}`

 let body: ReactNode
 if (!current) {
  const complete = total > 0 && counts.taken === total
  body = <div className="cap-finish">
   {complete && <span className="cap-finish-mark"><Icon name="check" size={30} /></span>}
   <h2>{!total ? 'There are no points to photograph yet' : !complete ? 'Some points still need a photo' : total === 1 ? 'Your photo is in' : <>All <span className="num">{total}</span> photos are in</>}</h2>
   <p>{!total ? 'The team is still preparing your capture plan. You will see the points here once it is ready.'
    : !complete ? 'Close the camera and open it again to carry on.'
    : 'The next step is sending them to the team. They look at every photo and tell you if any point needs a retake.'}</p>
   <Button size="lg" autoFocus onClick={onClose}>Done</Button>
  </div>
 } else {
  const { area, point, index } = current
  const retake = isRetake(point)
  const skipTo = nextIndex(list, index)
  const earlier = [...list].reverse().find(item => item.point.hasPhoto && !isRetake(item.point))
  const thumb: Review | null = last
   ? { ...last, title: title(list.find(item => item.point.id === last.pointId) ?? current) }
   : earlier ? { pointId: earlier.point.id, url: photoUrl(tour.id, earlier.point.id, version), title: title(earlier) } : null
  const plan = area.hasPlan ? planUrl(tour.id, area.id) : null
  const frozen = shot ?? review
  const instruction = point.note?.trim() || `Stand on point ${index + 1} and face along the arrow.`

  body = <>
   <div className={'cap-ticks' + (total > 32 ? ' cap-ticks--dense' : '')} role="group" aria-label={`${counts.taken} of ${total} photos taken`}>
    {list.map(item => {
     const state = pointState(item.point)
     const here = item.point.id === point.id
     return <button key={item.point.id} type="button" className={`cap-tick cap-tick--${here ? 'current' : state}`} aria-current={here ? 'step' : undefined}
      aria-label={`Point ${item.index + 1}, ${item.area.name}, ${state === 'taken' ? 'photo taken' : state === 'retake' ? 'needs a retake' : 'to do'}`}
      onClick={() => goTo(item.point.id)}><i /></button>
    })}
   </div>
   <div className="cap-main">
    <div className="cap-view">
     <video ref={video} className={ready && live ? '' : 'is-hidden'} autoPlay muted playsInline disablePictureInPicture
      onLoadedData={() => setReady(true)} onEmptied={() => setReady(false)} />
     {live && ready && !frozen && <span className="cap-level" aria-hidden="true" />}
     {live && !ready && !frozen && <div className="cap-wait"><Spinner label="Opening the camera" /></div>}
     {!live && !frozen && <div className="cap-fallback">
      <Icon name="camera" size={28} />
      <p>{cameraError || 'This browser cannot show a live camera here. Take the photo with your phone’s own camera, or choose one you already took.'}</p>
      <InlineError>{pickError}</InlineError>
      <div className="cap-fallback-actions">
       <Button size="lg" icon="camera" block onClick={() => cameraInput.current?.click()}>Take photo</Button>
       <Button variant="secondary" size="lg" icon="image" block onClick={() => galleryInput.current?.click()}>Choose from gallery</Button>
       {cameraSupported && <Button variant="quiet" onClick={() => { setCameraError(''); setAttempt(count => count + 1) }}>Try the camera again</Button>}
      </div>
     </div>}
     {frozen && <img className="cap-frame" src={frozen.url} alt={shot ? 'The photo you just took' : `Photo of ${review?.title}`} draggable={false} />}
     {flash > 0 && <span key={flash} className="cap-flash" aria-hidden="true" />}
     {shot?.dark && !uploading && <p className="cap-dark" role="status"><Icon name="sun" size={18} />Looks dark — turn on the lights or open the curtains</p>}
     {uploading && <div className="cap-sending"><Spinner label="Sending your photo" /></div>}
     {review && !shot && <p className="cap-caption">{review.title}</p>}
     {planOpen && plan && <div className="cap-sheet">
      <button type="button" className="cap-sheet-plan" autoFocus aria-label="Close the plan" onClick={closePlan}>
       <MiniPlan large src={plan} alt={`Plan of ${area.name}`} points={area.points} currentId={point.id} numberOf={numberOf} />
      </button>
      <p>{area.name}: stand on the amber point <span className="num">{index + 1}</span> and face along its arrow. Tap the plan to close it.</p>
     </div>}
    </div>
    <div className="cap-side">
     <div className="cap-card">
      <div className="cap-card-inner">
       {plan
        ? <button ref={planButton} type="button" className="cap-plan" aria-expanded={planOpen} aria-label={planOpen ? 'Close the plan' : `Open the plan of ${area.name}`}
         onClick={() => setPlanOpen(open => !open)}>
         <MiniPlan src={plan} alt="" points={area.points} currentId={point.id} numberOf={numberOf} />
        </button>
        : <span className="cap-plan cap-plan--none"><MiniPlan src={null} alt="" points={area.points} currentId={point.id} numberOf={numberOf} /></span>}
       <div className="cap-words">
        {retake && <div className="cap-retake">
         {point.hasPhoto && <button type="button" className="cap-rejected" aria-label="Look at the photo the team sent back"
          onClick={() => { if (!shot) setReview({ pointId: point.id, url: photoUrl(tour.id, point.id, version), title: title(current) }) }}>
          <img src={photoUrl(tour.id, point.id, version)} alt="" draggable={false} />
         </button>}
         <p><span className="cap-retake-lead">The team asks for a retake.</span> {point.retakeNote}</p>
        </div>}
        {!retake && point.hasPhoto && <p className="cap-replace">This point already has a photo. A new one replaces it.</p>}
        <p className="cap-instruction">{instruction}</p>
       </div>
      </div>
     </div>
     <div className="cap-bottom">
      {shot ? <div className="cap-bottom-inner cap-bottom-inner--stack">
       <InlineError onRetry={() => void keepPhoto()}>{error}</InlineError>
       <div className="cap-actions">
        <Button variant="secondary" size="lg" icon="retake" disabled={uploading} onClick={() => { discardShot(); resume() }}>Retake</Button>
        <Button size="lg" icon="check" autoFocus loading={uploading} onClick={() => void keepPhoto()}>Use photo</Button>
       </div>
      </div> : review ? <div className="cap-bottom-inner cap-bottom-inner--stack">
       <div className="cap-actions">
        <Button variant="secondary" size="lg" icon="retake" onClick={() => goTo(review.pointId)}>Retake this photo</Button>
        <Button size="lg" icon="camera" autoFocus onClick={() => setReview(null)}>Back to camera</Button>
       </div>
      </div> : <div className="cap-bottom-inner cap-bottom-inner--stack">
       <InlineError>{error}</InlineError>
       <div className="cap-controls">
        {thumb
         ? <button type="button" className="cap-thumb" aria-label={`Look at the last photo: ${thumb.title}`} onClick={() => { setPlanOpen(false); setReview(thumb) }}>
          <img src={thumb.url} alt="" draggable={false} />
         </button>
         : <span className="cap-thumb cap-thumb--empty" aria-hidden="true"><Icon name="image" size={20} /></span>}
        <button type="button" className="cap-shutter" autoFocus aria-label={`Take the photo for point ${index + 1}`}
         disabled={working || (live && !ready)} onClick={capture} />
        <Button variant="quiet" className="cap-skip" disabled={skipTo < 0} onClick={() => goTo(list[skipTo].point.id)}>Skip for now</Button>
       </div>
      </div>}
     </div>
    </div>
   </div>
   <input ref={cameraInput} className="cap-file" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={pick} />
   <input ref={galleryInput} className="cap-file" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={pick} />
  </>
 }

 return createPortal(<div ref={root} className="cap on-dark" role="dialog" aria-modal="true" aria-label={`Capture: ${tour.name}`} tabIndex={-1} onKeyDown={trapFocus}>
  <header className="cap-top">
   <button type="button" className="cap-close" aria-label="Close the camera" disabled={uploading} onClick={onClose}><Icon name="close" size={22} /></button>
   <p className="cap-title" aria-live="polite">
    {current ? <>{current.area.name} <span aria-hidden="true">·</span> Point <span className="num">{current.index + 1}</span> of <span className="num">{total}</span></> : tour.name}
   </p>
   {counts.retakes > 0 && <StatusPill tone="red" dot={false}>{counts.retakes} {counts.retakes === 1 ? 'retake' : 'retakes'}</StatusPill>}
  </header>
  {body}
 </div>, document.body)
}
