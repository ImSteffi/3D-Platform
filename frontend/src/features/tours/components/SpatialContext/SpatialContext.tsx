import { useEffect, useState } from 'react'
import { Button, ConfirmDialog, InlineError, Spinner, StatusPill } from '../../../../shared/ui'
import { deleteSpatialContext, getSpatialContext, startSpatialContext, type SpatialContext as Result } from '../../api/tourRequests'
import './SpatialContext.css'

const POLL_MS = 4000
const NONE: number[] = []

const errorText = (reason: unknown, fallback: string) => reason instanceof Error && reason.message ? reason.message : fallback

/** What the floor card needs from this floor's spatial context. */
export type SpatialState = {
 /** The finished result's frames, or null while there is none. The 3D tour needs it first. */
 frames: Result['frames'] | null
 /** Gallery photos added after the last run: not in the spatial context yet. */
 fresh: number[]
 /** Where it stands: LOADING until the first answer, then the run's own status. */
 status: 'LOADING' | Result['status']
}

/**
 * Operator only: run Atlas spatial context on one floor's photos and follow it. The result itself is shown
 * in the floor card. Once there is one, the button only comes back as "Re-generate spatial context" when photos
 * were added or deleted since, so a run is never repeated on the same photos.
 */
export default function SpatialContext({ tourId, areaId, photoCount, onReady, canDelete = true }: { tourId: number; areaId: number; photoCount: number
 onReady?: (state: SpatialState) => void
 /** False hides the delete button (the 3D panel shows it only while the spatial context itself is on screen). */
 canDelete?: boolean }) {
 const [result, setResult] = useState<Result | null>(null)
 const [loadError, setLoadError] = useState('')
 const [confirming, setConfirming] = useState(false)
 const [starting, setStarting] = useState(false)
 const [startError, setStartError] = useState('')
 const [deleting, setDeleting] = useState(false)
 const [removing, setRemoving] = useState(false)
 const [deleteError, setDeleteError] = useState('')
 const running = result?.status === 'RUNNING'

 useEffect(() => {
  let active = true
  let timer: number | undefined
  const load = () => getSpatialContext(tourId, areaId)
   .then(found => {
    if (!active) return
    setResult(found); setLoadError('')
    if (found.status === 'RUNNING') timer = window.setTimeout(load, POLL_MS)
   })
   .catch(reason => { if (active) setLoadError(errorText(reason, 'We could not load the spatial context.')) })
  void load()
  return () => { active = false; window.clearTimeout(timer) }
  // Loads again when photos are added or removed, so new ones are noticed; polls while a run is in progress.
 }, [tourId, areaId, running, photoCount])

 async function start() {
  setStarting(true); setStartError('')
  try { setResult(await startSpatialContext(tourId, areaId)); setConfirming(false) }
  catch (reason) { setStartError(errorText(reason, 'That did not go through. Please try again.')) }
  finally { setStarting(false) }
 }

 async function remove() {
  setRemoving(true); setDeleteError('')
  try { setResult(await deleteSpatialContext(tourId, areaId)); setDeleting(false) }
  catch (reason) { setDeleteError(errorText(reason, 'That did not go through. Please try again.')) }
  finally { setRemoving(false) }
 }

 const done = result?.status === 'SUCCEEDED'
 const failed = result?.status === 'FAILED'
 const frames = done ? result.frames : null
 const fresh = done ? result.newPhotoIds ?? NONE : NONE
 const status = result?.status ?? 'LOADING'
 useEffect(() => { onReady?.({ frames, fresh, status }) }, [frames, fresh, status, onReady])
 const removed = done ? result.removedPhotos ?? 0 : 0
 // Nothing to show without photos, unless there is a spatial context left to delete.
 if (photoCount === 0 && (!result || result.status === 'NONE')) return null

 const label = !result || result.status === 'NONE' ? 'Generate spatial context'
  : failed ? 'Try again'
  : done && (fresh.length || removed) && photoCount > 0 ? 'Re-generate spatial context'
  : null
 const updating = done && (fresh.length > 0 || removed > 0)

 return <div className="spatial">
  <div className="spatial-row">
   {running && <StatusPill><Spinner size={12} /> {result.phase === 'UPLOADING'
    ? `Uploading photos ${result.uploaded}/${result.total}`
    : 'Atlas is placing the photos'}</StatusPill>}
   {failed && <StatusPill tone="red">Spatial context failed</StatusPill>}
   {result && !running && label && <Button variant="secondary" icon="cube" disabled={!result.configured} title={result.configured ? undefined : 'WLT_API_KEY is not set on the server.'}
    onClick={() => { setStartError(''); setConfirming(true) }}>{label}</Button>}
   {canDelete && result && (done || failed) && <Button variant="quiet" icon="trash" onClick={() => { setDeleteError(''); setDeleting(true) }}>Delete spatial context</Button>}
  </div>
  {failed && result.error && <p className="spatial-error">{result.error}</p>}
  {result && !result.configured && !running && <p className="spatial-note">Not set up on this server: WLT_API_KEY is missing.</p>}
  {loadError && <InlineError>{loadError}</InlineError>}

  {confirming && <ConfirmDialog title={updating ? 'Re-generate spatial context?' : 'Generate spatial context?'} confirmLabel={label ?? 'Generate spatial context'}
   busy={starting} busyLabel="Starting…" error={startError} onConfirm={() => { void start() }} onCancel={() => setConfirming(false)}>
   <p>{updating && fresh.length > 0 && <>{fresh.length === 1 ? 'One new photo was' : <><strong className="num">{fresh.length}</strong> new photos were</>} added. </>}
    {updating && removed > 0 && <>{removed === 1 ? 'One photo was' : <><strong className="num">{removed}</strong> photos were</>} deleted. </>}
    This floor&rsquo;s <strong className="num">{photoCount}</strong> {photoCount === 1 ? 'photo goes' : 'photos go'} to World Labs Atlas, which places each camera and estimates depth. It spends Atlas credits.</p>
  </ConfirmDialog>}
  {deleting && <ConfirmDialog title="Delete spatial context?" confirmLabel="Delete spatial context" busy={removing} busyLabel="Deleting…" error={deleteError}
   onConfirm={() => { void remove() }} onCancel={() => setDeleting(false)}>
   <p>This floor&rsquo;s spatial context and its stored cameras and depth maps are deleted. The photos stay. Generate it again once the photos are right; that spends Atlas credits.</p>
  </ConfirmDialog>}
 </div>
}
