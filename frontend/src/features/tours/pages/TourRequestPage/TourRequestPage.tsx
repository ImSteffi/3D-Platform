import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import ConfirmDialog from '../../../../shared/ui/ConfirmDialog/ConfirmDialog'
import Icon from '../../../../shared/ui/Icon/Icon'
import PhotoCamera from '../../components/PhotoCamera/PhotoCamera'
import PlanSketcher from '../../components/PlanSketcher/PlanSketcher'
import { forgetSketch, loadSketch, sketchKey } from '../../components/PlanSketcher/sketchStorage'
import PlanView, { type PlanMarker } from '../../components/PlanView/PlanView'
import {
 addArea, deletePhoto, deleteTourRequest, getTourRequest, imageAccept, kindLabels, photoUrl, planUrl, removeArea,
 submitPhotos, submitTourRequest, uploadPhoto, uploadPlan, validImage,
 type AreaKind, type TourArea, type TourDetail, type TourPoint, type TourStatus,
} from '../../api/tourRequests'
import '../GenerateTourPage/GeneratePage.css'
import '../GenerateTourPage/TourInput.css'
import './TourRequests.css'

const steps = ['Floor plans', 'Capture plan', 'Photos', 'Review']
const stepOf: Record<TourStatus, number> = { DRAFT: 0, SUBMITTED: 1, PLAN_READY: 2, PHOTOS_SUBMITTED: 3, APPROVED: 4 }
const pointState = (point: TourPoint) => point.retakeNote ? 'retake' : point.hasPhoto ? 'done' : 'pending'
const markers = (area: TourArea): PlanMarker[] => area.points.map(point => ({
 key: point.id, label: point.seq, x: point.x, y: point.y, direction: point.direction, state: pointState(point),
}))
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'

type Run = (action: () => Promise<TourDetail>, changesImages?: boolean) => Promise<boolean>
type StepProps = { tour: TourDetail; version: number; busy: boolean; run: Run; fail: (text: string) => void; apply: (tour: TourDetail) => void }

function FileButton({ label, multiple, disabled, onFiles }: { label: string; multiple?: boolean; disabled: boolean; onFiles: (files: File[]) => void }) {
 return <label className={'btn btn-ghost tr-upload' + (disabled ? ' is-disabled' : '')}>
  <input type="file" accept={imageAccept} multiple={multiple} disabled={disabled} onChange={event => {
   const files = Array.from(event.target.files ?? [])
   event.target.value = ''
   if (files.length) onFiles(files)
  }} />
  {label}
 </label>
}

function DraftStep({ tour, version, busy, run, fail }: StepProps) {
 const [name, setName] = useState('')
 const [kind, setKind] = useState<AreaKind>('FLOOR')
 const [sketching, setSketching] = useState<TourArea | null>(null)
 const ready = tour.areas.length > 0 && tour.areas.every(area => area.hasPlan)
 async function add(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (!name.trim()) return
  if (await run(() => addArea(tour.id, name.trim(), kind))) setName('')
 }
 function plan(area: TourArea, file: File) {
  const problem = validImage(file, 20)
  if (problem) fail(problem)
  else void run(() => uploadPlan(tour.id, area.id, file), true)
 }
 return <>
  <p className="tr-lede">Add one area for every floor, separate building or outdoor space, then upload or draw a floor plan for each. We use the plans to mark exactly where you should take photos.</p>
  <form className="tr-form" onSubmit={add}>
   <label className="tr-field">Area name
    <input value={name} maxLength={100} placeholder="e.g. Ground floor, Basement, Shed" onChange={event => setName(event.target.value)} />
   </label>
   <label className="tr-field">Type
    <select value={kind} onChange={event => setKind(event.target.value as AreaKind)}>
     {(Object.keys(kindLabels) as AreaKind[]).map(key => <option key={key} value={key}>{kindLabels[key]}</option>)}
    </select>
   </label>
   <button type="submit" className="btn btn-ghost" disabled={busy || !name.trim() || tour.areas.length >= 20}><Icon name="plus" size={16} />Add area</button>
  </form>
  {!tour.areas.length && <div className="empty-state"><Icon name="planner" size={28} /><h3>No areas yet</h3><p>Start with the main floor of the property.</p></div>}
  <div className="tr-areas">{tour.areas.map(area => <section key={area.id} className="tr-area" aria-label={area.name}>
   <div className="tr-area-head">
    <div><h3>{area.name}</h3><small>{kindLabels[area.kind]}</small></div>
    <div className="tr-area-actions">
     {area.hasPlan && <FileButton label="Replace plan" disabled={busy} onFiles={files => plan(area, files[0])} />}
     {area.hasPlan && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setSketching(area)}>{loadSketch(sketchKey(area.id)).length ? 'Edit drawing' : 'Draw instead'}</button>}
     <button type="button" className="btn btn-ghost tr-danger" disabled={busy} onClick={() => {
      void run(() => removeArea(tour.id, area.id)).then(removed => { if (removed) forgetSketch(sketchKey(area.id)) })
     }}>Remove</button>
    </div>
   </div>
   <div className="tr-area-body tr-area-body--single">
    {area.hasPlan ? <PlanView src={planUrl(tour.id, area.id, version)} alt={'Floor plan of ' + area.name} /> : <div className="tr-plan-empty">
     <Icon name="upload" size={26} />
     <p>Upload a floor plan as a JPG, PNG or WebP image. A clear photo of a hand-drawn sketch is fine — mark the rooms, doors and stairs.</p>
     <div className="tr-plan-choices">
      <FileButton label="Upload floor plan" disabled={busy} onFiles={files => plan(area, files[0])} />
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setSketching(area)}>Draw it here</button>
     </div>
    </div>}
   </div>
  </section>)}</div>
  <div className="tr-footer">
   <button type="button" className="btn btn-primary" disabled={busy || !ready} onClick={() => { void run(() => submitTourRequest(tour.id)) }}>Send for capture plan</button>
   {!ready && <span className="tr-footer-note">{tour.areas.length ? 'Every area needs a floor plan first.' : 'Add at least one area first.'}</span>}
  </div>
  {sketching && <PlanSketcher key={sketching.id} title={sketching.name} storageKey={sketchKey(sketching.id)}
   onSave={file => run(() => uploadPlan(tour.id, sketching.id, file), true)} onClose={() => setSketching(null)} />}
 </>
}

const needsPhoto = (point: TourPoint) => !point.hasPhoto || !!point.retakeNote

function PhotosStep({ tour, version, busy, run, fail, apply }: StepProps) {
 const [activeId, setActiveId] = useState<number | null>(null)
 const [selected, setSelected] = useState<number | null>(null)
 const [filming, setFilming] = useState(false)
 const [dragging, setDragging] = useState(false)
 // Points whose photo is still uploading, so the next photo goes to the next point.
 const [claimed, setClaimed] = useState<number[]>([])
 const queue = useRef<Promise<void>>(Promise.resolve())
 const points = tour.areas.flatMap(area => area.points)
 const done = points.filter(point => !needsPhoto(point)).length
 const open = (area: TourArea) => area.points.filter(point => needsPhoto(point) && !claimed.includes(point.id))
 // Until the client picks a floor plan, work on the first one that still needs photos.
 const area = tour.areas.find(candidate => candidate.id === activeId)
  ?? tour.areas.find(candidate => candidate.points.some(needsPhoto)) ?? tour.areas[0]
 // Photos follow the plan's order: the next photo always belongs to the first point without one.
 // The only way to step out of order is to tap a photo already taken, which replaces that one.
 const picked = area?.points.find(point => point.id === selected && point.hasPhoto && !claimed.includes(point.id))
 const next = area ? picked ?? open(area)[0] : undefined
 const planMarkers = (candidate: TourArea): PlanMarker[] => markers(candidate).map(marker =>
  candidate.id === area?.id && marker.key === next?.id ? { ...marker, state: 'next' }
   : marker.state === 'pending' ? { ...marker, state: 'later' } : marker)
 function show(candidate: TourArea) {
  setActiveId(candidate.id); setSelected(null)
 }
 function upload(point: TourPoint, file: File) {
  setClaimed(current => [...current, point.id])
  queue.current = queue.current.then(async () => {
   try { apply(await uploadPhoto(tour.id, point.id, file)) }
   catch (reason) { fail(message(reason)) }
   finally { setClaimed(current => current.filter(id => id !== point.id)) }
  })
 }
 function addFiles(files: File[]) {
  if (!area || !files.length) return
  const problem = files.map(file => validImage(file, 30)).find(Boolean)
  if (problem) { fail(problem); return }
  const targets = picked && files.length === 1 ? [picked] : open(area)
  if (!targets.length) { fail('This floor plan already has all its photos. Tap a photo to replace it.'); return }
  if (files.length > targets.length) fail(`This floor plan needs ${targets.length} more ${targets.length === 1 ? 'photo' : 'photos'}; the extra ones were skipped.`)
  else fail('')
  // Several photos at once are matched to the points by the time they were taken.
  const ordered = [...files].sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }))
  ordered.slice(0, targets.length).forEach((file, index) => upload(targets[index], file))
  setSelected(null)
 }
 function capture(file: File) {
  if (!next) return
  fail('')
  upload(next, file)
  setSelected(null)
 }
 function removePhoto(point: TourPoint) {
  if (selected === point.id) setSelected(null)
  void run(() => deletePhoto(tour.id, point.id), true)
 }
 if (!area) return <p className="tr-count">This tour has no floor plans.</p>
 const taken = area.points.filter(point => point.hasPhoto || claimed.includes(point.id))
 const caption = !next ? 'All photos for this floor plan are taken'
  : (next.hasPhoto ? 'Retake photo ' : 'Photo ') + next.seq + ' of ' + area.points.length + ' · stand on the orange point and face along its line'
 return <>
  <div className="tr-progress">
   <strong>{done} of {points.length} photos</strong>
   <button type="button" className="btn btn-primary" disabled={busy || claimed.length > 0 || done !== points.length || !points.length} onClick={() => { void run(() => submitPhotos(tour.id)) }}>Submit photos</button>
  </div>
  <div className="tw">
   <section className="tw-plans" aria-label="Floor plans">{tour.areas.map(candidate => {
    const count = candidate.points.filter(point => !needsPhoto(point)).length
    const active = candidate.id === area.id
    return <div key={candidate.id} className={'tw-plan' + (active ? ' is-active' : '')}>
     <button type="button" className="tw-plan-head" aria-pressed={active} onClick={() => show(candidate)}>
      <strong>{candidate.name}</strong><span>{count} of {candidate.points.length}</span>
     </button>
     <PlanView src={planUrl(tour.id, candidate.id, version)} alt={'Capture plan of ' + candidate.name} markers={planMarkers(candidate)} dotSize={candidate.dotSize} lineLength={candidate.lineLength}
      onSelect={key => {
       const point = candidate.points.find(entry => entry.id === Number(key))
       if (!active) show(candidate)
       else if (point?.hasPhoto) setSelected(selected === point.id ? null : point.id)
      }} />
    </div>
   })}</section>
   <p className="tw-caption">{caption}</p>
   <section className="tw-stage" aria-label="Spatial context">
    {filming ? <PhotoCamera canCapture={!!next} caption={caption} onCapture={capture} onClose={() => setFilming(false)} />
     : picked ? <img className="tw-stage-photo" src={photoUrl(tour.id, picked.id, version)} alt={'Photo ' + picked.seq + ' of ' + area.name} />
     : <div className="tw-stage-empty"><Icon name="cube" size={34} /><h3>Spatial context</h3><p>The 3D space built from these photos will appear here once all photos are in and approved.</p></div>}
   </section>
   <section className="tw-strip" aria-label={'Photos of ' + area.name}>
    <div className="tw-strip-head">
     <strong>Photos</strong><span>{taken.length} of {area.points.length}</span>
     <span className="tw-strip-gap" />
     <FileButton multiple label="Add photos" disabled={busy} onFiles={addFiles} />
     {!filming && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setFilming(true)}>Take photos</button>}
    </div>
    <ul className="tw-shots">
     <li>
      <label className={'tw-drop' + (dragging ? ' is-dragging' : '')} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
       onDrop={event => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }}>
       <input type="file" accept={imageAccept} multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; addFiles(files) }} />
       <Icon name="upload" size={20} /><span>Drop or click</span>
      </label>
     </li>
     {taken.map(point => {
      const waiting = claimed.includes(point.id) || !point.hasPhoto
      return <li key={point.id}>
       <button type="button" className={'tw-shot' + (selected === point.id ? ' is-selected' : '') + (point.retakeNote ? ' tw-shot--retake' : '')} aria-pressed={selected === point.id} disabled={waiting}
        onClick={() => setSelected(selected === point.id ? null : point.id)}>
        {waiting ? <span className="tw-shot-wait">Uploading…</span> : <img src={photoUrl(tour.id, point.id, version)} alt={'Photo ' + point.seq} loading="lazy" />}
        <span className="tw-shot-number">{point.seq}</span>
       </button>
       {!waiting && <button type="button" className="tw-shot-remove" aria-label={'Remove photo ' + point.seq} disabled={busy} onClick={() => removePhoto(point)}><Icon name="close" size={14} /></button>}
       {point.retakeNote && !waiting && <p className="tr-danger">Retake: {point.retakeNote}</p>}
      </li>
     })}
    </ul>
    <p className="tr-count">Take the photos in the order of the plan. To redo one, tap it and add or take a new photo, or remove it with ×.</p>
   </section>
  </div>
 </>
}

function ReadOnlyAreas({ tour, version }: { tour: TourDetail; version: number }) {
 return <div className="tr-areas">{tour.areas.map(area => <section key={area.id} className="tr-area" aria-label={area.name}>
  <div className="tr-area-head"><div><h3>{area.name}</h3><small>{kindLabels[area.kind]}</small></div></div>
  <div className="tr-area-body tr-area-body--single">
   {area.hasPlan && <PlanView src={planUrl(tour.id, area.id, version)} alt={'Floor plan of ' + area.name} markers={markers(area)} dotSize={area.dotSize} lineLength={area.lineLength} />}
  </div>
 </section>)}</div>
}

export default function TourRequestPage() {
 const id = Number(useParams().tourId)
 const navigate = useNavigate()
 const [tour, setTour] = useState<TourDetail | null>(null)
 const [loadError, setLoadError] = useState('')
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const [version, setVersion] = useState(0)
 const [deleting, setDeleting] = useState(false)
 const [deleteError, setDeleteError] = useState('')
 useEffect(() => {
  let active = true
  getTourRequest(id).then(loaded => { if (active) setTour(loaded) })
   .catch(reason => { if (active) setLoadError(message(reason)) })
  return () => { active = false }
 }, [id])
 const run: Run = async (action, changesImages = false) => {
  if (busy) return false
  setBusy(true); setError('')
  try {
   setTour(await action())
   if (changesImages) setVersion(current => current + 1)
   return true
  } catch (reason) {
   setError(message(reason))
   return false
  } finally { setBusy(false) }
 }
 async function remove() {
  setBusy(true); setDeleteError('')
  try { await deleteTourRequest(id); navigate('/generate', { replace: true }) }
  catch (reason) { setDeleteError(message(reason)); setBusy(false) }
 }
 if (loadError) return <main className="dashboard"><p className="page-message" role="alert">{loadError}</p></main>
 if (!tour) return <main className="dashboard"><p className="page-message" role="status">Loading tour…</p></main>
 const step = stepOf[tour.status]
 const apply = (updated: TourDetail) => { setTour(updated); setVersion(current => current + 1) }
 const props = { tour, version, busy, run, fail: setError, apply }
 return <main className="dashboard tr-page">
  <header className="generate-detail-heading">
   <Link to="/generate" className="generate-back" aria-label="Back to Generate"><Icon name="arrow" size={24} /></Link>
   <h1>{tour.name}</h1>
  </header>
  <ol className="tour-input-steps" aria-label="Tour creation steps">{steps.map((label, index) =>
   <li key={label} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Icon name="check" size={14} /> : index + 1}</span>{label}</li>)}
  </ol>
  {error && <p className="tr-error" role="alert">{error}</p>}
  {tour.status === 'DRAFT' && <DraftStep {...props} />}
  {tour.status === 'SUBMITTED' && <>
   <div className="tr-banner"><h2>We're preparing your capture plan</h2><p>We are marking where to take each photo on your floor plans. Come back here when the plan is ready — this page will show the photo points.</p></div>
   <ReadOnlyAreas tour={tour} version={version} />
  </>}
  {tour.status === 'PLAN_READY' && <PhotosStep {...props} />}
  {tour.status === 'PHOTOS_SUBMITTED' && <>
   <div className="tr-banner"><h2>We're checking your photos</h2><p>If a photo needs to be retaken, the point will reopen here with a note.</p></div>
   <ReadOnlyAreas tour={tour} version={version} />
  </>}
  {tour.status === 'APPROVED' && <>
   <div className="tr-banner tr-banner--good"><h2>Photos approved — we're generating your tour</h2><p>Nothing more is needed from you right now.</p></div>
   <ReadOnlyAreas tour={tour} version={version} />
  </>}
  {tour.status === 'DRAFT' && <div className="tr-footer"><button type="button" className="btn btn-ghost tr-danger" disabled={busy} onClick={() => setDeleting(true)}>Delete draft</button></div>}
  {deleting && <ConfirmDialog title="Delete this draft?" confirmLabel="Delete draft" busy={busy} error={deleteError}
   onConfirm={() => { void remove() }} onCancel={() => { setDeleting(false); setDeleteError('') }}>
   <p>The draft and its floor plans will be removed. This cannot be undone.</p>
  </ConfirmDialog>}
 </main>
}
