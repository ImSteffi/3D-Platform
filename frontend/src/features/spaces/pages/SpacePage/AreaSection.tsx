import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Icon, Panel, Spinner } from '../../../../shared/ui'
import { loadSketch, sketchKey } from '../../../tours/components/PlanSketcher/sketchStorage'
import PlanView from '../../../tours/components/PlanView/PlanView'
import { onGalleryLink, planUrl, type TourArea, type TourDetail } from '../../../tours/api/tourRequests'
import FileButton from './FileButton'
import { planPickerAccept } from '../../../tours/api/prepareImage'
import FloorGallery, { type FloorUpload } from './FloorGallery'
import SharePanel from './SharePanel'
import { floorState, pad, plural, type Entry } from './spaceModel'

type Props = {
 tour: TourDetail
 area: TourArea
 /** This floor's capture points, numbered across the whole space. */
 entries: Entry[]
 version: number
 busy: boolean
 /** Delivered: plan and photos only, no to-do and no actions. */
 readOnly?: boolean
 /** This floor holds the page's one primary button. */
 primary: boolean
 selected: number | null
 /** Points whose photo is uploading right now. */
 waiting: number[]
 srcOf: (entry: Entry) => string
 onSelect: (entry: Entry) => void
 /** Files dropped on one frame (entry), or picked for this floor as a whole (null). */
 onFiles: (files: File[], entry: Entry | null) => void
 onDelete: (entry: Entry) => void
 onCamera: (entry: Entry | undefined) => void
 onPlan: (area: TourArea, file: File | undefined) => void
 onSketch: (area: TourArea) => void
 onRemove: (area: TourArea) => void
 /** Takes only the plan off this floor; the floor and its photos stay. */
 onRemovePlan: (area: TourArea) => void
 /** Renames the floor; resolves to whether it was saved. */
 onRename: (area: TourArea, name: string) => Promise<boolean>
 /** Undo (forward = false) or redo a plan change. */
 onStepPlan: (area: TourArea, forward: boolean) => void
 /**
  * Operator mode (customer page in the admin desk). The operator only marks spots (a button beside the floor's name) and can delete
  * photos until the tour is delivered: no floor or plan editing, no customer to-do, no photo taking. Omit for the customer view.
  */
 admin?: { markTo: string }
 /** False on the public gallery page: a link may add and change floors but not remove them. */
 removable?: boolean
 /** The request's send button, shown under this floor's photos. */
 send?: ReactNode
 /** Photos added to this floor directly (no plan or spot needed). Omit to hide the floor gallery. */
 floorPhotos?: { uploading: FloorUpload | null; onAdd: (files: File[]) => void; onDelete: (photoId: number) => void }
}

const stateWords = { retake: 'needs a retake', taken: 'photo taken', next: 'next', todo: 'to do' }
const fallbackNote = 'Stand on the number and face along the arrow.'
const noClipboardImage = 'No image in the clipboard. Copy a floor plan image first.'
const noClipboardAccess = 'Could not read the clipboard. Allow clipboard access, or press Ctrl+V over the plan box.'

/** A pasted image as a named file, so it takes the same path as an uploaded plan. */
function pastedFile(blob: Blob, type = blob.type): File {
 const ext = (type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/\+.*$/, '')
 return new File([blob], `pasted-plan.${ext}`, { type })
}

/** The first image in a paste event's data, if any. */
function imageIn(data: DataTransfer | null): File | undefined {
 const file = Array.from(data?.files ?? []).find(candidate => candidate.type.startsWith('image/'))
 return file && pastedFile(file)
}


/** One floor: its own to-do, then the flat plan on the left and that floor's photos on the right. */
export default function AreaSection({ tour, area, entries, version, busy, readOnly = false, primary, selected, waiting, srcOf, onSelect, onFiles, onDelete, onCamera, onPlan, onSketch, onRemove, onRemovePlan, onRename, onStepPlan, admin, send, removable = true, floorPhotos }: Props) {
 const status = tour.status
 const state = floorState(status, area)
 /** Photos can be added, replaced and deleted. */
 const open = !readOnly && status !== 'DELIVERED'
 const [renaming, setRenaming] = useState(false)
 const [name, setName] = useState(area.name)
 async function saveName() {
  const next = name.trim()
  if (!next || next === area.name) { setRenaming(false); return }
  if (await onRename(area, next)) setRenaming(false)
 }
 const editable = !admin && !readOnly && status === 'PLAN_READY' && entries.length > 0
 /** A photo can be deleted until the tour is delivered; after the photos were sent, deleting one reopens photo taking. */
 const canDelete = admin ? open : !readOnly && (status === 'PLAN_READY' || status === 'PHOTOS_SUBMITTED' || status === 'APPROVED')
 /** The plan can be replaced or redrawn and the floor removed: until we have placed points on it. */
 const planOpen = admin ? open && entries.length === 0 && !area.locked : open
 const free = (entry: Entry) => !waiting.includes(entry.point.id)
 const retakes = entries.filter(entry => entry.point.retakeNote)
 const firstRetake = retakes.find(free)
 const firstEmpty = editable ? entries.find(entry => !entry.point.hasPhoto && free(entry)) : undefined
 const toGo = entries.filter(entry => !entry.point.hasPhoto).length
 const uploading = entries.filter(entry => !free(entry)).length
 const hasDrawing = planOpen && loadSketch(sketchKey(area.id)).length > 0
 /** Only photos that exist or are uploading. */
 const shown = entries.filter(entry => entry.point.hasPhoto || !free(entry))
 const lead = primary ? 'primary' : 'secondary'
 const tourMade = tour.status === 'DELIVERED'
 // The customer's side: once the team has the spatial context, the tour is on its way.
 // (The team's spatial context and 3D generation live in the 3D panel, not here.)
 const tour3d = !admin ? area.tour3d ?? null : null
 const making = !admin && !tourMade && !!area.spatialReady && !tour3d
 const wide = making || !!tour3d
 const [sharing, setSharing] = useState(false)

 // A floor plan pasted from the clipboard: the paste button, or Ctrl/Cmd+V while the plan box is focused or hovered.
 const [pasteNote, setPasteNote] = useState<string | null>(null)
 const planBox = useRef<HTMLDivElement>(null)
 const hovered = useRef(false)
 const takePasted = useCallback((file: File | undefined) => {
  if (!file) { setPasteNote(noClipboardImage); return }
  setPasteNote(null)
  onPlan(area, file)
 }, [area, onPlan])
 const pasteFromClipboard = async () => {
  try {
   for (const item of await navigator.clipboard.read()) {
    const type = item.types.find(candidate => candidate.startsWith('image/'))
    if (type) { takePasted(pastedFile(await item.getType(type), type)); return }
   }
   takePasted(undefined)
  } catch {
   setPasteNote(noClipboardAccess)
  }
 }
 useEffect(() => {
  if (!planOpen || busy) return
  const onPaste = (event: ClipboardEvent) => {
   const target = event.target instanceof Node ? event.target : null
   const inside = !!target && !!planBox.current?.contains(target)
   // Hovering only counts when nothing editable has focus: a paste into a text field elsewhere stays there.
   const editing = target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select'))
   if (!inside && (!hovered.current || editing)) return
   event.preventDefault()
   takePasted(imageIn(event.clipboardData))
  }
  document.addEventListener('paste', onPaste)
  return () => document.removeEventListener('paste', onPaste)
 }, [planOpen, busy, takePasted])
 const pasteAlert = pasteNote && <p className="area-paste-note" role="alert">{pasteNote}</p>

 // This floor's to-do: one sentence, one supporting line, its own buttons.
 let title = '', text = ''
 let buttons: ReactNode = null
 if (!admin) switch (state) {
  case 'no-plan':
   // The plan's buttons sit in the plan box on the left; this side is the floor's photos.
   title = 'Photos'; text = 'When the plan is in, we mark where to stand. Your photos of this floor go here.'
   break
  case 'plan-added':
   title = 'Plan added'; text = 'Send your floor plans to us when every floor has one.'
   break
  case 'marking':
   title = 'We’re marking where to stand on this floor'; text = 'Nothing to do here right now.'
   break
  case 'retake':
   title = `Retake ${plural(retakes.length, 'photo')} on this floor`
   text = firstRetake ? `Photo ${pad(firstRetake.number)}: ${firstRetake.point.retakeNote}` : 'Your new photos are uploading.'
   buttons = <Button variant={lead} icon="camera" onClick={() => onCamera(firstRetake)}>Open camera</Button>
   break
  case 'photos':
   title = `Take this floor’s photos: ${toGo} to go`
   text = firstEmpty ? `Point ${pad(firstEmpty.number)}: ${firstEmpty.point.note?.trim() || fallbackNote}` : 'Your photos are uploading. Keep this page open until they are all in.'
   buttons = <>
    <FileButton multiple icon="upload" onFiles={files => onFiles(files, null)}>Upload photos</FileButton>
    <Button variant={lead} icon="camera" onClick={() => onCamera(firstEmpty)}>Open camera</Button>
   </>
   break
  case 'photos-in':
   title = 'This floor’s photos are in'; text = 'Send your photos to us when every floor is done.'
   break
  case 'checking':
   title = 'We’re checking these photos'; text = 'Nothing to do here right now.'
   break
  case 'building':
   title = 'We’re building your tour'; text = 'This takes a few days.'
   break
 }

 return <Panel as="section" padding="none" className="area" aria-label={area.name}>
  <header className="area-head">
   <div className="area-name">
    {renaming ? <form className="area-rename" onSubmit={event => { event.preventDefault(); void saveName() }}>
     <input autoFocus value={name} maxLength={100} aria-label="Floor name" disabled={busy}
      onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false) }} />
     <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Save</Button>
     <Button variant="quiet" disabled={busy} onClick={() => setRenaming(false)}>Cancel</Button>
    </form> : <h2>{area.name}</h2>}
   </div>
   {admin && open && area.hasPlan && <Button variant="secondary" className="area-mark" to={admin.markTo}>{entries.length ? 'Edit spots' : 'Mark spots'}</Button>}
   {planOpen && <div className="area-actions">
    {area.hasPlan && <FileButton variant="quiet" icon="upload" accept={planPickerAccept} disabled={busy} onFiles={files => onPlan(area, files[0])}>Replace plan</FileButton>}
    {area.hasPlan && <Button variant="quiet" icon="copy" disabled={busy} onClick={pasteFromClipboard}>Paste from clipboard</Button>}
    {area.hasPlan && <Button variant="quiet" icon="edit" disabled={busy} onClick={() => onSketch(area)}>{hasDrawing ? 'Edit drawing' : 'Draw floor plan'}</Button>}
    {area.hasPlan && <Button variant="quiet" icon="trash" disabled={busy} onClick={() => onRemovePlan(area)}>Remove plan</Button>}
    {open && !renaming && <Button variant="quiet" icon="edit" disabled={busy} onClick={() => { setName(area.name); setRenaming(true) }}>Rename floor</Button>}
    {removable && <Button variant="quiet" icon="trash" disabled={busy} onClick={() => onRemove(area)}>Remove floor</Button>}
   </div>}
  </header>

  <div className={`area-body ${wide ? 'area-body--tour' : ''}`.trim()}>
   <div className="area-plan" ref={planBox} onMouseEnter={() => { hovered.current = true }} onMouseLeave={() => { hovered.current = false }}>
    {!admin && state === 'marking' && <p className="area-plan-note">{title}</p>}
    {area.hasPlan && planOpen && pasteAlert}
    {area.hasPlan
     ? <PlanView src={planUrl(tour.id, area.id, version)} alt={'Floor plan of ' + area.name} dotSize={area.dotSize} lineLength={area.lineLength} selected={selected} unlabeled
      markers={entries.map(({ point, number }) => ({
       key: point.id, label: number, x: point.x, y: point.y, direction: point.direction,
       state: point.retakeNote ? 'retake' : point.hasPhoto ? 'done' : 'later',
      }))}
      onSelect={entries.length ? key => { const entry = entries.find(candidate => candidate.point.id === key); if (entry) onSelect(entry) } : undefined} />
     : planOpen ? <div className="area-plan-empty">
      <div className="area-actions area-plan-btns">
       <Button variant="secondary" icon="edit" disabled={busy} onClick={() => onSketch(area)}>Draw floor plan</Button>
       <FileButton variant={primary ? 'primary' : 'secondary'} icon="upload" accept={planPickerAccept} disabled={busy} onFiles={files => onPlan(area, files[0])}>Upload floor plan</FileButton>
       <Button variant="quiet" icon="copy" disabled={busy} onClick={pasteFromClipboard}>Paste from clipboard</Button>
      </div>
      {pasteAlert}
      <p>Add this floor&rsquo;s plan. A JPG, PNG or WebP image works, and so does a clear photo of a hand-drawn sketch: mark the rooms, doors and stairs.</p>
     </div>
     : <p className="area-quiet">This floor has no plan.</p>}
    {planOpen && (area.canUndoPlan || area.canRedoPlan) && <div className="area-plan-history" role="group" aria-label="Plan history">
     <button type="button" className="area-plan-step" disabled={busy || !area.canUndoPlan} title="Back to the previous plan" aria-label="Back to the previous plan"
      onClick={() => onStepPlan(area, false)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
     <button type="button" className="area-plan-step" disabled={busy || !area.canRedoPlan} title="Forward to the newer plan" aria-label="Forward to the newer plan"
      onClick={() => onStepPlan(area, true)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    </div>}
   </div>
   {/* The operator sees photos only once there are some: no empty section and no title. */}
   {making && <div className="area-making" role="status"><p>We are making your 3D tour</p></div>}
   {tour3d && <div className="area-tour3d">
    <div className="area-tour3d-stage">
     <iframe title={`3D tour of ${area.name}`} allow="fullscreen; xr-spatial-tracking; pointer-lock" allowFullScreen src={tour3d} />
    </div>
    <div className="area-tour3d-actions">
     <Button variant="secondary" icon="share" aria-expanded={sharing} onClick={() => setSharing(open => !open)}>Share</Button>
     {sharing && <SharePanel url={new URL(tour3d, window.location.origin).href} name={area.name} />}
    </div>
   </div>}
   {(!admin || !!floorPhotos || shown.length > 0 || (area.photos?.length ?? 0) > 0) && <div className="area-photos">
    {!admin && !readOnly && !tourMade && !making && <p className="area-photos-lead">Once all your photos are in, we will make your 3D tour.</p>}
    {entries.length === 0
     // No spots yet: this side is the floor's own photo gallery, open straight away.
     ? floorPhotos || (area.photos?.length ?? 0) > 0
      ? <FloorGallery tour={tour} area={area} version={version} busy={busy} uploading={floorPhotos?.uploading ?? null}
        editable={!!floorPhotos && open && !tourMade} title="Photos" hint={state === 'no-plan' || state === 'plan-added' || state === 'marking' ? undefined : title}
        onAdd={files => floorPhotos?.onAdd(files)} onDelete={photoId => floorPhotos?.onDelete(photoId)} />
      : readOnly
      ? <p className="area-quiet">No photos were needed for this floor.</p>
      : <div className="area-status">
       <h3>{title}</h3>
       <p>{text}</p>
       {buttons && <div className="area-status-btns">{buttons}</div>}
      </div>
     : <>
      <div className="area-photos-head">
       <h3>{admin ? 'Photos' : 'Your photos'}</h3>
       {!readOnly && !tourMade && buttons && <div className="area-status-btns">{buttons}</div>}
      </div>
      {!admin && !readOnly && (state !== 'photos' || uploading > 0) && <p className={`area-photos-line area-photos-line--${state}`}>
       {state === 'photos' ? null : state === 'retake' ? text : title}
       {editable && uploading > 0 && <Spinner size={14} label={`Uploading ${plural(uploading, 'photo')}`} />}
      </p>}
      {/* Only photos that exist are shown: no placeholder cards for points still to shoot. */}
      <ol className="frames">
      {shown.map(entry => {
       const { point, number } = entry
       const busyHere = !free(entry)
       const frame = point.retakeNote ? 'retake' : point.hasPhoto ? 'taken' : point.id === firstEmpty?.point.id ? 'next' : 'todo'
       return <li key={point.id} id={`frame-${point.id}`} className="frame-cell">
        <div className="frame-box">
         <button type="button" className={`frame frame--${frame}${point.hasPhoto && !busyHere ? ' skeleton-bg' : ''}`} aria-pressed={selected === point.id}
          aria-label={`Point ${number}, ${busyHere ? 'uploading' : stateWords[frame]}`}
          onClick={() => onSelect(entry)}>
          {point.hasPhoto && !busyHere && <img src={srcOf(entry)} alt="" loading="lazy" decoding="async" draggable={false} />}
          {busyHere && <Spinner size={16} className="frame-wait" />}
          <span className="frame-num">{pad(number)}</span>
         </button>
         {canDelete && point.hasPhoto && !busyHere && (!onGalleryLink() || point.photoViaLink) && <button type="button" className="frame-delete" disabled={busy}
          aria-label={`Delete photo ${number}`} title="Delete this photo" onClick={() => onDelete(entry)}><Icon name="trash" size={15} /></button>}
        </div>
        {point.retakeNote && <p className="frame-note"><span className="visually-hidden">Our note: </span>{point.retakeNote}</p>}
       </li>
      })}
      </ol>
      {/* Photos added before the spots were marked stay with the floor. */}
      {(area.photos?.length ?? 0) > 0 && <FloorGallery tour={tour} area={area} version={version} busy={busy} uploading={floorPhotos?.uploading ?? null}
       editable={!!floorPhotos && open && !tourMade} title="Other photos" onAdd={files => floorPhotos?.onAdd(files)} onDelete={photoId => floorPhotos?.onDelete(photoId)} />}
      {send && <div className="area-send">{send}</div>}
     </>}
   </div>}
  </div>
 </Panel>
}
