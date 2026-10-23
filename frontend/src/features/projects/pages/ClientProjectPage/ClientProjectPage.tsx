import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getClientProject, type ClientProjectDetail } from '../../api/clientProjects'
import ScanCard from '../../../scans/components/ScanCard/ScanCard'
import Icon from '../../../../shared/ui/Icon/Icon'
import './ClientProjectPage.css'
export default function ClientProjectPage() {
 const { projectId } = useParams()
 const id = Number(projectId)
 const [project, setProject] = useState<ClientProjectDetail | null>(null)
 const [error, setError] = useState<{ projectId: number; message: string } | null>(null)
 useEffect(() => {
  let active = true
  if (!Number.isSafeInteger(id) || id <= 0) return
  getClientProject(id).then(data => { if (active) setProject(data) })
   .catch(error => { if (active) setError({ projectId: id, message: error instanceof Error ? error.message : 'Could not load project.' }) })
  return () => { active = false }
 }, [id])
 return <main className="dashboard project-detail-page">
  <Link to="/projects">← All projects</Link>
  {!Number.isSafeInteger(id) || id <= 0 ? <p className="page-message">Project not found.</p>
   : error?.projectId === id ? <p role="alert" className="field-error page-message">{error.message}</p>
   : !project || project.id !== id ? <p className="page-message" role="status">Loading project…</p> : <>
    <div className="project-detail-heading"><div><span className="eyebrow">{project.organizationName}</span><h1>{project.name}</h1></div><span className="status-pill status-pill--ready">{project.scans.length} published {project.scans.length === 1 ? 'scan' : 'scans'}</span></div>
    <section aria-label="Published scans"><div className="section-heading"><div><h2>Published scans</h2></div><span className="scan-total"><Icon name="scan" size={15} />{project.scans.length}</span></div>
     {project.scans.length === 0 ? <div className="empty-state"><Icon name="scan" size={32} /><h3>A new perspective is on its way.</h3><p>Published scans will appear here when they’re ready.</p></div> : <ul className="client-scan-list">
      {project.scans.map(scan => <li key={scan.id}><ScanCard scan={{ ...scan, status: 'READY', files: scan.files ?? [] }} /></li>)}
     </ul>}
    </section>
   </>}
 </main>
}
