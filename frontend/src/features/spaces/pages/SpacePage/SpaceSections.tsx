import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Button, ConfirmDialog, Field, InlineError, Panel, Segmented } from '../../../../shared/ui'
import CaptureSession from '../../../capture/components/CaptureSession/CaptureSession'
import PlanSketcher from '../../../tours/components/PlanSketcher/PlanSketcher'
import { forgetSketch, sketchKey } from '../../../tours/components/PlanSketcher/sketchStorage'
import {
 addArea, deletePhoto, deleteTourRequest, kindLabels, photoUrl, removeArea, submitPhotos, submitTourRequest, uploadPhoto, uploadPlan, validImage,
 type AreaKind, type TourArea,
} from '../../../tours/api/tourRequests'
import AreaSection from './AreaSection'
import { entriesOf, floorState, message, needsYou, pad, plural, type Entry, type SpaceProps } from './spaceModel'
import './SpaceSections.css'

const MAX_AREAS = 20
const kinds = (Object.keys(kindLabels) as AreaKind[]).map(value => ({ value, label: kindLabels[value] }))
const floors = (count: number) => count === 1 ? 'one floor' : `${count} floors`

type Props = SpaceProps & {
 /** Only the floor sections, read-only: no add row and no to-dos (used once the tour is delivered). */
 sectionsOnly?: boolean
}

/** The space before delivery, as one page: the add-plan row, then one section per floor, each with its own to-do. */
export default function SpaceSections({ tour, version, busy, run, fail, apply, sectionsOnly = false }: Props) {
 const navigate = useNavigate()
 const status = tour.status
 const draft = status === 'DRAFT'
 const entries = useMemo(() => entriesOf(tour), [tour])

 // Adding a plan
 const [adding, setAdding] = useState(false)
 const [name, setName] = useState('')
 const [kind, setKind] = useState<AreaKind>('FLOOR')
 const [saving, setSaving] = useState(false)
 const [addError, setAddError] = useState('')
 const [sketching, setSketching] = useState<TourArea | null>(null)
 // Deleting
 const [deletingSpace, setDeletingSpace] = useState(false)
 const [photoToDelete, setPhotoToDelete] = useState<Entry | null>(null)
 const [removing, setRemoving] = useState(false)
 const [deleteError, setDeleteError] = useState('')
 // Photos
 const [selected, setSelected] = useState<number | null>(null)
 /** undefined: closed. Otherwise the point the camera starts on (null: wherever it likes). */
 const [camera, setCamera] = useState<number | null | undefined>(undefined)
 // Points whose photo is still uploading, so the next file goes to the next point.
 const [claimed, setClaimed] = useState<number[]>([])
 // Per-point counters so only the photo that changed is fetched again.
 const [stamps, setStamps] = useState<Record<number, number>>({})
 const [session, setSession] = useState(0)
 const queue = useRef<Promise<void>>(Promise.resolve())

 const full = tour.areas.length >= MAX_AREAS
 const states = tour.areas.map(area => ({ area, state: floorState(status, area) }))
 // Only one primary button on the page: the first floor that needs the customer has it.
 const primaryArea = sectionsOnly ? undefined : states.find(item => needsYou(item.state))?.area.id
 const free = (entry: Entry) => !claimed.includes(entry.point.id)
 const srcOf = (entry: Entry) => photoUrl(tour.id, entry.point.id, version * 1000 + session * 100 + (stamps[entry.point.id] ?? 0))
 const bump = (id: number) => setStamps(current => ({ ...current, [id]: (current[id] ?? 0) + 1 }))

 // The add call is made here, not through `run`, so a refusal shows right beside the button.
 async function add(event: { preventDefault: () => void }) {
  event.preventDefault()
  if (!name.trim() || full || saving) return
  setSaving(true); setAddError('')
  try {
   apply(await addArea(tour.id, name.trim(), kind))
   setName(''); setAdding(false)
  } catch (reason) { setAddError(message(reason, 'We could not add this plan. Please try again.')) }
  finally { setSaving(false) }
 }
 function plan(area: TourArea, file: File | undefined) {
  if (!file) return
  const problem = validImage(file, 20)
  if (problem) fail(problem)
  else void run(() => uploadPlan(tour.id, area.id, file), true)
 }
 function removePlan(area: TourArea) {
  void run(() => removeArea(tour.id, area.id)).then(removed => { if (removed) forgetSketch(sketchKey(area.id)) })
 }
 async function removeSpace() {
  setRemoving(true); setDeleteError('')
  try { await deleteTourRequest(tour.id); navigate('/spaces', { replace: true }) }
  catch (reason) { setDeleteError(message(reason, 'We could not delete this space. Please try again.')); setRemoving(false) }
 }
 async function removePhoto(entry: Entry) {
  setRemoving(true); setDeleteError('')
  try {
   apply(await deletePhoto(tour.id, entry.point.id))
   bump(entry.point.id)
   if (selected === entry.point.id) setSelected(null)
   setPhotoToDelete(null)
  } catch (reason) { setDeleteError(message(reason, 'We could not delete this photo. Please try again.')) }
  finally { setRemoving(false) }
 }

 function upload(entry: Entry, file: File) {
  const id = entry.point.id
  setClaimed(current => [...current, id])
  queue.current = queue.current.then(async () => {
   try { apply(await uploadPhoto(tour.id, id, file)); bump(id) }
   catch (reason) { fail(`Photo ${pad(entry.number)} did not upload. ${message(reason, 'Please try again.')}`) }
   finally { setClaimed(current => current.filter(other => other !== id)) }
  })
 }
 /**
  * Photos for one floor. Dropped on a frame: that point first, then the floor's empty points after it.
  * Picked for the floor: one photo goes to the selected point (or the floor's retake / next point), several fill its empty points in order.
  */
 function addFiles(area: TourArea, files: File[], target: Entry | null) {
  if (status !== 'PLAN_READY' || !files.length) return
  const problem = files.map(file => validImage(file, 30)).find(Boolean)
  if (problem) { fail(problem); return }
  const own = entries.filter(entry => entry.area.id === area.id)
  const empties = own.filter(entry => !entry.point.hasPhoto && free(entry))
  const retakes = own.filter(entry => entry.point.retakeNote && free(entry))
  const single = own.find(entry => entry.point.id === selected) ?? retakes[0] ?? empties[0]
  let targets: Entry[]
  if (target) targets = free(target) ? [target, ...empties.filter(entry => entry.number > target.number)] : []
  else if (files.length === 1 && single && free(single)) targets = [single]
  else targets = empties.length ? empties : retakes
  if (!targets.length) { fail(`Every point on ${area.name} already has a photo. Drop a photo onto a frame to replace it.`); return }
  const extra = files.length - targets.length
  fail(extra > 0 ? `Only ${plural(targets.length, 'point')} on ${area.name} could take a photo, so ${plural(extra, 'extra photo')} ${extra === 1 ? 'was' : 'were'} skipped.` : '')
  // Photos added together are matched to the points by the time they were taken.
  const ordered = [...files].sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }))
  ordered.slice(0, targets.length).forEach((file, index) => upload(targets[index], file))
  setSelected(null)
 }

 // The request-level sends, each with a short reason while it cannot be used.
 const count = (wanted: string[]) => states.filter(item => wanted.includes(item.state)).length
 const noPlan = count(['no-plan']), marking = count(['marking']), wantPhotos = count(['retake', 'photos'])
 let send: { label: string; action: () => void; reason: string } | null = null
 if (draft) send = {
  label: 'Send floor plans to us', action: () => { void run(() => submitTourRequest(tour.id)) },
  reason: !tour.areas.length ? 'Add a floor plan first.' : noPlan ? `${floors(noPlan)} still ${noPlan === 1 ? 'needs' : 'need'} a plan.`.replace(/^o/, 'O') : '',
 }
 else if (status === 'PLAN_READY') send = {
  label: 'Send photos to us', action: () => { void run(() => submitPhotos(tour.id)) },
  reason: (claimed.length ? 'Your photos are still uploading.'
   : wantPhotos ? `${floors(wantPhotos)} still ${wantPhotos === 1 ? 'needs' : 'need'} photos.`
   : noPlan ? `${floors(noPlan)} still ${noPlan === 1 ? 'needs' : 'need'} a plan.`
   : marking ? `We’re still marking ${floors(marking)}.` : !entries.length ? 'There are no photos to send yet.' : '').replace(/^o/, 'O'),
 }

 return <div className="sections">
  {/* Action row: add plan on the left; the request-level send on the right */}
  {!sectionsOnly && <div className={`sections-actions ${adding ? 'is-adding' : ''}`.trim()}>
   {adding ? <Panel as="form" padding="sm" className="add-form" aria-label="Add a plan" onSubmit={event => { void add(event) }}>
    <Field label="Name of this plan" value={name} onChange={setName} maxLength={100} autoFocus placeholder="For example Ground floor, Basement, Garden" />
    <div className="add-form-row">
     <Segmented aria-label="Kind of area" options={kinds} value={kind} onChange={setKind} />
     <div className="add-form-btns">
      <Button variant="quiet" disabled={saving} onClick={() => { setAdding(false); setName(''); setAddError('') }}>Cancel</Button>
      <Button type="submit" variant="secondary" icon="plus" loading={saving} disabled={!name.trim()}>Add plan</Button>
     </div>
    </div>
    <InlineError>{addError}</InlineError>
   </Panel> : <div className="add-plan">
    <Button variant="secondary" icon="plus" disabled={full} onClick={() => setAdding(true)}>Add plan</Button>
    {full && <p className="row-reason">A space can have up to {MAX_AREAS} plans.</p>}
   </div>}
   {(send || draft) && <div className="sections-next">
    {send?.reason && <p className="row-reason">{send.reason}</p>}
    {draft && <Button variant="quiet" icon="trash" disabled={busy} onClick={() => setDeletingSpace(true)}>Delete space</Button>}
    {send && <Button variant={primaryArea === undefined && !send.reason ? 'primary' : 'secondary'} iconAfter="arrow"
     loading={busy && !send.reason} disabled={busy || !!send.reason} onClick={send.action}>{send.label}</Button>}
   </div>}
  </div>}

  {/* One section per floor */}
  {states.map(({ area }) => <AreaSection key={area.id} tour={tour} area={area} entries={entries.filter(entry => entry.area.id === area.id)} version={version}
   busy={busy} readOnly={sectionsOnly} primary={area.id === primaryArea} selected={selected} waiting={claimed} srcOf={srcOf}
   onSelect={entry => setSelected(entry.point.id === selected ? null : entry.point.id)}
   onFiles={(files, entry) => addFiles(area, files, entry)} onDelete={entry => { setDeleteError(''); setPhotoToDelete(entry) }}
   onCamera={entry => setCamera(entry?.point.id ?? null)}
   onPlan={plan} onSketch={setSketching} onRemove={removePlan} />)}
  {tour.areas.length === 0 && <Panel><p className="sections-none">{sectionsOnly ? 'This space has no floor plans.'
   : 'No floor plans yet. Add one for every floor or building, then upload an image or draw it here.'}</p></Panel>}

  {sketching && <PlanSketcher key={sketching.id} title={sketching.name} storageKey={sketchKey(sketching.id)}
   onSave={file => run(() => uploadPlan(tour.id, sketching.id, file), true)} onClose={() => setSketching(null)} />}
  {deletingSpace && <ConfirmDialog title="Delete this space?" confirmLabel="Delete space" busy={removing} error={deleteError}
   onConfirm={() => { void removeSpace() }} onCancel={() => { setDeletingSpace(false); setDeleteError('') }}>
   <p><strong>{tour.name}</strong> and its floor plans will be removed. This cannot be undone.</p>
  </ConfirmDialog>}
  {photoToDelete && <ConfirmDialog title="Delete this photo?" confirmLabel="Delete photo" busy={removing} error={deleteError}
   onConfirm={() => { void removePhoto(photoToDelete) }} onCancel={() => { setPhotoToDelete(null); setDeleteError('') }}>
   <p>Photo <strong className="num">{pad(photoToDelete.number)}</strong> in {photoToDelete.area.name} will be removed. You can take it again.</p>
   {tour.status !== 'PLAN_READY' && <p>Your photos were already sent to us, so this reopens photo taking: add the missing photo and send them again.</p>}
  </ConfirmDialog>}
  {camera !== undefined && createPortal(<CaptureSession tour={tour} startPointId={camera ?? undefined}
   onChange={updated => { apply(updated); setSession(current => current + 1) }}
   onClose={() => { setCamera(undefined); setSelected(null) }} />, document.body)}
 </div>
}
