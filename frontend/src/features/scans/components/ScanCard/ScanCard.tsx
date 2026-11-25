import { useContext, useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Icon, InlineError, Panel, StatusPill } from '../../../../shared/ui'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import { getSharingStatus, setShareable, sharingUrl, type SharingStatus } from '../../api/share'
import { deleteScan } from '../../api/delete'
import { formatFileSize } from '../../utils/sceneFiles'
import SceneFileList from '../SceneFileList/SceneFileList'
import { ScanViewerContext } from '../ScanViewer/ScanViewerContext'
import ScanPreview from './ScanPreview'
import './ScanCard.css'

type ScanCardProps = {
 onDeleted?: (scanId: number) => void
 /** Only the preview, the name and the status. Sharing and deleting stay on the space's own page. */
 compact?: boolean
 scan: {
  id: number
  name: string
  status: 'READY' | 'UPLOADING' | 'FAILED'
  files: { relativePath: string; sizeBytes: number }[]
  fileCount?: number
  sizeBytes?: number
 }
}

const statusLabel = { READY: 'Ready', UPLOADING: 'Upload incomplete', FAILED: 'Failed' } as const
const statusTone = { READY: 'green', UPLOADING: 'amber', FAILED: 'red' } as const

/** One tour: preview, name, one primary action ("Walk through") and a quiet row for sharing and deleting. */
export default function ScanCard({ scan, onDeleted, compact = false }: ScanCardProps) {
 const user = useWorkspaceUser()
 const openViewer = useContext(ScanViewerContext)
 const [confirmDelete, setConfirmDelete] = useState(false)
 const [deleting, setDeleting] = useState(false)
 const [deleted, setDeleted] = useState(false)
 const [deleteFailed, setDeleteFailed] = useState(false)
 const [shareSettings, setShareSettings] = useState<SharingStatus | null>(null)
 const [updatingShare, setUpdatingShare] = useState(false)
 const [sharing, setSharing] = useState(false)
 const [copied, setCopied] = useState<'URL' | 'IFRAME' | null>(null)
 const [actionError, setActionError] = useState('')
 const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
 useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

 const ready = scan.status === 'READY'

 useEffect(() => {
  if (scan.status !== 'READY' || compact) return
  const request = new AbortController()
  getSharingStatus(scan.id, request.signal).then(setShareSettings)
   .catch(error => { if (!request.signal.aborted) setActionError(error instanceof Error ? error.message : 'Could not load the sharing settings. Refresh the page to try again.') })
  return () => request.abort()
 }, [scan.id, scan.status, compact])

 async function removeScan() {
  if (deleting || !user.platformAdmin) return
  setDeleting(true)
  setActionError('')
  try {
   await deleteScan(scan.id)
   setDeleted(true)
   onDeleted?.(scan.id)
  } catch (error) {
   // A failed delete may have removed some of the tour already: everything but another delete stays off.
   setDeleteFailed(true)
   setShareSettings(current => current ? { ...current, enabled: false } : current)
   setCopied(null)
   setActionError(error instanceof Error ? error.message : 'Could not delete this tour. Try again.')
  } finally { setDeleting(false) }
 }

 async function toggleShareable() {
  if (!shareSettings || updatingShare || sharing || deleting || deleteFailed) return
  setUpdatingShare(true)
  setActionError('')
  try {
   const settings = await setShareable(scan.id, !shareSettings.enabled)
   setShareSettings(settings)
   if (!settings.enabled) setCopied(null)
  } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not change sharing. Try again.') }
  finally { setUpdatingShare(false) }
 }

 async function copyShare(kind: 'URL' | 'IFRAME') {
  if (deleting || deleteFailed || sharing || updatingShare || !shareSettings?.enabled || !shareSettings.hostingEnabled) return
  setSharing(true)
  try {
   const current = await getSharingStatus(scan.id)
   setShareSettings(current)
   if (!current.enabled || !current.hostingEnabled) throw new Error('Sharing is turned off for this tour. Turn it on to copy a link.')
   const url = sharingUrl(current)
   const text = kind === 'URL' ? url : '<iframe src="' + url + '" title="3D viewer" style="width:100%;height:600px;border:0;border-radius:16px" loading="lazy" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe>'
   await navigator.clipboard.writeText(text)
   setActionError('')
   if (copyTimer.current) clearTimeout(copyTimer.current)
   setCopied(kind)
   copyTimer.current = setTimeout(() => setCopied(null), 1600)
  } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not copy. Try again.') }
  finally { setSharing(false) }
 }

 if (deleted) return null

 const blocked = deleting || deleteFailed
 const canWalk = ready && !blocked
 const fileCount = scan.fileCount ?? scan.files.length
 const sizeBytes = scan.sizeBytes ?? scan.files.reduce((sum, file) => sum + file.sizeBytes, 0)
 const shareOn = !!shareSettings?.enabled
 const canCopy = shareOn && !!shareSettings?.hostingEnabled && !blocked
 const shareId = 'tour-share-' + scan.id

 return <>
  <Panel as="article" padding="none" className={compact ? 'tour-card tour-card--compact' : 'tour-card'}>
   <button type="button" className="tour-card-media" tabIndex={compact ? undefined : -1} aria-label={`Walk through ${scan.name}`} disabled={!canWalk}
    onClick={event => openViewer?.(scan, event.currentTarget)}>
    <span className="tour-card-placeholder" aria-hidden="true"><Icon name="cube" size={28} /></span>
    {ready && <ScanPreview scanId={scan.id} />}
    {canWalk && <span className="tour-card-play" aria-hidden="true"><Icon name="play" size={20} /></span>}
   </button>

   <div className="tour-card-body">
    <div className="tour-card-head">
     <h3>{scan.name}</h3>
     {(user.platformAdmin || !ready) && <StatusPill tone={statusTone[scan.status]}>{statusLabel[scan.status]}</StatusPill>}
    </div>
    <p className="tour-card-meta">{fileCount} {fileCount === 1 ? 'file' : 'files'} · {formatFileSize(sizeBytes)}</p>
    {scan.status === 'UPLOADING' && <p className="tour-card-note">This upload stopped before it finished, so some files may be missing. Delete it and add the tour again.</p>}
    {scan.status === 'FAILED' && <p className="tour-card-note">This upload failed and the tour cannot be opened. Delete it and add the tour again.</p>}

    {!compact && <><Button icon="play" block disabled={!canWalk}
     onClick={event => openViewer?.(scan, event.currentTarget as HTMLButtonElement)}>Walk through</Button>

    {ready && <div className="tour-card-share">
     <button type="button" role="switch" className="tour-switch" aria-checked={shareOn} aria-busy={updatingShare}
      aria-label={`Share ${scan.name} with a link`} aria-controls={shareId}
      disabled={blocked || !shareSettings || updatingShare || sharing || (!shareSettings.hostingEnabled && !shareSettings.enabled)}
      onClick={() => { void toggleShareable() }}>
      <span className="tour-switch-track" aria-hidden="true"><span /></span>
      <span className="tour-switch-text">
       <strong>Share with a link</strong>
       <span>{!shareSettings ? 'Checking sharing' : shareOn ? 'On: anyone with the link can walk through.' : !shareSettings.hostingEnabled ? 'Not available for this tour.' : 'Off: only people who sign in can open it.'}</span>
      </span>
     </button>
     <div id={shareId} className="tour-card-copy">
      {canCopy && <>
       <Button variant="secondary" icon={copied === 'URL' ? 'check' : 'link'} disabled={sharing || updatingShare}
        onClick={() => { void copyShare('URL') }}>{copied === 'URL' ? 'Link copied' : 'Copy link'}</Button>
       <Button variant="secondary" icon={copied === 'IFRAME' ? 'check' : 'code'} disabled={sharing || updatingShare}
        onClick={() => { void copyShare('IFRAME') }}>{copied === 'IFRAME' ? 'Embed code copied' : 'Copy embed code'}</Button>
      </>}
     </div>
    </div>}

    <div className="tour-card-quiet">
     {user.platformAdmin && <Button variant="quiet" icon="trash" className="tour-card-delete" disabled={deleting || updatingShare || sharing}
      onClick={() => { setActionError(''); setConfirmDelete(true) }}>{deleting ? 'Deleting' : 'Delete tour'}</Button>}
    </div>

    {!confirmDelete && <InlineError>{actionError}</InlineError>}
    <span className="visually-hidden" role="status">{copied === 'URL' ? 'Link copied' : copied === 'IFRAME' ? 'Embed code copied' : ''}</span>

    {scan.files.length > 0 && <details className="tour-card-files">
     <summary><Icon name="chevron" size={14} />Files in this tour</summary>
     <SceneFileList files={scan.files} />
    </details>}</>}
   </div>
  </Panel>

  {confirmDelete && <ConfirmDialog title="Delete this tour?" confirmLabel="Delete tour" busy={deleting}
   error={actionError} onCancel={() => setConfirmDelete(false)} onConfirm={() => { void removeScan() }}>
   <p>This deletes <strong>{scan.name}</strong> and all its files for good. Its link and embed stop working. You cannot undo this.</p>
  </ConfirmDialog>}
 </>
}
