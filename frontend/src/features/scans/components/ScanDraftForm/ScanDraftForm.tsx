import { useId, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Button, Field, Icon, InlineError, Panel, Spinner } from '../../../../shared/ui'
import type { SavedScan } from '../../api/scans'
import { useScanPublish } from '../../hooks/useScanPublish'
import type { ScanDraft } from '../../types'
import { formatFileSize, readEntry, isZoneIdentifier, type SelectedSceneFile } from '../../utils/sceneFiles'
import SceneFileList from '../SceneFileList/SceneFileList'
import UploadProgress from '../UploadProgress/UploadProgress'
import './ScanDraftForm.css'

type ScanDraftFormProps = {
 organizationId: number
 projectId: number
 onPublished: (scan: SavedScan) => void
 onCancel: () => void
}

/** "Add a tour": drop or choose the folder of scene files, name the tour, upload. */
export default function ScanDraftForm({ organizationId, projectId, onPublished, onCancel }: ScanDraftFormProps) {
 const inputId = useId()
 const { busy, progress, error: publishError, serverScan, publish } = useScanPublish(organizationId, projectId)
 const [name, setName] = useState('')
 const [files, setFiles] = useState<SelectedSceneFile[]>([])
 const [error, setError] = useState('')
 const [selectionName, setSelectionName] = useState('')
 const [reading, setReading] = useState(false)
 const [dragging, setDragging] = useState(false)
 const readingRef = useRef(false)
 const folderInput = useRef<HTMLInputElement | null>(null)

 const totalSize = files.reduce((total, item) => total + item.file.size, 0)
 // Once the server holds a record of this tour, its name and files are fixed: only "Retry upload" remains.
 const locked = reading || busy || !!serverScan

 function selectFolder(fileList: FileList | null) {
  if (!fileList || fileList.length === 0 || readingRef.current || busy || serverScan || files.length > 0) return

  const selected = Array.from(fileList)
   .map(file => ({ file, relativePath: file.webkitRelativePath.split('/').slice(1).join('/') || file.name }))
   .filter(item => !isZoneIdentifier(item.relativePath))
   .sort((first, second) => first.relativePath.localeCompare(second.relativePath))

  setSelectionName(fileList[0].webkitRelativePath.split('/')[0] || 'Selected files')
  setFiles(selected)
  setError('')
 }

 async function handleDrop(event: DragEvent<HTMLDivElement>) {
  event.preventDefault()
  event.stopPropagation()
  setDragging(false)

  if (readingRef.current || busy || serverScan || files.length > 0) return

  // Capture dropped entries before awaiting directory reads.
  const entries = Array.from(event.dataTransfer.items)
   .filter(item => item.kind === 'file')
   .map(item => item.webkitGetAsEntry())
   .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) {
   setError('Nothing was dropped. Drop a folder or files from your computer.')
   return
  }

  readingRef.current = true
  setReading(true)
  setError('')

  try {
   const selected: SelectedSceneFile[] = []
   const singleFolder = entries.length === 1 && entries[0].isDirectory

   for (const entry of entries) {
    const rootPath = singleFolder ? '' : entry.name
    const entryFiles = await readEntry(entry, rootPath)
    for (const file of entryFiles) selected.push(file)
   }

   if (selected.length === 0) throw new Error('That folder has no files in it. Choose the folder that holds the scene files.')

   const paths = new Set(selected.map(item => item.relativePath))
   if (paths.size !== selected.length) throw new Error('Two of these files share the same path. Drop one folder at a time.')

   selected.sort((first, second) => first.relativePath.localeCompare(second.relativePath))

   setFiles(selected)
   setSelectionName(singleFolder ? entries[0].name : 'Selected files')
  } catch (error) {
   setError(error instanceof Error ? error.message : 'Could not read those files. Try choosing the folder instead.')
  } finally {
   readingRef.current = false
   setReading(false)
  }
 }

 function clearSelection() {
  setFiles([])
  setSelectionName('')
  setError('')
 }

 function createDraft(): ScanDraft | null {
  if (readingRef.current || busy) return null
  if (files.length === 0) {
   setError('Choose the folder of scene files for this tour first.')
   return null
  }
  if (!name.trim() || name.trim().length > 200) {
   setError('Give the tour a name of 1 to 200 characters.')
   return null
  }
  setError('')
  return { id: crypto.randomUUID(), name: name.trim(), files }
 }

 async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const draft = createDraft()
  if (!draft) return
  const saved = await publish(draft)
  if (saved) onPublished(saved)
 }

 return <Panel variant="well" className="tour-form">
  <form onSubmit={handleSubmit} noValidate>
   <h3>Add a tour</h3>

   <fieldset disabled={locked} className="tour-form-fields">
    {files.length === 0 ? <div className={`tour-drop${dragging ? ' tour-drop--over' : ''}`}
     onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (!locked) setDragging(true) }}
     onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
     onDrop={handleDrop}>
     <span className="tour-drop-icon"><Icon name="upload" size={22} /></span>
     <div className="tour-drop-text">
      <p id={`${inputId}-drop-title`} className="tour-drop-title">Drop the folder of scene files here</p>
      <p>Or choose it from your computer. Everything inside is included, subfolders too.</p>
     </div>
     {reading
      ? <Spinner label="Reading the folder" />
      : <Button variant="secondary" icon="folder" onClick={() => folderInput.current?.click()}>Choose folder</Button>}
     <input id={`${inputId}-folder`} name="sceneFolder" type="file" multiple hidden aria-labelledby={`${inputId}-drop-title`}
      ref={input => { folderInput.current = input; input?.setAttribute('webkitdirectory', '') }}
      onChange={event => { selectFolder(event.target.files); event.target.value = '' }} />
    </div> : <div className="tour-selection">
     <div className="tour-selection-head">
      <span className="tour-drop-icon"><Icon name="folder" size={20} /></span>
      <div className="tour-selection-text">
       <strong>{selectionName}</strong>
       <span className="tour-selection-meta">{files.length} {files.length === 1 ? 'file' : 'files'} · {formatFileSize(totalSize)}</span>
      </div>
      {!serverScan && <Button variant="quiet" onClick={clearSelection}>Choose different files</Button>}
     </div>
     <SceneFileList files={files.map(({ file, relativePath }) => ({ relativePath, sizeBytes: file.size }))} />
    </div>}

    <Field className="tour-form-name" name="scanName" label="Tour name" value={name} onChange={setName} autoComplete="off" maxLength={200}
     hint="The customer sees this name on their tour." />
   </fieldset>

   <InlineError>{error || publishError}</InlineError>
   {!busy && !!publishError && !!serverScan && <p className="tour-form-note">The files already sent are kept. Retry upload continues from where it stopped.</p>}

   {busy && <UploadProgress percent={progress.percent} label={progress.label} />}

   <fieldset disabled={reading || busy} className="tour-form-actions">
    {files.length > 0 && <Button type="submit" icon="upload" loading={busy}>{busy ? 'Uploading' : publishError ? 'Retry upload' : 'Upload tour'}</Button>}
    {!serverScan && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
   </fieldset>
  </form>
 </Panel>
}
