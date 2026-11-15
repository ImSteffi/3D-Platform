import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Button, EmptyState, Field, Icon, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import DeskRowsSkeleton from '../../components/DeskRowsSkeleton'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { getOrganizations, type Organization } from '../../api/organizations'
import { createOrganizationUser, getOrganizationUsers, type OrganizationUser } from '../../api/organizationUsers'
import OrganizationSpaces from './OrganizationSpaces'
import OrganizationTours from '../../../projects/components/OrganizationTours/OrganizationTours'
import { initials } from '../../utils/initials'
import '../../styles/customers.css'
import './OrganizationDetailsPage.css'

export default function OrganizationDetailsPage() {
 useShellMode('desk')
 const { organizationId } = useParams()
 const id = Number(organizationId)

 const [organization, setOrganization] = useState<Organization | null>(null)
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState('')
 const [attempt, setAttempt] = useState(0)

 const [users, setUsers] = useState<OrganizationUser[]>([])
 const [saving, setSaving] = useState(false)
 const [formOpen, setFormOpen] = useState(false)
 const [displayName, setDisplayName] = useState('')
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [formError, setFormError] = useState('')

 useEffect(() => {
  let active = true

  // The API has no single-customer endpoint, so the customer is found in the full list.
  async function loadOrganization() {
   try {
    const organizations = await getOrganizations()
    const found = organizations.find(item => item.id === id)
    const members = found ? await getOrganizationUsers(id) : []
    if (active) {
     setOrganization(found ?? null)
     setUsers(members)
    }
   } catch (error) {
    if (active) setLoadError(error instanceof Error ? error.message : 'Could not load this customer. Try again.')
   } finally {
    if (active) setLoading(false)
   }
  }

  void loadOrganization()
  return () => { active = false }
 }, [id, attempt])

 const retry = useCallback(() => { setLoading(true); setLoadError(''); setAttempt(value => value + 1) }, [])

 function closeForm() {
  setFormOpen(false)
  setDisplayName('')
  setEmail('')
  setPassword('')
  setFormError('')
 }

 async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return

  const trimmedName = displayName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (!trimmedName || !normalizedEmail || !password.trim()) {
   setFormError('Enter a name, an email and a first password.')
   return
  }
  if (trimmedName.length > 200 || normalizedEmail.length > 254) {
   setFormError('The name or the email is too long. Shorten it and try again.')
   return
  }
  if (new TextEncoder().encode(password).length > 72) {
   setFormError('The password is too long. Use 72 bytes or fewer.')
   return
  }

  setSaving(true)
  setFormError('')
  try {
   const user = await createOrganizationUser(id, { displayName: trimmedName, email: normalizedEmail, password })
   setUsers(current => [...current, user])
   closeForm()
  } catch (error) {
   setFormError(error instanceof Error ? error.message : 'Could not reach the server. Check your connection and try again.')
  } finally {
   setSaving(false)
  }
 }

 const organizationUsers = users.filter(user => user.organizationId === id)

 return <main className="page customer-page">
  <header className="page-header">
   <div>
    <Link className="desk-back" to="/organizations"><Icon name="back" size={16} />Customers</Link>
    <h1 className="desk-title">{organization?.name ?? 'Customer'}</h1>
   </div>
  </header>

  <Panel padding="lg" className="desk-window">
   {loading ? <SkeletonGroup label="Loading customer">
     <section className="desk-section">
      <div className="desk-section-head"><Skeleton width={96} height={22} index={0} /><Skeleton width={148} height={44} radius={999} index={1} /></div>
      <DeskRowsSkeleton mark="person" rows={3} start={2} />
     </section>
     <section className="desk-section">
      <div className="desk-section-head"><Skeleton width={88} height={22} index={6} /><Skeleton width={140} height={44} radius={999} index={7} /></div>
      <DeskRowsSkeleton mark="space" rows={2} start={8} />
     </section>
    </SkeletonGroup>
    : loadError ? <InlineError onRetry={retry}>{loadError}</InlineError>
    : !organization ? <EmptyState icon="building" title="Customer not found"
      text="This customer does not exist, or the link is out of date."
      action={<Button variant="secondary" to="/organizations" icon="back">Back to customers</Button>} />
    : <>
     <section className="desk-section" aria-labelledby="customer-people-title">
      <div className="desk-section-head">
       <h2 id="customer-people-title">People<span className="desk-count">{organizationUsers.length}</span></h2>
       {!formOpen && <Button variant="secondary" icon="plus" onClick={() => setFormOpen(true)}>Add a person</Button>}
      </div>

      {formOpen && <Panel variant="well" className="desk-form">
       <form onSubmit={handleSubmit} noValidate>
        <h3>Add a person</h3>
        <p>This person signs in with this email and password. Pass both on to them yourself.</p>
        <fieldset className="desk-form-fields" disabled={saving}>
         <Field name="displayName" label="Name" value={displayName} onChange={setDisplayName} autoComplete="off" autoFocus maxLength={200} />
         <Field name="email" label="Email" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="off" />
         <Field name="password" label="First password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
         <InlineError>{formError}</InlineError>
         <div className="desk-form-actions">
          <Button type="submit" loading={saving}>{saving ? 'Adding person' : 'Add person'}</Button>
          <Button variant="secondary" onClick={closeForm}>Cancel</Button>
         </div>
        </fieldset>
       </form>
      </Panel>}

      {organizationUsers.length === 0
       ? !formOpen && <EmptyState icon="users" level={3} title="Nobody can sign in yet"
         text="Add the first person so this customer can open their spaces and tours." />
       : <ul className="desk-list" aria-label="People">
         {organizationUsers.map(user => <li key={user.id}>
          <Link className="desk-row" to={`/organizations/${id}/people/${user.id}`}>
           <span className="desk-mark desk-mark--person" aria-hidden="true">{initials(user.displayName)}</span>
           <span className="desk-row-text"><strong>{user.displayName}</strong><span>{user.email}</span></span>
           <Icon name="chevron" size={18} />
          </Link>
         </li>)}
        </ul>}
     </section>

     <OrganizationSpaces userIds={organizationUsers.map(user => user.id)} />
     <OrganizationTours key={organization.id} organizationId={organization.id} />
    </>}
  </Panel>
 </main>
}
