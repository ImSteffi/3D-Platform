import { useEffect, useState } from 'react'
import { Button, ConfirmDialog, InlineError, Spinner, StatusPill } from '../../../../shared/ui'
import { getSpatialContext, startSpatialContext, type SpatialContext as Result } from '../../api/tourRequests'
import './SpatialContext.css'

const POLL_MS = 8000
const NONE: number[] = []

const errorText = (reason: unknown, fallback: string) => reason instanceof Error && reason.message ? reason.message : fallback

/** What the floor card needs from this floor's spatial context. */
export type SpatialState = {
 /** The finished result's frames, or null while there is none. The 3D tour needs it first. */
 frames: Result['frames'] | null
 /** Gallery photos added after the last run: not in the spatial context yet. */
 fresh: number[]
}

/**
 * Operator only: run Atlas spatial context on one floor's photos and follow it. The result itself is shown
 * in the floor card. Once there is one, the button only comes back as "Update spatial context" when new photos
 * were added since, so a run is never repeated on the same photos.
 */
export default function SpatialContext({ tourId, areaId, photoCount, onReady }: { tourId: number; areaId: number; photoCount: number
 onReady?: (state: SpatialState) => void }) {
 const [result, setResult] = useState<Result | null>(null)
 const [loadError, setLoadError] = useState('')
 const [confirming, setConfirming] = useState(false)
 const [starting, setStarting] = useState(false)
 const [startError, setStartError] = useState('')
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

 const done = result?.status === 'SUCCEEDED'
 const failed = result?.status === 'FAILED'
 const frames = done ? result.frames : null
 const fresh = done ? result.newPhotoIds ?? NONE : NONE
 useEffect(() => { onReady?.({ frames, fresh }) }, [frames, fresh, onReady])
 if (photoCount === 0) return null

 const label = !result || result.status === 'NONE' ? 'Generate Spatial Context'
  : failed ? 'Try again'
  : done && fresh.length ? 'Update spatial context'
  : null
 const updating = done && fresh.length > 0

 return <div className="spatial">
  <div className="spatial-row">
   {running && <StatusPill><Spinner size={12} /> Spatial context running</StatusPill>}
   {failed && <StatusPill tone="red">Spatial context failed</StatusPill>}
   {result && !running && label && <Button variant="secondary" icon="cube" disabled={!result.configured} title={result.configured ? undefined : 'WLT_API_KEY is not set on the server.'}
    onClick={() => { setStartError(''); setConfirming(true) }}>{label}</Button>}
  </div>
  {failed && result.error && <p className="spatial-error">{result.error}</p>}
  {result && !result.configured && !running && <p className="spatial-note">Not set up on this server: WLT_API_KEY is missing.</p>}
  {loadError && <InlineError>{loadError}</InlineError>}

  {confirming && <ConfirmDialog title={updating ? 'Update spatial context?' : 'Generate spatial context?'} confirmLabel={label ?? 'Generate Spatial Context'}
   busy={starting} busyLabel="Uploading photos…" error={startError} onConfirm={() => { void start() }} onCancel={() => setConfirming(false)}>
   <p>{updating && <>{fresh.length === 1 ? 'One new photo was' : <><strong className="num">{fresh.length}</strong> new photos were</>} added. </>}
    This floor&rsquo;s <strong className="num">{photoCount}</strong> {photoCount === 1 ? 'photo goes' : 'photos go'} to World Labs Atlas, which places each camera and estimates depth. It spends Atlas credits.</p>
  </ConfirmDialog>}
 </div>
}
