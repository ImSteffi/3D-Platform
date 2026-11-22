import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Button, ConfirmDialog, Field, InlineError, Panel, Segmented } from '../../../../shared/ui'
import CaptureSession from '../../../capture/components/CaptureSession/CaptureSession'
import PlanSketcher from '../../../tours/components/PlanSketcher/PlanSketcher'
import { forgetSketch, sketchKey } from '../../../tours/components/PlanSketcher/sketchStorage'
import {
 addFloorPhoto, deleteFloorPhoto, adminAddArea, adminRemoveArea, adminRemovePlan, adminStepPlan, adminUpdateArea, renameArea as customerRenameArea, adminUploadPlan, stepPlan as customerStepPlan, addArea as customerAddArea, deletePhoto, deleteTourRequest, kindLabels, photoUrl, removeArea as customerRemoveArea, removePlan as customerRemovePlan, uploadPhoto, uploadPlan as customerUploadPlan,
 type AreaKind, type TourArea,
} from '../../../tours/api/tourRequests'
import { prepareImages } from '../../../tours/api/prepareImage'
import type { FloorUpload } from './FloorGallery'
import AreaSection from './AreaSection'
import TourAnalytics from './TourAnalytics'
import { entriesOf, floorState, message, needsYou, pad, plural, type Entry, type SpaceProps } from './spaceModel'
import './SpaceSections.css'

const MAX_AREAS = 20
const kinds = (Object.keys(kindLabels) as AreaKind[]).map(value => ({ value, label: kindLabels[value] }))

type Props = SpaceProps & {
 /** Only the floor sections, read-only: no add row and no to-dos (used once the tour is delivered). */
 sectionsOnly?: boolean
 /** The team's view of a customer's space: same page, plus spot marking, Atlas, and the team's own plan edits. */
 admin?: boolean
 /** The public gallery page (no account): no deleting the space or its floors. */
 gallery?: boolean
}

/** The space before delivery, as one page: the add-plan row, then one section per floor, each with its own to-do. */
export default function SpaceSections({ tour, version, busy, run, fail, apply, sectionsOnly = false, admin = false, gallery = false }: Props) {
 const addArea = admin ? adminAddArea : customerAddArea
 const uploadPlan = admin ? adminUploadPlan : customerUploadPlan
 const removeArea = admin ? adminRemoveArea : customerRemoveArea
 const dropPlan = admin ? adminRemovePlan : customerRemovePlan
 const stepPlan = admin ? adminStepPlan : customerStepPlan
 const rename = (areaId: number, name: string) => admin ? adminUpdateArea(tour.id, areaId, { name }) : customerRenameArea(tour.id, areaId, name)
 const navigate = useNavigate()
 const status = tour.status
 const draft = status === 'DRAFT'
 const entries = useMemo(() => entriesOf(tour), [tour])

 // Adding a plan
 const [adding, setAdding] = useState(false)
 /** The floor cards or, in their place, the tours' analytics. */
 const [analytics, setAnalytics] = useState(false)
 const [name, setName] = useState('')
 const [kind, setKind] = useState<AreaKind>('FLOOR')
 const [saving, setSaving] = useState(false)
 const [addError, setAddError] = useState('')
 const [sketching, setSketching] = useState<TourArea | null>(null)
 /** How many photos are still uploading to each floor (by area id). */
 const [floorUploads, setFloorUploads] = useState<Record<number, FloorUpload>>({})
 /** A plan change on a floor the team already marked, waiting for the customer to confirm. */
 const [pendingChange, setPendingChange] = useState<{ area: TourArea; what: 'replace' | 'draw' | 'remove' | 'unplan'; go: () => void } | null>(null)
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
 // Changing a floor the team already marked clears its spots (and photos): ask first.
 const marked = (area: TourArea) => !admin && !draft && (area.locked || area.points.length > 0)
 function guarded(area: TourArea, what: 'replace' | 'draw' | 'remove' | 'unplan', go: () => void) {
  if (marked(area)) setPendingChange({ area, what, go })
  else go()
 }
 async function plan(area: TourArea, picked: File | undefined) {
  if (!picked) return
  const { ready, problem } = await prepareImages([picked], 'plan')
  if (problem) fail(problem)
  const file = ready[0]
  if (file) guarded(area, 'replace', () => { void run(() => uploadPlan(tour.id, area.id, file), true) })
 }
 // Photos added to a floor directly: one at a time, so each upload is its own request.
 // Each photo is prepared and sent on its own, so the first one shows up within seconds. The next photo
 // is prepared while the current one uploads.
 async function addFloorPhotos(area: TourArea, files: File[]) {
  if (!files.length) return
  const set = (upload: FloorUpload | null) => setFloorUploads(current => {
   const next = { ...current }
   if (upload) next[area.id] = upload; else delete next[area.id]
   return next
  })
  const problems: string[] = []
  // A few photos are prepared ahead (iPhone photos convert side by side) while one uploads at a time.
  const AHEAD = 4
  const prepared: ReturnType<typeof prepareImages>[] = []
  const prepareUpTo = (last: number) => { for (let j = prepared.length; j <= Math.min(last, files.length - 1); j++) prepared.push(prepareImages([files[j]], 'photo')) }
  prepareUpTo(AHEAD - 1)
  set({ done: 0, total: files.length, preview: null })
  for (let i = 0; i < files.length; i++) {
   const { ready, problem } = await prepared[i]
   prepareUpTo(i + AHEAD)
   if (problem) problems.push(problem)
   const file = ready[0]
   if (file) {
    const preview = URL.createObjectURL(file)
    set({ done: i, total: files.length, preview })
    try { apply(await addFloorPhoto(tour.id, area.id, file)) }
    catch (reason) { problems.push(message(reason, `${files[i].name} could not be uploaded.`)) }
    finally { URL.revokeObjectURL(preview) }
   }
   set({ done: i + 1, total: files.length, preview: null })
  }
  set(null)
  if (problems.length) fail(problems.length === 1 ? problems[0] : `${problems.length} files were skipped. ${problems.slice(0, 3).join(' ')}${problems.length > 3 ? ' …' : ''}`)
 }
 function removePlan(area: TourArea) {
  guarded(area, 'remove', () => doRemovePlan(area))
 }
 function doRemovePlan(area: TourArea) {
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
 async function addFiles(area: TourArea, picked: File[], target: Entry | null) {
  if (status !== 'PLAN_READY' || !picked.length) return
  const { ready: files, problem } = await prepareImages(picked, 'photo')
  if (problem) fail(problem)
  if (!files.length) return
  const own = entries.filter(entry => entry.area.id === area.id)
  const empties = own.filter(entry => !entry.point.hasPhoto && free(entry))
  const retakes = own.filter(entry => entry.point.retakeNote && free(entry))
  const single = own.find(entry => entry.point.id === selected) ?? retakes[0] ?? empties[0]
  let targets: Entry[]
  if (target) targets = free(target) ? [target, ...empties.filter(entry => entry.number > target.number)] : []
  else if (files.length === 1 && single && free(single)) targets = [single]
  else targets = empties.length ? empties : retakes
  if (!targets.length) { fail(`Every point on ${area.name} already has a photo. Delete a photo to take it again.`); return }
  const extra = files.length - targets.length
  fail(extra > 0 ? `Only ${plural(targets.length, 'point')} on ${area.name} could take a photo, so ${plural(extra, 'extra photo')} ${extra === 1 ? 'was' : 'were'} skipped.` : '')
  // Photos added together are matched to the points by the time they were taken.
  const ordered = [...files].sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }))
  ordered.slice(0, targets.length).forEach((file, index) => upload(targets[index], file))
  setSelected(null)
 }

 // There is no send button: plans and photos reach the team as they are uploaded.
 return <div className="sections">
  {/* Action row: add plan on the left */}
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
    {!analytics && <Button variant="secondary" icon="plus" disabled={full} onClick={() => setAdding(true)}>Add plan</Button>}
    {!gallery && <Button variant={analytics ? 'primary' : 'secondary'} icon={analytics ? 'layers' : 'eye'} aria-pressed={analytics} onClick={() => setAnalytics(on => !on)}>{analytics ? 'Floor plans' : 'Analytics'}</Button>}
    {full && !analytics && <p className="row-reason">A space can have up to {MAX_AREAS} plans.</p>}
   </div>}
   {draft && <div className="sections-next">
    {draft && !admin && !gallery && <Button variant="quiet" icon="trash" disabled={busy} onClick={() => setDeletingSpace(true)}>Delete space</Button>}
   </div>}
  </div>}

  {analytics && <TourAnalytics tour={tour} />}
  {/* One section per floor */}
  {!analytics && states.map(({ area }) => <AreaSection key={area.id} tour={tour} area={area} entries={entries.filter(entry => entry.area.id === area.id)} version={version}
   busy={busy} readOnly={sectionsOnly} primary={area.id === primaryArea} selected={selected} waiting={claimed} srcOf={srcOf}
   onSelect={entry => setSelected(entry.point.id === selected ? null : entry.point.id)}
   onFiles={(files, entry) => addFiles(area, files, entry)} onDelete={entry => { setDeleteError(''); setPhotoToDelete(entry) }}
   onCamera={entry => setCamera(entry?.point.id ?? null)}
   onPlan={plan} onSketch={area => guarded(area, 'draw', () => setSketching(area))} onRemove={removePlan} onRename={(area, name) => run(() => rename(area.id, name))} onStepPlan={(area, forward) => guarded(area, 'replace', () => { void run(() => stepPlan(tour.id, area.id, forward), true) })} onRemovePlan={area => guarded(area, 'unplan', () => { void run(() => dropPlan(tour.id, area.id), true).then(done => { if (done) forgetSketch(sketchKey(area.id)) }) })} removable={!gallery && (draft || tour.areas.length > 1)}
   floorPhotos={{ uploading: floorUploads[area.id] ?? null, onAdd: files => { void addFloorPhotos(area, files) }, onDelete: photoId => { void run(() => deleteFloorPhoto(tour.id, photoId)) } }} admin={admin ? { markTo: `/review/${tour.id}` } : undefined} />)}
  {!analytics && tour.areas.length === 0 && <Panel><p className="sections-none">{sectionsOnly ? 'This space has no floor plans.'
   : 'No floors yet. Click Add plan for each floor or building, then upload a photo of its floor plan or draw it by hand.'}</p></Panel>}

  {pendingChange && <ConfirmDialog title={pendingChange.what === 'remove' ? 'Remove this floor?' : 'Change this floor plan?'}
   confirmLabel={pendingChange.what === 'remove' ? 'Remove floor' : 'Change plan'} busyLabel="Working…"
   onConfirm={() => { const go = pendingChange.go; setPendingChange(null); go() }} onCancel={() => setPendingChange(null)}>
   <p>We have already marked where to stand on <strong>{pendingChange.area.name}</strong>. {pendingChange.what === 'remove'
    ? "Removing it deletes those spots and any photos on this floor."
    : "A new plan clears those spots and any photos on this floor, and we mark it again."} This cannot be undone.</p>
  </ConfirmDialog>}
  {sketching && <PlanSketcher key={sketching.id} title={sketching.name} storageKey={sketchKey(sketching.id)}
   onSave={file => run(() => uploadPlan(tour.id, sketching.id, file), true)} onClose={() => setSketching(null)} />}
  {deletingSpace && <ConfirmDialog title="Delete this space?" confirmLabel="Delete space" busy={removing} error={deleteError}
   onConfirm={() => { void removeSpace() }} onCancel={() => { setDeletingSpace(false); setDeleteError('') }}>
   <p><strong>{tour.name}</strong> and its floor plans will be removed. This cannot be undone.</p>
  </ConfirmDialog>}
  {photoToDelete && <ConfirmDialog title="Delete this photo?" confirmLabel="Delete photo" busy={removing} error={deleteError}
   onConfirm={() => { void removePhoto(photoToDelete) }} onCancel={() => { setPhotoToDelete(null); setDeleteError('') }}>
   <p>Photo <strong className="num">{pad(photoToDelete.number)}</strong> in {photoToDelete.area.name} will be removed. You can take it again.</p>
   {tour.status !== 'PLAN_READY' && <p>We are already checking these photos. Add the missing photo again and it reaches us on its own.</p>}
  </ConfirmDialog>}
  {camera !== undefined && createPortal(<CaptureSession tour={tour} startPointId={camera ?? undefined}
   onChange={updated => { apply(updated); setSession(current => current + 1) }}
   onClose={() => { setCamera(undefined); setSelected(null) }} />, document.body)}
 </div>
}
