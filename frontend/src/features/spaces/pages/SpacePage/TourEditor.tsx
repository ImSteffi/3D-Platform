import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon } from '../../../../shared/ui'
import { saveSpaceTour, type SpaceTour, type SpaceTourDefinition, type Teleport, type TourDetail } from '../../../tours/api/tourRequests'
import './TourEditor.css'

type Vec = [number, number, number]
type Pose = { position: Vec; yaw: number; pitch?: number }
/** Add teleportation: place its start here, choose the floor it leads to, then place its end there. It works both ways. */
type Step =
 | { kind: 'start' }
 | { kind: 'choose'; position: Vec; yaw: number }
 | { kind: 'end'; position: Vec; yaw: number; to: number }
 /** Edit spawn, step 1: click the floor where people start on this floor. */
 | { kind: 'spawn' }
 /**
  * Choosing which way people face: when they land through teleport `id` (the eye button), or, with `spawn`,
  * at this floor's new start point (Edit spawn, step 2).
  */
 | { kind: 'look'; id: string | null; spawn?: Vec }

type Props = {
 tour: TourDetail
 /** The floor being edited. */
 areaId: number
 /** Each floor's 3DGS scene, by floor id. Only these floors can be teleported to. */
 scenes: Record<number, string>
 saved: SpaceTour | null
 onSaved: (saved: SpaceTour) => void
 onClose: () => void
}

/** Eye height above the floor in walk mode (the viewer's hover height plus eye height). */
const EYE = 1.4
/** A ring's radius unless set (the viewer's default), and the sizes the team can choose (diameter, metres). */
const RADIUS = 0.45
const MIN_DIAMETER = 0.4
const MAX_DIAMETER = 4
const newId = () => Math.random().toString(36).slice(2, 10)

/**
 * One floor's 3DGS, full screen, with its teleports as rings on the floor. Changes save as they are made.
 * Add teleportation: click where it starts, pick the 3DGS it leads to, then click where people land there.
 */
export default function TourEditor({ tour, areaId, scenes, saved, onSaved, onClose }: Props) {
 const [definition, setDefinition] = useState<SpaceTourDefinition>(() => {
  const found = saved?.definition ?? { start: null, scenes: {}, teleports: [] }
  // Teleports and the start point on floors removed since (or without a 3DGS now) are left out, or every save would be refused.
  const live = (id: number) => !!scenes[id] && tour.areas.some(area => area.id === id)
  return { ...found, start: found.start && live(found.start.areaId) ? found.start : null,
   teleports: found.teleports.filter(t => live(t.from) && live(t.to)),
   spawns: Object.fromEntries(Object.entries(found.spawns ?? {}).filter(([, pose]) => live(pose.areaId))) }
 })
 /** The floor on screen: the edited floor, or the target floor while placing a teleport's end. */
 const [shown, setShown] = useState(areaId)
 const [step, setStep] = useState<Step | null>(null)
 const [selected, setSelected] = useState<string | null>(null)
 /** The teleport being edited in the list: its name and its ring's diameter on this floor, shown live before saving. */
 const [draft, setDraft] = useState<{ id: string; label: string; diameter: number } | null>(null)
 /** Answers to "where is the view now?", by request. */
 const requests = useRef(new Map<string, (pose: Pose | null) => void>())
 const [ready, setReady] = useState(false)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [note, setNote] = useState('')
 const frame = useRef<HTMLIFrameElement>(null)
 const stepRef = useRef(step)
 useEffect(() => { stepRef.current = step }, [step])

 const name = (id: number) => tour.areas.find(area => area.id === id)?.name ?? 'Floor'
 const others = tour.areas.filter(area => area.id !== areaId && scenes[area.id])
 const post = useCallback((message: unknown) => frame.current?.contentWindow?.postMessage(message, window.location.origin), [])

 /** Saves the whole tour; the floors' scenes go with it so the tour page can load them. */
 const persist = useCallback(async (next: SpaceTourDefinition) => {
  setDefinition(next)
  setSaving(true); setError('')
  try {
   const result = await saveSpaceTour(tour.id, { ...next, scenes: Object.fromEntries(Object.entries(scenes).map(([id, scene]) => [id, scene])) })
   onSaved(result)
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'The change could not be saved.') }
  finally { setSaving(false) }
 }, [tour.id, scenes, onSaved])

 const show = (id: number) => { if (id !== shown) { setReady(false); setShown(id) } }

 // The rings of the floor on screen; the selected one highlighted.
 useEffect(() => {
  if (!ready) return
  const markers = definition.teleports.flatMap(t => [
   ...(t.from === shown ? [{ id: t.id, position: t.position, label: t.label || name(t.to), selected: t.id === selected,
    radius: draft?.id === t.id && shown === areaId ? draft.diameter / 2 : t.radius ?? RADIUS }] : []),
   ...(t.to === shown ? [{ id: `${t.id}~back`, position: [t.arrive.position[0], t.arrive.position[1] - EYE, t.arrive.position[2]], label: t.backLabel || name(t.from),
    selected: t.id === selected, radius: draft?.id === t.id && shown === areaId ? draft.diameter / 2 : t.backRadius ?? RADIUS }] : []),
  ])
  const spawnAt = step?.kind === 'look' && step.spawn ? step.spawn : definition.spawns?.[String(shown)]?.position
  if (spawnAt && shown === areaId) markers.push({ id: 'spawn', position: [spawnAt[0], spawnAt[1] - EYE, spawnAt[2]], label: 'Start', selected: false, radius: 0.3 })
  post({ type: 'tour-edit-markers', markers })
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ready, definition.teleports, definition.spawns, shown, selected, draft, step, post])
 useEffect(() => {
  if (!ready) return
  post({ type: 'tour-edit-place', on: step?.kind === 'start' || step?.kind === 'end' || step?.kind === 'spawn' })
  post({ type: 'tour-edit-look', on: step?.kind === 'look' })
 }, [ready, step, post])

 useEffect(() => {
  const onMessage = (event: MessageEvent) => {
   if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
   const data = event.data ?? {}
   const current = stepRef.current
   if (data.type === 'tour-edit-ready') {
    setReady(true)
    // The edited floor opens where people start on it.
    const spawn = definition.spawns?.[String(areaId)]
    if (!current && shown === areaId && spawn) post({ type: 'tour-edit-pose', pose: spawn })
   }
   else if (data.type === 'tour-edit-pose-now') {
    const handle = requests.current.get(data.request)
    requests.current.delete(data.request)
    handle?.(data.pose ?? null)
   }
   else if (data.type === 'tour-edit-select' && !current && data.id !== 'spawn') setSelected(String(data.id).replace(/~back$/, ''))
   else if (data.type === 'tour-edit-picked') {
    if (!data.point) { setNote('That spot is not on the floor. Click the floor.'); return }
    setNote('')
    if (current?.kind === 'start') setStep({ kind: 'choose', position: data.point, yaw: (data.pose as Pose | null)?.yaw ?? 0 })
    else if (current?.kind === 'spawn') {
     // Step 2: the view goes to the spot (eye height), facing the way it faced, for the team to turn.
     const [x, y, z] = data.point as Vec
     const position: Vec = [x, y + EYE, z]
     post({ type: 'tour-edit-pose', pose: { areaId, position, yaw: (data.pose as Pose | null)?.yaw ?? 0, pitch: 0 } })
     setStep({ kind: 'look', id: null, spawn: position })
    }
    else if (current?.kind === 'end') {
     const pose = data.pose as Pose | null
     const [x, y, z] = data.point as Vec
     const [sx, sy, sz] = current.position
     // A portal: each end lands people on the other end, looking the way the view looked when that end was placed.
     const teleport: Teleport = { id: newId(), from: areaId, position: current.position, to: current.to, label: '',
      arrive: { areaId: current.to, position: [x, y + EYE, z], yaw: pose?.yaw ?? 0 },
      back: { areaId, position: [sx, sy + EYE, sz], yaw: current.yaw } }
     void persist({ ...definition, teleports: [...definition.teleports, teleport] })
     setSelected(teleport.id)
     setStep(null)
     show(areaId)
    }
   }
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [areaId, definition, persist, shown])

 function cancel() {
  setStep(null); setNote('')
  show(areaId)
 }
 useEffect(() => {
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (stepRef.current) cancel(); else onClose() } }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [onClose])

 /** Asks the view where it is and which way it looks. */
 const askPose = (handle: (pose: Pose | null) => void) => {
  const request = newId()
  requests.current.set(request, handle)
  post({ type: 'tour-edit-get-pose', request })
 }

 /** Where people land on this floor through a portal: its way back if it starts here, else its arrival. */
 const landing = (t: Teleport) => t.from === areaId
  ? t.back ?? { areaId, position: [t.position[0], t.position[1] + EYE, t.position[2]] as Vec, yaw: 0, pitch: 0 }
  : t.arrive
 const withLanding = (t: Teleport, yaw: number, pitch: number): Teleport => t.from === areaId
  ? { ...t, back: { ...landing(t), yaw, pitch } }
  : { ...t, arrive: { ...t.arrive, yaw, pitch } }
 /** The eye button: the view goes to where people land here, looking the way they do now. */
 function startLook(t: Teleport) {
  setSelected(t.id); setDraft(null); setNote('')
  post({ type: 'tour-edit-pose', pose: landing(t) })
  setStep({ kind: 'look', id: t.id })
 }
 function saveLook() {
  if (step?.kind !== 'look') return
  const { id, spawn } = step
  askPose(pose => {
   if (!pose) { setNote('The view is not ready yet. Try again.'); return }
   if (spawn) {
    // The floor's start point: the clicked spot, facing the way the view faces now.
    void persist({ ...definition, spawns: { ...definition.spawns, [String(areaId)]: { areaId, position: spawn, yaw: pose.yaw, pitch: pose.pitch ?? 0 } } })
   } else {
    void persist({ ...definition, teleports: definition.teleports.map(x => x.id === id ? withLanding(x, pose.yaw, pose.pitch ?? 0) : x) })
   }
   setStep(null)
  })
 }

 /** Portals with an end on this floor, and the floor at their other end. */
 const here = definition.teleports.filter(t => t.from === areaId || t.to === areaId)
 const otherEnd = (t: Teleport) => t.from === areaId ? t.to : t.from
 /** The name of the portal's ring on this floor, and the change that renames it. */
 const endLabel = (t: Teleport) => (t.from === areaId ? t.label : t.backLabel) ?? ''
 const shownName = (t: Teleport) => endLabel(t) || name(otherEnd(t))
 const endDiameter = (t: Teleport) => 2 * ((t.from === areaId ? t.radius : t.backRadius) ?? RADIUS)
 /** The portal with its ring on this floor renamed and resized. */
 const changed = (t: Teleport, label: string, diameter: number): Teleport => t.from === areaId
  ? { ...t, label, radius: diameter / 2 }
  : { ...t, backLabel: label, backRadius: diameter / 2 }
 function saveDraft() {
  if (!draft) return
  const t = definition.teleports.find(x => x.id === draft.id)
  setDraft(null)
  if (!t) return
  const label = draft.label.trim()
  if (label !== endLabel(t) || Math.abs(draft.diameter - endDiameter(t)) > 1e-6)
   void persist({ ...definition, teleports: definition.teleports.map(x => x.id === t.id ? changed(x, label, draft.diameter) : x) })
 }
 const scene = scenes[shown]

 return createPortal(<div className="te" role="dialog" aria-modal="true" aria-label={`Edit 3DGS of ${name(areaId)}`}>
  {scene && <iframe key={shown} ref={frame} className="te-frame" title={`3DGS of ${name(shown)}`} allow="fullscreen; xr-spatial-tracking; pointer-lock"
   src={`/tour-viewer/tour.html?scene=${encodeURIComponent(scene)}&edit=1`} />}
  {!ready && <p className="te-loading">Loading {name(shown)}…</p>}

  <header className="te-bar">
   <div className="te-title">
    <h2>{name(shown)}</h2>
    <p>{step?.kind === 'spawn' || (step?.kind === 'look' && step.spawn) ? 'Setting where people start on this floor'
     : step?.kind === 'look' ? 'Setting the view people arrive with' : step?.kind === 'end' ? `Placing the end of a teleport from ${name(areaId)}` : saving ? 'Saving…' : error ? '' : others.length === 0 ? 'Teleports need another floor with a 3DGS' : 'Changes save automatically'}</p>
   </div>
   <div className="te-bar-btns">
    {!step && <Button variant="secondary" icon="pin" disabled={!ready} onClick={() => { setSelected(null); setDraft(null); setNote(''); setStep({ kind: 'spawn' }) }}>Edit spawn</Button>}
    {!step && <Button variant="primary" icon="plus" disabled={!ready || others.length === 0}
     title={others.length ? undefined : 'Another floor needs its 3DGS first.'} onClick={() => { setSelected(null); setStep({ kind: 'start' }) }}>Add teleportation</Button>}
    {step?.kind === 'look' && <Button variant="primary" icon="check" disabled={!ready} onClick={saveLook}>Save view</Button>}
    {step && <Button variant="secondary" onClick={cancel}>Cancel</Button>}
    {!step && <Button variant="secondary" icon="close" onClick={onClose}>Done</Button>}
   </div>
  </header>

  {step?.kind === 'spawn' && <div className="te-banner" role="status">
   <span className="te-banner-step">Step 1 of 2</span>
   <span>Click the floor where people start on {name(areaId)}</span>
   <span className="te-banner-hint">Drag to look around, W A S D to walk</span>
  </div>}
  {(step?.kind === 'start' || step?.kind === 'end') && <div className="te-banner" role="status">
   <span className="te-banner-step">{step.kind === 'start' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
   <span>{step.kind === 'start' ? 'Click the floor where the teleport starts' : `Click the floor where people land on ${name(step.to)}`}</span>
   <span className="te-banner-hint">Drag to look around, W A S D to walk</span>
  </div>}
  {step?.kind === 'look' && <div className="te-banner" role="status">
   <span className="te-banner-step">{step.spawn ? 'Step 2 of 2' : 'Arrival view'}</span>
   <span>{step.spawn ? 'Look the way people should face when they start here' : 'Look the way people should face when they arrive here'}</span>
   <span className="te-banner-hint">Drag to turn left, right, up or down, then Save view</span>
  </div>}
  {(note || error) && <p className="te-note" role="alert">{error || note}</p>}

  {step?.kind === 'choose' && <div className="te-choose" role="dialog" aria-label="Where does it lead?">
   <div className="te-choose-card">
    <h3>Where does it lead?</h3>
    <p>Pick the 3DGS tour, then click where people land in it.</p>
    <div className="te-choose-list">
     {others.map(area => <button key={area.id} type="button" className="te-choose-item" onClick={() => { setStep({ kind: 'end', position: step.position, yaw: step.yaw, to: area.id }); show(area.id) }}>
      <Icon name="cube" size={18} />
      <span>{area.name}</span>
     </button>)}
    </div>
    <Button variant="quiet" onClick={cancel}>Cancel</Button>
   </div>
  </div>}

  {!step && here.length > 0 && <aside className="te-list" aria-label="Teleports on this floor">
   <h3>Teleports</h3>
   <ol>
    {here.map(t => <li key={t.id} className={t.id === selected ? 'is-selected' : undefined}>
     {draft?.id === t.id
      ? <div className="te-list-edit" onKeyDown={event => {
        if (event.key === 'Enter') saveDraft()
        if (event.key === 'Escape') { event.stopPropagation(); setDraft(null) }
       }}>
       <input className="te-list-input" autoFocus value={draft.label} maxLength={60} placeholder={name(otherEnd(t))} aria-label="Teleport name"
        onChange={event => setDraft({ ...draft, label: event.target.value })} />
       <label className="te-size">
        <span>Size</span>
        <input type="range" min={MIN_DIAMETER} max={MAX_DIAMETER} step={0.1} value={draft.diameter} aria-label="Circle diameter in metres"
         onChange={event => setDraft({ ...draft, diameter: Number(event.target.value) })} />
        <span className="te-size-value">{draft.diameter.toFixed(1)} m</span>
       </label>
       <div className="te-list-edit-btns">
        <button type="button" className="te-text-btn" onClick={() => setDraft(null)}>Cancel</button>
        <button type="button" className="te-text-btn te-text-btn--primary" onClick={saveDraft}>Save</button>
       </div>
      </div>
      : <button type="button" className="te-list-main" onClick={() => setSelected(t.id === selected ? null : t.id)}>
       <span aria-hidden="true">↔</span> {shownName(t)}
      </button>}
     {draft?.id !== t.id && <div className="te-list-icons">
      <button type="button" className="te-icon" title="Name and size" aria-label={`Name and size of ${shownName(t)}`}
       onClick={() => { setSelected(t.id); setDraft({ id: t.id, label: endLabel(t), diameter: Math.round(endDiameter(t) * 10) / 10 }) }}><Icon name="edit" size={16} /></button>
      <button type="button" className="te-icon" title="Arrival view" aria-label={`View people arrive with at ${shownName(t)}`}
       onClick={() => startLook(t)}><Icon name="eye" size={16} /></button>
      <button type="button" className="te-icon" title="Delete" aria-label={`Delete ${shownName(t)}`}
       onClick={() => { setSelected(null); void persist({ ...definition, teleports: definition.teleports.filter(x => x.id !== t.id) }) }}><Icon name="trash" size={16} /></button>
     </div>}
    </li>)}
   </ol>
  </aside>}
 </div>, document.body)
}
