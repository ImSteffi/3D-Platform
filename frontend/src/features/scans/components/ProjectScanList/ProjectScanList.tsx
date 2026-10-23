import { useEffect, useState } from 'react'
import Button from '../../../../shared/ui/Button/Button.tsx'
import ScanDraftForm from '../ScanDraftForm/ScanDraftForm'
import type { ScanDraft } from '../../types'
import ScanDraftCard from '../ScanDraftCard/ScanDraftCard'
import SceneFileList from '../SceneFileList/SceneFileList'
import Icon from '../../../../shared/ui/Icon/Icon'
import './ProjectScanList.css'
import { getScans, type SavedScan } from '../../api/scans.ts'
import { formatFileSize } from '../../utils/sceneFiles.ts'

export default function ProjectScanList({ organizationId, projectId }: { organizationId: number; projectId: number }) {
  const [saved, setSaved] = useState<SavedScan[]>([])
  const [drafts, setDrafts] = useState<ScanDraft[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getScans(organizationId, projectId)
      .then(data => { if (active) setSaved(data) })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load scans.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organizationId, projectId])

  return <>
    <div className="scan-draft-heading">
      <h4>Scans</h4>
      {!formOpen && !loading && !error && <Button onClick={() => setFormOpen(true)}><Icon name="plus" size={14} />Add scan</Button>}
    </div>
    {formOpen && <ScanDraftForm onAdd={scan => { setDrafts(current => [...current, scan]); setFormOpen(false) }} onCancel={() => setFormOpen(false)} />}
    {loading && <p>Loading scans…</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {!loading && !error && saved.length === 0 && drafts.length === 0 && <p className="no-scans">No scans yet. Add the first capture to this project.</p>}
    <ul className="scan-draft-list" aria-label="Saved scans">
      {saved.map(scan => <li key={scan.id} className="saved-scan-card">
        <div className="saved-scan-heading"><span className="saved-scan-icon"><Icon name="scan" size={21} /></span><h4>{scan.name}</h4><span className={`status-pill ${scan.status === 'READY' ? 'status-pill--ready' : ''}`}>{scan.status === 'READY' ? 'Published' : scan.status === 'UPLOADING' ? 'Incomplete' : 'Failed'}</span></div>
        <p>{scan.files.length} files · {formatFileSize(scan.files.reduce((sum, f) => sum + f.sizeBytes, 0))}</p>
        {scan.status === 'UPLOADING' && <p>This upload was interrupted. Its files may only be partially uploaded.</p>}
        <details className="scan-file-details"><summary>View files</summary>
          <SceneFileList files={scan.files} />
        </details>
      </li>)}
    </ul>
    <ul className="scan-draft-list" aria-label="Scan drafts">
      {drafts.map(scan => <ScanDraftCard key={scan.id} scan={scan} organizationId={organizationId} projectId={projectId}
        onRemove={() => setDrafts(current => current.filter(item => item.id !== scan.id))}
        onPublished={result => {
          setSaved(current => [...current.filter(item => item.id !== result.id), result])
          setDrafts(current => current.filter(item => item.id !== scan.id))
        }} />)}
    </ul>
  </>
}
