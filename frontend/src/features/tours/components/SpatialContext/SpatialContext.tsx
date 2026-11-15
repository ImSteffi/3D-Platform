import { lazy, Suspense, useEffect, useState } from 'react'
import { Button, ConfirmDialog, InlineError, Spinner, StatusPill } from '../../../../shared/ui'
import { getSpatialContext, startSpatialContext, type SpatialContext as Result } from '../../api/tourRequests'
import './SpatialContext.css'

// three.js only loads once someone opens a result.
const SpatialContextViewer = lazy(() => import('./SpatialContextViewer'))
const POLL_MS = 8000

const errorText = (reason: unknown, fallback: string) => reason instanceof Error && reason.message ? reason.message : fallback

/** Operator only: run Atlas spatial context on one floor's photos, follow it, and open the result in a wide panel. */
export default function SpatialContext({ tourId, areaId, photoCount }: { tourId: number; areaId: number; photoCount: number }) {
 const [result, setResult] = useState<Result | null>(null)
 const [loadError, setLoadError] = useState('')
 const [confirming, setConfirming] = useState(false)
 const [starting, setStarting] = useState(false)
 const [startError, setStartError] = useState('')
 const [open, setOpen] = useState(false)
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
  if (!result || running) void load()
  return () => { active = false; window.clearTimeout(timer) }
  // Polls only while a run is in progress.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [tourId, areaId, running])

 useEffect(() => {
  if (!open) return
  const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
  window.addEventListener('keydown', close)
  return () => window.removeEventListener('keydown', close)
 }, [open])

 async function start() {
  setStarting(true); setStartError('')
  try { setResult(await startSpatialContext(tourId, areaId)); setConfirming(false) }
  catch (reason) { setStartError(errorText(reason, 'That did not go through. Please try again.')) }
  finally { setStarting(false) }
 }

 if (photoCount === 0) return null
 const done = result?.status === 'SUCCEEDED'
 const failed = result?.status === 'FAILED'

 return <div className="spatial">
  <div className="spatial-row">
   {running && <StatusPill><Spinner size={12} /> Spatial context running</StatusPill>}
   {failed && <StatusPill tone="red">Spatial context failed</StatusPill>}
   {done && <Button variant="secondary" size="md" onClick={() => setOpen(true)}>Spatial context</Button>}
   {result && !running && <Button variant="quiet" disabled={!result.configured} title={result.configured ? undefined : 'WLT_API_KEY is not set on the server.'}
    onClick={() => { setStartError(''); setConfirming(true) }}>{done || failed ? 'Run again' : 'Run spatial context'}</Button>}
  </div>
  {failed && result.error && <p className="spatial-error">{result.error}</p>}
  {result && !result.configured && !running && <p className="spatial-note">Not set up on this server: WLT_API_KEY is missing.</p>}
  {loadError && <InlineError>{loadError}</InlineError>}

  {confirming && <ConfirmDialog title="Run spatial context?" confirmLabel="Run spatial context" busy={starting} busyLabel="Uploading photos…"
   error={startError} onConfirm={() => { void start() }} onCancel={() => setConfirming(false)}>
   <p>This floor&rsquo;s <strong className="num">{photoCount}</strong> {photoCount === 1 ? 'photo goes' : 'photos go'} to World Labs Atlas, which places each camera and estimates depth. It spends Atlas credits.</p>
  </ConfirmDialog>}

  {open && done && <div className="spatial-sheet" role="dialog" aria-modal="true" aria-label="Spatial context">
   <div className="spatial-sheet-backdrop" onClick={() => setOpen(false)} />
   <section className="spatial-sheet-panel on-dark">
    <header className="spatial-sheet-head">
     <h2>Spatial context</h2>
     <Button variant="quiet" icon="close" aria-label="Close" onClick={() => setOpen(false)} />
    </header>
    <Suspense fallback={<Spinner block label="Loading the viewer" />}>
     <SpatialContextViewer frames={result.frames} />
    </Suspense>
   </section>
  </div>}
 </div>
}
