import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Panel, Spinner } from '../../../../shared/ui'
import { getSpaceTour, type SpaceTour, type TourArea, type TourDetail } from '../../../tours/api/tourRequests'
import SpatialContext, { type SpatialState } from '../../../tours/components/SpatialContext/SpatialContext'
import { entriesOf } from './spaceModel'
import TourEditor from './TourEditor'
import './Tour3DPanel.css'

// three.js loads only when a spatial context is shown.
const SpatialContextViewer = lazy(() => import('../../../tours/components/SpatialContext/SpatialContextViewer'))

/**
 * TEST ONLY: there is no 3DGS generation yet. In the local dev build every floor with a finished spatial context acts
 * as if its 3DGS were made and gets one of the test scenes in frontend/public/dev-scenes (git-ignored, so production never has them), in turn.
 * A production build has no 3DGS anywhere. Replace with the floor's real 3DGS once generation is connected.
 */
const testScenes = import.meta.env.DEV ? ['/dev-scenes/fred', '/dev-scenes/alex', '/dev-scenes/my-room'] : []
const sceneFor = (index: number): string | null => testScenes.length ? testScenes[index % testScenes.length] : null

type View = '3dgs' | 'spatial'

type CardProps = {
 tour: TourDetail
 area: TourArea
 photoCount: number
 scene: string | null
 /** The space's saved teleports, if any: the card's 3DGS then shows them and they work. */
 tourId: string | null
 /** Changes when teleports were edited, so the 3DGS loads them again. */
 version: number
 onEdit: () => void
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
function FloorCard({ tour, area, photoCount, scene, tourId, version, onEdit }: CardProps) {
 const [spatial, setSpatial] = useState<SpatialState>({ frames: null, fresh: [], status: 'LOADING' })
 const onReady = useCallback((state: SpatialState) => setSpatial(state), [])
 const frames = spatial.frames
 const spatialReady = frames !== null && frames.length > 0
 const [view, setView] = useState<View>(scene ? '3dgs' : 'spatial')
 const showing: View = scene ? view : 'spatial'
 const src = tourId
  ? `/tour-viewer/tour.html?tour=${encodeURIComponent(tourId)}&floor=${area.id}`
  : `/tour-viewer/tour.html?scene=${encodeURIComponent(scene ?? '')}&space=${tour.id}&floor=${area.id}`
 // GENERATE 3DGS is not connected yet: a click says so instead of doing nothing.
 const [notice, setNotice] = useState('')
 useEffect(() => {
  if (!notice) return
  const timer = setTimeout(() => setNotice(''), 3500)
  return () => clearTimeout(timer)
 }, [notice])
 const message = spatialMessage(photoCount, spatial.status)

 return <article className="panel3d-card" aria-label={area.name}>
  <div className="panel3d-stage on-dark">
   {showing === '3dgs' && scene
    ? <iframe key={version} className="panel3d-splat" title={`3DGS of ${area.name}`} allow="fullscreen; xr-spatial-tracking; pointer-lock" src={src} />
    : spatialReady
    ? <Suspense fallback={<Spinner block label="Loading the spatial context" />}><SpatialContextViewer frames={frames} bare /></Suspense>
    : message
    ? <div className="panel3d-empty" role="status">
     {message.busy && <Spinner size={18} />}
     <p className="panel3d-empty-title">{message.title}</p>
     <p>{message.text}</p>
    </div>
    : <Spinner block label="Loading the spatial context" />}
   {notice && <p className="panel3d-notice" role="status">{notice}</p>}
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
     <SpatialContext tourId={tour.id} areaId={area.id} photoCount={photoCount} onReady={onReady} canDelete={showing === 'spatial'} />
    </div>
    {scene
     ? showing === '3dgs' && <Button variant="primary" icon="edit" onClick={onEdit}>Edit 3DGS</Button>
     // No 3DGS yet: it is made from the spatial context, so the button waits for it. Not connected to Atlas yet.
     : photoCount > 0 && <Button variant="primary" icon="cube" disabled={!spatialReady}
      title={spatialReady ? undefined : 'Generate the spatial context first.'}
      onClick={() => setNotice('3DGS generation is not connected yet.')}>GENERATE 3DGS</Button>}
   </div>
  </div>
 </article>
}

/** Team only: the space's 3D work in one place, a card per floor. */
export default function Tour3DPanel({ tour }: { tour: TourDetail }) {
 const counts = useMemo(() => {
  const entries = entriesOf(tour)
  return Object.fromEntries(tour.areas.map(area => [area.id,
   entries.filter(entry => entry.area.id === area.id && entry.point.hasPhoto).length + (area.photos?.length ?? 0)]))
 }, [tour])
 const scenes = useMemo(() => {
  const found: Record<number, string> = {}
  // A 3DGS is made from the spatial context, so only floors whose spatial context is ready pretend to have one.
  tour.areas.forEach((area, index) => { const scene = sceneFor(index); if (scene && area.spatialReady) found[area.id] = scene })
  return found
 }, [tour.areas])
 const [saved, setSaved] = useState<SpaceTour | null>(null)
 const [editing, setEditing] = useState<number | null>(null)
 const [version, setVersion] = useState(0)

 useEffect(() => {
  let live = true
  getSpaceTour(tour.id).then(found => { if (live) setSaved(found) }).catch(() => {})
  return () => { live = false }
 }, [tour.id])

 /** A floor's 3DGS shows the teleports once they are saved for it. */
 const tourIdFor = (areaId: number) => saved && saved.definition.scenes[String(areaId)] ? saved.publicId : null

 return <Panel as="section" padding="none" className="area panel3d" aria-label="3D panel">
  <header className="area-head">
   <div className="area-name"><h2>3D panel</h2></div>
  </header>
  {tour.areas.length === 0
   ? <p className="area-quiet panel3d-none">This space has no floors yet.</p>
   : <div className="panel3d-grid">
    {tour.areas.map(area => <FloorCard key={area.id} tour={tour} area={area} photoCount={counts[area.id] ?? 0} scene={scenes[area.id] ?? null}
     tourId={tourIdFor(area.id)} version={version} onEdit={() => setEditing(area.id)} />)}
   </div>}
  {editing !== null && <TourEditor tour={tour} areaId={editing} scenes={scenes} saved={saved} onSaved={setSaved}
   onClose={() => { setEditing(null); setVersion(current => current + 1) }} />}
 </Panel>
}
