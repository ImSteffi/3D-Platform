import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import Icon from '../../../../shared/ui/Icon/Icon'
import './GeneratePage.css'
import './ObjectInput.css'
import ObjectSizeGuide from './ObjectSizeGuide'

type Unit = 'cm' | 'mm' | 'm'
type Axis = 'width' | 'height' | 'depth'
type Reference = { id: string; file: File; view: string }
const factors: Record<Unit, number> = { mm: .001, cm: .01, m: 1 }
function productHost(value: string) {
 try {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !!url.hostname ? url.hostname : ''
 } catch { return '' }
}
function ReferencePhoto({ reference, primary, onPrimary, onView, onRemove }: {
 reference: Reference; primary: boolean; onPrimary: () => void; onView: (view: string) => void; onRemove: () => void
}) {
 const [url, setUrl] = useState('')
 const [failed, setFailed] = useState(false)
 useEffect(() => {
  const objectUrl = URL.createObjectURL(reference.file)
  setUrl(objectUrl)
  return () => URL.revokeObjectURL(objectUrl)
 }, [reference.file])
 return <li className="object-reference">
  <div className="object-reference-image">
   {failed ? <span>Preview unavailable</span> : url && <img src={url} alt={reference.file.name} onError={() => setFailed(true)} />}
   <button type="button" className="object-remove" aria-label={'Remove ' + reference.file.name} onClick={onRemove}><Icon name="close" size={16} /></button>
  </div>
  <div className="object-reference-controls">
   <strong title={reference.file.name}>{reference.file.name}</strong>
   <label className="object-primary"><input type="radio" name="primary-reference" checked={primary} onChange={onPrimary} />Primary image</label>
   <label className="object-view-label">View<select value={reference.view} aria-label={'View of ' + reference.file.name} onChange={event => onView(event.target.value)}>
    <option value="">Not specified</option><option>Front</option><option>Back</option><option>Left</option><option>Right</option><option>Top</option><option>Detail</option>
   </select></label>
  </div>
 </li>
}
export default function GenerateObjectPage() {
 const [url, setUrl] = useState('')
 const [urlTouched, setUrlTouched] = useState(false)
 const [references, setReferences] = useState<Reference[]>([])
 const [primaryId, setPrimaryId] = useState('')
 const [name, setName] = useState('')
 const [notes, setNotes] = useState('')
 const [unit, setUnit] = useState<Unit>('cm')
 const [dimensions, setDimensions] = useState<Record<Axis, string>>({ width: '', height: '', depth: '' })
 const [error, setError] = useState('')
 const [dragging, setDragging] = useState(false)
 const input = useRef<HTMLInputElement>(null)
 const host = productHost(url.trim())
 function addPhotos(files: File[]) {
  if (!files.length) return
  if (files.some(file => !file.size || !(['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || (!file.type && /[.](jpe?g|png|webp)$/i.test(file.name))))) {
   setError('Choose non-empty JPG, PNG or WebP images.')
   return
  }
  const next = [...references]
  for (const file of files) {
   if (!next.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) {
    next.push({ id: crypto.randomUUID(), file, view: '' })
   }
  }
  setReferences(next)
  if (!primaryId && next.length) setPrimaryId(next[0].id)
  setError('')
 }
 function changeUnit(next: Unit) {
  setDimensions(current => Object.fromEntries((Object.keys(current) as Axis[]).map(axis => {
   const value = Number(current[axis])
   return [axis, current[axis] && Number.isFinite(value) ? String(Number((value * factors[unit] / factors[next]).toFixed(6))) : current[axis]]
  })) as Record<Axis, string>)
  setUnit(next)
 }
 function removePhoto(id: string) {
  const next = references.filter(reference => reference.id !== id)
  setReferences(next)
  if (primaryId === id) setPrimaryId(next[0]?.id ?? '')
 }
 return <main className="dashboard object-input-page">
  <header className="generate-detail-heading">
   <Link to="/generate" className="generate-back" aria-label="Back to Generate"><Icon name="arrow" size={24} /></Link>
   <h1>Generate Object</h1>
  </header>
  <div className="object-input-workspace">
   <div className="object-input-main">
    <section className="object-panel" aria-labelledby="object-reference-heading">
     <div className="object-panel-heading"><h2 id="object-reference-heading">Reference inputs</h2></div>
     <label className="object-field-label" htmlFor="object-url">Product URL <span>Optional</span></label>
     <input id="object-url" type="url" inputMode="url" value={url} onChange={event => setUrl(event.target.value)} onBlur={() => setUrlTouched(true)} aria-invalid={urlTouched && !!url && !host} aria-describedby={urlTouched && !!url && !host ? 'object-url-help' : undefined} />
     {urlTouched && !!url && !host && <p id="object-url-help" className="object-help object-error">Enter a complete http:// or https:// product URL.</p>}
     <div className="object-photos-heading"><h3>Reference photos</h3>{!!references.length && <span>{references.length + (references.length === 1 ? ' image' : ' images')}</span>}</div>
     <input ref={input} className="object-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose object reference photos" onChange={event => { addPhotos(Array.from(event.target.files ?? [])); event.target.value = '' }} />
     <div className={'object-dropzone' + (dragging ? ' is-dragging' : '')} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); addPhotos(Array.from(event.dataTransfer.files)) }}>
      <Icon name="upload" size={28} /><h3>{references.length ? 'Add reference photos' : 'Drop photos of your object here'}</h3><p>JPG, PNG, WebP</p>
      <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()}>Choose photos</button>
     </div>
     {error && <p className="object-error" role="alert">{error}</p>}
     {!!references.length && <ul className="object-reference-grid">{references.map(reference => <ReferencePhoto key={reference.id} reference={reference} primary={primaryId === reference.id} onPrimary={() => setPrimaryId(reference.id)} onView={view => setReferences(current => current.map(item => item.id === reference.id ? { ...item, view } : item))} onRemove={() => removePhoto(reference.id)} />)}</ul>}
    </section>
    <section className="object-panel object-dimensions-panel" aria-labelledby="object-dimensions-heading">
     <div className="object-panel-heading"><h2 id="object-dimensions-heading">Dimensions</h2><label className="object-unit">Unit<select aria-label="Dimension unit" value={unit} onChange={event => changeUnit(event.target.value as Unit)}><option value="cm">cm</option><option value="mm">mm</option><option value="m">m</option></select></label></div>
     <div className="object-dimension-layout">
      <div><div className="object-dimension-fields">{(['width', 'height', 'depth'] as Axis[]).map(axis => <label key={axis} htmlFor={'object-' + axis}><span>{axis[0].toUpperCase() + axis.slice(1)}</span><div><input id={'object-' + axis} type="number" min="0" step="any" value={dimensions[axis]} onChange={event => setDimensions(current => ({ ...current, [axis]: event.target.value }))} aria-invalid={!!dimensions[axis] && !(Number(dimensions[axis]) > 0)} /><span>{unit}</span></div></label>)}</div><p className="object-help">Measure the full object: left to right, bottom to top, and front to back.</p></div>
      <ObjectSizeGuide />
     </div>
    </section>
   </div>
   <aside className="object-panel object-details" aria-labelledby="object-details-heading">
    <h2 id="object-details-heading">Object details</h2>
    <label className="object-field-label" htmlFor="object-name">Object name <span>Required</span></label>
    <input id="object-name" required value={name} maxLength={100} onChange={event => setName(event.target.value)} />
    <label className="object-field-label" htmlFor="object-notes">Appearance &amp; details <span>Optional</span></label>
    <textarea id="object-notes" rows={5} value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} />
    <button type="button" className="btn btn-primary object-generate-button" disabled>Generate object</button>
   </aside>
  </div>
 </main>
}
