import { useEffect, useState } from 'react'
import { InlineError, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import ProjectScanList from '../../../scans/components/ProjectScanList/ProjectScanList'
import { getProjects, type Project } from '../../api/projects'

/** The customer's tours, shown straight on the customer page instead of behind a "Spaces" list. */
export default function OrganizationTours({ organizationId }: { organizationId: number }) {
 const [projects, setProjects] = useState<Project[] | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)

 useEffect(() => {
  let active = true
  getProjects(organizationId)
   .then(data => { if (active) setProjects(data) })
   .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load the tours. Try again.') })
  return () => { active = false }
 }, [organizationId, attempt])


 if (error) return <section className="desk-section"><InlineError onRetry={() => { setError(''); setProjects(null); setAttempt(v => v + 1) }}>{error}</InlineError></section>
 if (!projects) return <SkeletonGroup label="Loading tours"><section className="desk-section"><Skeleton height={160} radius="var(--r-card)" index={0} /></section></SkeletonGroup>
 // No tours yet: nothing to show. A tour only comes after the photos, so there is no empty section or button.
 if (projects.length === 0) return null
 return <>{projects.map(project => <section key={project.id} className="desk-section">
  <ProjectScanList organizationId={organizationId} projectId={project.id} />
 </section>)}</>
}
