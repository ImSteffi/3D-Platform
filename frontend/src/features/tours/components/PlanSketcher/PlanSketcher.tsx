import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { loadSketch, saveSketch } from './sketchStorage'
import { Button, InlineError } from '../../../../shared/ui'
import './PlanSketcher.css'

const W = 1200
const H = 800
const GRID = 20
const INK = '#17191b'
const MARK = '#7a4a00'
const FONT = 'Arial, Helvetica, sans-serif'

type Tool = 'select' | 'room' | 'wall' | 'pen' | 'door' | 'stairs' | 'text'
type Shape =
 | { id: number; kind: 'room'; x: number; y: number; w: number; h: number; label: string }
 | { id: number; kind: 'wall'; x1: number; y1: number; x2: number; y2: number }
 | { id: number; kind: 'pen'; points: [number, number][] }
 // Door and stairs may be resized; sketches saved before that have no w/h and use the default size.
 | { id: number; kind: 'door'; x: number; y: number; w?: number; h?: number }
 | { id: number; kind: 'stairs'; x: number; y: number; w?: number; h?: number }
 | { id: number; kind: 'text'; x: number; y: number; label: string }
type Box = [number, number, number, number]
/** Corner and side handles of the selection box; a wall has one handle per end instead. */
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2'
type Drag = { mode: 'draw'; start: [number, number] } | { mode: 'move'; id: number; last: [number, number] }
 | { mode: 'resize'; id: number; handle: Handle; original: Shape; from: Box }

const boxHandles: { handle: Handle; fx: number; fy: number }[] = [
 { handle: 'nw', fx: 0, fy: 0 }, { handle: 'n', fx: 0.5, fy: 0 }, { handle: 'ne', fx: 1, fy: 0 }, { handle: 'e', fx: 1, fy: 0.5 },
 { handle: 'se', fx: 1, fy: 1 }, { handle: 's', fx: 0.5, fy: 1 }, { handle: 'sw', fx: 0, fy: 1 }, { handle: 'w', fx: 0, fy: 0.5 },
]
const doorSize = (shape: { w?: number; h?: number }) => [shape.w ?? 40, shape.h ?? 40] as const
const stairsSize = (shape: { w?: number; h?: number }) => [shape.w ?? 60, shape.h ?? 100] as const

const tools: { tool: Tool; label: string; hint: string }[] = [
 { tool: 'room', label: 'Room', hint: 'Drag to draw a room, then type its name.' },
 { tool: 'wall', label: 'Wall', hint: 'Drag to draw a straight wall.' },
 { tool: 'door', label: 'Door', hint: 'Tap where a door is.' },
 { tool: 'stairs', label: 'Stairs', hint: 'Tap where the stairs are.' },
 { tool: 'text', label: 'Label', hint: 'Tap to place a label, then type its text.' },
 { tool: 'pen', label: 'Freehand', hint: 'Draw anything freely.' },
 { tool: 'select', label: 'Select', hint: 'Tap a shape to select it, drag to move it.' },
]

const snap = (value: number) => Math.round(value / GRID) * GRID
const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

function moved(shape: Shape, dx: number, dy: number): Shape {
 switch (shape.kind) {
  case 'wall': return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
  case 'pen': return { ...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy]) }
  default: return { ...shape, x: shape.x + dx, y: shape.y + dy }
 }
}

function bounds(shape: Shape): [number, number, number, number] {
 switch (shape.kind) {
  case 'room': return [shape.x, shape.y, shape.w, shape.h]
  case 'wall': return [Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2), Math.abs(shape.x2 - shape.x1), Math.abs(shape.y2 - shape.y1)]
  case 'pen': {
   const xs = shape.points.map(point => point[0]), ys = shape.points.map(point => point[1])
   return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
  }
  case 'door': { const [w, h] = doorSize(shape); return [shape.x, shape.y - h, w, h] }
  case 'stairs': { const [w, h] = stairsSize(shape); return [shape.x, shape.y, w, h] }
  case 'text': return [shape.x - 8, shape.y - 24, Math.max(40, shape.label.length * 13) + 16, 34]
 }
}

/** The selection box after dragging one of its handles to (x, y); never smaller than one grid step. */
function draggedBox([x, y, w, h]: Box, handle: Handle, px: number, py: number): Box {
 let [left, top, right, bottom] = [x, y, x + w, y + h]
 if (handle.includes('w')) left = Math.min(px, right - GRID)
 if (handle.includes('e')) right = Math.max(px, left + GRID)
 if (handle.includes('n')) top = Math.min(py, bottom - GRID)
 if (handle.includes('s')) bottom = Math.max(py, top + GRID)
 return [left, top, right - left, bottom - top]
}

/** The shape fitted to a new box (from its box when the drag started). Labels keep their size. */
function resized(shape: Shape, from: Box, [x, y, w, h]: Box): Shape {
 switch (shape.kind) {
  case 'room': return { ...shape, x, y, w, h }
  case 'door': return { ...shape, x, y: y + h, w, h }
  case 'stairs': return { ...shape, x, y, w, h }
  case 'pen': {
   const sx = from[2] ? w / from[2] : 1, sy = from[3] ? h / from[3] : 1
   return { ...shape, points: shape.points.map(([px, py]) => [x + (px - from[0]) * sx, y + (py - from[1]) * sy]) }
  }
  default: return shape
 }
}

// Shapes carry their styling as attributes so the exported image looks the same as the editor.
function draw(shape: Shape): ReactNode {
 switch (shape.kind) {
  case 'room': return <>
   <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill="#ffffff" stroke={INK} strokeWidth={4} />
   <text x={shape.x + shape.w / 2} y={shape.y + shape.h / 2 + 7} textAnchor="middle" fontFamily={FONT} fontSize={22} fill={INK}>{shape.label}</text>
  </>
  case 'wall': return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={INK} strokeWidth={6} strokeLinecap="round" />
  case 'pen': return <polyline points={shape.points.map(point => point.join(',')).join(' ')} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  case 'door': {
   const [w, h] = doorSize(shape)
   return <>
    <rect x={shape.x} y={shape.y - h} width={w} height={h} fill="#ffffff" fillOpacity={0} />
    <path d={`M${shape.x} ${shape.y}V${shape.y - h}A${w} ${h} 0 0 1 ${shape.x + w} ${shape.y}`} fill="none" stroke={MARK} strokeWidth={4} strokeLinecap="round" />
    <text x={shape.x + w / 2} y={shape.y + 18} textAnchor="middle" fontFamily={FONT} fontSize={14} fill={MARK}>Door</text>
   </>
  }
  case 'stairs': {
   const [w, h] = stairsSize(shape)
   // Steps keep roughly the same spacing however long the stairs are drawn.
   const steps = Math.max(2, Math.round(h / 14) - 1)
   return <>
    <rect x={shape.x} y={shape.y} width={w} height={h} fill="#ffffff" stroke={MARK} strokeWidth={3} />
    {Array.from({ length: steps }, (_, index) => {
     const y = shape.y + (index + 1) * h / (steps + 1)
     return <line key={index} x1={shape.x} x2={shape.x + w} y1={y} y2={y} stroke={MARK} strokeWidth={2} />
    })}
    <text x={shape.x + w / 2} y={shape.y + h + 18} textAnchor="middle" fontFamily={FONT} fontSize={14} fill={MARK}>Stairs</text>
   </>
  }
  case 'text': {
   // A transparent box makes the label easy to hit; the text itself ignores the pointer.
   const [x, y, w, h] = bounds(shape)
   return <>
    <rect x={x} y={y} width={w} height={h} fill="#ffffff" fillOpacity={0} />
    <text x={shape.x} y={shape.y} fontFamily={FONT} fontSize={22} fill={INK}>{shape.label}</text>
   </>
  }
 }
}

async function toPng(svg: SVGSVGElement): Promise<File> {
 const clone = svg.cloneNode(true) as SVGSVGElement
 clone.querySelectorAll('[data-ui]').forEach(node => node.remove())
 clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
 clone.setAttribute('width', String(W))
 clone.setAttribute('height', String(H))
 const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
 try {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
   image.onload = () => resolve()
   image.onerror = () => reject(new Error('Could not render the sketch.'))
   image.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = W * 1.5
  canvas.height = H * 1.5
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not render the sketch.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not render the sketch.')
  return new File([blob], 'floor-plan-sketch.png', { type: 'image/png' })
 } finally { URL.revokeObjectURL(url) }
}

type Props = {
 title: string
 /** Where the editable shapes are kept on this device so the sketch can be reopened. */
 storageKey: string
 /** Resolves true once the image is uploaded; the sketcher stays open otherwise. */
 onSave: (file: File) => Promise<boolean>
 onClose: () => void
}

export default function PlanSketcher({ title, storageKey, onSave, onClose }: Props) {
 const [shapes, setShapes] = useState<Shape[]>(() => loadSketch<Shape>(storageKey))
 const [undo, setUndo] = useState<Shape[][]>([])
 const [tool, setTool] = useState<Tool>('room')
 const [selected, setSelected] = useState<number | null>(null)
 const [draft, setDraft] = useState<Shape | null>(null)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const dialog = useRef<HTMLDialogElement>(null)
 const svg = useRef<SVGSVGElement>(null)
 const labelInput = useRef<HTMLInputElement>(null)
 const drag = useRef<Drag | null>(null)
 const nextId = useRef(shapes.reduce((max, shape) => Math.max(max, shape.id), 0) + 1)
 useEffect(() => {
  const element = dialog.current
  if (element && !element.open) element.showModal()
 }, [])
 const current = shapes.find(shape => shape.id === selected) ?? null
 const labelled = current && (current.kind === 'room' || current.kind === 'text') ? current : null

 function change(next: Shape[]) {
  setUndo(history => [...history.slice(-49), shapes])
  setShapes(next)
 }
 function add(shape: Shape, focusLabel: boolean) {
  change([...shapes, shape])
  setSelected(shape.id)
  if (focusLabel) requestAnimationFrame(() => labelInput.current?.select())
 }
 function at(event: PointerEvent<SVGSVGElement>): [number, number] {
  const box = event.currentTarget.getBoundingClientRect()
  return [clamp((event.clientX - box.left) / box.width * W, W), clamp((event.clientY - box.top) / box.height * H, H)]
 }
 function down(event: PointerEvent<SVGSVGElement>) {
  if (saving || !event.isPrimary) return
  const point = at(event)
  const [x, y] = [snap(point[0]), snap(point[1])]
  const id = nextId.current
  // A handle of the selected shape resizes it, whichever tool is active.
  const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle') as Handle | null
  if (handle && current) {
   setUndo(history => [...history.slice(-49), shapes])
   drag.current = { mode: 'resize', id: current.id, handle, original: current, from: bounds(current) }
   event.currentTarget.setPointerCapture(event.pointerId)
   return
  }
  if (tool === 'select') {
   const hit = Number((event.target as Element).closest('[data-id]')?.getAttribute('data-id'))
   if (!hit) { setSelected(null); return }
   setSelected(hit)
   setUndo(history => [...history.slice(-49), shapes])
   drag.current = { mode: 'move', id: hit, last: point }
  } else if (tool === 'door' || tool === 'stairs') {
   nextId.current += 1
   add({ id, kind: tool, x, y }, false)
   return
  } else if (tool === 'text') {
   nextId.current += 1
   add({ id, kind: 'text', x, y, label: 'Label' }, true)
   return
  } else {
   drag.current = { mode: 'draw', start: [x, y] }
   setSelected(null)
   setDraft(tool === 'room' ? { id, kind: 'room', x, y, w: 0, h: 0, label: '' }
    : tool === 'wall' ? { id, kind: 'wall', x1: x, y1: y, x2: x, y2: y }
    : { id, kind: 'pen', points: [point] })
  }
  event.currentTarget.setPointerCapture(event.pointerId)
 }
 function move(event: PointerEvent<SVGSVGElement>) {
  const active = drag.current
  if (!active) return
  const point = at(event)
  if (active.mode === 'move') {
   const [dx, dy] = [point[0] - active.last[0], point[1] - active.last[1]]
   active.last = point
   setShapes(list => list.map(shape => shape.id === active.id ? moved(shape, dx, dy) : shape))
   return
  }
  const [x, y] = [snap(point[0]), snap(point[1])]
  if (active.mode === 'resize') {
   const original = active.original
   const next: Shape = original.kind === 'wall'
    ? active.handle === 'p1' ? { ...original, x1: x, y1: y } : { ...original, x2: x, y2: y }
    : resized(original, active.from, draggedBox(active.from, active.handle, x, y))
   setShapes(list => list.map(shape => shape.id === active.id ? next : shape))
   return
  }
  setDraft(shape => {
   if (!shape) return shape
   if (shape.kind === 'room') return { ...shape, x: Math.min(active.start[0], x), y: Math.min(active.start[1], y), w: Math.abs(x - active.start[0]), h: Math.abs(y - active.start[1]) }
   if (shape.kind === 'wall') return { ...shape, x2: x, y2: y }
   if (shape.kind === 'pen') return { ...shape, points: [...shape.points, point] }
   return shape
  })
 }
 function up() {
  const active = drag.current
  drag.current = null
  if (active?.mode !== 'draw' || !draft) return
  setDraft(null)
  const usable = draft.kind === 'room' ? draft.w >= GRID && draft.h >= GRID
   : draft.kind === 'wall' ? draft.x1 !== draft.x2 || draft.y1 !== draft.y2
   : draft.kind === 'pen' && draft.points.length > 2
  if (!usable) return
  nextId.current += 1
  add(draft, draft.kind === 'room')
 }
 function relabel(label: string) {
  if (!labelled) return
  setShapes(list => list.map(shape => shape.id === labelled.id && (shape.kind === 'room' || shape.kind === 'text') ? { ...shape, label } : shape))
 }
 function removeSelected() {
  if (selected === null) return
  change(shapes.filter(shape => shape.id !== selected))
  setSelected(null)
 }
 function undoLast() {
  const previous = undo.at(-1)
  if (!previous) return
  setUndo(history => history.slice(0, -1))
  setShapes(previous)
  setSelected(null)
 }
 async function save() {
  if (!svg.current || !shapes.length || saving) return
  setSaving(true); setError('')
  try {
   saveSketch(storageKey, shapes)
   if (await onSave(await toPng(svg.current))) onClose()
   else setError('Could not save the sketch. Please try again.')
  } catch (reason) {
   setError(reason instanceof Error ? reason.message : 'Could not save the sketch. Please try again.')
  } finally { setSaving(false) }
 }
 const box = current ? bounds(current) : null
 return <dialog ref={dialog} className="sketcher" aria-label={'Draw the floor plan of ' + title} onCancel={event => event.preventDefault()}>
  <header className="sketcher-head">
   <h2>Draw {title}</h2>
   <div className="sketcher-head-actions">
    <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
    <Button loading={saving} disabled={!shapes.length} onClick={() => { void save() }}>Save floor plan</Button>
   </div>
  </header>
  <div className="sketcher-tools" role="toolbar" aria-label="Drawing tools">
   {tools.map(item => <button key={item.tool} type="button" className={'sketcher-tool' + (tool === item.tool ? ' is-active' : '')} aria-pressed={tool === item.tool} onClick={() => { setTool(item.tool); if (item.tool !== 'select') setSelected(null) }}>{item.label}</button>)}
   <span className="sketcher-gap" />
   <button type="button" className="sketcher-tool" disabled={!undo.length} onClick={undoLast}>Undo</button>
   <button type="button" className="sketcher-tool" disabled={selected === null} onClick={removeSelected}>Delete</button>
   <button type="button" className="sketcher-tool" disabled={!shapes.length} onClick={() => { change([]); setSelected(null) }}>Clear</button>
  </div>
  <div className="sketcher-bar">
   {labelled ? <label className="sketcher-label">Name
    <input ref={labelInput} value={labelled.label} maxLength={40} placeholder="e.g. Kitchen" onChange={event => relabel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
   </label> : <p>{tools.find(item => item.tool === tool)?.hint}</p>}
  </div>
  <InlineError className="sketcher-error">{error}</InlineError>
  <div className="sketcher-stage">
   <svg ref={svg} className={'sketcher-canvas sketcher-canvas--' + tool} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <rect width={W} height={H} fill="#fbfaf7" />
    <g data-ui>
     {Array.from({ length: W / 40 - 1 }, (_, index) => <line key={'v' + index} x1={(index + 1) * 40} x2={(index + 1) * 40} y1={0} y2={H} stroke="#e6e2d9" strokeWidth={1} />)}
     {Array.from({ length: H / 40 - 1 }, (_, index) => <line key={'h' + index} y1={(index + 1) * 40} y2={(index + 1) * 40} x1={0} x2={W} stroke="#e6e2d9" strokeWidth={1} />)}
    </g>
    {shapes.map(shape => <g key={shape.id} data-id={shape.id}>{draw(shape)}</g>)}
    {draft && <g opacity={0.6}>{draw(draft)}</g>}
    {box && current?.kind !== 'wall' && <rect data-ui x={box[0] - 8} y={box[1] - 8} width={box[2] + 16} height={box[3] + 16} fill="none" stroke="#f2a31b" strokeWidth={3} strokeDasharray="10 7" pointerEvents="none" />}
    {/* Drag a handle to resize: corners change both sides, side handles one. A wall has a handle at each end. */}
    {current && box && current.kind !== 'text' && <g data-ui className="sketcher-handles">
     {current.kind === 'wall'
      ? ([['p1', current.x1, current.y1], ['p2', current.x2, current.y2]] as const).map(([handle, cx, cy]) =>
        <circle key={handle} data-handle={handle} className="sketcher-handle" cx={cx} cy={cy} r={10} />)
      : boxHandles.map(({ handle, fx, fy }) =>
        <circle key={handle} data-handle={handle} className={`sketcher-handle sketcher-handle--${handle}`}
         cx={box[0] - 8 + (box[2] + 16) * fx} cy={box[1] - 8 + (box[3] + 16) * fy} r={9} />)}
    </g>}
   </svg>
  </div>
 </dialog>
}
