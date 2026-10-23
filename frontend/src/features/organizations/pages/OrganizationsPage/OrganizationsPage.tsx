import OrganizationMark from '../../../../shared/ui/OrganizationMark/OrganizationMark'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import Button from '../../../../shared/ui/Button/Button'
import TextField from '../../../../shared/ui/TextField/TextField'
import FormPanel from '../../../../shared/ui/FormPanel/FormPanel'
import Icon from '../../../../shared/ui/Icon/Icon'
import { createOrganization, getOrganizations, type Organization } from '../../api/organizations'
import './OrganizationsPage.css'
export default function OrganizationsPage() {
 const [organizations, setOrganizations] = useState<Organization[]>([])
 const [formOpen, setFormOpen] = useState(false)
 const [name, setName] = useState('')
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState('')
 const [saving, setSaving] = useState(false)
 const [params] = useSearchParams()
 const query = (params.get('q') ?? '').trim().toLowerCase()
 useEffect(() => {
  let active = true
  getOrganizations().then(data => { if (active) setOrganizations(data) })
   .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'Could not load organizations.') })
   .finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [])
 function closeForm() { setFormOpen(false); setName(''); setError('') }
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 200) { setError('Enter a name of 1–200 characters.'); return }
  setSaving(true); setError('')
  try { const org = await createOrganization(trimmedName); setOrganizations(current => [...current, org]); closeForm() }
  catch (error) { setError(error instanceof Error ? error.message : 'Could not save organization.') }
  finally { setSaving(false) }
 }
 const visible = organizations.filter(org => org.name.toLowerCase().includes(query))
 return <main className="dashboard organizations-page">
  <header className="organizations-page-heading"><div><span className="eyebrow">CLIENT WORKSPACES</span><h1>Organizations</h1></div>{!formOpen && <Button onClick={() => setFormOpen(true)}><Icon name="plus" size={15} />Add organization</Button>}</header>
  {formOpen && <FormPanel><div className="section-heading"><div><h2>A new workspace</h2><p>Create an organization for your client.</p></div></div><form className="organization-form" onSubmit={submit}><fieldset className="organization-form-fields" disabled={saving}><TextField id="organization-name" name="organizationName" label="Organization name" value={name} onChange={setName} error={error} /><div className="organization-form-actions"><Button type="submit">{saving ? 'Creating…' : 'Create organization'}<Icon name="arrow" size={14} /></Button><Button variant="ghost" onClick={closeForm}>Cancel</Button></div></fieldset></form></FormPanel>}
  <section className="organizations-library" aria-label="Organizations"><div className="section-heading"><h2>{query ? `Results for “${params.get('q')}”` : 'All organizations'}</h2>{!loading && !loadError && <span className="status-pill">{visible.length} workspaces</span>}</div>
   {loading ? <p className="page-message">Loading organizations…</p> : loadError ? <p className="field-error page-message" role="alert">{loadError}</p> : visible.length === 0 ? <div className="empty-state"><Icon name="building" size={32} /><h3>{query ? 'No matching organizations.' : 'Create your first organization.'}</h3><p>{query ? 'Try a different name in the search bar.' : 'Bring a client’s users, projects, and scans into one workspace.'}</p></div> : <div className="organization-gallery">{visible.map((org,i) => <Link className="organization-tile" to={`/organizations/${org.id}`} key={org.id}><div className="organization-tile-top"><OrganizationMark variant={i} /><Icon name="arrow" size={18} /></div><h3>{org.name}</h3><div className="organization-tile-footer"><span>Organization workspace</span><Icon name="chevron" size={13} /></div></Link>)}</div>}
  </section>
 </main>
}
