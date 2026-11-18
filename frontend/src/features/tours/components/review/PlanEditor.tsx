import { useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Icon, InlineError, Panel, Segmented } from '../../../../shared/ui'
import PlanView, { type PlanMarker } from '../PlanView/PlanView'
import {
 MAX_POINTS_PER_GROUP, createPoint, deletePoint, planUrl, saveMarkerSizes, updatePoint,
 type PointInput, type TourArea, type TourDetail,
} from '../../api/tourRequests'
import FitPlan from './FitPlan'
import { errorText, pad } from './reviewText'
import './review.css'

type DraftPoint = { key: string; x: number; y: number; direction: number; note: string }
type AreaDraft = { captureGroup: number; points: DraftPoint[] }
/** What the server holds for a draft point, so only real differences are sent. */
type Synced = { id: number; x: number; y: number; direction: number; note: string }
/** One step back: an area's points as they were before a change. `tag` joins the many small steps of one drag into one: it names the change and the press it belongs to. */
type Undo = { areaId: number; points: DraftPoint[]; tag: string }
type Op =
 | { kind: 'delete'; key: string; id: number }
 | { kind: 'patch'; key: string; id: number; changes: Partial<PointInput>; next: Synced }
 | { kind: 'create'; key: string; areaId: number; point: DraftPoint }

/** Drags, turns and typing are saved once they pause; adding and deleting a point are saved at once. */
const SETTLE_MS = 500

const keyOf = (id: number) => 'p' + id
const toDraft = (area: TourArea): AreaDraft => ({
 captureGroup: area.captureGroup,
 points: [...area.points].sort((a, b) => a.seq - b.seq).map(point => ({ key: keyOf(point.id), x: point.x, y: point.y, direction: point.direction, note: point.note ?? '' })),
})
const toDrafts = (tour: TourDetail) => Object.fromEntries(tour.areas.map(area => [area.id, toDraft(area)])) as Record<number, AreaDraft>
const toSynced = (tour: TourDetail) => new Map(tour.areas.flatMap(area => area.points.map(point =>
 [keyOf(point.id), { id: point.id, x: point.x, y: point.y, direction: point.direction, note: point.note ?? '' }] as const)))

/** Deletes first (they free room in a floor plan), then changes, then new points. */
function pendingOps(drafts: Record<number, AreaDraft>, synced: Map<string, Synced>): Op[] {
 const deletes: Op[] = [], patches: Op[] = [], creates: Op[] = []
 const live = new Set<string>()
 for (const [areaId, draft] of Object.entries(drafts)) for (const point of draft.points) {
  live.add(point.key)
  const saved = synced.get(point.key)
  if (!saved) { creates.push({ kind: 'create', key: point.key, areaId: Number(areaId), point }); continue }
  const changes: Partial<PointInput> = {}
  if (saved.x !== point.x || saved.y !== point.y) { changes.x = point.x; changes.y = point.y }
  if (saved.direction !== point.direction) changes.direction = point.direction
  const note = point.note.trim()
  if (saved.note !== note) changes.note = note
  if (Object.keys(changes).length) patches.push({ kind: 'patch', key: point.key, id: saved.id, changes, next: { id: saved.id, x: point.x, y: point.y, direction: point.direction, note } })
 }
 for (const [key, saved] of synced) if (!live.has(key)) deletes.push({ kind: 'delete', key, id: saved.id })
 return [...deletes, ...patches, ...creates]
}

type Props = {
 tour: TourDetail
 onTour: (tour: TourDetail) => void
 /** send: the first plan, with "Send plan to customer" (SUBMITTED). live: the plan is already with the customer; every change shows to them right away. */
 mode?: 'send' | 'live'
 /** wide: plan and point list side by side. stack: plan above the list, for the column beside the photo viewer. */
 layout?: 'wide' | 'stack'
 /** The point shown in the photo viewer; the editor follows it. */
 focusPointId?: number | null
 /** Called when the operator picks a saved point on the plan or in the list. */
 onFocusPoint?: (pointId: number) => void
 /** Vertical space taken by everything else on screen, for sizing the plan. */
 reserve?: number
}

/**
 * The operator places, moves and aims the capture points of each area, in every status. Each change is saved
 * on its own (no Save button); the customer sees the spots once every floor with a plan has them, and every change after that at once.
 */
export default function PlanEditor({ tour, onTour, layout = 'wide', focusPointId, onFocusPoint, reserve }: Props) {
 const stack = layout === 'stack'
 const id = tour.id
 const [drafts, setDrafts] = useState<Record<number, AreaDraft>>(() => toDrafts(tour))
 const [synced, setSynced] = useState(() => toSynced(tour))
 const [areaId, setAreaId] = useState<number | null>(null)
 const [selectedKey, setSelectedKey] = useState<string | null>(null)
 // Slider positions while dragging; the value is saved when the slider is released.
 const [sizing, setSizing] = useState<Record<number, { dot: number; line: number }>>({})
 const [, setSaving] = useState(false)
 const [saveError, setSaveError] = useState('')
 const [error, setError] = useState('')
 const [confirming, setConfirming] = useState<{ areaId: number; key: string; label: number } | null>(null)
 const [history, setHistory] = useState<Undo[]>([])
 const [seenFocus, setSeenFocus] = useState(focusPointId)
 const [showGuide, setShowGuide] = useState(true)
 const nextKey = useRef(0)
 const gesture = useRef(0)

 // The save loop runs outside React's render, so it reads the latest state through refs.
 const draftsRef = useRef(drafts)
 const syncedRef = useRef(synced)
 const onTourRef = useRef(onTour)
 const running = useRef(false)
 const failedRef = useRef(false)
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
 useEffect(() => { draftsRef.current = drafts; onTourRef.current = onTour })

 async function apply(op: Op, current: Map<string, Synced>) {
  const next = new Map(current)
  if (op.kind === 'delete') {
   const updated = await deletePoint(id, op.id)
   next.delete(op.key)
   return { updated, next }
  }
  if (op.kind === 'patch') {
   const updated = await updatePoint(id, op.id, op.changes)
   next.set(op.key, op.next)
   return { updated, next }
  }
  const note = op.point.note.trim()
  const updated = await createPoint(id, op.areaId, { x: op.point.x, y: op.point.y, direction: op.point.direction, note: note || null })
  const known = new Set([...current.values()].map(saved => saved.id))
  const created = updated.areas.find(candidate => candidate.id === op.areaId)?.points
   .filter(point => !known.has(point.id)).sort((a, b) => b.id - a.id)[0]
  if (created) next.set(op.key, { id: created.id, x: op.point.x, y: op.point.y, direction: op.point.direction, note })
  return { updated, next }
 }

 async function flush() {
  if (timer.current) { clearTimeout(timer.current); timer.current = null }
  if (running.current) return
  running.current = true
  setSaving(true)
  try {
   for (;;) {
    const op = pendingOps(draftsRef.current, syncedRef.current)[0]
    if (!op) break
    const { updated, next } = await apply(op, syncedRef.current)
    syncedRef.current = next
    setSynced(next)
    onTourRef.current(updated)
   }
   setSaveError(''); failedRef.current = false
  } catch (reason) { setSaveError(errorText(reason)); failedRef.current = true }
  finally {
   running.current = false; setSaving(false)
   // A change made while the last request was finishing is picked up by the next round.
   if (!timer.current && pendingOps(draftsRef.current, syncedRef.current).length && !failedRef.current) schedule(SETTLE_MS)
  }
 }
 const flushRef = useRef(flush)
 useEffect(() => { flushRef.current = flush })
 function schedule(delay: number) {
  if (timer.current) clearTimeout(timer.current)
  timer.current = setTimeout(() => { timer.current = null; void flushRef.current() }, delay)
 }
 // Leaving the page (or the status changing under it) still saves the last change.
 useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; void flushRef.current() } }, [])

 const pending = pendingOps(drafts, synced).length > 0
 useEffect(() => {
  if (!pending) return
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
  window.addEventListener('beforeunload', warn)
  return () => window.removeEventListener('beforeunload', warn)
 }, [pending])

 function undo() {
  const step = history[history.length - 1]
  if (!step) return
  setHistory(current => current.slice(0, -1))
  setDrafts(current => { const base = current[step.areaId]; return base ? { ...current, [step.areaId]: { ...base, points: step.points } } : current })
  setAreaId(step.areaId); setSelectedKey(null); setError('')
  schedule(0)
 }
 const undoRef = useRef(undo)
 useEffect(() => { undoRef.current = undo })
 useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
   if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
    && !(event.target instanceof HTMLInputElement && event.target.type !== 'range') && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); undoRef.current() }
  }
  // Each press of the mouse or a key starts a new undo step.
  const onPress = () => { gesture.current++ }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keydown', onPress, true)
  window.addEventListener('pointerdown', onPress, true)
  return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onPress, true); window.removeEventListener('pointerdown', onPress, true) }
 }, [])

 // The photo viewer picked another point: show its area and select it here too.
 if (focusPointId !== seenFocus) {
  setSeenFocus(focusPointId)
  if (focusPointId != null) {
   const owner = tour.areas.find(candidate => candidate.points.some(point => point.id === focusPointId))
   const key = [...synced].find(([, saved]) => saved.id === focusPointId)?.[0]
   if (owner && key) { setAreaId(owner.id); setSelectedKey(key) }
  }
 }

 const rows = useRef(new Map<string, HTMLLIElement>())
 // A point picked on the plan brings its instruction into view in the list.
 useEffect(() => {
  if (selectedKey) rows.current.get(selectedKey)?.scrollIntoView({ block: 'nearest' })
 }, [selectedKey])

 // Beside the photo viewer one floor is shown at a time; on the full page every floor is its own section, as the customer sees them.
 const area = tour.areas.find(candidate => candidate.id === areaId) ?? tour.areas[0]
 if (!area) return <p className="rv-quiet">This space has no areas yet, so there is nothing to plan.</p>
 const shown = stack ? [area] : tour.areas
 const draftOf = (target: TourArea) => drafts[target.id] ?? toDraft(target)
 const serverPoint = (key: string) => {
  const saved = synced.get(key)
  return saved ? tour.areas.flatMap(candidate => candidate.points).find(point => point.id === saved.id) : undefined
 }

 const groupTotals: Record<number, number> = {}
 for (const candidate of tour.areas) {
  const entry = draftOf(candidate)
  groupTotals[entry.captureGroup] = (groupTotals[entry.captureGroup] ?? 0) + entry.points.length
 }
 const totalOf = (target: TourArea) => groupTotals[draftOf(target).captureGroup] ?? draftOf(target).points.length
 const sizeOf = (target: TourArea) => sizing[target.id] ?? { dot: target.dotSize, line: target.lineLength }

 function select(target: TourArea, key: string | null) {
  setAreaId(target.id); setSelectedKey(key)
  const saved = key ? synced.get(key) : undefined
  if (saved && onFocusPoint) { setSeenFocus(saved.id); onFocusPoint(saved.id) }
 }
 function edit(target: TourArea, change: (current: AreaDraft) => Partial<AreaDraft>, tag = '', delay = SETTLE_MS) {
  const before = draftOf(target).points
  const step = tag && tag + '@' + gesture.current
  setHistory(current => {
   const last = current[current.length - 1]
   if (step && last?.areaId === target.id && last.tag === step) return current
   return [...current.slice(-99), { areaId: target.id, points: before, tag: step }]
  })
  setDrafts(current => { const base = current[target.id] ?? toDraft(target); return { ...current, [target.id]: { ...base, ...change(base) } } })
  schedule(delay)
 }
 function editPoint(target: TourArea, key: string, change: Partial<DraftPoint>) {
  edit(target, current => ({ points: current.points.map(point => point.key === key ? { ...point, ...change } : point) }), Object.keys(change).join() + ':' + key)
 }
 function addPoint(target: TourArea, x: number, y: number, direction = 0) {
  if (totalOf(target) >= MAX_POINTS_PER_GROUP) { setError(`This floor plan already has ${MAX_POINTS_PER_GROUP} points, the most one capture can hold. Delete a point to add another.`); return }
  const key = 'n' + nextKey.current++
  edit(target, current => ({ points: [...current.points, { key, x, y, direction, note: '' }] }), '', 0)
  setAreaId(target.id); setSelectedKey(key)
 }
 function removePoint(target: TourArea, key: string) {
  edit(target, current => ({ points: current.points.filter(point => point.key !== key) }), '', 0)
  if (selectedKey === key) setSelectedKey(null)
  setError(''); setConfirming(null)
 }
 function askRemove(target: TourArea, key: string, label: number) {
  if (serverPoint(key)?.hasPhoto) setConfirming({ areaId: target.id, key, label })
  else removePoint(target, key)
 }
 function switchArea(next: number) { setAreaId(next); setSelectedKey(null) }

 function commitSizes(target: TourArea) {
  const sizes = sizing[target.id]
  if (!sizes || (sizes.dot === target.dotSize && sizes.line === target.lineLength)) return
  setError('')
  saveMarkerSizes(id, target.id, sizes.dot, sizes.line).then(updated => {
   onTour(updated)
   setSizing(current => { const next = { ...current }; delete next[target.id]; return next })
  }).catch(reason => setError(errorText(reason)))
 }
 const slider = (target: TourArea, label: string, field: 'dot' | 'line', min: number, max: number) => {
  const size = sizeOf(target)
  return <label className="rv-range">
   <span>{label}<b className="num">{size[field]}</b></span>
   <input type="range" min={min} max={max} step={1} value={size[field]}
    onChange={event => setSizing(current => ({ ...current, [target.id]: { ...size, [field]: Number(event.target.value) } }))}
    onPointerUp={() => commitSizes(target)} onKeyUp={() => commitSizes(target)} onBlur={() => commitSizes(target)} />
  </label>
 }
 // Beside the photos the plan also shows which points already have a photo.
 const stateOf = (key: string): PlanMarker['state'] => {
  if (!stack) return undefined
  const point = serverPoint(key)
  return !point ? 'pending' : point.retakeNote ? 'retake' : point.hasPhoto ? 'done' : 'pending'
 }

 // Saving is silent; only a failed save shows, with a way to retry.
 const saveState = saveError
  ? <span className="pe-status" role="status"><span className="pe-state pe-state--error"><i aria-hidden="true" />Not saved<button type="button" className="rv-text-button" onClick={() => { void flush() }}>Retry</button></span></span>
  : null

 const footer = <>
  <InlineError>{saveError ? 'Your last change is not saved. ' + saveError : error}</InlineError>
  {/* No send step: the customer sees the spots once every floor with a plan has them. */}
 </>

 const section = (target: TourArea) => {
  const draft = draftOf(target)
  const size = sizeOf(target)
  const total = totalOf(target)
  const full = total >= MAX_POINTS_PER_GROUP
  const sharing = tour.areas.filter(candidate => candidate.id !== target.id && drafts[candidate.id]?.captureGroup === draft.captureGroup)
  const selected = draft.points.find(point => point.key === selectedKey)
  return <section key={target.id} className="pe-section" aria-label={target.name}>
   {!stack && <div className="pe-section-head">
    <h2 className="rv-bar-title">{target.name}</h2>
   </div>}
   <div className="pe-body">
    <Panel variant="solid" padding="none" as="div" className="rv-well pe-well">
     {target.hasPlan
      ? <FitPlan src={planUrl(id, target.id)} reserve={reserve ?? 250}>
       <PlanView src={planUrl(id, target.id)} alt={'Floor plan of ' + target.name} selected={selected?.key ?? null}
        dotSize={size.dot} lineLength={size.line}
        markers={!showGuide ? [] : draft.points.map((point, index) => ({ key: point.key, label: index + 1, x: point.x, y: point.y, direction: point.direction, state: stateOf(point.key) }))}
        onSelect={key => select(target, String(key))}
        onPlanClick={showGuide ? (x, y) => addPoint(target, x, y) : undefined}
        onMove={(key, x, y) => editPoint(target, String(key), { x, y })}
        onRotate={(key, direction) => editPoint(target, String(key), { direction })} />
      </FitPlan>
      : <p className="rv-well-empty">The customer has not added this floor's plan yet.</p>}
    </Panel>

    <aside className="pe-side" aria-label={'Points of ' + target.name}>
     {target.hasPlan && <>
     {stack && saveState}
     {sharing.length > 0 && <p className="rv-fine">Counted together with {sharing.map(candidate => candidate.name).join(', ')}: they are captured as one floor plan.</p>}

     {draft.points.length
      ? <ol className="pe-points">{draft.points.map((point, index) => {
       const active = point.key === selectedKey
       const photo = serverPoint(point.key)?.hasPhoto
       return <li key={point.key} ref={node => { if (node) rows.current.set(point.key, node); else rows.current.delete(point.key) }} className={'pe-point' + (active ? ' is-selected' : '')}>
        <button type="button" className="pe-point-number num" aria-pressed={active} aria-label={'Select point ' + (index + 1)} onClick={() => select(target, active ? null : point.key)}>{pad(index + 1)}</button>
        <span className="pe-point-direction num">{point.direction}°{photo && <span className="pe-point-photo" title="Has a photo"><Icon name="image" size={14} /><span className="visually-hidden">has a photo</span></span>}</span>
        <button type="button" className="rv-icon-button rv-icon-button--danger" aria-label={'Delete point ' + (index + 1)} title="Delete point" onClick={() => askRemove(target, point.key, index + 1)}><Icon name="trash" size={16} /></button>
        {active && <div className="pe-point-more">
         <label className="rv-range">
          <span>Direction<b className="num">{point.direction}°</b></span>
          <input type="range" min={0} max={359} step={1} value={point.direction} onChange={event => editPoint(target, point.key, { direction: Number(event.target.value) })} />
         </label>
         <button type="button" className="rv-text-button" disabled={full} onClick={() => addPoint(target, point.x, point.y, (point.direction + 90) % 360)}><Icon name="plus" size={15} />Add another direction here</button>
        </div>}
       </li>
      })}</ol>
      : null}

     <div className="pe-sizes">
      <h3>Marker size</h3>
      {slider(target, 'Circle width', 'dot', 8, 40)}
      {slider(target, 'Line length', 'line', 10, 80)}
     </div>
     </>}
     {!target.hasPlan && <p className="rv-fine">Points can be placed here as soon as the customer adds the plan for {target.name}.</p>}
     {stack && footer}
    </aside>
   </div>
  </section>
 }

 const confirmArea = confirming ? tour.areas.find(candidate => candidate.id === confirming.areaId) : undefined
 return <div className={'pe' + (stack ? ' pe--stack' : '')}>
  <div className="rv-bar">
   {stack
    ? tour.areas.length > 1
     ? <Segmented aria-label="Area" value={area.id} onChange={switchArea} options={tour.areas.map(candidate => ({
      value: candidate.id, count: drafts[candidate.id]?.points.length ?? 0, label: candidate.name,
     }))} />
     : <h2 className="rv-bar-title">{area.name}</h2>
    : saveState ?? <span />}
   {tour.areas.some(candidate => candidate.hasPlan) && <Button variant="secondary" icon={showGuide ? 'check' : undefined} aria-pressed={showGuide} onClick={() => setShowGuide(value => !value)}>Guide</Button>}
  </div>

  {shown.map(section)}
  {!stack && <div className="pe-footer">{footer}</div>}

  {confirming && confirmArea && <ConfirmDialog title={`Delete point ${confirming.label}?`} confirmLabel="Delete point"
   onConfirm={() => removePoint(confirmArea, confirming.key)} onCancel={() => setConfirming(null)}>
   Point <strong>{pad(confirming.label)}</strong> in {confirmArea.name} already has a photo. Deleting the point deletes its photo too.
  </ConfirmDialog>}
 </div>
}
