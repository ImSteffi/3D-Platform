import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button, EmptyState, Icon, InlineError, Panel } from '../../../../shared/ui'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { getOrganizations } from '../../../organizations/api/organizations'
import { getProjects, type Project } from '../../api/projects'
import ProjectScanList from '../../../scans/components/ProjectScanList/ProjectScanList'
import ScanCardSkeleton from '../../../scans/components/ScanCard/ScanCardSkeleton'
import '../../../organizations/styles/customers.css'
import './AdminProjectPage.css'

/** One of a customer's spaces, as the operator sees it: its tours and the upload of a new one. */
export default function AdminProjectPage() {
 useShellMode('desk')
 const { organizationId, projectId } = useParams()
 const orgId = Number(organizationId)
 const id = Number(projectId)
 const validOrg = Number.isSafeInteger(orgId) && orgId > 0
 const valid = validOrg && Number.isSafeInteger(id) && id > 0
 const [project, setProject] = useState<Project | null>(null)
 const [customerName, setCustomerName] = useState('')
 const [missingId, setMissingId] = useState<number | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)

 useEffect(() => {
  if (!valid) return
  let active = true
  getProjects(orgId).then(projects => {
   if (!active) return
   const found = projects.find(project => project.id === id)
   if (found) setProject(found)
   else setMissingId(id)
  }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load this space. Try again.') })
  // The customer's name is only for the link back; the page works without it.
  getOrganizations().then(organizations => {
   if (active) setCustomerName(organizations.find(item => item.id === orgId)?.name ?? '')
  }).catch(() => {})
  return () => { active = false }
 }, [orgId, id, valid, attempt])

 const retry = useCallback(() => { setError(''); setAttempt(value => value + 1) }, [])
 const back = validOrg ? `/organizations/${orgId}` : '/organizations'
 const notFound = !valid || missingId === id
 const shown = project && project.id === id ? project : null

 return <main className="page admin-space-page">
  <header className="page-header">
   <div>
    <Link className="desk-back" to={back}><Icon name="back" size={16} />{validOrg ? customerName || 'Customer' : 'Customers'}</Link>
    <h1 className="desk-title">{shown?.name ?? 'Space'}</h1>
   </div>
  </header>

  <Panel padding="lg" className="desk-window">
   {notFound ? <EmptyState icon="spaces" title="Space not found"
     text="This space does not exist, or the link is out of date."
     action={<Button variant="secondary" to={back} icon="back">{validOrg ? 'Back to the customer' : 'Back to customers'}</Button>} />
    : error ? <InlineError onRetry={retry}>{error}</InlineError>
    : !shown ? <ScanCardSkeleton label="Loading space" head />
    : <ProjectScanList key={shown.id} organizationId={orgId} projectId={shown.id} />}
  </Panel>
 </main>
}
