import { useEffect, useState } from 'react'
import Button from '../../../../shared/ui/Button/Button.tsx'
import ScanDraftForm from '../ScanDraftForm/ScanDraftForm'
import ScanCard from '../ScanCard/ScanCard'
import Icon from '../../../../shared/ui/Icon/Icon'
import './ProjectScanList.css'
import { getScans, type SavedScan } from '../../api/scans.ts'

export default function ProjectScanList({ organizationId, projectId }: { organizationId: number; projectId: number }) {
  const [saved, setSaved] = useState<SavedScan[]>([])
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
    {formOpen && <ScanDraftForm organizationId={organizationId} projectId={projectId}
      onPublished={result => {
        setSaved(current => [...current.filter(item => item.id !== result.id), result]);
        setFormOpen(false);
      }} onCancel={() => setFormOpen(false)} />}
    {loading && <p>Loading scans…</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {!loading && !error && saved.length === 0 && <p className="no-scans">No scans yet. Add the first capture to this project.</p>}
    <ul className="scan-draft-list" aria-label="Saved scans">
      {saved.map(scan => <li key={scan.id}><ScanCard scan={scan} /></li>)}
    </ul>

  </>
}
