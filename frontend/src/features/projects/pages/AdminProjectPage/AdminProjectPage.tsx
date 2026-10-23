import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getProjects, type Project } from '../../api/projects'
import ProjectScanList from '../../../scans/components/ProjectScanList/ProjectScanList'
import './AdminProjectPage.css'

export default function AdminProjectPage() {
 const { organizationId, projectId } = useParams()
 const orgId = Number(organizationId)
 const id = Number(projectId)
 const valid = Number.isSafeInteger(orgId) && orgId > 0 && Number.isSafeInteger(id) && id > 0
 const [project, setProject] = useState<Project | null>(null)
 const [error, setError] = useState('')
 useEffect(() => {
  if (!valid) return
  let active = true
  getProjects(orgId).then(projects => {
   if (!active) return
   const found = projects.find(project => project.id === id)
   if (found) setProject(found)
   else setError('Project not found.')
  }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load project.') })
  return () => { active = false }
 }, [orgId, id, valid])
 return <main className="dashboard admin-project-page">
  <Link to={Number.isSafeInteger(orgId) && orgId > 0 ? `/organizations/${orgId}` : '/organizations'}>← Back to organization</Link>
  {!valid ? <p className="page-message">Project not found.</p>
   : error ? <p role="alert" className="field-error page-message">{error}</p>
   : !project ? <p className="page-message" role="status">Loading project…</p>
   : <><h1>{project.name}</h1><section className="admin-project-scans" aria-label="Project scans"><ProjectScanList key={project.id} organizationId={orgId} projectId={project.id} /></section></>}
 </main>
}
