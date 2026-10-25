import ScanPreview from './ScanPreview'
import ConfirmDialog from '../../../../shared/ui/ConfirmDialog/ConfirmDialog'
import { useContext, useEffect, useRef, useState } from 'react'
import Icon from '../../../../shared/ui/Icon/Icon'
import SceneFileList from '../SceneFileList/SceneFileList'
import { formatFileSize } from '../../utils/sceneFiles'
import { ScanViewerContext } from '../ScanViewer/ScanViewerContext'
import { getSharingStatus, setShareable, sharingUrl, type SharingStatus } from '../../api/share'
import { deleteScan } from '../../api/delete'
import { downloadScan } from '../../api/download'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import './ScanCard.css'

type ScanCardProps = {
 onDeleted?: (scanId: number) => void
 scan: {
  id: number
  name: string
  status: 'READY' | 'UPLOADING' | 'FAILED'
  files: { relativePath: string; sizeBytes: number }[]
  fileCount?: number
  sizeBytes?: number
 }
}

export default function ScanCard({ scan, onDeleted }: ScanCardProps) {
 const user = useWorkspaceUser()
 const openViewer = useContext(ScanViewerContext)
 const [confirmDelete, setConfirmDelete] = useState(false)
 const [deleting, setDeleting] = useState(false)
 const [deleted, setDeleted] = useState(false)
 const [deleteFailed, setDeleteFailed] = useState(false)
 const [shareSettings, setShareSettings] = useState<SharingStatus | null>(null)
 const [updatingShare, setUpdatingShare] = useState(false)
 const [sharing, setSharing] = useState(false)
 const [shareOpen, setShareOpen] = useState(false)
 const [copied, setCopied] = useState<'URL' | 'IFRAME' | null>(null)
 const [actionError, setActionError] = useState('')
 const downloadRequest = useRef<AbortController | null>(null)
 useEffect(() => () => downloadRequest.current?.abort(), [])
 const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
 useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])
 useEffect(() => {
  if (scan.status !== 'READY') return
  const request = new AbortController()
  getSharingStatus(scan.id, request.signal).then(setShareSettings)
   .catch(error => { if (!request.signal.aborted) setActionError(error instanceof Error ? error.message : 'Could not load sharing settings.') })
  return () => request.abort()
 }, [scan.id, scan.status])

 async function removeScan() {
  if (deleting || !user.platformAdmin) return
  setDeleting(true)
  setActionError('')
  try {
   await deleteScan(scan.id)
   setDeleted(true)
   onDeleted?.(scan.id)
  } catch (error) {
   setDeleteFailed(true)
   setShareSettings(current => current ? { ...current, enabled: false } : current)
   setShareOpen(false)
   setActionError(error instanceof Error ? error.message : 'Could not delete this scan. Please try again.')
  } finally { setDeleting(false) }
 }

 async function toggleShareable() {
  if (!shareSettings || updatingShare || sharing || deleting || deleteFailed) return
  setUpdatingShare(true)
  setActionError('')
  try {
   const settings = await setShareable(scan.id, !shareSettings.enabled)
   setShareSettings(settings)
   if (!settings.enabled) { setShareOpen(false); setCopied(null) }
  } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update sharing.') }
  finally { setUpdatingShare(false) }
 }

 async function copyShare(kind: 'URL' | 'IFRAME') {
  if (deleting || deleteFailed || sharing || updatingShare || !shareSettings?.enabled || !shareSettings.hostingEnabled) return
  setSharing(true)
  try {
   const current = await getSharingStatus(scan.id)
   setShareSettings(current)
   if (!current.enabled || !current.hostingEnabled) throw new Error('Sharing is currently disabled for this scan.')
   const url = sharingUrl(current)
   const text = kind === 'URL' ? url : '<iframe src="' + url + '" title="3D viewer" style="width:100%;height:600px;border:0;border-radius:16px" loading="lazy" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe>'
   await navigator.clipboard.writeText(text)
   setActionError('')
   if (copyTimer.current) clearTimeout(copyTimer.current)
   setCopied(kind)
   copyTimer.current = setTimeout(() => setCopied(null), 1600)
  } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not copy. Please try again.') }
  finally { setSharing(false) }
 }
 const [downloading, setDownloading] = useState(false)
 async function download() {
  if (deleting || deleteFailed || downloading || scan.status !== 'READY') return
  setDownloading(true)
  setActionError('')
  const request = new AbortController()
  downloadRequest.current = request
  try { await downloadScan(scan.id, request.signal) }
  catch (error) { if (!request.signal.aborted) setActionError(error instanceof Error ? error.message : 'Could not download this scan.') }
  finally { if (!request.signal.aborted) { downloadRequest.current = null; setDownloading(false) } }
 }
 const totalSize = scan.sizeBytes ?? scan.files.reduce((sum, file) => sum + file.sizeBytes, 0)
 if (deleted) return null
 return <>
 <article className="saved-scan-card">
  <div className="saved-scan-preview">
   {scan.status === 'READY' && <ScanPreview scanId={scan.id} />}
   <button type="button" className="scan-play-button" aria-label={`Open scan ${scan.name}`} disabled={deleting || deleteFailed || scan.status !== 'READY'} onClick={event => openViewer?.(scan, event.currentTarget)}>
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
   </button>
  </div>
  <div className="saved-scan-content">
   <div className="saved-scan-summary">
    <div className="saved-scan-heading"><span className="saved-scan-icon"><Icon name="scan" size={21} /></span><h3>{scan.name}</h3></div>
    <p>{scan.fileCount ?? scan.files.length} files · {formatFileSize(totalSize)}</p>
    {scan.status === 'UPLOADING' && <p>This upload was interrupted. Its files may only be partially uploaded.</p>}
    <div className="saved-scan-actions">
     <div className="scan-share-actions">
      <button type="button" className={'btn btn-ghost scan-share-toggle' + (shareOpen ? ' is-open' : '')}
       aria-expanded={shareOpen} aria-controls={'scan-share-' + scan.id} disabled={deleting || deleteFailed || scan.status !== 'READY' || !shareSettings?.enabled || !shareSettings.hostingEnabled || updatingShare}
       onClick={() => setShareOpen(value => !value)}><span>Share</span></button>
      <div id={'scan-share-' + scan.id} className={'scan-share-options' + (shareOpen ? ' is-open' : '')} inert={!shareOpen} aria-hidden={!shareOpen}>
       <div className="scan-share-options-inner">
        {(['URL', 'IFRAME'] as const).map(kind => <button key={kind} type="button" disabled={sharing || updatingShare || !shareSettings?.enabled}
         className={'btn btn-ghost scan-copy-button' + (copied === kind ? ' is-copied' : '')}
         aria-label={copied === kind ? kind + ' copied' : 'Copy ' + kind} onClick={() => { void copyShare(kind) }}>
         {copied === kind && <span aria-hidden="true">✓ </span>}{kind}
        </button>)}
       </div>
      </div>
     </div>
     <button type="button" className="btn btn-ghost" disabled={deleting || deleteFailed || downloading || scan.status !== 'READY'}
      onClick={() => { void download() }}>{downloading ? 'Preparing…' : 'Download'}</button>
     {user.platformAdmin && <span className="scan-delete-action"><button type="button" className="btn btn-ghost" disabled={deleting || updatingShare || sharing || downloading} onClick={() => { setActionError(''); setConfirmDelete(true) }}>{deleting ? 'Deleting…' : 'Delete'}</button></span>}
    </div>
    {actionError && <span className="scan-action-error" role="alert">{actionError}</span>}<span className="sr-only" role="status">{copied ? copied + ' copied to clipboard' : ''}</span>
   </div>
   <div className="saved-scan-files"><SceneFileList files={scan.files} /></div>
  </div>
  <div className="saved-scan-status"><span className={`status-pill ${scan.status === 'READY' ? 'status-pill--ready' : ''}`}>{scan.status === 'READY' ? 'Published' : scan.status === 'UPLOADING' ? 'Incomplete' : 'Failed'}</span>
   {scan.status === 'READY' && <button type="button" role="switch" aria-checked={shareSettings?.enabled ?? false}
    aria-label={'Shareable: ' + scan.name} aria-busy={updatingShare}
    className="scan-shareable" disabled={deleting || deleteFailed || !shareSettings || updatingShare || sharing || (!shareSettings.hostingEnabled && !shareSettings.enabled)}
    onClick={() => { void toggleShareable() }}>
    <span className="scan-shareable-track" aria-hidden="true"><span /></span><span>Shareable</span>
   </button>}
  </div>
 </article>
 {confirmDelete && <ConfirmDialog title="Delete scan?" confirmLabel="Delete scan" busy={deleting}
  error={actionError} onCancel={() => setConfirmDelete(false)} onConfirm={() => { void removeScan() }}>
  <p>Delete <strong>{scan.name}</strong> and all its files permanently? Its shared URL and iframe will stop working. This cannot be undone.</p>
 </ConfirmDialog>}
 </>
}
