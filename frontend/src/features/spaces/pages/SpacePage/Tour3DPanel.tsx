import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, ConfirmDialog, Panel, Spinner } from '../../../../shared/ui'
import { getSpaceTour, getSplats, startSplats, type SpaceTour, type SplatStatus, type TourArea, type TourDetail } from '../../../tours/api/tourRequests'
import SpatialContext, { type SpatialState } from '../../../tours/components/SpatialContext/SpatialContext'
import { entriesOf } from './spaceModel'
import TourEditor from './TourEditor'
import './Tour3DPanel.css'

// three.js loads only when a spatial context is shown.
const SpatialContextViewer = lazy(() => import('../../../tours/components/SpatialContext/SpatialContextViewer'))
/** How often the panel asks again while a 3DGS is being made. */
const SPLAT_POLL_MS = 10_000

type View = '3dgs' | 'spatial'

type CardProps = {
 tour: TourDetail
 area: TourArea
 photoCount: number
 /** The floor's 3DGS: none, being made, failed or made (with the folder the viewer loads). */
 splat: SplatStatus | null
 /** The space's saved teleports, if any: the card's 3DGS then shows them and they work. */
 tourId: string | null
 /** Changes when teleports were edited, so the 3DGS loads them again. */
 version: number
 onEdit: () => void
 /** Starts (or retries) the 3DGS; resolves to an error message, or '' when it started. */
 onGenerate: () => Promise<string>
}

/** What a 3DGS being made says, by step. */
function splatProgress(splat: SplatStatus) {
 if (splat.phase === 'UPLOADING') return splat.total > 0 ? `Sending the photos to Atlas: ${splat.uploaded} of ${splat.total} files` : 'Sending the photos to Atlas…'
 if (splat.phase === 'CONVERTING') return 'Preparing the 3DGS for the viewer…'
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

/** One floor: its 3DGS or spatial context, the switch between them, and the buttons that make or edit them. */
function FloorCard({ tour, area, photoCount, splat, tourId, version, onEdit, onGenerate }: CardProps) {
 const [spatial, setSpatial] = useState<SpatialState>({ frames: null, fresh: [], status: 'LOADING' })
 const onReady = useCallback((state: SpatialState) => setSpatial(state), [])
 const frames = spatial.frames
 const spatialReady = frames !== null && frames.length > 0
 const scene = splat?.scene ?? null
 const making = splat?.status === 'RUNNING'
 const failed = splat?.status === 'FAILED'
 const [view, setView] = useState<View>('3dgs')
 const showing: View = scene ? view : 'spatial'
 const src = tourId
  ? `/tour-viewer/tour.html?tour=${encodeURIComponent(tourId)}&floor=${area.id}`
  : `/tour-viewer/tour.html?scene=${encodeURIComponent(scene ?? '')}&space=${tour.id}&floor=${area.id}`
 const message = spatialMessage(photoCount, spatial.status)
 // Making a 3DGS spends Atlas credits, so it is confirmed first (a retry that only converts again is free).
 const [confirming, setConfirming] = useState(false)
 const [starting, setStarting] = useState(false)
 const [startError, setStartError] = useState('')
 async function generate() {
  setStarting(true); setStartError('')
  const problem = await onGenerate()
  setStarting(false)
  if (problem) setStartError(problem); else setConfirming(false)
 }

 return <article className="panel3d-card" aria-label={area.name}>
  <div className="panel3d-stage on-dark">
   {showing === '3dgs' && scene
    ? <iframe key={`${version}-${scene}`} className="panel3d-splat" title={`3DGS of ${area.name}`} allow="fullscreen; xr-spatial-tracking; pointer-lock" src={src} />
    : spatialReady
    ? <Suspense fallback={<Spinner block label="Loading the spatial context" />}><SpatialContextViewer frames={frames} bare /></Suspense>
    : message
    ? <div className="panel3d-empty" role="status">
     {message.busy && <Spinner size={18} />}
     <p className="panel3d-empty-title">{message.title}</p>
     <p>{message.text}</p>
    </div>
    : <Spinner block label="Loading the spatial context" />}
   {/* A 3DGS being made, or one that failed, says so over whatever the stage shows. */}
   {!scene && making && <p className="panel3d-notice" role="status"><Spinner size={13} /> {splatProgress(splat)}</p>}
   {!scene && failed && <p className="panel3d-notice panel3d-notice--error" role="alert">{splat.error ?? 'Making the 3DGS failed.'}</p>}
  </div>
  {scene && <div className="panel3d-switch" role="group" aria-label="What to show">
   <button type="button" aria-pressed={showing === '3dgs'} onClick={() => setView('3dgs')}>3DGS</button>
   <button type="button" aria-pressed={showing === 'spatial'} onClick={() => setView('spatial')}>Spatial context</button>
  </div>}
  <div className="panel3d-card-body">
   <header className="panel3d-card-head">
    <h3>{area.name}</h3>
    <span className="panel3d-count"><span className="num">{photoCount}</span> {photoCount === 1 ? 'photo' : 'photos'}</span>
   </header>
   {/* One row of buttons, the same height in both views, so the card keeps its size when switching.
       The spatial context stays mounted in the 3DGS view (it loads the frames) but only shows its buttons in its own view. */}
   <div className="panel3d-actions">
    <div className="panel3d-spatial" hidden={!!scene && showing === '3dgs'}>
     <SpatialContext tourId={tour.id} areaId={area.id} photoCount={photoCount} onReady={onReady} canDelete={showing === 'spatial' && !making} />
    </div>
    {scene
     ? showing === '3dgs' && <Button variant="primary" icon="edit" onClick={onEdit}>Edit 3DGS</Button>
     : making
     ? <Button variant="primary" icon="cube" loading disabled>Making 3DGS</Button>
     // No 3DGS yet: it is made from the spatial context, so the button waits for it.
     : photoCount > 0 && <Button variant="primary" icon="cube" disabled={!spatialReady || splat?.configured === false}
      title={!spatialReady ? 'Generate the spatial context first.' : splat?.configured === false ? 'WLT_API_KEY is not set on the server.' : undefined}
      onClick={() => { setStartError(''); setConfirming(true) }}>{failed ? 'TRY AGAIN' : 'GENERATE 3DGS'}</Button>}
   </div>
  </div>

  {confirming && <ConfirmDialog title={splat?.retryFree ? 'Prepare the 3DGS again?' : 'Generate the 3DGS?'}
   confirmLabel={splat?.retryFree ? 'Try again' : 'Generate 3DGS'} busy={starting} busyLabel="Starting…" error={startError}
   onConfirm={() => { void generate() }} onCancel={() => setConfirming(false)}>
   {splat?.retryFree
    ? <p>Atlas already made this 3DGS; only preparing it for the viewer failed. Trying again uses the kept result and spends no Atlas credits.</p>
    : <p>This floor&rsquo;s spatial context ({frames?.length ?? 0} placed photos) goes to World Labs Atlas, which makes the 3DGS.
     It takes about 15 to 30 minutes and spends <strong>5,000 Atlas credits (about $5)</strong>; a failed run is free. It runs on the server, so you can leave this page.</p>}
  </ConfirmDialog>}
 </article>
}

/** Team only: the space's 3D work in one place, a card per floor. */
export default function Tour3DPanel({ tour }: { tour: TourDetail }) {
 const counts = useMemo(() => {
  const entries = entriesOf(tour)
  return Object.fromEntries(tour.areas.map(area => [area.id,
   entries.filter(entry => entry.area.id === area.id && entry.point.hasPhoto).length + (area.photos?.length ?? 0)]))
 }, [tour])
 const [splats, setSplats] = useState<SplatStatus[]>([])
 const anyMaking = splats.some(splat => splat.status === 'RUNNING')
 useEffect(() => {
  let live = true
  let timer: number | undefined
  const load = () => getSplats(tour.id)
   .then(found => { if (!live) return; setSplats(found); if (found.some(splat => splat.status === 'RUNNING')) timer = window.setTimeout(load, SPLAT_POLL_MS) })
   .catch(() => { if (live) timer = window.setTimeout(load, SPLAT_POLL_MS) })
  void load()
  return () => { live = false; window.clearTimeout(timer) }
 }, [tour.id, anyMaking])
 const splatOf = (areaId: number) => splats.find(splat => splat.areaId === areaId) ?? null
 /** Each floor's finished 3DGS, by floor id: what the tour viewer and the teleport editor load. */
 const scenes = useMemo(() => {
  const found: Record<number, string> = {}
  for (const splat of splats) if (splat.scene) found[splat.areaId] = splat.scene
  return found
 }, [splats])
 async function generate(areaId: number) {
  try {
   const started = await startSplats(tour.id, areaId)
   setSplats(current => [...current.filter(splat => splat.areaId !== areaId), started])
   return ''
  } catch (reason) { return reason instanceof Error ? reason.message : 'That did not go through. Please try again.' }
 }
 const [saved, setSaved] = useState<SpaceTour | null>(null)
 const [editing, setEditing] = useState<number | null>(null)
 const [version, setVersion] = useState(0)

 useEffect(() => {
  let live = true
  getSpaceTour(tour.id).then(found => { if (live) setSaved(found) }).catch(() => {})
  return () => { live = false }
 }, [tour.id])

 /** A floor's 3DGS shows the teleports once they are saved for it. */
 const tourIdFor = (areaId: number) => saved && scenes[areaId] ? saved.publicId : null

 return <Panel as="section" padding="none" className="area panel3d" aria-label="3D panel">
  <header className="area-head">
   <div className="area-name"><h2>3D panel</h2></div>
  </header>
  {tour.areas.length === 0
   ? <p className="area-quiet panel3d-none">This space has no floors yet.</p>
   : <div className="panel3d-grid">
    {tour.areas.map(area => <FloorCard key={area.id} tour={tour} area={area} photoCount={counts[area.id] ?? 0} splat={splatOf(area.id)}
     tourId={tourIdFor(area.id)} version={version} onEdit={() => setEditing(area.id)} onGenerate={() => generate(area.id)} />)}
   </div>}
  {editing !== null && <TourEditor tour={tour} areaId={editing} scenes={scenes} saved={saved} onSaved={setSaved}
   onClose={() => { setEditing(null); setVersion(current => current + 1) }} />}
 </Panel>
}
