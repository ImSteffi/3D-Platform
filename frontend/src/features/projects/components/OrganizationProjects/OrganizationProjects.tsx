import Icon from '../../../../shared/ui/Icon/Icon'
import './OrganizationProjects.css'
import FormPanel from '../../../../shared/ui/FormPanel/FormPanel'
import { useEffect, useId, useState, type FormEvent } from 'react'
import Button from '../../../../shared/ui/Button/Button.tsx'
import TextField from '../../../../shared/ui/TextField/TextField.tsx'
import { Link } from 'react-router'
import { createProject, getProjects, type Project } from '../../api/projects.ts'

type OrganizationProjectsProps = { organizationId: number }

export default function OrganizationProjects({ organizationId }: OrganizationProjectsProps) {
  const inputId = useId()
  const [projects, setProjects] = useState<Project[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    async function loadProjects() {
      try {
        const data = await getProjects(organizationId)
        if (active) {
          setProjects(data)
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Could not load projects.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProjects()
    return () => { active = false }
  }, [organizationId])

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
      setError('Enter a project name of 1–200 characters.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const saved = await createProject(organizationId, trimmedName)
      setProjects((current) => [...current, saved])
      closeForm()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not connect to the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="organization-projects">
      <div className="organizations-heading">
        <div><h2>Projects</h2></div>
        {!formOpen && !loading && !loadError && <Button type="button" onClick={() => setFormOpen(true)}><Icon name="plus" size={14} />Add project</Button>}
      </div>
      {formOpen && (
        <FormPanel>
          <h3>New project</h3>
          <form className="project-form" onSubmit={handleSubmit}>
            <fieldset disabled={saving} className="organization-form-fields">
            <TextField id={`${inputId}-project-name`} name="projectName" label="Project name"
              value={name} onChange={setName} error={error} />
            <div className="organization-form-actions">
              <Button type="submit">{saving ? 'Creating…' : 'Create project'}</Button>
              <Button type="button" variant="ghost" onClick={closeForm}>Cancel</Button>
            </div>
            </fieldset>
          </form>
        </FormPanel>
      )}
      {loading ? (
        <p>Loading projects…</p>
      ) : loadError ? (
        <p className="field-error" role="alert">{loadError}</p>
      ) : projects.length === 0 ? (
        <p className="project-empty-scans">No projects added yet.</p>
      ) : (
        <ul className="project-draft-list" aria-label="Projects">
          {projects.map((project) => (
            <li key={project.id}>
              <Link className="project-draft-card admin-project-link" to={`/organizations/${organizationId}/projects/${project.id}`}>
                <div className="admin-project-title"><span><Icon name="folder" size={20} /></span><h3>{project.name}</h3><Icon name="arrow" size={18} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
