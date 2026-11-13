import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import Icon from '../../../../shared/ui/Icon/Icon'
import TourCamera from './TourCamera'
import TourInputGuide from './TourInputGuide'
import './GeneratePage.css'
import './TourInput.css'

const accept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov'
const isVideo = (file: File) => file.type.startsWith('video/') || /[.](mp4|webm|mov)$/i.test(file.name)
const supported = (file: File) => ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'].includes(file.type.split(';')[0])
 || (!file.type && /[.](jpe?g|png|webp|mp4|webm|mov)$/i.test(file.name))
const fileSize = (size: number) => size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + ' MB' : Math.ceil(size / 1024) + ' KB'

function MediaPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
 const [url, setUrl] = useState('')
 const [failed, setFailed] = useState(false)
 useEffect(() => {
  const objectUrl = URL.createObjectURL(file)
  setUrl(objectUrl)
  setFailed(false)
  return () => URL.revokeObjectURL(objectUrl)
 }, [file])
 return <li className={'tour-media-item' + (isVideo(file) ? ' tour-media-item--video' : '')}>
  <div className="tour-media-preview">
   {failed ? <p>Preview unavailable. Try a different format.</p> : url && (isVideo(file)
    ? <video src={url} controls playsInline preload="metadata" onError={() => setFailed(true)} />
    : <img src={url} alt={file.name} onError={() => setFailed(true)} />)}
  </div>
  <div className="tour-media-caption"><div><strong title={file.name}>{file.name}</strong><span>{fileSize(file.size)}</span></div>
   <button type="button" className="tour-remove-media" aria-label={'Remove ' + file.name} onClick={onRemove}><Icon name="close" size={18} /></button>
  </div>
 </li>
}

export default function GenerateTourEditorPage() {
 const [guideOpen, setGuideOpen] = useState(true)
 const [cameraOpen, setCameraOpen] = useState(false)
 const [files, setFiles] = useState<File[]>([])
 const [name, setName] = useState('')
 const [notes, setNotes] = useState('')
 const [error, setError] = useState('')
 const [dragging, setDragging] = useState(false)
 const input = useRef<HTMLInputElement>(null)
 function addFiles(incoming: File[]) {
  if (!incoming.length) return
  const valid = incoming.filter(file => supported(file) && file.size > 0)
  if (valid.length !== incoming.length) {
   setError('Choose non-empty JPG, PNG or WebP photos, or an MP4, WebM or MOV video.')
   return
  }
  const unique = [...files]
  for (const file of valid) {
   if (!unique.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) unique.push(file)
  }
  const videos = unique.filter(isVideo).length
  if (videos && (videos > 1 || unique.length > 1)) {
   setError('Use multiple photos or one video per tour. Remove the current media before switching.')
   return
  }
  setFiles(unique)
  setError('')
 }
 function resetInput() {
  setFiles([])
  setName('')
  setNotes('')
  setError('')
  setDragging(false)
  if (input.current) input.current.value = ''
 }
 function closeInput() {
  setCameraOpen(false)
  resetInput()
 }
 function openCamera() {
  setCameraOpen(true)
 }
 function chooseFiles() {
  input.current?.click()
 }
 return <main className="dashboard tour-input-page">
  <header className="generate-detail-heading">
   <Link to="/generate" className="generate-back" aria-label="Back to Generate"><Icon name="arrow" size={24} /></Link>
   <h1>Generate Tour</h1>
   <button type="button" className="btn btn-ghost tour-guide-trigger" onClick={() => setGuideOpen(true)}>Input guide</button>
  </header>
  {guideOpen && <TourInputGuide onClose={() => setGuideOpen(false)} />}
  <input ref={input} className="tour-file-input" type="file" aria-label="Choose photos or a video" accept={accept} multiple onChange={event => {
   addFiles(Array.from(event.target.files ?? [])); event.target.value = ''
  }} />
   <ol className="tour-input-steps" aria-label="Tour creation steps"><li className={!files.length ? 'is-current' : 'is-complete'} aria-current={!files.length ? 'step' : undefined}><span>1</span>Add media</li><li className={files.length ? 'is-current' : ''} aria-current={files.length ? 'step' : undefined}><span>2</span>Review</li><li><span>3</span>Generate</li></ol>
   <div className="tour-input-workspace">
    <div className="tour-input-media">
     <div className="tour-panel-heading"><div><h2>Your media</h2><p className="tour-muted">{files.length ? files.length + (files.some(isVideo) ? ' video' : files.length === 1 ? ' photo' : ' photos') + ' · ' + fileSize(files.reduce((sum, file) => sum + file.size, 0)) : 'Add photos or a video to get started.'}</p></div>
      {!!files.length && <button type="button" className="btn btn-ghost" onClick={() => { setFiles([]); setError('') }}>Clear all</button>}
     </div>
     {cameraOpen && <TourCamera onCapture={file => addFiles([file])} onClose={closeInput} />}
     <div className={'tour-dropzone' + (dragging ? ' is-dragging' : '')} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={event => {
      event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files))
     }}>
      <Icon name="upload" size={28} />
      <h3>{files.length ? 'Add more media' : 'Drop photos or a video here'}</h3>
      <p>JPG, PNG, WebP · MP4, WebM, MOV</p>
      <div className="tour-media-actions"><button type="button" className="btn btn-ghost" onClick={chooseFiles}>Choose files</button>{!cameraOpen && <button type="button" className="btn btn-ghost" onClick={openCamera}>Open camera</button>}</div>
     </div>
     {error && <p className="tour-input-error" role="alert">{error}</p>}
     {!!files.length && <ul className="tour-media-grid" aria-label="Selected media">{files.map((file, index) => <MediaPreview key={file.name + file.size + file.lastModified} file={file} onRemove={() => { setFiles(current => current.filter((_, i) => i !== index)); setError('') }} />)}</ul>}
    </div>
    <aside className="tour-settings" aria-labelledby="tour-details-heading">
     <h2 id="tour-details-heading">Tour details</h2>
     <label htmlFor="tour-name">Tour name <span>Required</span></label>
     <input id="tour-name" required value={name} maxLength={100} onChange={event => setName(event.target.value)} />
     <label htmlFor="tour-notes">Notes <span>Optional</span></label>
     <textarea id="tour-notes" rows={4} value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} />
     <button type="button" className="btn btn-primary tour-generate-button" disabled>Generate tour</button>
    </aside>
   </div>
 </main>
}
