import { useRef, useState } from 'react'
import Button from '../../../../shared/ui/Button/Button'
import Icon from '../../../../shared/ui/Icon/Icon'
import type { ScanDraft } from '../../types'
import { publishScan, type SavedScan } from '../../api/scans'
import { formatFileSize } from '../../utils/sceneFiles'
import SceneFileList from '../SceneFileList/SceneFileList'
import './ScanDraftCard.css'
export default function ScanDraftCard({ scan, organizationId, projectId, onRemove, onPublished }: {
  scan: ScanDraft
  organizationId: number
  projectId: number
  onRemove: () => void
  onPublished: (scan: SavedScan) => void
}) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [serverScan, setServerScan] = useState<SavedScan | null>(null)
  const publishing = useRef(false)

  async function publish() {
    if (publishing.current) return
    publishing.current = true
    setBusy(true)
    setError('')
    try {
      const saved = await publishScan(organizationId, projectId, scan,
        serverScan, setServerScan, setProgress)
      onPublished(saved)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed. Please retry.')
    } finally {
      publishing.current = false
      setBusy(false)
    }
  }

  return (
    <li className="scan-draft-card">
      <fieldset disabled={busy} className="organization-form-fields">
        <div className="scan-draft-heading">
          <div>
            <span className="status-pill">Draft</span><h4>{scan.name}</h4>
            <p>Draft · {scan.files.length} files · {formatFileSize(scan.files.reduce((sum, f) => sum + f.file.size, 0))}</p>
          </div>
          {!serverScan && <Button variant="ghost" onClick={onRemove}>Remove scan</Button>}
        </div>
        <details className="scan-file-details">
          <summary>View files</summary>
          <SceneFileList files={scan.files.map(f => ({relativePath: f.relativePath, sizeBytes: f.file.size}))} />
        </details>
        <div className="organization-form-actions scan-publish-actions">
          <Button onClick={() => { void publish() }}><Icon name="upload" size={14} />{busy ? 'Publishing…' : error ? 'Retry publish' : 'Publish'}</Button>
        </div>
      </fieldset>
      {busy && <div className="upload-progress" role="status"><div className="upload-progress-track"><span style={{ width: `${Number(progress.match(/— (\d+)%/)?.[1] ?? 0)}%` }} /></div><p>{progress} Keep this page open.</p></div>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </li>
  )
}
