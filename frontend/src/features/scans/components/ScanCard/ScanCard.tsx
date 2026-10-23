import { useState } from 'react'
import Button from '../../../../shared/ui/Button/Button'
import Icon from '../../../../shared/ui/Icon/Icon'
import SceneFileList from '../SceneFileList/SceneFileList'
import { formatFileSize } from '../../utils/sceneFiles'
import './ScanCard.css'

type ScanCardProps = {
 scan: {
  name: string
  status: 'READY' | 'UPLOADING' | 'FAILED'
  files: { relativePath: string; sizeBytes: number }[]
  fileCount?: number
  sizeBytes?: number
 }
}

export default function ScanCard({ scan }: ScanCardProps) {
 const [notice, setNotice] = useState('')
 const totalSize = scan.sizeBytes ?? scan.files.reduce((sum, file) => sum + file.sizeBytes, 0)
 return <article className="saved-scan-card">
  <div className="saved-scan-preview">
   <button type="button" className="scan-play-button" aria-label={`Open scan ${scan.name}`} onClick={() => setNotice('The viewer is not connected yet.')}>
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
   </button>
  </div>
  <div className="saved-scan-content">
   <div className="saved-scan-summary">
    <div className="saved-scan-heading"><span className="saved-scan-icon"><Icon name="scan" size={21} /></span><h3>{scan.name}</h3></div>
    <p>{scan.fileCount ?? scan.files.length} files · {formatFileSize(totalSize)}</p>
    {scan.status === 'UPLOADING' && <p>This upload was interrupted. Its files may only be partially uploaded.</p>}
    <div className="saved-scan-actions">
     {(['Share', 'Download', 'Delete'] as const).map(action => <span key={action} className={action === 'Delete' ? 'scan-delete-action' : undefined}><Button variant="ghost" onClick={() => setNotice(`${action} is not connected yet.`)}>{action}</Button></span>)}
    </div>
    {notice && <p className="scan-action-notice" role="status">{notice}</p>}
   </div>
   <div className="saved-scan-files"><SceneFileList files={scan.files} /></div>
  </div>
  <div className="saved-scan-status"><span className={`status-pill ${scan.status === 'READY' ? 'status-pill--ready' : ''}`}>{scan.status === 'READY' ? 'Published' : scan.status === 'UPLOADING' ? 'Incomplete' : 'Failed'}</span></div>
 </article>
}
