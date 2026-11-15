import { useEffect, useRef, useState } from 'react'
import { Button, Icon, InlineError, Panel, Segmented } from '../../../../shared/ui'
import PlanView from '../PlanView/PlanView'
import {
 MAX_POINTS_PER_GROUP, planUrl, saveAreaPoints, saveMarkerSizes, sendPlan, type TourArea, type TourDetail,
} from '../../api/tourRequests'
import FitPlan from './FitPlan'
import { errorText, pad } from './reviewText'
import './review.css'

type DraftPoint = { key: string; x: number; y: number; direction: number; note: string }
/** `revision` counts the changes, so a save that finishes late does not mark newer changes as saved. */
type AreaDraft = { captureGroup: number; points: DraftPoint[]; dirty: boolean; revision: number }
/** One step back: an area's points as they were before a change. `tag` joins the many small steps of one drag into one: it names the change and the press it belongs to. */
type Undo = { areaId: number; points: DraftPoint[]; tag: string }
const AUTOSAVE_MS = 700

const toDraft = (area: TourArea): AreaDraft => ({
 captureGroup: area.captureGroup, dirty: false, revision: 0,
 points: area.points.map(point => ({ key: 'p' + point.id, x: point.x, y: point.y, direction: point.direction, note: point.note ?? '' })),
})
const toDrafts = (tour: TourDetail) => Object.fromEntries(tour.areas.map(area => [area.id, toDraft(area)])) as Record<number, AreaDraft>

type Props = {
 tour: TourDetail
 onTour: (tour: TourDetail) => void
 /** send (default): changes save by themselves, then the whole plan is sent. publish: saving an area is what shows it to the customer, so it stays a button. */
 mode?: 'send' | 'publish'
 /** Limits the editor to these areas. Default: every area. */
 areaIds?: number[]
}

/**
 * The operator places, moves and aims the capture points of each area. SUBMITTED: every area, then "Send plan".
 * PLAN_READY: only floors the customer added later; saving one publishes it straight away.
 */
export default function PlanEditor({ tour, onTour, mode = 'send', areaIds }: Props) {
 const publish = mode === 'publish'
 const id = tour.id
 const [drafts, setDrafts] = useState<Record<number, AreaDraft>>(() => toDrafts(tour))
 const [areaId, setAreaId] = useState<number | null>(null)
 const [selectedKey, setSelectedKey] = useState<string | null>(null)
 // Slider positions while dragging; the value is saved when the slider is released.
 const [sizing, setSizing] = useState<Record<number, { dot: number; line: number }>>({})
 const [busy, setBusy] = useState<'' | 'save' | 'send'>('')
 const [error, setError] = useState('')
 const nextKey = useRef(0)
 const gesture = useRef(0)
 const [history, setHistory] = useState<Undo[]>([])
 /** The area whose last automatic save failed, and at which revision: it is not retried until something changes. */
 const [failed, setFailed] = useState<{ areaId: number; revision: number } | null>(null)
 const autosave = !publish

 function undo() {
  const step = history[history.length - 1]
  if (!step) return
  setHistory(current => current.slice(0, -1))
  setDrafts(current => { const base = current[step.areaId]; return base ? { ...current, [step.areaId]: { ...base, points: step.points, dirty: true, revision: base.revision + 1 } } : current })
  setAreaId(step.areaId); setSelectedKey(null); setError('')
 }
 async function save(target: number) {
  const saving = drafts[target]
  if (busy || !saving) return
  setBusy('save'); setError('')
  try {
   const updated = await saveAreaPoints(id, target, saving.captureGroup, saving.points.map(point => ({
    x: point.x, y: point.y, direction: point.direction, note: point.note.trim() || null,
   })))
   if (autosave) {
    // The draft stays as it is (a drag may be under way); it is only marked saved if nothing changed meanwhile.
    setDrafts(current => { const now = current[target]; return now && now.revision === saving.revision ? { ...current, [target]: { ...now, dirty: false } } : current })
    setFailed(null)
   } else {
    const saved = updated.areas.find(candidate => candidate.id === target)
    if (saved) setDrafts(current => ({ ...current, [target]: toDraft(saved) }))
    setSelectedKey(null)
   }
   onTour(updated)
  } catch (reason) { if (autosave) setFailed({ areaId: target, revision: saving.revision }); setError(errorText(reason)) }
  finally { setBusy('') }
 }

 // Effects call the latest save and undo through these.
 const saveRef = useRef(save)
 const undoRef = useRef(undo)
 useEffect(() => { saveRef.current = save; undoRef.current = undo })

 const pendingId = autosave ? tour.areas.find(candidate => drafts[candidate.id]?.dirty
  && !(failed?.areaId === candidate.id && failed.revision === drafts[candidate.id].revision))?.id : undefined
 useEffect(() => {
  if (pendingId == null || busy) return
  const timer = setTimeout(() => { void saveRef.current(pendingId) }, AUTOSAVE_MS)
  return () => clearTimeout(timer)
 }, [pendingId, busy, drafts])
 useEffect(() => {
  if (!autosave) return
  const onKey = (event: KeyboardEvent) => {
   if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
    && !(event.target instanceof HTMLInputElement && event.target.type !== 'range')) { event.preventDefault(); undoRef.current() }
  }
  // Each press of the mouse or a key starts a new undo step.
  const onPress = () => { gesture.current++ }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keydown', onPress, true)
  window.addEventListener('pointerdown', onPress, true)
  return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onPress, true); window.removeEventListener('pointerdown', onPress, true) }
 }, [autosave])
 const rows = useRef(new Map<string, HTMLLIElement>())

 // A point picked on the plan brings its instruction into view in the list.
 useEffect(() => {
  if (selectedKey) rows.current.get(selectedKey)?.scrollIntoView({ block: 'nearest' })
 }, [selectedKey])

 const areas = areaIds ? tour.areas.filter(candidate => areaIds.includes(candidate.id)) : tour.areas
 const area = areas.find(candidate => candidate.id === areaId) ?? areas[0]
 if (!area) return publish ? null : <p className="rv-quiet">This space has no areas yet, so there is nothing to plan.</p>
 const draft = drafts[area.id] ?? toDraft(area)
 const selected = draft.points.find(point => point.key === selectedKey)

 const groupTotals: Record<number, number> = {}
 for (const candidate of tour.areas) {
  const entry = drafts[candidate.id] ?? toDraft(candidate)
  if (entry) groupTotals[entry.captureGroup] = (groupTotals[entry.captureGroup] ?? 0) + entry.points.length
 }
 const groupTotal = groupTotals[draft.captureGroup] ?? draft.points.length
 const sharing = tour.areas.filter(candidate => candidate.id !== area.id && drafts[candidate.id]?.captureGroup === draft.captureGroup)
 const full = groupTotal >= MAX_POINTS_PER_GROUP
 const anyDirty = tour.areas.some(candidate => drafts[candidate.id]?.dirty)
 const anyEmpty = tour.areas.some(candidate => !drafts[candidate.id]?.points.length)
 const noPlan = tour.areas.filter(candidate => !candidate.hasPlan)
 const anyOver = Object.values(groupTotals).some(total => total > MAX_POINTS_PER_GROUP)
 const size = sizing[area.id] ?? { dot: area.dotSize, line: area.lineLength }

 function edit(change: (current: AreaDraft) => Partial<AreaDraft>, tag = '') {
  const target = area.id
  const step = tag && tag + '@' + gesture.current
  setHistory(current => {
   const last = current[current.length - 1]
   if (step && last?.areaId === target && last.tag === step) return current
   return [...current.slice(-99), { areaId: target, points: draft.points, tag: step }]
  })
  setDrafts(current => { const base = current[target] ?? toDraft(area); return { ...current, [target]: { ...base, ...change(base), dirty: true, revision: base.revision + 1 } } })
 }
 function editPoint(key: string, change: Partial<DraftPoint>) {
  edit(current => ({ points: current.points.map(point => point.key === key ? { ...point, ...change } : point) }), Object.keys(change).join() + ':' + key)
 }
 function addPoint(x: number, y: number, direction = 0) {
  if (full) { setError(`This floor plan already has ${MAX_POINTS_PER_GROUP} points, the most one capture can hold. Delete a point to add another.`); return }
  const key = 'n' + nextKey.current++
  edit(current => ({ points: [...current.points, { key, x, y, direction, note: '' }] }))
  setSelectedKey(key)
 }
 function removePoint(key: string) {
  edit(current => ({ points: current.points.filter(point => point.key !== key) }))
  if (selectedKey === key) setSelectedKey(null)
  setError('')
 }
 function switchArea(next: number) { setAreaId(next); setSelectedKey(null) }

 async function send() {
  if (busy) return
  setBusy('send'); setError('')
  try { onTour(await sendPlan(id)) }
  catch (reason) { setError(errorText(reason)) }
  finally { setBusy('') }
 }
 function commitSizes() {
  const pending = sizing[area.id]
  if (!pending || (pending.dot === area.dotSize && pending.line === area.lineLength)) return
  const target = area.id
  setError('')
  saveMarkerSizes(id, target, pending.dot, pending.line).then(updated => {
   onTour(updated)
   setSizing(current => { const next = { ...current }; delete next[target]; return next })
  }).catch(reason => setError(errorText(reason)))
 }
 const slider = (label: string, field: 'dot' | 'line', min: number, max: number) => <label className="rv-range">
  <span>{label}<b className="num">{size[field]}</b></span>
  <input type="range" min={min} max={max} step={1} value={size[field]}
   onChange={event => setSizing(current => ({ ...current, [area.id]: { ...size, [field]: Number(event.target.value) } }))}
   onPointerUp={commitSizes} onKeyUp={commitSizes} onBlur={commitSizes} />
 </label>

 const sendNote = noPlan.length ? `The customer has not added the plan for ${noPlan.map(candidate => candidate.name).join(', ')} yet. The plan can be sent once every floor has one.`
  : anyDirty ? (failed ? 'Your last change is not saved yet.' : 'Saving your changes…')
  : anyEmpty ? 'Every area needs at least one point.'
  : anyOver ? `A floor plan has more than ${MAX_POINTS_PER_GROUP} photos.`
  : 'The customer will be able to take their photos.'

 return <div className="pe">
  <div className="rv-bar">
   {areas.length > 1
    ? <Segmented aria-label="Area" value={area.id} onChange={switchArea} options={areas.map(candidate => ({
     value: candidate.id, count: drafts[candidate.id]?.points.length ?? 0,
     label: <>{candidate.name}{publish && drafts[candidate.id]?.dirty && <span className="pe-unsaved" role="img" aria-label="unsaved changes" />}</>,
    }))} />
    : <h2 className="rv-bar-title">{area.name}</h2>}
  </div>
  <div className="pe-body">
   <Panel variant="solid" padding="none" as="div" className="rv-well pe-well">
    {area.hasPlan
     ? <FitPlan src={planUrl(id, area.id)} reserve={250}>
      <PlanView src={planUrl(id, area.id)} alt={'Floor plan of ' + area.name} selected={selected?.key ?? null}
       dotSize={size.dot} lineLength={size.line}
       markers={draft.points.map((point, index) => ({ key: point.key, label: index + 1, x: point.x, y: point.y, direction: point.direction }))}
       onSelect={key => setSelectedKey(String(key))}
       onPlanClick={(x, y) => addPoint(x, y)}
       onMove={(key, x, y) => editPoint(String(key), { x, y })}
       onRotate={(key, direction) => editPoint(String(key), { direction })} />
     </FitPlan>
     : <p className="rv-well-empty">The customer has not added this floor's plan yet.</p>}
   </Panel>

   <aside className="pe-side" aria-label={'Points of ' + area.name}>
    {area.hasPlan && <>
    <div className="pe-side-head">
     <span className={'num pe-count' + (groupTotal > MAX_POINTS_PER_GROUP ? ' is-over' : '')} title={`Up to ${MAX_POINTS_PER_GROUP} photos per floor plan`}>{groupTotal} / {MAX_POINTS_PER_GROUP}</span>
    </div>
    {sharing.length > 0 && <p className="rv-fine">Counted together with {sharing.map(candidate => candidate.name).join(', ')}: they are captured as one floor plan.</p>}

    {draft.points.length
     ? <ol className="pe-points">{draft.points.map((point, index) => {
      const active = point.key === selectedKey
      return <li key={point.key} ref={node => { if (node) rows.current.set(point.key, node); else rows.current.delete(point.key) }} className={'pe-point' + (active ? ' is-selected' : '')}>
       <button type="button" className="pe-point-number num" aria-pressed={active} aria-label={'Select point ' + (index + 1)} onClick={() => setSelectedKey(active ? null : point.key)}>{pad(index + 1)}</button>
       <span className="pe-point-direction num">{point.direction}°</span>
       <button type="button" className="rv-icon-button rv-icon-button--danger" aria-label={'Delete point ' + (index + 1)} title="Delete point" onClick={() => removePoint(point.key)}><Icon name="trash" size={16} /></button>
       {active && <div className="pe-point-more">
        <label className="rv-range">
         <span>Direction<b className="num">{point.direction}°</b></span>
         <input type="range" min={0} max={359} step={1} value={point.direction} onChange={event => editPoint(point.key, { direction: Number(event.target.value) })} />
        </label>
        <button type="button" className="rv-text-button" disabled={full} onClick={() => addPoint(point.x, point.y, (point.direction + 90) % 360)}><Icon name="plus" size={15} />Add another direction here</button>
       </div>}
      </li>
     })}</ol>
     : <p className="pe-empty">No points yet. Click the plan where the first photo should be taken.</p>}

    <div className="pe-sizes">
     <h3>Marker size</h3>
     {slider('Circle width', 'dot', 8, 40)}
     {slider('Line length', 'line', 10, 80)}
    </div>

    {!publish && <div className="pe-save">
     {anyDirty
      ? <span className="pe-state pe-state--dirty" role="status"><i aria-hidden="true" />{failed ? 'Not saved' : 'Saving…'}</span>
      : <span className="pe-state" role="status"><Icon name="check" size={16} />Saved</span>}
     <Button variant="quiet" icon="back" disabled={!history.length || busy === 'send'} title="Undo (Ctrl+Z)" onClick={undo}>Undo</Button>
    </div>}
    </>}
    {!area.hasPlan && <p className="rv-fine">Points can be placed here as soon as the customer adds the plan for {area.name}.</p>}

    <InlineError onRetry={failed ? () => { setError(''); setFailed(null) } : undefined}>{error}</InlineError>

    {publish
     ? area.hasPlan && <div className="pe-send">
      <Button block size="lg" loading={busy === 'save'} disabled={!draft.points.length || groupTotal > MAX_POINTS_PER_GROUP} onClick={() => { void save(area.id) }}>Save and show to customer</Button>
      <p className={'rv-fine' + (groupTotal > MAX_POINTS_PER_GROUP ? ' is-error' : '')}>{groupTotal > MAX_POINTS_PER_GROUP ? `A floor plan has more than ${MAX_POINTS_PER_GROUP} photos.`
       : draft.points.length ? `Saving shows these points to the customer right away, so they can photograph ${area.name}.` : 'Place at least one point first.'}</p>
     </div>
     : <div className="pe-send">
      <Button block size="lg" loading={busy === 'send'} disabled={noPlan.length > 0 || anyDirty || anyEmpty || anyOver} onClick={() => { void send() }}>Send plan to customer</Button>
      <p className={'rv-fine' + (anyOver && !noPlan.length ? ' is-error' : '')}>{sendNote}</p>
     </div>}
   </aside>
  </div>
 </div>
}
