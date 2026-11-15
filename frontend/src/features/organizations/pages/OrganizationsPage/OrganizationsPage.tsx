import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, EmptyState, Field, Icon, InlineError, Panel, SkeletonGroup } from '../../../../shared/ui'
import DeskRowsSkeleton from '../../components/DeskRowsSkeleton'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { createOrganization, getOrganizations, type Organization } from '../../api/organizations'
import { initials } from '../../utils/initials'
import '../../styles/customers.css'
import './OrganizationsPage.css'

export default function OrganizationsPage() {
 useShellMode('desk')
 const [organizations, setOrganizations] = useState<Organization[]>([])
 const [formOpen, setFormOpen] = useState(false)
 const [name, setName] = useState('')
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState('')
 const [saving, setSaving] = useState(false)
 const [attempt, setAttempt] = useState(0)
 const [params, setParams] = useSearchParams()
 const search = params.get('q') ?? ''
 const query = search.trim().toLowerCase()

 useEffect(() => {
  let active = true
  getOrganizations().then(data => { if (active) setOrganizations(data) })
   .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'Could not load your customers. Try again.') })
   .finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [attempt])

 const retry = useCallback(() => { setLoading(true); setLoadError(''); setAttempt(value => value + 1) }, [])

 function setSearch(value: string) {
  setParams(current => {
   const next = new URLSearchParams(current)
   if (value) next.set('q', value)
   else next.delete('q')
   return next
  }, { replace: true })
 }

 function closeForm() { setFormOpen(false); setName(''); setError('') }

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 200) { setError('Enter a customer name of 1 to 200 characters.'); return }
  setSaving(true); setError('')
  try { const org = await createOrganization(trimmedName); setOrganizations(current => [...current, org]); closeForm() }
  catch (error) { setError(error instanceof Error ? error.message : 'Could not save this customer. Try again.') }
  finally { setSaving(false) }
 }

 const visible = organizations.filter(org => org.name.toLowerCase().includes(query))
 const ready = !loading && !loadError

 return <main className="page customers-page">
  <header className="page-header">
   <div><h1>Customers</h1><p>Each customer has people who sign in and spaces that hold their tours.</p></div>
   {!formOpen && <Button icon="plus" onClick={() => setFormOpen(true)}>New customer</Button>}
  </header>

  <Panel padding="lg" className="desk-window">
   {formOpen && <Panel variant="well" className="desk-form">
    <form onSubmit={submit} noValidate>
     <h3>New customer</h3>
     <p>Give the customer a name. You add their people and spaces next.</p>
     <fieldset className="desk-form-fields" disabled={saving}>
      <Field name="organizationName" label="Customer name" value={name} onChange={setName} error={error} autoComplete="off" autoFocus maxLength={200} />
      <div className="desk-form-actions">
       <Button type="submit" loading={saving}>{saving ? 'Creating customer' : 'Create customer'}</Button>
       <Button variant="secondary" onClick={closeForm}>Cancel</Button>
      </div>
     </fieldset>
    </form>
   </Panel>}

   <section className="desk-section" aria-labelledby="customers-list-title">
    <div className="desk-section-head">
     <h2 id="customers-list-title">{query ? 'Matching customers' : 'All customers'}{ready && <span className="desk-count">{visible.length}</span>}</h2>
     {ready && organizations.length > 0 && <Field className="desk-search" type="search" inputMode="search" name="q" label="Search customers" placeholder="Search customers" value={search} onChange={setSearch} autoComplete="off" />}
    </div>

    {loading ? <SkeletonGroup label="Loading customers"><DeskRowsSkeleton mark="organization" rows={5} /></SkeletonGroup>
     : loadError ? <InlineError onRetry={retry}>{loadError}</InlineError>
     : organizations.length === 0 ? <EmptyState icon="building" title="No customers yet"
       text="Create a customer to add the people who sign in and the spaces their tours live in." />
     : visible.length === 0 ? <EmptyState icon="search" level={3} title="No customer matches that"
       text={<>Nothing is called “{search.trim()}”. Check the spelling or clear the search.</>}
       action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} />
     : <ul className="desk-list">
       {visible.map(org => <li key={org.id}>
        <Link className="desk-row" to={`/organizations/${org.id}`}>
         <span className="desk-mark" aria-hidden="true">{initials(org.name)}</span>
         <span className="desk-row-text"><strong>{org.name}</strong></span>
         <Icon name="chevron" size={18} />
        </Link>
       </li>)}
      </ul>}
   </section>
  </Panel>
 </main>
}
