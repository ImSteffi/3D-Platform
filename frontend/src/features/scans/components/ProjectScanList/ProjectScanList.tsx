import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, InlineError } from '../../../../shared/ui'
import { getScans, type SavedScan } from '../../api/scans'
import ScanCard from '../ScanCard/ScanCard'
import ScanCardSkeleton from '../ScanCard/ScanCardSkeleton'
import ScanDraftForm from '../ScanDraftForm/ScanDraftForm'
import './ProjectScanList.css'

/** The operator's "Tours" section of a space: the uploaded tours and the form that adds one. */
export default function ProjectScanList({ organizationId, projectId }: { organizationId: number; projectId: number }) {
 const [saved, setSaved] = useState<SavedScan[]>([])
 const [formOpen, setFormOpen] = useState(false)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)

 useEffect(() => {
  let active = true
  getScans(organizationId, projectId)
   .then(data => { if (active) setSaved(data) })
   .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load the tours. Try again.') })
   .finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [organizationId, projectId, attempt])

 const retry = useCallback(() => { setLoading(true); setError(''); setAttempt(value => value + 1) }, [])
 const ready = !loading && !error

 return <section className="tour-list" aria-labelledby="tour-list-title">
  <div className="tour-list-head">
   <div>
    <h2 id="tour-list-title">Tours{ready && <span className="tour-list-count">{saved.length}</span>}</h2>
   </div>
   {!formOpen && ready && <Button icon="plus" onClick={() => setFormOpen(true)}>Add a tour</Button>}
  </div>

  {formOpen && <ScanDraftForm organizationId={organizationId} projectId={projectId}
   onPublished={result => {
    setSaved(current => [...current.filter(item => item.id !== result.id), result])
    setFormOpen(false)
   }} onCancel={() => setFormOpen(false)} />}

  {loading ? <ScanCardSkeleton label="Loading tours" />
   : error ? <InlineError onRetry={retry}>{error}</InlineError>
   : saved.length === 0 ? !formOpen && <EmptyState icon="cube" level={3} title="No tours in this space yet"
     text="Add the first tour by uploading the folder of scene files you built." />
   : <ul className="tour-grid" aria-label="Tours">
     {saved.map(scan => <li key={scan.id}><ScanCard scan={scan} onDeleted={id => setSaved(current => current.filter(item => item.id !== id))} /></li>)}
    </ul>}
 </section>
}
