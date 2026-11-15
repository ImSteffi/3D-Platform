import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { Button, ConfirmDialog, Field, Icon, InlineError, Panel, StatusPill } from '../../../../shared/ui'
import PlanView from '../PlanView/PlanView'
import { deletePhoto, photoUrl, planUrl, reviewPhotos, type TourArea, type TourDetail, type TourPoint } from '../../api/tourRequests'
import FitPlan from './FitPlan'
import PlanEditor from './PlanEditor'
import { errorText, pad, plural } from './reviewText'
import './review.css'

const REASONS = ['Too dark', 'Blurry', 'Wrong direction', 'Too close', 'Something in the way']
const NOTE_LIMIT = 500

const reasonParts = (note: string) => note.split(/\.\s*/).map(part => part.trim()).filter(Boolean)
const hasReason = (note: string, reason: string) => reasonParts(note).some(part => part.toLowerCase() === reason.toLowerCase())
/** A chip adds its reason to the note, or takes it out again; the note stays free text. */
function toggleReason(note: string, reason: string) {
 const parts = reasonParts(note)
 const next = hasReason(note, reason) ? parts.filter(part => part.toLowerCase() !== reason.toLowerCase()) : [...parts, reason]
 return next.join('. ').slice(0, NOTE_LIMIT)
}

type Entry = { area: TourArea; point: TourPoint }
type Props = {
 tour: TourDetail
 onTour: (tour: TourDetail) => void
 /** review: judge every photo, draft retakes, approve or send them. browse: look and delete only. */
 mode: 'review' | 'browse'
 /** Shows the live point editor beside the photo instead of a read-only plan. */
 editable?: boolean
}

/** One photo large on an opaque well, the flat plan beside it with the active point lit, every point in a filmstrip. */
export default function PhotoDesk({ tour, onTour, mode, editable = false }: Props) {
 const review = mode === 'review'
 const entries: Entry[] = tour.areas.flatMap(area => [...area.points].sort((a, b) => a.seq - b.seq).map(point => ({ area, point })))
 const [activeId, setActiveId] = useState<number | null>(() => (entries.find(entry => entry.point.hasPhoto) ?? entries[0])?.point.id ?? null)
 const [retakes, setRetakes] = useState<Record<number, string>>({})
 const [fine, setFine] = useState<Record<number, boolean>>({})
 const [broken, setBroken] = useState<Record<number, boolean>>({})
 // The large photo is letterboxed, so its shimmer stops once it has loaded rather than showing around it.
 const [loadedPhoto, setLoadedPhoto] = useState<number | null>(null)
 const [busy, setBusy] = useState<'' | 'approve' | 'send' | 'delete'>('')
 const [error, setError] = useState('')
 const [deleting, setDeleting] = useState<Entry | null>(null)
 const [deleteError, setDeleteError] = useState('')
 const noteField = useRef<HTMLTextAreaElement>(null)
 const strip = useRef<HTMLOListElement>(null)
 const thumbs = useRef(new Map<number, HTMLElement>())
 const noteId = useId()

 const found = entries.findIndex(entry => entry.point.id === activeId)
 const index = found < 0 ? 0 : found
 const active: Entry | undefined = entries[index]
 const filled = entries.map(entry => ({ entry, note: (retakes[entry.point.id] ?? '').trim() })).filter(item => item.note)

 function go(step: number) {
  const next = entries[Math.min(entries.length - 1, Math.max(0, index + step))]
  if (next) setActiveId(next.point.id)
 }
 function setNote(pointId: number, note: string) {
  setRetakes(current => ({ ...current, [pointId]: note }))
  if (note.trim()) setFine(current => ({ ...current, [pointId]: false }))
 }
 function dropNote(pointId: number) {
  setRetakes(current => { const next = { ...current }; delete next[pointId]; return next })
 }
 function markFine() {
  if (!active?.point.hasPhoto) return
  dropNote(active.point.id)
  setFine(current => ({ ...current, [active.point.id]: true }))
  go(1)
 }

 const onKey = useEffectEvent((event: KeyboardEvent) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || deleting) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('input, textarea, select, [contenteditable="true"], dialog')) return
  const key = event.key.toLowerCase()
  if (key === 'arrowleft') go(-1)
  else if (key === 'arrowright') go(1)
  else if (review && key === 'a') markFine()
  else if (review && key === 'r') noteField.current?.focus()
  else return
  event.preventDefault()
 })
 useEffect(() => {
  const listener = (event: KeyboardEvent) => onKey(event)
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
 }, [])

 // Keep the active frame in sight without moving the page.
 const activePointId = active?.point.id
 useEffect(() => {
  const list = strip.current
  const frame = activePointId === undefined ? undefined : thumbs.current.get(activePointId)
  if (!list || !frame) return
  list.scrollTo({ left: frame.offsetLeft - (list.clientWidth - frame.offsetWidth) / 2 })
 }, [activePointId])

 async function finish(approve: boolean) {
  if (busy) return
  setBusy(approve ? 'approve' : 'send'); setError('')
  try {
   const updated = await reviewPhotos(tour.id, approve, approve ? [] : filled.map(item => ({ pointId: item.entry.point.id, note: item.note })))
   setRetakes({})
   onTour(updated)
  } catch (reason) { setError(errorText(reason)) }
  finally { setBusy('') }
 }
 async function confirmDelete() {
  if (!deleting || busy) return
  setBusy('delete'); setDeleteError('')
  try {
   const updated = await deletePhoto(tour.id, deleting.point.id)
   dropNote(deleting.point.id)
   setDeleting(null)
   onTour(updated)
  } catch (reason) { setDeleteError(errorText(reason)) }
  finally { setBusy('') }
 }

 if (!active) return editable
  ? <PlanEditor key={tour.id} tour={tour} onTour={onTour} mode="live" />
  : <p className="rv-quiet">This plan has no capture points yet.</p>

 const { area, point } = active
 const note = retakes[point.id] ?? ''
 const drafted = !!note.trim()
 const canJudge = review && point.hasPhoto
 const several = tour.areas.length > 1
 const stateOf = (candidate: TourPoint) => candidate.id === point.id ? 'next' as const
  : (retakes[candidate.id]?.trim() || candidate.retakeNote) ? 'retake' as const
  : candidate.hasPhoto ? 'done' as const : 'pending' as const

 return <div className={'pd pd--' + mode + (editable ? ' pd--editing' : '')}>
  <div className="pd-main">
   <Panel variant="solid" padding="none" as="div" className={'rv-well pd-photo' + (point.hasPhoto && !broken[point.id] && loadedPhoto !== point.id ? ' skeleton-bg' : '')}>
    {point.hasPhoto && !broken[point.id]
     ? <img key={point.id} src={photoUrl(tour.id, point.id)} alt={`Photo ${point.seq} of ${area.name}`} draggable={false}
      onLoad={() => setLoadedPhoto(point.id)} onError={() => setBroken(current => ({ ...current, [point.id]: true }))} />
     : <div className="pd-photo-empty">
      <Icon name="image" size={26} />
      <p>{point.hasPhoto ? 'This photo could not be loaded. Refresh the page to try again.' : 'No photo for this point yet.'}</p>
     </div>}
    <span className="pd-photo-tag"><b className="num">{pad(point.seq)}</b>{area.name}</span>
    <button type="button" className="pd-step pd-step--previous" aria-label="Previous photo" disabled={index === 0} onClick={() => go(-1)}><Icon name="back" size={18} /></button>
    <button type="button" className="pd-step pd-step--next" aria-label="Next photo" disabled={index === entries.length - 1} onClick={() => go(1)}><Icon name="arrow" size={18} /></button>
   </Panel>

   {(review || point.hasPhoto || point.retakeNote) && <div className="pd-verdict">
    <div className="pd-verdict-head">
     <div className="pd-verdict-title">
      {review && <h2>Point <span className="num">{pad(point.seq)}</span> <span className="rv-dim">of <span className="num">{entries.length}</span></span></h2>}
      {review && drafted && <StatusPill tone="red">Retake drafted</StatusPill>}
      {review && !drafted && fine[point.id] && <StatusPill tone="green">Marked fine</StatusPill>}
      {!review && point.retakeNote && <StatusPill tone="red">Retake asked</StatusPill>}
     </div>
     {point.hasPhoto && <button type="button" className="rv-text-button rv-text-button--danger" disabled={!!busy} onClick={() => { setDeleteError(''); setDeleting(active) }}><Icon name="trash" size={15} />Delete photo</button>}
    </div>
    {review && <p className="pd-instruction">{point.note ? <>The customer was told: <q>{point.note}</q></> : 'No instruction was written for this point.'}</p>}
    {point.retakeNote && <p className="pd-earlier">{review ? 'Earlier retake note' : 'Retake note sent'}: {point.retakeNote}</p>}

    {review && <>
     <div className="pd-judge">
      <div className="pd-reasons" role="group" aria-label="Retake reasons">
       {REASONS.map(reason => <button key={reason} type="button" className="pd-chip" aria-pressed={hasReason(note, reason)} disabled={!canJudge}
        onClick={() => setNote(point.id, toggleReason(note, reason))}>{reason}</button>)}
      </div>
      <button type="button" className="pd-chip pd-chip--fine" disabled={!canJudge} onClick={markFine}><Icon name="check" size={15} />Photo is fine</button>
     </div>
     <Field label="Retake note for the customer" id={noteId} className="pd-note">
      <textarea ref={noteField} id={noteId} rows={2} maxLength={NOTE_LIMIT} value={note} disabled={!canJudge}
       placeholder="Leave empty if the photo is fine"
       onChange={event => setNote(point.id, event.target.value)}
       onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.blur() } }} />
     </Field>
    </>}
   </div>}
  </div>

  <aside className="pd-side">
   {editable
    ? <PlanEditor key={tour.id} tour={tour} onTour={onTour} mode="live" layout="stack" reserve={review ? 620 : 460}
     focusPointId={point.id} onFocusPoint={setActiveId} />
    : <Panel variant="solid" padding="none" as="div" className="rv-well pd-plan">
    <p className="pd-plan-name">{area.name}</p>
    {area.hasPlan
     ? <FitPlan src={planUrl(tour.id, area.id)} reserve={review ? 560 : 420}>
      <PlanView src={planUrl(tour.id, area.id)} alt={'Capture plan of ' + area.name} selected={point.id}
       dotSize={area.dotSize} lineLength={area.lineLength}
       markers={area.points.map(candidate => ({ key: candidate.id, label: candidate.seq, x: candidate.x, y: candidate.y, direction: candidate.direction, state: stateOf(candidate) }))}
       onSelect={key => setActiveId(Number(key))} />
     </FitPlan>
     : <p className="rv-well-empty">This area has no floor plan.</p>}
   </Panel>}

   {review && <>
    <section className="pd-tray" aria-label="Retakes to send">
     <header><h2>Retakes to send</h2><span className="num">{filled.length}</span></header>
     {filled.length
      ? <ul>{filled.map(({ entry }) => <li key={entry.point.id} className={entry.point.id === point.id ? 'is-active' : undefined}>
       <button type="button" className="pd-tray-number num" aria-label={`Show photo ${entry.point.seq}`} onClick={() => setActiveId(entry.point.id)}>{pad(entry.point.seq)}</button>
       <div className="pd-tray-text">
        {several && <span>{entry.area.name}</span>}
        <input value={retakes[entry.point.id] ?? ''} maxLength={NOTE_LIMIT} aria-label={`Retake note for photo ${entry.point.seq}`} onChange={event => setNote(entry.point.id, event.target.value)} />
       </div>
       <button type="button" className="rv-icon-button" aria-label={`Remove the retake for photo ${entry.point.seq}`} title="Remove retake" onClick={() => dropNote(entry.point.id)}><Icon name="close" size={15} /></button>
      </li>)}</ul>
      : <p className="pd-tray-empty">Nothing drafted. Every photo you flag is listed here before anything is sent.</p>}
    </section>
    <div className="pd-actions">
     <InlineError>{error}</InlineError>
     {filled.length
      ? <Button block size="lg" loading={busy === 'send'} disabled={!!busy && busy !== 'send'} onClick={() => { void finish(false) }}>Send {plural(filled.length, 'retake')} to customer</Button>
      : <Button block size="lg" icon="check" loading={busy === 'approve'} disabled={!!busy && busy !== 'approve'} onClick={() => { void finish(true) }}>Approve all photos</Button>}
     <p className="rv-fine">{filled.length ? 'The customer sees each note next to the photo to take again.' : 'Approving tells the customer the team is building their tour.'}</p>
    </div>
   </>}
  </aside>

  {review && <>
  <ol ref={strip} className="pd-strip" aria-label="All capture points">
   {entries.map((entry, position) => {
    const id = entry.point.id
    const flagged = !!retakes[id]?.trim() || (!review && !!entry.point.retakeNote)
    const first = several && (position === 0 || entries[position - 1].area.id !== entry.area.id)
    return <li key={id} ref={node => { if (node) thumbs.current.set(id, node); else thumbs.current.delete(id) }} className={first ? 'pd-frame-slot pd-frame-slot--first' : 'pd-frame-slot'}>
     {first && <span className="pd-strip-area">{entry.area.name}</span>}
     <button type="button" aria-pressed={id === point.id} onClick={() => setActiveId(id)}
      aria-label={`Photo ${entry.point.seq}${several ? ', ' + entry.area.name : ''}${!entry.point.hasPhoto ? ', no photo yet' : flagged ? ', retake' : fine[id] ? ', marked fine' : ''}`}
      className={'pd-frame' + (entry.point.hasPhoto ? (broken[id] ? '' : ' skeleton-bg') : ' pd-frame--empty') + (flagged ? ' pd-frame--retake' : '') + (review && fine[id] && !flagged ? ' pd-frame--fine' : '')}>
      {entry.point.hasPhoto && !broken[id] && <img src={photoUrl(tour.id, id)} alt="" loading="lazy" draggable={false} />}
      <span className="num pd-frame-number">{pad(entry.point.seq)}</span>
      {review && fine[id] && !flagged && <span className="pd-frame-check"><Icon name="check" size={12} /></span>}
     </button>
    </li>
   })}
  </ol>

  <p className="pd-keys">
   <kbd>Left</kbd><kbd>Right</kbd> previous and next photo
   {review && <><span aria-hidden="true" className="pd-keys-gap" /><kbd>A</kbd> photo is fine
    <span aria-hidden="true" className="pd-keys-gap" /><kbd>R</kbd> write a retake note
    <span aria-hidden="true" className="pd-keys-gap" /><kbd>Esc</kbd> leave the note</>}
  </p>
  </>}

  {deleting && <ConfirmDialog title={`Delete photo ${deleting.point.seq}?`} confirmLabel="Delete photo" busy={busy === 'delete'} error={deleteError}
   onConfirm={() => { void confirmDelete() }} onCancel={() => setDeleting(null)}>
   The customer will be asked to take the photo for point <strong>{pad(deleting.point.seq)}</strong> in {deleting.area.name} again.
   {tour.status === 'PHOTOS_SUBMITTED' ? ' This sends the capture back to them.' : ''}
  </ConfirmDialog>}
 </div>
}
