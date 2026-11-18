import { useEffect, useState, type FormEvent } from 'react'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { Button, EmptyState, Field, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { createOrganization, getOrganizations, type Organization } from '../../api/organizations'
import OrganizationPeople from '../../components/OrganizationPeople'
import TeamSection from '../../components/TeamSection'
import '../../styles/customers.css'

/** Route: /users. Everyone who can sign in, grouped by customer, plus the form that adds a customer. */
export default function UsersPage() {
 useShellMode('desk')
 const [organizations, setOrganizations] = useState<Organization[] | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [formOpen, setFormOpen] = useState(false)
 const [name, setName] = useState('')
 const [formError, setFormError] = useState('')
 const [saving, setSaving] = useState(false)

 useEffect(() => {
  let active = true
  getOrganizations()
   .then(found => { if (active) setOrganizations(found) })
   .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the users. Try again.') })
  return () => { active = false }
 }, [attempt])

 function closeForm() { setFormOpen(false); setName(''); setFormError('') }

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 200) { setFormError('Enter a customer name of 1 to 200 characters.'); return }
  setSaving(true); setFormError('')
  try { const org = await createOrganization(trimmed); setOrganizations(current => [...(current ?? []), org]); closeForm() }
  catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not save this customer. Try again.') }
  finally { setSaving(false) }
 }

 return <main className="page customer-page">
  <header className="page-header">
   <div><h1 className="desk-title">Users</h1></div>
  </header>
  <Panel padding="lg" className="desk-window">
   <TeamSection />
   <section className="desk-section" aria-labelledby="customers-title">
   <div className="desk-section-head">
    <h2 id="customers-title">Customers{organizations && <span className="desk-count">{organizations.length}</span>}</h2>
    {!formOpen && <Button variant="secondary" icon="plus" onClick={() => setFormOpen(true)}>New customer</Button>}
   </div>
   {formOpen && <Panel variant="well" className="desk-form">
    <form onSubmit={submit} noValidate>
     <h3>New customer</h3>
     <p>Give the customer a name. You add their people next.</p>
     <fieldset className="desk-form-fields" disabled={saving}>
      <Field name="organizationName" label="Customer name" value={name} onChange={setName} error={formError} autoComplete="off" autoFocus maxLength={200} />
      <div className="desk-form-actions">
       <Button type="submit" loading={saving}>{saving ? 'Creating customer' : 'Create customer'}</Button>
       <Button variant="secondary" onClick={closeForm}>Cancel</Button>
      </div>
     </fieldset>
    </form>
   </Panel>}
   {error ? <InlineError onRetry={() => { setError(''); setAttempt(value => value + 1) }}>{error}</InlineError>
    : !organizations ? <SkeletonGroup label="Loading users"><Skeleton height={64} radius="var(--r-card)" index={0} /></SkeletonGroup>
    : organizations.length === 0 ? <EmptyState icon="users" title="No customers yet" />
    : organizations.map(organization => <OrganizationPeople key={organization.id} organizationId={organization.id} title={organization.name} />)}
   </section>
  </Panel>
 </main>
}
