import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { getClientProjects, type ClientProject } from '../../api/clientProjects'
import Card from '../../../../shared/ui/Card/Card'
import Icon from '../../../../shared/ui/Icon/Icon'
import './ClientProjects.css'
export default function ClientProjects({ featured = false }: { featured?: boolean }) {
 const [projects, setProjects] = useState<ClientProject[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [params] = useSearchParams()
 const query = (params.get('q') ?? '').trim().toLowerCase()
 useEffect(() => {
  let active = true
  getClientProjects().then(data => { if (active) setProjects(data) })
   .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load projects.') })
   .finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [])
 if (loading) return <p className="page-message" role="status">Loading projects…</p>
 if (error) return <p role="alert" className="field-error page-message">{error}</p>
 const filtered = projects.filter(p => `${p.name} ${p.organizationName}`.toLowerCase().includes(query))
 const visible = featured ? filtered.slice(0,3) : filtered
 return <div className="client-projects">
  <div className="client-project-stats"><Card title="Your projects" value={String(projects.length)} detail="Spaces within your organization" /><Card title="Published scans" value={String(projects.reduce((sum,p) => sum+p.publishedScanCount,0))} detail="Ready for you to explore" /></div>
  <section aria-label="Your projects"><div className="section-heading"><div><h2>{featured ? 'Your projects' : 'Project library'}</h2>{query && <p>Results for “{params.get('q')}”</p>}</div>{featured && <Link className="text-link" to="/projects">View all <Icon name="arrow" size={14} /></Link>}</div>
   {visible.length === 0 ? <div className="empty-state"><Icon name="folder" size={30} /><h3>{query ? 'No matching projects.' : 'Your projects will appear here.'}</h3><p>{query ? 'Try another project or organization name.' : 'Your administrator will add projects to this workspace.'}</p></div> : <ul className="client-project-list">{visible.map(project => <li key={project.id}><Link className="client-project-row" to={`/projects/${project.id}`}><span className="client-project-icon"><Icon name="folder" size={20} /></span><h3>{project.name}</h3><span className="client-project-count">{project.publishedScanCount} published {project.publishedScanCount === 1 ? 'scan' : 'scans'}</span><Icon name="arrow" size={17} /></Link></li>)}</ul>}
  </section>
 </div>
}
