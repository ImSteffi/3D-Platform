import { useEffect, useRef, useState } from 'react'
import type { ViewerHandle } from '@playcanvas/supersplat-viewer/viewer'
import type { CameraComponent } from 'playcanvas'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import { saveStartingView, type StartingView, type ViewerManifest } from '../../api/viewer'
import './SplatScene.css'

export default function SplatScene({ scanId, shareToken }: { scanId?: number; shareToken?: string }) {
 const user = useWorkspaceUser()
 const container = useRef<HTMLDivElement>(null)
 const activeViewer = useRef<ViewerHandle | null>(null)
 const saveRequest = useRef<AbortController | null>(null)
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const [ready, setReady] = useState(false)
 const [saving, setSaving] = useState(false)
 const [saveMessage, setSaveMessage] = useState('')
 const [saveError, setSaveError] = useState(false)
 useEffect(() => {
  let disposed = false
  let viewer: ViewerHandle | undefined
  const abort = new AbortController()
  async function load() {
   try {
    const response = await fetch(shareToken ? '/api/public/views/' + encodeURIComponent(shareToken) : '/api/scans/' + scanId + '/viewer', { signal: abort.signal, credentials: shareToken ? 'omit' : 'same-origin' })
    if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Please sign in again.'
     : response.status === 404 ? 'This 3D tour is currently unavailable.'
     : 'Could not open this scan. Please close the viewer and try again.')
    const assets: ViewerManifest = await response.json()
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
     contents: fetch(assets.contentUrl, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error('Could not download the scene.')
      return response
     }).catch(cause => {
      if (!disposed) setError('Could not download the scene. Please close the viewer and try again.')
      throw cause
     }),
     contentFilename: assets.contentFilename,
     collisionUrl: assets.collisionUrl ?? undefined,
     settings,
     noanim: true,
    })
    if (disposed) { instance.destroy(); return }
    viewer = instance
    activeViewer.current = instance
    instance.app.assets.on('error', () => {
     if (!disposed) setError('Could not read this scene. Please check its files and try again.')
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
      setNotice('Walk mode needs valid collision data and a scene large enough to walk in.')
     }
    }
    instance.events.on('loaded:changed', selectDefault)
    instance.events.on('walkAllowed:changed', selectDefault)
    selectDefault()
   } catch (cause) {
    if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not load the 3D viewer.')
   }
  }
  void load()
  return () => {
   disposed = true
   abort.abort()
   saveRequest.current?.abort()
   activeViewer.current = null
   viewer?.destroy()
  }
 }, [scanId, shareToken])

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
   if (!request.signal.aborted) setSaveMessage('Starting view saved.')
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

 return <>
  <div ref={container} className="splat-scene" />
  {!shareToken && user.platformAdmin && <div className="scan-starting-view-controls">
   <button type="button" className="btn btn-primary" disabled={!ready || !!error || saving}
    onClick={() => { void setStartingView() }}>{saving ? 'Saving…' : 'Set starting view'}</button>
   {saveMessage && <p className={saveError ? 'scan-starting-view-message scan-starting-view-message--error' : 'scan-starting-view-message'}
    role={saveError ? 'alert' : 'status'}>{saveMessage}</p>}
  </div>}
  {error && <p className="scan-viewer-placeholder" role="alert">{error}</p>}
  {!error && notice && <p className="splat-scene-notice" role="status">{notice}</p>}
 </>
}
