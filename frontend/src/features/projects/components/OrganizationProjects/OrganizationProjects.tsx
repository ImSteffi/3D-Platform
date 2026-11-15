import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, EmptyState, Field, Icon, InlineError, Panel, SkeletonGroup } from '../../../../shared/ui'
import { createProject, getProjects, type Project } from '../../api/projects'
import '../../../organizations/styles/customers.css'
import DeskRowsSkeleton from '../../../organizations/components/DeskRowsSkeleton'
import './OrganizationProjects.css'

type OrganizationProjectsProps = { organizationId: number }

/** The "Spaces" section of a customer: the customer's projects, with an inline form to create one. */
export default function OrganizationProjects({ organizationId }: OrganizationProjectsProps) {
 const [projects, setProjects] = useState<Project[]>([])
 const [formOpen, setFormOpen] = useState(false)
 const [name, setName] = useState('')
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState('')
 const [saving, setSaving] = useState(false)
 const [attempt, setAttempt] = useState(0)

 useEffect(() => {
  let active = true
  getProjects(organizationId).then(data => { if (active) setProjects(data) })
   .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'Could not load this customer’s spaces. Try again.') })
   .finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [organizationId, attempt])

 const retry = useCallback(() => { setLoading(true); setLoadError(''); setAttempt(value => value + 1) }, [])

 function closeForm() {
  setFormOpen(false)
  setName('')
  setError('')
 }

 async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return

  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 200) {
   setError('Enter a space name of 1 to 200 characters.')
   return
  }

  setSaving(true)
  setError('')
  try {
   const saved = await createProject(organizationId, trimmedName)
   setProjects(current => [...current, saved])
   closeForm()
  } catch (error) {
   setError(error instanceof Error ? error.message : 'Could not reach the server. Check your connection and try again.')
  } finally {
   setSaving(false)
  }
 }

 const ready = !loading && !loadError

 return <section className="desk-section customer-spaces" aria-labelledby="customer-spaces-title">
  <div className="desk-section-head">
   <h2 id="customer-spaces-title">Spaces{ready && <span className="desk-count">{projects.length}</span>}</h2>
   {!formOpen && ready && <Button variant="secondary" icon="plus" onClick={() => setFormOpen(true)}>New space</Button>}
  </div>

  {formOpen && <Panel variant="well" className="desk-form">
   <form onSubmit={handleSubmit} noValidate>
    <h3>New space</h3>
    <p>A space is one of this customer’s places. You upload its tours inside it.</p>
    <fieldset className="desk-form-fields" disabled={saving}>
     <Field name="projectName" label="Space name" value={name} onChange={setName} error={error} autoComplete="off" autoFocus maxLength={200} />
     <div className="desk-form-actions">
      <Button type="submit" loading={saving}>{saving ? 'Creating space' : 'Create space'}</Button>
      <Button variant="secondary" onClick={closeForm}>Cancel</Button>
     </div>
    </fieldset>
   </form>
  </Panel>}

  {loading ? <SkeletonGroup label="Loading spaces"><DeskRowsSkeleton mark="space" rows={3} /></SkeletonGroup>
   : loadError ? <InlineError onRetry={retry}>{loadError}</InlineError>
   : projects.length === 0 ? !formOpen && <EmptyState icon="spaces" level={3} title="No spaces yet"
     text="Create a space, then open it to upload the tours you build for this customer." />
   : <ul className="desk-list" aria-label="Spaces">
     {projects.map(project => <li key={project.id}>
      <Link className="desk-row" to={`/organizations/${organizationId}/projects/${project.id}`}>
       <span className="desk-mark desk-mark--space" aria-hidden="true"><Icon name="spaces" size={18} /></span>
       <span className="desk-row-text"><strong>{project.name}</strong></span>
       <Icon name="chevron" size={18} />
      </Link>
     </li>)}
    </ul>}
 </section>
}
