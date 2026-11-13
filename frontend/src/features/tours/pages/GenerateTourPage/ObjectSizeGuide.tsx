import { useEffect, useRef, useState } from 'react'

type Point = [number, number, number]
type Project = (point: Point) => [number, number]
type Visual = { size: Point }
const examples = [
 { name: 'Chair', size: [.85, 1.15, .85] as Point },
 { name: 'Table', size: [1.55, .8, .95] as Point },
 { name: 'Lamp', size: [.65, 1.55, .65] as Point },
]
const points = (vertices: Point[], project: Project) => vertices.map(vertex => project(vertex).join(',')).join(' ')
function Box({ from, to, project }: { from: Point; to: Point; project: Project }) {
 const [x,y,z] = from
 const [X,Y,Z] = to
 return <g stroke="#a6b0aa" strokeWidth=".8" strokeLinejoin="round">
  <polygon points={points([[x,y,z],[X,y,z],[X,Y,z],[x,Y,z]], project)} fill="#596c61" />
  <polygon points={points([[x,y,z],[x,y,Z],[x,Y,Z],[x,Y,z]], project)} fill="#3e5146" />
  <polygon points={points([[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]], project)} fill="#81988a" />
 </g>
}
function Ring({ y, radius, project, fill }: { y: number; radius: number; project: Project; fill: string }) {
 const vertices: Point[] = Array.from({ length: 40 }, (_, i) => {
  const angle = i / 40 * Math.PI * 2
  return [.5 + Math.cos(angle) * radius, y, .5 + Math.sin(angle) * radius]
 })
 return <polygon points={points(vertices, project)} fill={fill} stroke="#a6b0aa" strokeWidth=".8" />
}
function LampShade({ project }: { project: Project }) {
 const segments = Array.from({ length: 40 }, (_, index) => {
  const a = index / 40 * Math.PI * 2
  const b = (index + 1) / 40 * Math.PI * 2
  const vertex = (angle: number, radius: number, y: number): Point => [.5 + Math.cos(angle) * radius, y, .5 + Math.sin(angle) * radius]
  const vertices = [vertex(a,.5,.66),vertex(b,.5,.66),vertex(b,.25,1),vertex(a,.25,1)]
  const depth = vertices.reduce((sum,point) => sum + point[0] * .64 + point[2], 0)
  const light = Math.round(104 + Math.cos(a - .8) * 22)
  return { index, vertices, depth, fill: 'rgb(' + (light - 14) + ' ' + (light + 8) + ' ' + (light - 3) + ')' }
 }).sort((a,b) => b.depth - a.depth)
 return <g>
  {segments.map(segment => <polygon key={segment.index} points={points(segment.vertices,project)} fill={segment.fill} stroke={segment.fill} strokeWidth=".4" />)}
  <Ring y={1} radius={.25} fill="#a3b5a9" project={project} />
 </g>
}
function Measure({ from, to, label, vertical = false }: { from: [number,number]; to: [number,number]; label: string; vertical?: boolean }) {
 const dx = to[0] - from[0]
 const dy = to[1] - from[1]
 const length = Math.hypot(dx,dy)
 const px = -dy / length * 4
 const py = dx / length * 4
 const x = (from[0] + to[0]) / 2 + (vertical ? -12 : label === 'Depth' ? -16 : 0)
 const y = (from[1] + to[1]) / 2 + (vertical ? 0 : label === 'Depth' ? 14 : 17)
 return <g>
  <g stroke="#ff803c" strokeWidth="1.6" fill="none">
   <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
   {[from,to].map((point,index) => <line key={index} x1={point[0]-px} y1={point[1]-py} x2={point[0]+px} y2={point[1]+py} />)}
  </g>
  <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" transform={vertical ? 'rotate(-90 ' + x + ' ' + y + ')' : undefined}>{label}</text>
 </g>
}
export default function ObjectSizeGuide() {
 const [selected, setSelected] = useState(0)
 const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
 const [visual, setVisual] = useState<Visual>({ size: examples[0].size })
 const current = useRef(visual)
 useEffect(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const update = () => setReducedMotion(preference.matches)
  preference.addEventListener('change', update)
  return () => preference.removeEventListener('change', update)
 }, [])
 useEffect(() => {
  if (reducedMotion) return
  const timer = setInterval(() => setSelected(value => (value + 1) % examples.length), 4500)
  return () => clearInterval(timer)
 }, [reducedMotion])
 useEffect(() => {
  const start = current.current
  const target: Visual = { size: examples[selected].size }
  let frame = 0
  let began: number | undefined
  const animate = (time: number) => {
   began ??= time
   const progress = reducedMotion ? 1 : Math.min(1, (time - began) / 1000)
   const eased = progress * progress * (3 - 2 * progress)
   const mix = (from: Point, to: Point) => from.map((value,index) => value + (to[index] - value) * eased) as Point
   const next = { size: mix(start.size,target.size) }
   current.current = next
   setVisual(next)
   if (progress < 1) frame = requestAnimationFrame(animate)
  }
  frame = requestAnimationFrame(animate)
  return () => cancelAnimationFrame(frame)
 }, [selected, reducedMotion])
 const project: Project = ([x,y,z]) => [
  140 + (x - .5) * visual.size[0] * 75 - (z - .5) * visual.size[2] * 48,
  205 - y * visual.size[1] * 92 - z * visual.size[2] * 30,
 ]
 const vertices = (values: Point[]) => points(values,project)
 const frontLeft = project([0,0,0])
 const frontRight = project([1,0,0])
 const backLeft = project([0,0,1])
 const topBackLeft = project([0,1,1])
 return <figure className="object-scale-guide object-scale-guide--examples">
  <svg viewBox="18 28 244 202" role="img" aria-label={examples[selected].name + ' inside a grey bounding box, with orange width, height and depth measurements.'}>
   <g stroke="#747a82" strokeWidth="1" strokeLinejoin="round">
    <polygon points={vertices([[0,0,0],[1,0,0],[1,0,1],[0,0,1]])} fill="#858b9410" />
    <polygon points={vertices([[0,0,1],[1,0,1],[1,1,1],[0,1,1]])} fill="#858b940b" />
    <polyline points={vertices([[0,0,0],[0,0,1],[0,1,1],[1,1,1],[1,0,1],[1,0,0]])} fill="none" strokeDasharray="3 3" opacity=".65" />
   </g>
   {selected !== 2 && <g>
    {([.91,0] as const).flatMap(z => ([.91,0] as const).map(x => <Box key={x + ':' + z} from={[x,0,z]} to={[x+.09,selected === 0 ? .46 : .92,z+.09]} project={project} />))}
    <Box from={[0,selected === 0 ? .44 : .91,0]} to={[1,selected === 0 ? .53 : 1,1]} project={project} />
    {selected === 0 && <Box from={[0,.53,.9]} to={[1,1,1]} project={project} />}
   </g>}
   {selected === 2 && <g>
    <Ring y={.025} radius={.29} fill="#596c61" project={project} />
    <Box from={[.475,.025,.475]} to={[.525,.8,.525]} project={project} />
    <LampShade project={project} />
   </g>}
   <g stroke="#8a9098" strokeWidth="1.1" fill="none" strokeLinejoin="round">
    <polyline points={vertices([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,0]])} />
    <polyline points={vertices([[0,1,0],[0,1,1],[1,1,1],[1,1,0]])} />
    <line x1={project([0,0,0])[0]} y1={project([0,0,0])[1]} x2={backLeft[0]} y2={backLeft[1]} />
   </g>
   <Measure from={frontLeft} to={frontRight} label="Width" />
   <Measure from={backLeft} to={topBackLeft} label="Height" vertical />
   <Measure from={frontLeft} to={backLeft} label="Depth" />
  </svg>
 </figure>
}
