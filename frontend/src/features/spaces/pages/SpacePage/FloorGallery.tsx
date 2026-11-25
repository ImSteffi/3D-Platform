import { useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Icon, Spinner } from '../../../../shared/ui'
import { floorPhotoDownloadUrl, floorPhotosZipUrl, floorPhotoUrl, onGalleryLink, type TourArea, type TourDetail } from '../../../tours/api/tourRequests'
import FileButton from './FileButton'
import FloorCamera from './FloorCamera'
import FloorPhotoViewer from './FloorPhotoViewer'

const MAX_PHOTOS = 64
/** A live camera in the page (needs HTTPS or localhost): offers Take photos next to Add photos. */
const floorCameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Progress of a batch of photos going to one floor: one at a time, with a preview of the current one. */
export type FloorUpload = { done: number; total: number; preview: string | null }

type Props = {
 tour: TourDetail
 area: TourArea
 /** Not used for gallery photos: each photo has its own id and never changes. */
 version: number
 busy: boolean
 /** Photos being sent to this floor right now, or null. */
 uploading: FloorUpload | null
 /** False once the tour is delivered, or for the team's read-only views. */
 editable: boolean
 title: string
 /** One line under the title, for example what happens next on this floor. */
 hint?: string
 onAdd: (files: File[]) => void
 onDelete: (photoId: number) => void
 /** Deletes every photo of this floor; resolves true once done. Not offered on a gallery link. */
 onDeleteAll?: () => Promise<boolean>
 /** Team only: photos added after the spatial context was made. Shown first, outlined. */
 fresh?: number[]
}

/** A floor's own photos: added straight away, with or without a plan. Shown on the right of the floor card. */
export default function FloorGallery({ tour, area, busy, uploading, editable, title, hint, onAdd, onDelete, onDeleteAll, fresh }: Props) {
 // New photos (not in the spatial context yet) come first so they are seen.
 const photos = fresh?.length ? [...(area.photos ?? []).filter(id => fresh.includes(id)), ...(area.photos ?? []).filter(id => !fresh.includes(id))] : area.photos ?? []
 const full = photos.length >= MAX_PHOTOS
 // One row until opened: the last card in the row shows how many more there are and opens the rest in place.
 const [open, setOpen] = useState(false)
 const [columns, setColumns] = useState(8)
 const row = useRef<HTMLOListElement>(null)
 const hasPhotos = photos.length > 0
 // The in-app camera: many photos in a row, sent together on Done. Not while a batch is still going up.
 const [camera, setCamera] = useState(false)
 const room = MAX_PHOTOS - photos.length
 const canDelete = (photoId: number) => editable && (!onGalleryLink() || !!area.linkPhotos?.includes(photoId))
 // Saving photos is for people signed in to the space, not for someone sending photos through a gallery link.
 const canDownload = !onGalleryLink()
 const canDeleteAll = editable && !onGalleryLink() && !!onDeleteAll
 const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
 const [deletingAll, setDeletingAll] = useState(false)
 async function deleteAll() {
  if (!onDeleteAll) return
  setDeletingAll(true)
  const done = await onDeleteAll()
  setDeletingAll(false)
  if (done) { setConfirmDeleteAll(false); setOpen(false) }
 }
 // The photo open in the viewer. If it goes (deleted), the one that took its place is shown; none left closes it.
 const [viewing, setViewing] = useState<{ id: number; index: number } | null>(null)
 const shown = viewing ? (photos.includes(viewing.id) ? viewing.id : photos[Math.min(viewing.index, photos.length - 1)] ?? null) : null
 if (viewing && shown === null) setViewing(null)
 const shownIndex = shown === null ? -1 : photos.indexOf(shown)
 function closeViewer() {
  const id = shown
  setViewing(null)
  // Back to the thumbnail it was opened from (or the one now in its place), else the "Show all" card.
  window.requestAnimationFrame(() => {
   const list = row.current
   const target = list?.querySelector<HTMLElement>(`[data-photo-id="${id}"]`) ?? list?.querySelector<HTMLElement>('.frame-more')
   target?.focus()
  })
 }
 useEffect(() => {
  const list = row.current
  if (!list) return
  // Read the columns the grid really has, so the row is right at every width (phones use smaller cards).
  const measure = () => setColumns(Math.max(2, getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length))
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(list)
  return () => observer.disconnect()
 }, [hasPhotos])
 // The uploading card takes a place in the row too, so "Show all" stays the last card of the first row.
 const rowRoom = columns - (uploading ? 1 : 0)
 const folded = !open && photos.length > rowRoom
 const visible = folded ? photos.slice(0, rowRoom - 1) : photos
 return <div className="floor-gallery">
  <div className="area-photos-head">
   <h3>{title}{hasPhotos && <span className="desk-count">{photos.length}</span>}</h3>
   {editable && <div className="floor-gallery-add">
    {floorCameraSupported && <Button variant="secondary" icon="camera" disabled={busy || full || !!uploading}
     title={full ? `A floor can have at most ${MAX_PHOTOS} photos.` : uploading ? 'Wait for the photos being sent to finish.' : 'Take many photos in a row with the camera.'}
     onClick={() => setCamera(true)}>Take photos</Button>}
    <FileButton multiple icon="upload" disabled={busy || full} title={full ? `A floor can have at most ${MAX_PHOTOS} photos.` : undefined} onFiles={onAdd}>Add photos</FileButton>
   </div>}
  </div>
  {hint && <p className="floor-gallery-hint">{hint}</p>}
  {uploading && <p className="floor-gallery-hint" aria-live="polite"><Spinner size={14} /> Uploading photo {Math.min(uploading.done + 1, uploading.total)} of {uploading.total}</p>}
  {photos.length > 0 || uploading ? <ol ref={row} className="frames">
   {uploading && <li className="frame-cell">
    <div className="frame frame--uploading skeleton-bg">
     {uploading.preview && <img src={uploading.preview} alt="" draggable={false} />}
     <span className="frame-uploading"><Spinner size={18} /></span>
    </div>
   </li>}
   {visible.map((photoId, index) => <li key={photoId} className="frame-cell">
    <div className="frame-box">
     <button type="button" data-photo-id={photoId} className={`frame frame--taken frame-open skeleton-bg${fresh?.includes(photoId) ? ' frame--new' : ''}`}
      title={fresh?.includes(photoId) ? 'New: not in the spatial context yet' : undefined} aria-label={`Open photo ${index + 1} of ${photos.length}`}
      onClick={() => setViewing({ id: photoId, index: photos.indexOf(photoId) })}>
      <img src={floorPhotoUrl(tour.id, photoId)} alt="" loading="lazy" decoding="async" draggable={false}
       // A signed link can fail once right after an upload: try again a moment later.
       onError={event => { const img = event.currentTarget; if (!img.dataset.retried) { img.dataset.retried = '1'; window.setTimeout(() => { img.src = floorPhotoUrl(tour.id, photoId) + '?retry=1' }, 1500) } }} />
     </button>
     {canDownload && <a className={`frame-download${canDelete(photoId) ? '' : ' frame-download--alone'}`} href={floorPhotoDownloadUrl(tour.id, photoId)} download
      aria-label={`Download photo ${index + 1}`} title="Download this photo"><Icon name="download" size={15} /></a>}
     {canDelete(photoId) && <button type="button" className="frame-delete" disabled={busy} aria-label={`Delete photo ${index + 1}`}
      title="Delete this photo" onClick={() => onDelete(photoId)}><Icon name="trash" size={15} /></button>}
    </div>
   </li>)}
   {photos.length > rowRoom && <li className="frame-cell">
    <button type="button" className="frame frame-more" aria-expanded={open} onClick={() => setOpen(!open)}>
     {folded ? <><strong>+{photos.length - visible.length}</strong><span>Show all</span></> : <span>Show less</span>}
    </button>
   </li>}
  </ol>
  : null}
  {hasPhotos && (canDownload || canDeleteAll) && <div className="floor-gallery-tools">
   {canDownload && <Button variant="quiet" icon="download" href={floorPhotosZipUrl(tour.id, area.id)} download>Download all</Button>}
   {canDeleteAll && <Button variant="quiet" icon="trash" className="floor-gallery-delete-all" disabled={busy || !!uploading} onClick={() => setConfirmDeleteAll(true)}>Delete all</Button>}
  </div>}
  {confirmDeleteAll && <ConfirmDialog title={`Delete all ${photos.length} photos?`} confirmLabel="Delete all photos" busy={deletingAll}
   onConfirm={() => { void deleteAll() }} onCancel={() => setConfirmDeleteAll(false)}>
   <p>This deletes every photo of <strong>{title === 'Photos' ? area.name : title}</strong> for good. You cannot undo this.</p>
  </ConfirmDialog>}
  {shown !== null && <FloorPhotoViewer urls={photos.map(id => floorPhotoUrl(tour.id, id))} index={shownIndex} title={title}
   canDelete={canDelete(shown)} downloadUrl={canDownload ? floorPhotoDownloadUrl(tour.id, shown) : undefined} busy={busy} onIndex={next => setViewing({ id: photos[next], index: next })} onDelete={() => onDelete(shown)} onClose={closeViewer} />}
  {camera && <FloorCamera title={title} room={room} onDone={files => onAdd(files.slice(0, Math.max(0, room)))} onClose={() => setCamera(false)} />}
 </div>
}
