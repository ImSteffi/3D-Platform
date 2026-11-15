import type { ViewerHandle } from '@playcanvas/supersplat-viewer/viewer'
import type { Vec3, CameraComponent } from 'playcanvas'
import './viewerTools.css'
import { loadMeasurementCollision } from './measurementCollision'

// The pinned viewer version exposes its depth picker through this event.
type SurfacePicker = { pick(x: number, y: number): Promise<Vec3 | null> }

export function installViewerTools(viewer: ViewerHandle, container: HTMLElement, collisionUrl?: string | null) {
 const root = container.querySelector<HTMLElement>('.sse-viewer')
 const walk = root?.querySelector<HTMLButtonElement>('.sse-fpsCamera')
 const canvas = root?.querySelector('canvas')
 if (!root || !walk || !canvas) return () => {}
 const button = document.createElement('button')
 button.type = 'button'
 button.className = 'sse-controlButton platform-measure'
 button.title = 'Measure'
 button.setAttribute('aria-label', 'Measure')
 button.setAttribute('aria-pressed', 'false')
 button.disabled = true
 button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 16 13-13 5 5L8 21zM6 13l2 2m1-5 2 2m1-5 2 2m1-5 2 2"/></svg>'
 walk.after(button)
 const panel = document.createElement('div')
 panel.className = 'platform-measure-panel'
 panel.hidden = true
 panel.setAttribute('role', 'status')
 root.append(panel)
 const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
 svg.classList.add('platform-measure-overlay')

 root.append(svg)
 const instruction = window.matchMedia('(pointer: coarse)').matches
  ? 'Tap to add points · tap the ruler again to finish'
  : 'Click to add points · Backspace removes the last · Esc to finish'

 let picker: SurfacePicker | undefined
 const abort = new AbortController()
 const collision = collisionUrl ? loadMeasurementCollision(collisionUrl, abort.signal).catch(() => null) : Promise.resolve(null)
 let active = false
 let disposed = false
 let busy = false
 let generation = 0
 let previousInput = true
 let points: Vec3[] = []
 const subscription = viewer.events.on('picker:ready', (value: SurfacePicker) => {
  picker = value
  button.disabled = false
 })
 const render = () => {
  const camera = viewer.app.root.findComponents('camera').find(c => c.enabled && c.entity.enabled) as CameraComponent | undefined
  if (!active || !camera || !points.length) { svg.style.display = 'none'; return }
  const projected = points.map(p => camera.worldToScreen(p))
  if (projected.some(p => p.z <= 0)) { svg.style.display = 'none'; return }
  svg.style.display = 'block'
  const width = viewer.app.graphicsDevice.clientRect.width
  const height = viewer.app.graphicsDevice.clientRect.height
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height)
  svg.replaceChildren()
  const ns = 'http://www.w3.org/2000/svg'
  const element = (tag: string, attributes: Record<string, string | number>) => {
   const node = document.createElementNS(ns, tag)
   Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)))
   svg.append(node)
   return node
  }
  projected.forEach((p, i) => {
   if (i > 0) {
    const from = projected[i - 1]
    element('line', { x1: from.x, y1: from.y, x2: p.x, y2: p.y })
    const x = (from.x + p.x) / 2
    const y = (from.y + p.y) / 2
    const text = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(points[i - 1].distance(points[i])) + ' m'
    const labelWidth = Math.max(60, text.length * 8 + 22)
    element('rect', { x: x - labelWidth / 2, y: y - 13, width: labelWidth, height: 26, rx: 13 })
    element('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }).textContent = text
   }
  })
  projected.forEach(p => element('circle', { cx: p.x, cy: p.y, r: 6 }))
 }
 const setActive = (value: boolean) => {
  generation++
  active = value
  if (active) {
   previousInput = viewer.state.inputEnabled
   viewer.state.inputEnabled = false
   if (document.pointerLockElement === canvas) void document.exitPointerLock()
   points = []
   panel.textContent = instruction
  } else {
   viewer.state.inputEnabled = previousInput
   points = []
  }
  button.setAttribute('aria-pressed', String(active))
  button.classList.toggle('sse-active', active)
  root.classList.toggle('platform-measuring', active)
  panel.hidden = !active
  render()
 }
 const toggle = () => setActive(!active)
 button.addEventListener('click', toggle)
 const stopNavigation = (event: Event) => {
  if (active && event.target === canvas) {
   event.preventDefault()
   event.stopImmediatePropagation()
  }
 }
 const pick = async (event: PointerEvent) => {
  if (!active || event.target !== canvas || event.button !== 0 || !picker || busy) return
  event.preventDefault()
  event.stopImmediatePropagation()
  busy = true
  const current = generation
  try {
   const rect = canvas.getBoundingClientRect()
   const x = (event.clientX - rect.left) / rect.width
   const y = (event.clientY - rect.top) / rect.height
   const collider = await collision
   if (disposed || current !== generation) return
   const camera = viewer.app.root.findComponents('camera').find(c => c.enabled && c.entity.enabled) as CameraComponent | undefined
   if (!camera) return
   const near = camera.screenToWorld(x * rect.width, y * rect.height, camera.nearClip)
   const far = camera.screenToWorld(x * rect.width, y * rect.height, camera.farClip)
   const direction = far.clone().sub(near).normalize()
   const point = collider ? collider.pick(near, direction, camera.farClip) : await picker.pick(x, y)
   if (disposed || current !== generation) return
   if (!point) { panel.textContent = 'No surface there. Try another spot.'; return }
   points.push(point.clone())
   panel.textContent = instruction
   render()
  } catch {
   if (!disposed && current === generation) panel.textContent = "That spot can't be measured. Try another."
  } finally { busy = false }
 }
 const key = (event: KeyboardEvent) => {
  if (active && event.key === 'Backspace') {
   event.preventDefault()
   event.stopImmediatePropagation()
   points.pop()
   render()
  }
  if (active && event.key === 'Escape') {
   event.preventDefault()
   event.stopImmediatePropagation()
   setActive(false)
  }
 }
 root.addEventListener('pointerdown', pick, true)
 const blockedEvents = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel', 'contextmenu']
 blockedEvents.forEach(name => root.addEventListener(name, stopNavigation, { capture: true, passive: false }))
 window.addEventListener('keydown', key, true)
 viewer.app.on('update', render)
 return () => {
  disposed = true
  abort.abort()
  if (active) setActive(false)
  subscription.off()
  viewer.app.off('update', render)
  window.removeEventListener('keydown', key, true)
  root.removeEventListener('pointerdown', pick, true)
  blockedEvents.forEach(name => root.removeEventListener(name, stopNavigation, true))
  button.remove()
  panel.remove()
  svg.remove()
 }
}
