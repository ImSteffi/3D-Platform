import { useEffect, useState } from 'react'
import { Button, InlineError, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import ProjectScanList from '../../../scans/components/ProjectScanList/ProjectScanList'
import { createProject, getProjects, type Project } from '../../api/projects'

/** The customer's tours, shown straight on the customer page instead of behind a "Spaces" list. */
export default function OrganizationTours({ organizationId }: { organizationId: number }) {
 const [projects, setProjects] = useState<Project[] | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [creating, setCreating] = useState(false)

 useEffect(() => {
  let active = true
  getProjects(organizationId)
   .then(data => { if (active) setProjects(data) })
   .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load the tours. Try again.') })
  return () => { active = false }
 }, [organizationId, attempt])

 // Tours live in a project on the server; the first tour gets one made for it.
 async function start() {
  setCreating(true)
  try { setProjects([await createProject(organizationId, 'Tours')]) }
  catch (err) { setError(err instanceof Error ? err.message : 'Could not start the tours. Try again.') }
  finally { setCreating(false) }
 }

 if (error) return <section className="desk-section"><InlineError onRetry={() => { setError(''); setProjects(null); setAttempt(v => v + 1) }}>{error}</InlineError></section>
 if (!projects) return <SkeletonGroup label="Loading tours"><section className="desk-section"><Skeleton height={160} radius="var(--r-card)" index={0} /></section></SkeletonGroup>
 if (projects.length === 0) return <section className="desk-section" aria-labelledby="org-tours-title">
  <div className="desk-section-head">
   <h2 id="org-tours-title">Tours<span className="desk-count">0</span></h2>
   <Button icon="plus" loading={creating} onClick={() => void start()}>Add a tour</Button>
  </div>
 </section>
 return <>{projects.map(project => <section key={project.id} className="desk-section">
  <ProjectScanList organizationId={organizationId} projectId={project.id} />
 </section>)}</>
}
