import { useEffect, useRef, useState } from 'react'
import type { ViewerHandle } from '@playcanvas/supersplat-viewer/viewer'
import type { CameraComponent } from 'playcanvas'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import { savePreview, saveStartingView, type StartingView, type ViewerManifest } from '../../api/viewer'
import { Button, Spinner } from '../../../../shared/ui'
import './SplatScene.css'
import { installViewerTools } from '../../utils/viewerTools'

type SceneError = { text: string; retry: boolean }
class OpenError extends Error {
 retry: boolean
 constructor(text: string, retry: boolean) { super(text); this.retry = retry }
}
const TRY_AGAIN = "This tour can't be opened right now. Try again in a moment."
// Based on the viewer's own control map for walk and fly: drag looks around, W A S D moves, a click or tap goes to that spot.
const HINT_MOUSE = 'Drag to look around · W A S D to move · ruler button to measure'
const HINT_TOUCH = 'Drag to look around · tap to move there · ruler button to measure'

export default function SplatScene({ scanId, shareToken, name }: { scanId?: number; shareToken?: string; name?: string }) {
 const user = useWorkspaceUser()
 const container = useRef<HTMLDivElement>(null)
 const activeViewer = useRef<ViewerHandle | null>(null)
 const saveRequest = useRef<AbortController | null>(null)
 const [error, setError] = useState<SceneError | null>(null)
 const [notice, setNotice] = useState('')
 const [ready, setReady] = useState(false)
 const [attempt, setAttempt] = useState(0)
 const [sharedName, setSharedName] = useState('')
 const [hintGone, setHintGone] = useState(false)
 const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches)
 const [savingPreview, setSavingPreview] = useState(false)
 const [saving, setSaving] = useState(false)
 const [saveMessage, setSaveMessage] = useState('')
 const [saveError, setSaveError] = useState(false)
 useEffect(() => {
  let disposed = false
  let viewer: ViewerHandle | undefined
  let removeTools: (() => void) | undefined
  const abort = new AbortController()
  async function load() {
   try {
    const response = await fetch(shareToken ? '/api/public/views/' + encodeURIComponent(shareToken) : '/api/scans/' + scanId + '/viewer', { signal: abort.signal, credentials: shareToken ? 'omit' : 'same-origin' })
    if (!response.ok) throw response.status === 401 ? new OpenError('Your session has ended. Sign in again to open this tour.', false)
     : response.status === 404 ? new OpenError(shareToken ? "This tour isn't available. The link may have been turned off." : "This tour isn't available any more.", false)
     : new OpenError(TRY_AGAIN, true)
    const assets: ViewerManifest & { name?: string | null } = await response.json()
    if (!disposed && typeof assets.name === 'string') setSharedName(assets.name)
    const [{ createViewer }, { importSettings, validateSettings }] = await Promise.all([
     import('@playcanvas/supersplat-viewer/viewer'),
     import('@playcanvas/supersplat-viewer/settings'),
     import('@playcanvas/supersplat-viewer/viewer.css'),
    ])
    if (disposed || !container.current) return
    validateSettings(assets.settings)
    const settings = importSettings(assets.settings)
    const instance = await createViewer({
     container: container.current,
     contentUrl: assets.contentUrl,
     contents: fetch(assets.contentUrl, { signal: abort.signal, credentials: 'omit' }).then(response => {
      if (!response.ok) throw new Error('Could not download the scene.')
      return response
     }).catch(cause => {
      if (!disposed) setError({ text: TRY_AGAIN, retry: true })
      throw cause
     }),
     contentFilename: assets.contentFilename,
     collisionUrl: assets.collisionUrl ?? undefined,
     settings,
     noanim: true,
    })
    if (disposed) { instance.destroy(); return }
    viewer = instance
    removeTools = installViewerTools(instance, container.current!, assets.collisionUrl)
    activeViewer.current = instance
    instance.app.assets.on('error', () => {
     if (!disposed) setError({ text: "This tour's files can't be read right now. Try again in a moment.", retry: true })
    })
    let defaultSelected = false
    const selectDefault = () => {
     if (disposed || !instance.state.loaded) return
     setReady(true)
     if (defaultSelected) return
     if (instance.state.walkAllowed) {
      instance.state.cameraMode = 'walk'
      defaultSelected = true
      setNotice('')
     } else {
      instance.state.cameraMode = 'fly'
      setNotice("Walking isn't available in this tour. You can still fly through it.")
     }
    }
    instance.events.on('loaded:changed', selectDefault)
    instance.events.on('walkAllowed:changed', selectDefault)
    selectDefault()
   } catch (cause) {
    if (!disposed) setError(cause instanceof OpenError ? { text: cause.message, retry: cause.retry } : { text: TRY_AGAIN, retry: true })
   }
  }
  void load()
  return () => {
   disposed = true
   abort.abort()
   saveRequest.current?.abort()
   activeViewer.current = null
   removeTools?.()
   viewer?.destroy()
  }
 }, [scanId, shareToken, attempt])

 // The hint leaves on the first interaction and does not come back.
 useEffect(() => {
  if (!ready || hintGone) return
  const dismiss = () => setHintGone(true)
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  events.forEach(type => window.addEventListener(type, dismiss, { capture: true, passive: true }))
  return () => events.forEach(type => window.removeEventListener(type, dismiss, true))
 }, [ready, hintGone])

 function retry() {
  setError(null)
  setReady(false)
  setNotice('')
  setAttempt(count => count + 1)
 }

 async function setPreview() {
  const viewer = activeViewer.current
  if (shareToken || !scanId || !user.platformAdmin || !viewer?.state.loaded || saveRequest.current) return
  if (viewer.state.xrMode) {
   setSaveError(true)
   setSaveMessage('Exit VR or AR before setting the preview.')
   return
  }
  const request = new AbortController()
  saveRequest.current = request
  setSavingPreview(true)
  setSaveMessage('')
  setSaveError(false)
  try {
   const frame = await viewer.captureFrame({ width: 800, height: 600, supersample: 2 })
   if (request.signal.aborted) return
   // captureFrame returns base64 RGBA pixels, not an encoded image.
   const pixels = Uint8ClampedArray.from(atob(frame.data), char => char.charCodeAt(0))
   const canvas = document.createElement('canvas')
   canvas.width = frame.width
   canvas.height = frame.height
   const context = canvas.getContext('2d')
   if (!context) throw new Error('Could not create the preview image.')
   context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0)
   const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Could not create the preview image.')), 'image/png'))
   if (request.signal.aborted) return
   await savePreview(scanId, image, request.signal)
   if (!request.signal.aborted) setSaveMessage('Preview saved')
  } catch (cause) {
   if (!request.signal.aborted) {
    setSaveError(true)
    setSaveMessage(cause instanceof Error ? cause.message : 'Could not save the preview.')
   }
  } finally {
   if (!request.signal.aborted) {
    saveRequest.current = null
    setSavingPreview(false)
   }
  }
 }

 async function setStartingView() {
  const viewer = activeViewer.current
  if (shareToken || !scanId || !user.platformAdmin || !viewer?.state.loaded || saveRequest.current) return
  if (viewer.state.xrMode) {
   setSaveError(true)
   setSaveMessage('Exit VR or AR before setting the starting view.')
   return
  }
  const camera = viewer.app.root.findComponents('camera').find(component => component.enabled
   && component.entity.enabled) as CameraComponent | undefined
  if (!camera) return
  const position = camera.entity.getPosition().clone()
  const target = position.clone().add(camera.entity.forward)
  const view: StartingView = {
   position: [position.x, position.y, position.z],
   target: [target.x, target.y, target.z],
   fov: camera.fov,
  }
  const request = new AbortController()
  saveRequest.current = request
  setSaving(true)
  setSaveMessage('')
  setSaveError(false)
  try {
   await saveStartingView(scanId, view, request.signal)
   if (!request.signal.aborted) setSaveMessage('Starting view saved')
  } catch (cause) {
   if (!request.signal.aborted) {
    setSaveError(true)
    setSaveMessage(cause instanceof Error ? cause.message : 'Could not save the starting view.')
   }
  } finally {
   if (!request.signal.aborted) {
    saveRequest.current = null
    setSaving(false)
   }
  }
 }

 const title = name ?? sharedName
 const toolsDisabled = !ready || !!error || saving || savingPreview
 return <>
  <div ref={container} className="splat-scene" />
  <div className="lens-top">
   <div className="lens-top-info">
    {title && <p className="lens-chip lens-name">{title}</p>}
    {!error && notice && <p className="lens-chip lens-notice" role="status">{notice}</p>}
   </div>
   {!shareToken && user.platformAdmin && <div className="lens-tools" role="group" aria-label="Team tools">
    <div className="lens-tools-bar">
     <span className="lens-tools-label">Team tools</span>
     <button type="button" className="lens-tool" disabled={toolsDisabled}
      onClick={() => { void setStartingView() }}>{saving ? 'Saving…' : 'Set starting view'}</button>
     <button type="button" className="lens-tool" disabled={toolsDisabled}
      onClick={() => { void setPreview() }}>{savingPreview ? 'Saving…' : 'Set preview'}</button>
    </div>
    {saveMessage && <p className={saveError ? 'lens-chip lens-feedback lens-feedback--error' : 'lens-chip lens-feedback'}
     role={saveError ? 'alert' : 'status'}>{saveMessage}</p>}
   </div>}
  </div>
  {!error && !ready && <div className="lens-stage-message"><Spinner size={22} label="Opening your tour…" /></div>}
  {error && <div className="lens-stage-message lens-stage-message--solid" role="alert">
   <p>{error.text}</p>
   {error.retry && <Button variant="secondary" icon="retake" onClick={retry}>Retry</Button>}
  </div>}
  {ready && !error && <p className={hintGone ? 'lens-chip lens-hint lens-hint--gone' : 'lens-chip lens-hint'} aria-hidden={hintGone}>{touch ? HINT_TOUCH : HINT_MOUSE}</p>}
 </>
}
