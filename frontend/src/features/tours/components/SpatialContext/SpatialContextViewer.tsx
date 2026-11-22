import { useEffect, useRef, useState } from 'react'
import {
 BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
 PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Quaternion, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
} from 'three'
import { Spinner } from '../../../../shared/ui'
import { pad } from '../../../spaces/pages/SpacePage/spaceModel'
import type { SpatialFrame } from '../../api/tourRequests'
import { buildFrameCloud, loadImage } from './pointCloud'

type Placed = { frame: SpatialFrame; position: Vector3; rotation: Quaternion; fov: number; aspect: number; depth: number }

/** Keys that fly the view: W/S forward and back along where you look, A/D sideways, Shift faster. */
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'])

/**
 * Point cloud of every photo's depth plus one textured frustum per photo; the strip below jumps to a photo's camera.
 * `bare`: only the point cloud, no photos (no frustums, no strip), for the floor card.
 * Click to lock the pointer and look around (Esc lets go; dragging also works), scroll to move, fly with WASD.
 */
export default function SpatialContextViewer({ frames, bare = false }: { frames: SpatialFrame[]; bare?: boolean }) {
 const host = useRef<HTMLDivElement>(null)
 const goTo = useRef<(index: number) => void>(() => {})
 const [loading, setLoading] = useState(true)
 const [failed, setFailed] = useState('')
 const [current, setCurrent] = useState<number | null>(null)
 const usable = frames.filter(frame => frame.camera && frame.depthUrl && frame.imageUrl)

 useEffect(() => {
  const element = host.current
  if (!element) return
  let disposed = false
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SRGBColorSpace
  element.appendChild(renderer.domElement)
  const scene = new Scene()
  scene.background = new Color('#141516')
  const view = new PerspectiveCamera(60, 1, 0.01, 1000)
  view.position.set(0, 0.5, 2)
  // Free flight, like a game: dragging turns the view where it stands, the keys move it.
  const controls = { target: new Vector3() }
  let yaw = 0, pitch = 0
  const syncAngles = () => {
   const d = controls.target.clone().sub(view.position).normalize()
   yaw = Math.atan2(-d.x, -d.z)
   pitch = Math.asin(Math.max(-1, Math.min(1, d.y)))
  }
  const look = () => {
   const d = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
   controls.target.copy(view.position).add(d)
   view.lookAt(controls.target)
  }
  const disposables: { dispose: () => void }[] = []
  const placed: Placed[] = []
  // Keys held down while the view has focus; the loop moves the camera and its target together.
  const held = new Set<string>()
  let speed = 1
  let last = 0
  // The loader places the view once; after that (or once the user has moved) only the user moves it.
  let viewPlaced = false
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Spatial context. Click to look around with the mouse (Esc lets go), or drag; W A S D to move.')
  const keyDown = (event: KeyboardEvent) => { if (FLY_KEYS.has(event.code)) { event.preventDefault(); held.add(event.code); flight = null; viewPlaced = true } }
  const keyUp = (event: KeyboardEvent) => { held.delete(event.code) }
  const blur = () => held.clear()
  canvas.addEventListener('keydown', keyDown)
  canvas.addEventListener('keyup', keyUp)
  canvas.addEventListener('blur', blur)
  // A mouse click locks the pointer (FPS look, Esc lets go); dragging stays as the fallback (touch, or no pointer lock).
  const locked = () => document.pointerLockElement === canvas
  const canLock = typeof canvas.requestPointerLock === 'function'
  let drag: { x: number; y: number; moved: number; mouse: boolean } | null = null
  const pointerDown = (event: PointerEvent) => {
   canvas.focus({ preventScroll: true })
   flight = null
   viewPlaced = true
   if (locked()) return
   canvas.setPointerCapture(event.pointerId)
   drag = { x: event.clientX, y: event.clientY, moved: 0, mouse: event.pointerType === 'mouse' }
  }
  const pointerMove = (event: PointerEvent) => {
   if (locked()) {
    // Mouse right looks right, mouse up looks up; clamp spikes some browsers report on lock.
    const dx = Math.max(-150, Math.min(150, event.movementX)), dy = Math.max(-150, Math.min(150, event.movementY))
    yaw -= dx * 0.003
    pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * 0.003))
    look()
    return
   }
   if (!drag) return
   const dx = event.clientX - drag.x, dy = event.clientY - drag.y
   yaw += dx * 0.004
   pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.004))
   drag = { ...drag, x: event.clientX, y: event.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) }
   look()
  }
  const pointerUp = (event: PointerEvent) => {
   const click = drag && drag.mouse && drag.moved < 5
   drag = null
   if (!click || event.type !== 'pointerup' || !canLock || locked()) return
   // Refused (iframe without allow-pointer-lock, too soon after Esc, ...): dragging keeps working.
   try { Promise.resolve(canvas.requestPointerLock()).catch(() => {}) } catch { /* no pointer lock here */ }
  }
  const lockChange = () => { if (!locked()) drag = null }
  const lockError = () => { drag = null }
  document.addEventListener('pointerlockchange', lockChange)
  document.addEventListener('pointerlockerror', lockError)
  // Scroll moves forward and back along the view.
  const wheel = (event: WheelEvent) => {
   event.preventDefault()
   flight = null
   viewPlaced = true
   const forward = new Vector3()
   view.getWorldDirection(forward)
   view.position.addScaledVector(forward, -event.deltaY * speed * 0.0015)
   look()
  }
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('pointercancel', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  let flight: { from: Vector3; to: Vector3; targetFrom: Vector3; targetTo: Vector3; fovFrom: number; fovTo: number; start: number } | null = null

  const resize = () => {
   const { clientWidth: w, clientHeight: h } = element
   renderer.setSize(w, h, false)
   view.aspect = w / Math.max(1, h)
   view.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(element)
  resize()

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  goTo.current = index => {
   const target = placed.find(entry => entry.frame.index === index)
   if (!target) return
   const forward = new Vector3(0, 0, -1).applyQuaternion(target.rotation)
   flight = {
    from: view.position.clone(), to: target.position.clone(),
    targetFrom: controls.target.clone(), targetTo: target.position.clone().addScaledVector(forward, Math.max(0.05, target.depth)),
    fovFrom: view.fov, fovTo: Math.min(100, target.fov * 1.15), start: performance.now(),
   }
  }

  renderer.setAnimationLoop(now => {
   const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
   last = now
   if (held.size) {
    const forward = new Vector3()
    view.getWorldDirection(forward)
    const right = new Vector3().crossVectors(forward, view.up).normalize()
    const move = new Vector3()
    if (held.has('KeyW')) move.add(forward)
    if (held.has('KeyS')) move.sub(forward)
    if (held.has('KeyD')) move.add(right)
    if (held.has('KeyA')) move.sub(right)
    if (move.lengthSq()) {
     // Shift: three times faster.
     move.normalize().multiplyScalar(speed * dt * (held.has('ShiftLeft') || held.has('ShiftRight') ? 3 : 1))
     view.position.add(move)
     look()
    }
   }
   if (flight) {
    const t = reduced ? 1 : Math.min(1, (now - flight.start) / 700)
    const k = 1 - (1 - t) ** 3
    // Stop just behind the camera so its frustum stays in view.
    const to = flight.to.clone().lerp(flight.targetTo, -0.15)
    view.position.lerpVectors(flight.from, to, k)
    controls.target.lerpVectors(flight.targetFrom, flight.targetTo, k)
    view.fov = flight.fovFrom + (flight.fovTo - flight.fovFrom) * k
    view.updateProjectionMatrix()
    view.lookAt(controls.target)
    if (t >= 1) { flight = null; syncAngles() }
   }
   renderer.render(scene, view)
  })

  ;(async () => {
   const clouds = new Group(), frustums = new Group()
   frustums.visible = !bare
   scene.add(clouds, frustums)
   const bounds: Vector3[] = []
   for (const frame of usable) {
    const camera = frame.camera!
    const image = await loadImage(frame.imageUrl!)
    const cloud = await buildFrameCloud(camera, frame.depthUrl!, image, frame.confidenceUrl)
    if (disposed) return
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(cloud.positions.subarray(0, cloud.count * 3), 3))
    geometry.setAttribute('color', new Float32BufferAttribute(cloud.colors.subarray(0, cloud.count * 3), 3))
    const material = new PointsMaterial({ size: 0.012, vertexColors: true, sizeAttenuation: true })
    clouds.add(new Points(geometry, material))
    disposables.push(geometry, material)

    const { fx, fy, cx, cy, width, height } = camera.intrinsics
    const position = new Vector3(...camera.extrinsics.position)
    const [qx, qy, qz, qw] = camera.extrinsics.quaternion
    const rotation = new Quaternion(qx, qy, qz, qw).normalize()
    const d = Math.max(0.08, cloud.medianDepth * 0.12)
    // Image corners at depth d in the RUB camera frame.
    const corner = (u: number, v: number) => new Vector3((u - cx) / fx * d, -(v - cy) / fy * d, -d)
    const [a, b, c, e] = [corner(0, 0), corner(width, 0), corner(width, height), corner(0, height)]
    const o = new Vector3()
    const lines = new BufferGeometry().setFromPoints([o, a, o, b, o, c, o, e, a, b, b, c, c, e, e, a])
    const lineMaterial = new LineBasicMaterial({ color: '#f2a31b' })
    const frustum = new Group()
    frustum.add(new LineSegments(lines, lineMaterial))
    const texture = new Texture(image)
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    const plane = new PlaneGeometry(b.x - a.x, a.y - e.y)
    const planeMaterial = new MeshBasicMaterial({ map: texture, side: DoubleSide, transparent: true, opacity: 0.92 })
    const photo = new Mesh(plane, planeMaterial)
    photo.position.set((a.x + b.x) / 2, (a.y + e.y) / 2, -d)
    frustum.add(photo)
    frustum.position.copy(position)
    frustum.quaternion.copy(rotation)
    frustums.add(frustum)
    disposables.push(lines, lineMaterial, texture, plane, planeMaterial)
    placed.push({ frame, position, rotation, fov: 2 * Math.atan(height / 2 / fy) * 180 / Math.PI, aspect: width / height, depth: cloud.medianDepth })
    bounds.push(position)
    const centre = bounds.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(bounds.length)
    const spread = Math.max(1, ...bounds.map(p => p.distanceTo(centre)), ...placed.map(p => p.depth))
    // Speed and draw distance grow with the scene; neither moves the view.
    view.far = Math.max(view.far, spread * 50)
    // About a third of the scene per second.
    speed = spread * 0.35
    if (!viewPlaced) {
     // Once, with the first frame: look at it from behind and above. Later frames just appear around the user.
     viewPlaced = true
     controls.target.copy(centre)
     view.position.copy(centre).add(new Vector3(0, spread * 1.2, spread * 1.8))
     view.lookAt(controls.target)
     syncAngles()
    }
    view.updateProjectionMatrix()
   }
   if (disposed) return
   setLoading(false)
  })().catch(reason => { if (!disposed) { setFailed(reason instanceof Error ? reason.message : 'The result could not be drawn.'); setLoading(false) } })

  return () => {
   disposed = true
   observer.disconnect()
   renderer.setAnimationLoop(null)
   canvas.removeEventListener('keydown', keyDown)
   canvas.removeEventListener('keyup', keyUp)
   canvas.removeEventListener('blur', blur)
   canvas.removeEventListener('pointerdown', pointerDown)
   canvas.removeEventListener('pointermove', pointerMove)
   canvas.removeEventListener('pointerup', pointerUp)
   canvas.removeEventListener('pointercancel', pointerUp)
   canvas.removeEventListener('wheel', wheel)
   document.removeEventListener('pointerlockchange', lockChange)
   document.removeEventListener('pointerlockerror', lockError)
   if (locked()) document.exitPointerLock()
   disposables.forEach(item => item.dispose())
   renderer.dispose()
   renderer.domElement.remove()
  }
  // The frames of one finished run never change; reload only when the run does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [usable.map(frame => frame.depthUrl).join('|'), bare])

 return <div className="spatial-viewer on-dark">
  <div className="spatial-stage" ref={host}>
   {loading && <Spinner block label="Building the point cloud" />}
   {failed && <p className="spatial-stage-error">{failed}</p>}
  </div>
  {bare ? <p className="spatial-hint spatial-hint--bare">Click the view to look around with the mouse, fly with W A S D (Shift = faster), Esc to let go. On touch, drag to look.</p> : <>
  <div className="spatial-strip-head">
   <span className="num">{current === null ? `${usable.length} cameras` : `${current + 1} of ${usable.length}`}</span>
   <span className="spatial-hint">Click the view to look around with the mouse, fly with W A S D (Shift faster), Esc to let go. Pick a photo to look from its camera.</span>
  </div>
  <ol className="spatial-strip">
   {usable.map((frame, position) => <li key={frame.index}>
    <button type="button" className="spatial-thumb" aria-pressed={current === position} disabled={loading}
     aria-label={`Look from photo ${pad(frame.pointSeq)}`} onClick={() => { setCurrent(position); goTo.current(frame.index) }}>
     <img src={frame.imageUrl!} alt="" loading="lazy" decoding="async" draggable={false} />
     <span className="frame-num">{pad(frame.pointSeq)}</span>
    </button>
   </li>)}
  </ol>
  </>}
 </div>
}
