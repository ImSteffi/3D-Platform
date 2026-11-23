import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon } from '../../../../shared/ui'
import { saveSpaceTour, type SpaceTour, type SpaceTourDefinition, type Teleport, type TourDetail } from '../../../tours/api/tourRequests'
import './TourEditor.css'

type Vec = [number, number, number]
type Pose = { position: Vec; yaw: number }
/** Add teleportation: place its start here, choose the floor it leads to, then place its end there. It works both ways. */
type Step =
 | { kind: 'start' }
 | { kind: 'choose'; position: Vec; yaw: number }
 | { kind: 'end'; position: Vec; yaw: number; to: number }

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
const EYE = 1.5
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
   teleports: found.teleports.filter(t => live(t.from) && live(t.to)) }
 })
 /** The floor on screen: the edited floor, or the target floor while placing a teleport's end. */
 const [shown, setShown] = useState(areaId)
 const [step, setStep] = useState<Step | null>(null)
 const [selected, setSelected] = useState<string | null>(null)
 /** The teleport whose name is being edited in the list. */
 const [renaming, setRenaming] = useState<string | null>(null)
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
   ...(t.from === shown ? [{ id: t.id, position: t.position, label: t.label || name(t.to), selected: t.id === selected }] : []),
   ...(t.to === shown ? [{ id: `${t.id}~back`, position: [t.arrive.position[0], t.arrive.position[1] - EYE, t.arrive.position[2]], label: t.backLabel || name(t.from), selected: t.id === selected }] : []),
  ])
  post({ type: 'tour-edit-markers', markers })
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ready, definition.teleports, shown, selected, post])
 useEffect(() => { if (ready) post({ type: 'tour-edit-place', on: step?.kind === 'start' || step?.kind === 'end' }) }, [ready, step, post])

 useEffect(() => {
  const onMessage = (event: MessageEvent) => {
   if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
   const data = event.data ?? {}
   const current = stepRef.current
   if (data.type === 'tour-edit-ready') setReady(true)
   else if (data.type === 'tour-edit-select' && !current) setSelected(String(data.id).replace(/~back$/, ''))
   else if (data.type === 'tour-edit-picked') {
    if (!data.point) { setNote('That spot is not on the floor. Click the floor.'); return }
    setNote('')
    if (current?.kind === 'start') setStep({ kind: 'choose', position: data.point, yaw: (data.pose as Pose | null)?.yaw ?? 0 })
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

 /** Portals with an end on this floor, and the floor at their other end. */
 const here = definition.teleports.filter(t => t.from === areaId || t.to === areaId)
 const otherEnd = (t: Teleport) => t.from === areaId ? t.to : t.from
 /** The name of the portal's ring on this floor, and the change that renames it. */
 const endLabel = (t: Teleport) => (t.from === areaId ? t.label : t.backLabel) ?? ''
 const shownName = (t: Teleport) => endLabel(t) || name(otherEnd(t))
 const renamed = (t: Teleport, label: string): Teleport => t.from === areaId ? { ...t, label } : { ...t, backLabel: label }
 const scene = scenes[shown]

 return createPortal(<div className="te" role="dialog" aria-modal="true" aria-label={`Edit 3DGS of ${name(areaId)}`}>
  {scene && <iframe key={shown} ref={frame} className="te-frame" title={`3DGS of ${name(shown)}`} allow="fullscreen; xr-spatial-tracking; pointer-lock"
   src={`/tour-viewer/tour.html?scene=${encodeURIComponent(scene)}&edit=1`} />}
  {!ready && <p className="te-loading">Loading {name(shown)}…</p>}

  <header className="te-bar">
   <div className="te-title">
    <h2>{name(shown)}</h2>
    <p>{step?.kind === 'end' ? `Placing the end of a teleport from ${name(areaId)}` : saving ? 'Saving…' : error ? '' : others.length === 0 ? 'Teleports need another floor with a 3DGS' : 'Changes save automatically'}</p>
   </div>
   <div className="te-bar-btns">
    {!step && <Button variant="primary" icon="plus" disabled={!ready || others.length === 0}
     title={others.length ? undefined : 'Another floor needs its 3DGS first.'} onClick={() => { setSelected(null); setStep({ kind: 'start' }) }}>Add teleportation</Button>}
    {step && <Button variant="secondary" onClick={cancel}>Cancel</Button>}
    {!step && <Button variant="secondary" icon="close" onClick={onClose}>Done</Button>}
   </div>
  </header>

  {(step?.kind === 'start' || step?.kind === 'end') && <div className="te-banner" role="status">
   <span className="te-banner-step">{step.kind === 'start' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
   <span>{step.kind === 'start' ? 'Click the floor where the teleport starts' : `Click the floor where people land on ${name(step.to)}`}</span>
   <span className="te-banner-hint">Drag to look around, W A S D to walk</span>
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
     {renaming === t.id
      ? <input className="te-list-input" autoFocus defaultValue={endLabel(t)} maxLength={60} placeholder={name(otherEnd(t))} aria-label="Teleport name"
       onBlur={event => { const label = event.target.value.trim(); setRenaming(null); if (label !== endLabel(t)) void persist({ ...definition, teleports: definition.teleports.map(x => x.id === t.id ? renamed(x, label) : x) }) }}
       onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.value = endLabel(t); event.currentTarget.blur() }
       }} />
      : <button type="button" className="te-list-main" onClick={() => setSelected(t.id === selected ? null : t.id)}>
       <span aria-hidden="true">↔</span> {shownName(t)}
      </button>}
     {renaming !== t.id && <div className="te-list-icons">
      <button type="button" className="te-icon" title="Rename" aria-label={`Rename ${shownName(t)}`}
       onClick={() => { setSelected(t.id); setRenaming(t.id) }}><Icon name="edit" size={16} /></button>
      <button type="button" className="te-icon" title="Delete" aria-label={`Delete ${shownName(t)}`}
       onClick={() => { setSelected(null); void persist({ ...definition, teleports: definition.teleports.filter(x => x.id !== t.id) }) }}><Icon name="trash" size={16} /></button>
     </div>}
    </li>)}
   </ol>
  </aside>}
 </div>, document.body)
}
