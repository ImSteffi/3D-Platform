import { installViewerTools } from '../src/features/scans/utils/viewerTools'
import { createViewer, type ViewerHandle } from '@playcanvas/supersplat-viewer/viewer'
import { importSettings, validateSettings } from '@playcanvas/supersplat-viewer/settings'
import '@playcanvas/supersplat-viewer/viewer.css'
import './page.css'

const message = document.getElementById('message')!
let viewer: ViewerHandle | undefined
let removeTools: (() => void) | undefined
async function open() {
 const [sceneResponse, settingsResponse] = await Promise.all([fetch('./scene.json'), fetch('./settings.json')])
 if (!sceneResponse.ok || !settingsResponse.ok) throw new Error('Viewer files could not be loaded. Check that the entire viewer folder was uploaded.')
 const scene: { contentUrl: string; contentFilename: string; collisionUrl?: string | null } = await sceneResponse.json()
 const settings: unknown = await settingsResponse.json()
 validateSettings(settings)
 const instance = await createViewer({
  container: document.getElementById('viewer')!,
  contentUrl: scene.contentUrl,
  contentFilename: scene.contentFilename,
  collisionUrl: scene.collisionUrl ?? undefined,
  settings: importSettings(settings),
  noanim: true,
 })
 viewer = instance
 removeTools = installViewerTools(instance, document.getElementById('viewer')!, scene.collisionUrl)
 instance.app.assets.on('error', () => {
  message.hidden = false
  message.textContent = 'The scene could not be loaded. Check that all data files were uploaded.'
 })
 let walkSelected = false
 const ready = () => {
  if (!instance.state.loaded) return
  message.hidden = true
  if (walkSelected) return
  if (instance.state.walkAllowed) {
   instance.state.cameraMode = 'walk'
   walkSelected = true
  } else instance.state.cameraMode = 'fly'
 }
 instance.events.on('loaded:changed', ready)
 instance.events.on('walkAllowed:changed', ready)
 ready()
}
void open().catch(() => {
 message.hidden = false
 message.textContent = location.protocol === 'file:'
  ? 'Upload this folder to a web server or use a local HTTP server. This viewer cannot run by double-clicking index.html.'
  : 'Could not open the viewer. Check that all files are present and settings.json is valid.'
})
window.addEventListener('pagehide', () => { removeTools?.(); viewer?.destroy() })
