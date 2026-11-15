import { useState, type DragEvent, type ReactNode } from 'react'
import { Button, Icon, Panel, Spinner } from '../../../../shared/ui'
import { loadSketch, sketchKey } from '../../../tours/components/PlanSketcher/sketchStorage'
import PlanView from '../../../tours/components/PlanView/PlanView'
import { planUrl, type TourArea, type TourDetail } from '../../../tours/api/tourRequests'
import SpatialContext from '../../../tours/components/SpatialContext/SpatialContext'
import FileButton from './FileButton'
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
 /**
  * Operator mode (customer page in the admin desk). The operator only marks spots (a button beside the floor's name) and can delete
  * photos until the tour is delivered: no floor or plan editing, no customer to-do, no photo taking. Omit for the customer view.
  */
 admin?: { markTo: string }
}

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
const stateWords = { retake: 'needs a retake', taken: 'photo taken', next: 'next', todo: 'to do' }
const fallbackNote = 'Stand on the number and face along the arrow.'


/** One floor: its own to-do, then the flat plan on the left and that floor's photos on the right. */
export default function AreaSection({ tour, area, entries, version, busy, readOnly = false, primary, selected, waiting, srcOf, onSelect, onFiles, onDelete, onCamera, onPlan, onSketch, onRemove, admin }: Props) {
 const [over, setOver] = useState<number | 'plan' | null>(null)
 const status = tour.status
 const state = floorState(status, area)
 /** Photos can be added, replaced and deleted. */
 const open = !readOnly && status !== 'DELIVERED'
 const editable = !admin && !readOnly && status === 'PLAN_READY' && entries.length > 0
 /** A photo can be deleted until the tour is delivered; after the photos were sent, deleting one reopens photo taking. */
 const canDelete = admin ? open : !readOnly && (status === 'PLAN_READY' || status === 'PHOTOS_SUBMITTED' || status === 'APPROVED')
 /** The plan can be replaced or redrawn and the floor removed: until we have placed points on it. */
 const planOpen = !admin && !readOnly && (status === 'DRAFT' || entries.length === 0)
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

 // This floor's to-do: one sentence, one supporting line, its own buttons.
 let title = '', text = ''
 let buttons: ReactNode = null
 if (!admin) switch (state) {
  case 'no-plan':
   title = 'Add this floor’s plan'; text = 'Upload an image or draw it here.'
   buttons = <>
    <Button variant="secondary" icon="edit" disabled={busy} onClick={() => onSketch(area)}>Draw the plan</Button>
    <FileButton variant={lead} icon="upload" disabled={busy} onFiles={files => onPlan(area, files[0])}>Upload plan image</FileButton>
   </>
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
    <h2>{area.name}</h2>
   </div>
   {admin && open && area.hasPlan && <Button variant="secondary" className="area-mark" to={admin.markTo}>{entries.length ? 'Edit spots' : 'Mark spots'}</Button>}
   {planOpen && <div className="area-actions">
    {area.hasPlan && <FileButton variant="quiet" icon="upload" disabled={busy} onFiles={files => onPlan(area, files[0])}>Replace plan</FileButton>}
    {area.hasPlan && <Button variant="quiet" icon="edit" disabled={busy} onClick={() => onSketch(area)}>{hasDrawing ? 'Edit drawing' : 'Draw the plan'}</Button>}
    <Button variant="quiet" icon="trash" disabled={busy} onClick={() => onRemove(area)}>Remove</Button>
   </div>}
  </header>

  <div className="area-body">
   <div className="area-plan">
    {area.hasPlan
     ? <PlanView src={planUrl(tour.id, area.id, version)} alt={'Floor plan of ' + area.name} dotSize={area.dotSize} lineLength={area.lineLength} selected={selected}
      markers={entries.map(({ point, number }) => ({
       key: point.id, label: number, x: point.x, y: point.y, direction: point.direction,
       state: point.retakeNote ? 'retake' : point.hasPhoto ? 'done' : point.id === firstEmpty?.point.id ? 'next' : 'later',
      }))}
      onSelect={entries.length ? key => { const entry = entries.find(candidate => candidate.point.id === key); if (entry) onSelect(entry) } : undefined} />
     : planOpen ? <div className={`area-plan-empty ${over === 'plan' ? 'is-over' : ''}`.trim()}
      onDragOver={event => { if (hasFiles(event)) { event.preventDefault(); setOver('plan') } }} onDragLeave={() => setOver(null)}
      onDrop={event => { event.preventDefault(); setOver(null); if (!busy) onPlan(area, event.dataTransfer.files[0]) }}>
      <span className="area-plan-icon"><Icon name="planner" size={22} /></span>
      <p>This floor&rsquo;s plan goes here. A JPG, PNG or WebP image works, and so does a clear photo of a hand-drawn sketch: mark the rooms, doors and stairs. You can also drop the image here.</p>
     </div>
     : <p className="area-quiet">This floor has no plan.</p>}
   </div>
   {/* The operator sees photos only once there are some: no empty section and no title. */}
   {(!admin || shown.length > 0) && <div className="area-photos">
    {entries.length === 0
     // No points yet: this side says where the floor stands instead of showing photos.
     ? readOnly
      ? <p className="area-quiet">No photos were needed for this floor.</p>
      : <div className="area-status">
       <h3>{title}</h3>
       <p>{text}</p>
       {buttons && <div className="area-status-btns">{buttons}</div>}
      </div>
     : <>
      <div className="area-photos-head">
       <h3>{admin ? 'Photos' : 'Your photos'}</h3>
       {!readOnly && buttons && <div className="area-status-btns">{buttons}</div>}
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
         <button type="button" className={`frame frame--${frame}${over === point.id ? ' is-over' : ''}${point.hasPhoto && !busyHere ? ' skeleton-bg' : ''}`} aria-pressed={selected === point.id}
          aria-label={`Point ${number}, ${busyHere ? 'uploading' : stateWords[frame]}`}
          onClick={() => onSelect(entry)}
          onDragOver={editable ? event => { if (hasFiles(event)) { event.preventDefault(); setOver(point.id) } } : undefined}
          onDragLeave={editable ? () => setOver(null) : undefined}
          onDrop={editable ? event => { event.preventDefault(); setOver(null); onFiles(Array.from(event.dataTransfer.files), entry) } : undefined}>
          {point.hasPhoto && !busyHere && <img src={srcOf(entry)} alt="" loading="lazy" decoding="async" draggable={false} />}
          {busyHere && <Spinner size={16} className="frame-wait" />}
          <span className="frame-num">{pad(number)}</span>
         </button>
         {canDelete && point.hasPhoto && !busyHere && <button type="button" className="frame-delete" disabled={busy}
          aria-label={`Delete photo ${number}`} title="Delete this photo" onClick={() => onDelete(entry)}><Icon name="trash" size={15} /></button>}
        </div>
        {point.retakeNote && <p className="frame-note"><span className="visually-hidden">Our note: </span>{point.retakeNote}</p>}
       </li>
      })}
      </ol>
      {admin && <SpatialContext tourId={tour.id} areaId={area.id} photoCount={entries.filter(entry => entry.point.hasPhoto).length} />}
     </>}
   </div>}
  </div>
 </Panel>
}
