import { useEffect, useRef, useState } from 'react'
import {
 BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
 PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Quaternion, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Spinner } from '../../../../shared/ui'
import { pad } from '../../../spaces/pages/SpacePage/spaceModel'
import type { SpatialFrame } from '../../api/tourRequests'
import { buildFrameCloud, loadImage } from './pointCloud'

type Placed = { frame: SpatialFrame; position: Vector3; rotation: Quaternion; fov: number; aspect: number; depth: number }

/** Point cloud of every photo's depth plus one textured frustum per photo; the strip below jumps to a photo's camera. */
export default function SpatialContextViewer({ frames }: { frames: SpatialFrame[] }) {
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
  const controls = new OrbitControls(view, renderer.domElement)
  controls.enableDamping = true
  const disposables: { dispose: () => void }[] = []
  const placed: Placed[] = []
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
   if (flight) {
    const t = reduced ? 1 : Math.min(1, (now - flight.start) / 700)
    const k = 1 - (1 - t) ** 3
    // Stop just behind the camera so its frustum stays in view.
    const to = flight.to.clone().lerp(flight.targetTo, -0.15)
    view.position.lerpVectors(flight.from, to, k)
    controls.target.lerpVectors(flight.targetFrom, flight.targetTo, k)
    view.fov = flight.fovFrom + (flight.fovTo - flight.fovFrom) * k
    view.updateProjectionMatrix()
    if (t >= 1) flight = null
   }
   controls.update()
   renderer.render(scene, view)
  })

  ;(async () => {
   const clouds = new Group(), frustums = new Group()
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
   }
   if (disposed) return
   // Start looking at the middle of the cameras from behind and above.
   const centre = bounds.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(Math.max(1, bounds.length))
   const spread = Math.max(1, ...bounds.map(p => p.distanceTo(centre)), ...placed.map(p => p.depth))
   controls.target.copy(centre)
   view.position.copy(centre).add(new Vector3(0, spread * 1.2, spread * 1.8))
   view.far = spread * 50
   view.updateProjectionMatrix()
   setLoading(false)
  })().catch(reason => { if (!disposed) { setFailed(reason instanceof Error ? reason.message : 'The result could not be drawn.'); setLoading(false) } })

  return () => {
   disposed = true
   observer.disconnect()
   renderer.setAnimationLoop(null)
   controls.dispose()
   disposables.forEach(item => item.dispose())
   renderer.dispose()
   renderer.domElement.remove()
  }
  // The frames of one finished run never change; reload only when the run does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [usable.map(frame => frame.depthUrl).join('|')])

 return <div className="spatial-viewer on-dark">
  <div className="spatial-stage" ref={host}>
   {loading && <Spinner block label="Building the point cloud" />}
   {failed && <p className="spatial-stage-error">{failed}</p>}
  </div>
  <div className="spatial-strip-head">
   <span className="num">{current === null ? `${usable.length} cameras` : `${current + 1} of ${usable.length}`}</span>
   <span className="spatial-hint">Drag to orbit, scroll to zoom. Pick a photo to look from its camera.</span>
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
 </div>
}
