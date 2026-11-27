import { lazy, Suspense, useCallback, useState } from 'react'
import { Button, ConfirmDialog, Spinner } from '../../../../shared/ui'
import { splatDownloadUrl, type SplatStatus, type TourArea, type TourDetail } from '../../../tours/api/tourRequests'
import SpatialContext, { type SpatialState } from '../../../tours/components/SpatialContext/SpatialContext'
import type { ConvertWhat } from './splatConvert'
import FloorMenu from './FloorMenu'
import SharePanel from './SharePanel'
import './Tour3DPanel.css'

// three.js loads only when a spatial context is shown.
const SpatialContextViewer = lazy(() => import('../../../tours/components/SpatialContext/SpatialContextViewer'))

type View = '3dgs' | 'spatial'
/** A conversion running in this browser: which floor, what it makes, and the step it is on. */
export type Converting = { areaId: number; what: ConvertWhat; step: string }

type CardProps = {
 tour: TourDetail
 area: TourArea
 photoCount: number
 /** The floor's 3DGS: none, being made, failed, made (Atlas's file stored), visible (sogReady) or walkable (voxelsReady). */
 splat: SplatStatus | null
 /** This floor's conversion running in this browser, if any; another floor's blocks starting one here. */
 converting: Converting | null
 busyElsewhere: boolean
 /** The last conversion of this floor that failed, with what it was making. */
 convertError: { what: ConvertWhat; message: string } | null
 /** The space's saved teleports, if any: the card's 3DGS then shows them and they work. */
 tourId: string | null
 /** Changes when teleports were edited, so the 3DGS loads them again. */
 version: number
 onEdit: () => void
 /** Starts (or retries) the 3DGS at Atlas; resolves to an error message, or '' when it started. */
 onGenerate: () => Promise<string>
 onConvert: (what: ConvertWhat) => void
}

/** What a 3DGS being made says, by step. */
function splatProgress(splat: SplatStatus) {
 if (splat.phase === 'UPLOADING') return splat.total > 0 ? `Sending the photos to Atlas: ${splat.uploaded} of ${splat.total} files` : 'Sending the photos to Atlas…'
 if (splat.phase === 'STORING') return 'Fetching the 3DGS from Atlas…'
 return 'Atlas is making the 3DGS. This takes about 15 to 30 minutes.'
}

/** What the stage says while it has no point cloud to show. */
function spatialMessage(photoCount: number, status: SpatialState['status']) {
 if (photoCount === 0) return { title: 'No photos on this floor yet', text: 'Add them under Floor plans, then generate the spatial context here.' }
 if (status === 'LOADING') return null
 if (status === 'RUNNING') return { title: 'Making the spatial context…', text: 'This runs on the server. You can leave this page.', busy: true }
 if (status === 'FAILED') return { title: 'The spatial context failed', text: 'Try again with the button below.' }
 return { title: 'No spatial context yet', text: 'Generate it with the button below. The 3DGS is made from it.' }
}

/** One floor's 3D, inside its floor card: the 3DGS or spatial context, the switch between them, and the buttons that make or edit them. */
export default function Floor3DCard({ tour, area, photoCount, splat, converting, busyElsewhere, convertError, tourId, version, onEdit, onGenerate, onConvert }: CardProps) {
 const [spatial, setSpatial] = useState<SpatialState>({ frames: null, fresh: [], status: 'LOADING' })
 const onReady = useCallback((state: SpatialState) => setSpatial(state), [])
 const frames = spatial.frames
 const spatialReady = frames !== null && frames.length > 0
 const scene = splat?.scene ?? null
 const making = splat?.status === 'RUNNING'
 const failed = splat?.status === 'FAILED'
 /** Atlas's 3DGS is stored, but this browser has not made the viewer's file yet. */
 const awaitingSog = splat?.status === 'SUCCEEDED' && !splat.sogReady
 const walkable = !!splat?.voxelsReady
 const [view, setView] = useState<View>('3dgs')
 const [sharing, setSharing] = useState(false)
 const showing: View = scene ? view : 'spatial'
 const src = tourId
  ? `/tour-viewer/tour.html?tour=${encodeURIComponent(tourId)}&floor=${area.id}`
  : `/tour-viewer/tour.html?scene=${encodeURIComponent(scene ?? '')}&space=${tour.id}&floor=${area.id}`
 const message = spatialMessage(photoCount, spatial.status)
 // Making a 3DGS spends Atlas credits, so it is confirmed first (fetching a finished result again is free).
 const [confirming, setConfirming] = useState(false)
 const [starting, setStarting] = useState(false)
 const [startError, setStartError] = useState('')
 async function generate() {
  setStarting(true); setStartError('')
  const problem = await onGenerate()
  setStarting(false)
  if (problem) setStartError(problem); else setConfirming(false)
 }

 // What the stage says on top of its picture: the 3DGS being made, converted in this browser, or failing.
 const notice = converting ? { text: converting.step, busy: true }
  : making && splat ? { text: splatProgress(splat), busy: true }
  : awaitingSog && !convertError ? { text: busyElsewhere ? 'Waiting for the other floor to finish preparing…' : 'Preparing the 3DGS for the viewer…', busy: true }
  : convertError ? { text: convertError.message, error: true }
  : failed && splat ? { text: splat.error ?? 'Making the 3DGS failed.', error: true }
  : null

 let action = null
 if (scene && showing === 'spatial') action = null
 else if (converting?.what === 'voxels') action = <Button variant="primary" icon="cube" loading disabled>Generating voxels</Button>
 else if (scene && walkable) action = <Button variant="primary" icon="edit" onClick={onEdit}>Edit 3DGS</Button>
 // Visible in fly mode; the voxels add walking and teleports.
 else if (scene) action = <Button variant="primary" icon="cube" disabled={busyElsewhere} title={busyElsewhere ? 'Another floor is being converted in this browser.' : undefined}
  onClick={() => onConvert('voxels')}>{convertError?.what === 'voxels' ? 'TRY VOXELS AGAIN' : 'GENERATE VOXELS'}</Button>
 else if (awaitingSog) action = convertError
  ? <Button variant="primary" icon="cube" disabled={busyElsewhere} onClick={() => onConvert('sog')}>TRY AGAIN</Button>
  : <Button variant="primary" icon="cube" loading disabled>Preparing 3DGS</Button>
 else if (making) action = <Button variant="primary" icon="cube" loading disabled>Making 3DGS</Button>
 // No 3DGS yet: it is made from the spatial context, so the button waits for it.
 else if (photoCount > 0) action = <Button variant="primary" icon="cube" disabled={!spatialReady || splat?.configured === false}
  title={!spatialReady ? 'Generate the spatial context first.' : splat?.configured === false ? 'WLT_API_KEY is not set on the server.' : undefined}
  onClick={() => { setStartError(''); setConfirming(true) }}>{failed ? 'TRY AGAIN' : 'GENERATE 3DGS'}</Button>

 return <article className="panel3d-card" aria-label={area.name}>
  <div className="panel3d-stage on-dark">
   {showing === '3dgs' && scene
    ? <iframe key={`${version}-${scene}-${walkable}`} className="panel3d-splat" title={`3DGS of ${area.name}`} allow="fullscreen; xr-spatial-tracking; pointer-lock" src={src} />
    : spatialReady
    ? <Suspense fallback={<Spinner block label="Loading the spatial context" />}><SpatialContextViewer frames={frames} bare /></Suspense>
    : message
    ? <div className="panel3d-empty" role="status">
     {message.busy && <Spinner size={18} />}
     <p className="panel3d-empty-title">{message.title}</p>
     <p>{message.text}</p>
    </div>
    : <Spinner block label="Loading the spatial context" />}
   {notice && (!scene || showing === '3dgs') && <p className={`panel3d-notice${notice.error ? ' panel3d-notice--error' : ''}`} role={notice.error ? 'alert' : 'status'}>
    {notice.busy && <Spinner size={13} />} {notice.text}
   </p>}
   {scene && !walkable && showing === '3dgs' && !notice && <p className="panel3d-badge">Fly mode: no voxels yet</p>}
  </div>
  {scene && <div className="panel3d-switch" role="group" aria-label="What to show">
   <button type="button" aria-pressed={showing === '3dgs'} onClick={() => setView('3dgs')}>3DGS</button>
   <button type="button" aria-pressed={showing === 'spatial'} onClick={() => setView('spatial')}>Spatial context</button>
  </div>}
  <div className="panel3d-card-body">
   {/* One row of buttons, the same height in both views, so the card keeps its size when switching.
       The spatial context stays mounted in the 3DGS view (it loads the frames) but only shows its buttons in its own view. */}
   <div className="panel3d-actions">
    <div className="panel3d-spatial" hidden={!!scene && showing === '3dgs'}>
     <SpatialContext tourId={tour.id} areaId={area.id} photoCount={photoCount} onReady={onReady} canDelete={showing === 'spatial' && !making} />
    </div>
    {action}
    {scene && showing === '3dgs' && <Button variant="secondary" icon="share" aria-expanded={sharing} onClick={() => setSharing(open => !open)}>Share</Button>}
    {/* The team only (this card is never shown to customers): the floor's 3DGS as files. */}
    {splat?.status === 'SUCCEEDED' && showing === '3dgs' && <FloorMenu label={`Download the 3DGS of ${area.name}`} text="Download 3DGS" up>
     <Button variant="quiet" href={splatDownloadUrl(tour.id, area.id, 'raw')} download>3DGS raw (.spz)</Button>
     {walkable
      ? <Button variant="quiet" href={splatDownloadUrl(tour.id, area.id, 'collisions')} download>3DGS with collisions (.zip)</Button>
      : <Button variant="quiet" disabled title="Generate the voxels first.">3DGS with collisions: no voxels yet</Button>}
    </FloorMenu>}
    {scene && showing === '3dgs' && sharing && <SharePanel url={new URL(src, window.location.origin).href} name={area.name} />}
   </div>
  </div>

  {confirming && <ConfirmDialog title={splat?.retryFree ? 'Fetch the 3DGS again?' : 'Generate the 3DGS?'}
   confirmLabel={splat?.retryFree ? 'Try again' : 'Generate 3DGS'} busy={starting} busyLabel="Starting…" error={startError}
   onConfirm={() => { void generate() }} onCancel={() => setConfirming(false)}>
   {splat?.retryFree
    ? <p>Atlas already made this 3DGS; only fetching it failed. Trying again fetches it again and spends no Atlas credits.</p>
    : <p>This floor&rsquo;s spatial context ({frames?.length ?? 0} placed photos) goes to World Labs Atlas, which makes the 3DGS.
     It takes about 15 to 30 minutes and spends <strong>5,000 Atlas credits (about $5)</strong>; a failed run is free. It runs on the server, so you can leave this page.</p>}
  </ConfirmDialog>}
 </article>
}

