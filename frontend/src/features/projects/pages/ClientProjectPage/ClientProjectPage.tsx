import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button, EmptyState, Icon, InlineError, Panel } from '../../../../shared/ui'
import { useBackdrop, useShellMode } from '../../../../shared/layout/Backdrop'
import { getClientProject, type ClientProjectDetail } from '../../api/clientProjects'
import ScanCard from '../../../scans/components/ScanCard/ScanCard'
import ScanCardSkeleton from '../../../scans/components/ScanCard/ScanCardSkeleton'
import '../../../scans/components/ProjectScanList/ProjectScanList.css'
import './ClientProjectPage.css'

/** A customer's space that holds tours the team delivered outside a capture. */
export default function ClientProjectPage() {
 useShellMode('place')
 const { projectId } = useParams()
 const id = Number(projectId)
 const valid = Number.isSafeInteger(id) && id > 0
 const [project, setProject] = useState<ClientProjectDetail | null>(null)
 const [error, setError] = useState<{ projectId: number; message: string } | null>(null)
 const [attempt, setAttempt] = useState(0)

 useEffect(() => {
  let active = true
  if (!Number.isSafeInteger(id) || id <= 0) return
  getClientProject(id).then(data => { if (active) setProject(data) })
   .catch(error => { if (active) setError({ projectId: id, message: error instanceof Error ? error.message : 'Could not load this space. Try again.' }) })
  return () => { active = false }
 }, [id, attempt])

 const retry = useCallback(() => { setError(null); setAttempt(value => value + 1) }, [])
 const shown = valid && project && project.id === id ? project : null
 const failed = error?.projectId === id ? error.message : ''
 const tours = shown?.scans ?? []

 // The place is the page: the first tour's preview fills the screen behind the glass.
 useBackdrop(tours.length > 0 ? `/api/scans/${tours[0].id}/preview` : null)

 return <main className="page space-tours-page">
  <header className="page-header">
   <div>
    <Link className="space-tours-back" to="/spaces"><Icon name="back" size={16} />All spaces</Link>
    <h1>{shown?.name ?? 'Your space'}</h1>
    {shown && tours.length > 0 && <p>{tours.length === 1 ? 'One tour from the team, ready to walk through and share.' : `${tours.length} tours from the team, ready to walk through and share.`}</p>}
   </div>
  </header>

  {!valid ? <Panel><EmptyState icon="spaces" title="Space not found"
     text="This space does not exist, or the link is out of date."
     action={<Button variant="secondary" to="/spaces" icon="back">All spaces</Button>} /></Panel>
   : failed ? <Panel><InlineError onRetry={retry}>{failed}</InlineError></Panel>
   : !shown ? <ScanCardSkeleton label="Loading your space" />
   : tours.length === 0 ? <Panel><EmptyState icon="cube" title="No tours here yet"
     text="When the team delivers a tour to this space, it appears here for you to walk through and share."
     action={<Button variant="secondary" to="/spaces" icon="back">All spaces</Button>} /></Panel>
   : <ul className="tour-grid" aria-label="Tours">
     {tours.map(scan => <li key={scan.id}><ScanCard scan={{ ...scan, status: 'READY', files: scan.files ?? [] }} /></li>)}
    </ul>}
 </main>
}
