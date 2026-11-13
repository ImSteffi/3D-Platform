import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import Icon from '../../../../shared/ui/Icon/Icon'
import PlanView from '../../components/PlanView/PlanView'
import {
 deletePhoto, getTourRequest, kindLabels, MAX_POINTS_PER_GROUP, photoUrl, planUrl, reopenPlan, reviewPhotos, saveAreaPoints, saveMarkerSizes, sendPlan,
 statusLabels, type TourArea, type TourDetail, type TourPoint,
} from '../../api/tourRequests'
import '../GenerateTourPage/GeneratePage.css'
import '../TourRequestPage/TourRequests.css'

type DraftPoint = { key: string; x: number; y: number; direction: number; note: string }
type AreaDraft = { captureGroup: number; points: DraftPoint[]; dirty: boolean }

const toDraft = (area: TourArea): AreaDraft => ({
 captureGroup: area.captureGroup, dirty: false,
 points: area.points.map(point => ({ key: 'p' + point.id, x: point.x, y: point.y, direction: point.direction, note: point.note ?? '' })),
})
const toDrafts = (tour: TourDetail) => Object.fromEntries(tour.areas.map(area => [area.id, toDraft(area)])) as Record<number, AreaDraft>
const pointState = (point: TourPoint) => point.retakeNote ? 'retake' : point.hasPhoto ? 'done' : 'pending'
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'

export default function AdminTourRequestPage() {
 const id = Number(useParams().tourId)
 const [tour, setTour] = useState<TourDetail | null>(null)
 const [drafts, setDrafts] = useState<Record<number, AreaDraft>>({})
 const [selected, setSelected] = useState<{ areaId: number; key: string } | null>(null)
 const [retakes, setRetakes] = useState<Record<number, string>>({})
 const [loadError, setLoadError] = useState('')
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const nextKey = useRef(0)
 // Slider positions while dragging; the value is saved to the plan when the slider is released.
 const [sizing, setSizing] = useState<Record<number, { dot: number; line: number }>>({})
 const sizeOf = (area: TourArea) => sizing[area.id] ?? { dot: area.dotSize, line: area.lineLength }
 function commitSizes(area: TourArea) {
  const size = sizing[area.id]
  if (!size || (size.dot === area.dotSize && size.line === area.lineLength)) return
  setError('')
  saveMarkerSizes(id, area.id, size.dot, size.line).then(updated => {
   setTour(updated)
   setSizing(current => { const next = { ...current }; delete next[area.id]; return next })
  }).catch(reason => setError(message(reason)))
 }
 function sizeSliders(area: TourArea) {
  const size = sizeOf(area)
  const slider = (label: string, field: 'dot' | 'line', min: number, max: number) => <label className="tr-field">{label}: {size[field]}
   <input type="range" min={min} max={max} step={1} value={size[field]}
    onChange={event => setSizing(current => ({ ...current, [area.id]: { ...size, [field]: Number(event.target.value) } }))}
    onPointerUp={() => commitSizes(area)} onKeyUp={() => commitSizes(area)} onBlur={() => commitSizes(area)} />
  </label>
  return <div className="tr-editor-row">{slider('Circle width', 'dot', 8, 40)}{slider('Line length', 'line', 10, 80)}</div>
 }
 useEffect(() => {
  let active = true
  getTourRequest(id).then(loaded => { if (active) { setTour(loaded); setDrafts(toDrafts(loaded)) } })
   .catch(reason => { if (active) setLoadError(message(reason)) })
  return () => { active = false }
 }, [id])

 async function run(action: () => Promise<TourDetail>, after?: (updated: TourDetail) => void) {
  if (busy) return
  setBusy(true); setError('')
  try {
   const updated = await action()
   setTour(updated)
   after?.(updated)
  } catch (reason) { setError(message(reason)) }
  finally { setBusy(false) }
 }
 function edit(areaId: number, change: (draft: AreaDraft) => Partial<AreaDraft>) {
  setDrafts(current => ({ ...current, [areaId]: { ...current[areaId], ...change(current[areaId]), dirty: true } }))
 }
 function editPoint(areaId: number, key: string, change: Partial<DraftPoint>) {
  edit(areaId, draft => ({ points: draft.points.map(point => point.key === key ? { ...point, ...change } : point) }))
 }
 function addPoint(areaId: number, x: number, y: number, direction = 0) {
  const key = 'n' + nextKey.current++
  edit(areaId, draft => ({ points: [...draft.points, { key, x, y, direction, note: '' }] }))
  setSelected({ areaId, key })
 }
 function save(area: TourArea) {
  const draft = drafts[area.id]
  void run(() => saveAreaPoints(id, area.id, draft.captureGroup, draft.points.map(point => ({
   x: point.x, y: point.y, direction: point.direction, note: point.note.trim() || null,
  }))), updated => {
   const saved = updated.areas.find(candidate => candidate.id === area.id)
   if (saved) setDrafts(current => ({ ...current, [area.id]: toDraft(saved) }))
   setSelected(null)
  })
 }

 if (loadError) return <main className="dashboard"><p className="page-message" role="alert">{loadError}</p></main>
 if (!tour) return <main className="dashboard"><p className="page-message" role="status">Loading tour request…</p></main>

 const planning = tour.status === 'SUBMITTED'
 const reviewing = tour.status === 'PHOTOS_SUBMITTED'
 const groupTotals: Record<number, number> = {}
 for (const area of tour.areas) {
  const draft = drafts[area.id]
  if (draft) groupTotals[draft.captureGroup] = (groupTotals[draft.captureGroup] ?? 0) + draft.points.length
 }
 const anyDirty = tour.areas.some(area => drafts[area.id]?.dirty)
 const anyEmpty = tour.areas.some(area => !drafts[area.id]?.points.length)
 const anyOver = Object.values(groupTotals).some(total => total > MAX_POINTS_PER_GROUP)
 const filledRetakes = Object.entries(retakes).map(([pointId, note]) => ({ pointId: Number(pointId), note: note.trim() })).filter(retake => retake.note)
 const allPoints = tour.areas.flatMap(area => area.points)

 return <main className="dashboard tr-page">
  <header className="generate-detail-heading">
   <Link to="/tour-requests" className="generate-back" aria-label="Back to tour requests"><Icon name="arrow" size={24} /></Link>
   <h1>{tour.name}</h1>
  </header>
  <p className="tr-lede" style={{ marginTop: 16 }}>{tour.ownerName} · {tour.ownerEmail} · {statusLabels[tour.status]}{tour.notes ? ' · ' + tour.notes : ''}</p>
  {planning && <div className="tr-banner"><h2>Mark the capture points</h2><p>Click a plan to add a point. Drag the dot to move it and drag the black line to turn the camera, or type the degrees. Each line is one photo, up to {MAX_POINTS_PER_GROUP} per floor plan.</p></div>}
  {reviewing && <div className="tr-banner"><h2>Review the photos</h2><p>Approve them, or write a note on each photo that has to be retaken and send those back to the client. Removing a photo also sends the request back to the client.</p></div>}
  {tour.status === 'PLAN_READY' && <div className="tr-banner"><h2>Waiting for the client's photos</h2><p>{allPoints.filter(point => point.hasPhoto && !point.retakeNote).length} of {allPoints.length} photos uploaded.</p>
   <div className="tr-footer">
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { void run(() => reopenPlan(id), updated => setDrafts(toDrafts(updated))) }}>Edit plan</button>
    <span className="tr-footer-note">The client cannot upload until you send the plan again. Photos stay on points you leave unchanged.</span>
   </div></div>}
  {tour.status === 'APPROVED' && <div className="tr-banner tr-banner--good"><h2>Photos approved</h2><p>These photos are ready for generation.</p></div>}
  {error && <p className="tr-error" role="alert">{error}</p>}

  <div className="tr-areas">{tour.areas.map(area => {
   const draft = drafts[area.id]
   const src = planUrl(tour.id, area.id)
   const title = <div><h3>{area.name}</h3><small>{kindLabels[area.kind]}</small></div>
   if (planning && draft) {
    const current = selected?.areaId === area.id ? draft.points.find(point => point.key === selected.key) : undefined
    const total = groupTotals[draft.captureGroup] ?? 0
    return <section key={area.id} className="tr-area" aria-label={area.name}>
     <div className="tr-area-head">{title}
      <div className="tr-area-actions"><button type="button" className="btn btn-primary" disabled={busy || !draft.dirty} onClick={() => save(area)}>{draft.dirty ? 'Save area' : 'Saved'}</button></div>
     </div>
     <div className="tr-area-body">
      <PlanView src={src} alt={'Floor plan of ' + area.name} selected={current?.key ?? null} dotSize={sizeOf(area).dot} lineLength={sizeOf(area).line}
       markers={draft.points.map((point, index) => ({ key: point.key, label: index + 1, x: point.x, y: point.y, direction: point.direction }))}
       onSelect={key => setSelected({ areaId: area.id, key: String(key) })}
       onPlanClick={(x, y) => addPoint(area.id, x, y)}
       onMove={(key, x, y) => editPoint(area.id, String(key), { x, y })}
       onRotate={(key, direction) => editPoint(area.id, String(key), { direction })} />
      <div className="tr-editor">
       {sizeSliders(area)}
       <p className={'tr-count' + (total > MAX_POINTS_PER_GROUP ? ' tr-danger' : '')}>{draft.points.length} / {MAX_POINTS_PER_GROUP} photos</p>
       {current ? <div className="tr-selected">
        <label className="tr-field" aria-label="Direction slider">
         <input type="range" min={0} max={359} step={1} value={current.direction} onChange={event => editPoint(area.id, current.key, { direction: Number(event.target.value) })} />
        </label>
        <div className="tr-area-actions">
         <button type="button" className="btn btn-ghost" disabled={draft.points.length >= MAX_POINTS_PER_GROUP} onClick={() => addPoint(area.id, current.x, current.y, (current.direction + 90) % 360)}>Add another direction here</button>
         <button type="button" className="btn btn-ghost tr-danger" onClick={() => {
          edit(area.id, value => ({ points: value.points.filter(point => point.key !== current.key) }))
          setSelected(null)
         }}>Delete</button>
        </div>
       </div> : <p className="tr-count">{draft.points.length ? 'Select a point to edit it, or click the plan to add another.' : 'Click the plan to add the first point.'}</p>}
      </div>
     </div>
    </section>
   }
   return <section key={area.id} className="tr-area" aria-label={area.name}>
    <div className="tr-area-head">{title}<small>{area.points.length} {area.points.length === 1 ? 'photo' : 'photos'}</small></div>
    <div className="tr-area-body tr-area-body--single">
     {sizeSliders(area)}
     <PlanView src={src} alt={'Floor plan of ' + area.name} dotSize={sizeOf(area).dot} lineLength={sizeOf(area).line}
      markers={area.points.map(point => ({ key: point.id, label: point.seq, x: point.x, y: point.y, direction: point.direction, state: pointState(point) }))} />
    </div>
    {area.points.some(point => point.hasPhoto) && <ul className="tr-review-grid">{area.points.filter(point => point.hasPhoto).map(point => <li key={point.id} className="tr-review-item">
     <a href={photoUrl(tour.id, point.id)} target="_blank" rel="noreferrer"><img src={photoUrl(tour.id, point.id)} alt={'Photo for point ' + point.seq} loading="lazy" /></a>
     <p><strong>Photo {point.seq}</strong></p>
     {(reviewing || tour.status === 'PLAN_READY') && <button type="button" className="btn btn-ghost tr-danger" disabled={busy} onClick={() => { void run(() => deletePhoto(tour.id, point.id)) }}>Remove photo</button>}
     {point.retakeNote && <p className="tr-danger">Retake requested: {point.retakeNote}</p>}
     {reviewing && <label className="tr-field">Retake note
      <input value={retakes[point.id] ?? ''} maxLength={500} placeholder="Leave empty if the photo is fine" onChange={event => setRetakes(current => ({ ...current, [point.id]: event.target.value }))} />
     </label>}
    </li>)}</ul>}
   </section>
  })}</div>

  {planning && <div className="tr-footer">
   <button type="button" className="btn btn-primary" disabled={busy || anyDirty || anyEmpty || anyOver} onClick={() => { void run(() => sendPlan(id)) }}>Send plan to client</button>
   <span className="tr-footer-note">{anyDirty ? 'Save every area first.' : anyEmpty ? 'Every area needs at least one point.' : anyOver ? `A floor plan has more than ${MAX_POINTS_PER_GROUP} photos.` : 'The client will be able to upload photos.'}</span>
  </div>}
  {reviewing && <div className="tr-footer">
   <button type="button" className="btn btn-primary" disabled={busy || filledRetakes.length > 0} onClick={() => { void run(() => reviewPhotos(id, true, [])) }}>Approve photos</button>
   <button type="button" className="btn btn-ghost" disabled={busy || !filledRetakes.length} onClick={() => { void run(() => reviewPhotos(id, false, filledRetakes), () => setRetakes({})) }}>Request {filledRetakes.length || ''} {filledRetakes.length === 1 ? 'retake' : 'retakes'}</button>
  </div>}
 </main>
}
