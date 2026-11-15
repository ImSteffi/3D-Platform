import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, EmptyState, Field, Icon, InlineError, Panel } from '../../../shared/ui'
import { createOrganizationUser, getOrganizationUsers, type OrganizationUser } from '../api/organizationUsers'
import { initials } from '../utils/initials'

/** One customer's people and the form that adds one. Used on the Users page. */
export default function OrganizationPeople({ organizationId, title }: { organizationId: number; title: string }) {
 const [users, setUsers] = useState<OrganizationUser[] | null>(null)
 const [loadError, setLoadError] = useState('')
 const [saving, setSaving] = useState(false)
 const [formOpen, setFormOpen] = useState(false)
 const [displayName, setDisplayName] = useState('')
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [formError, setFormError] = useState('')

 useEffect(() => {
  let active = true
  getOrganizationUsers(organizationId)
   .then(found => { if (active) setUsers(found.filter(user => user.organizationId === organizationId)) })
   .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'Could not load the people. Try again.') })
  return () => { active = false }
 }, [organizationId])

 function closeForm() {
  setFormOpen(false); setDisplayName(''); setEmail(''); setPassword(''); setFormError('')
 }

 async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return
  const trimmedName = displayName.trim()
  const normalizedEmail = email.trim().toLowerCase()
  if (!trimmedName || !normalizedEmail || !password.trim()) { setFormError('Enter a name, an email and a first password.'); return }
  if (trimmedName.length > 200 || normalizedEmail.length > 254) { setFormError('The name or the email is too long. Shorten it and try again.'); return }
  if (new TextEncoder().encode(password).length > 72) { setFormError('The password is too long. Use 72 bytes or fewer.'); return }
  setSaving(true)
  setFormError('')
  try {
   const user = await createOrganizationUser(organizationId, { displayName: trimmedName, email: normalizedEmail, password })
   setUsers(current => [...(current ?? []), user])
   closeForm()
  } catch (error) {
   setFormError(error instanceof Error ? error.message : 'Could not reach the server. Check your connection and try again.')
  } finally {
   setSaving(false)
  }
 }

 const titleId = `people-${organizationId}`
 return <section className="desk-section" aria-labelledby={titleId}>
  <div className="desk-section-head">
   <h2 id={titleId}><Link to={`/organizations/${organizationId}`} className="desk-title-link">{title}</Link>{users && <span className="desk-count">{users.length}</span>}</h2>
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

  {loadError ? <InlineError>{loadError}</InlineError>
   : !users ? null
   : users.length === 0 ? !formOpen && <EmptyState icon="users" level={3} title="Nobody can sign in yet"
     text="Add the first person so this customer can open their spaces and tours." />
   : <ul className="desk-list" aria-label={`People at ${title}`}>
     {users.map(user => <li key={user.id}>
      <Link className="desk-row" to={`/organizations/${organizationId}/people/${user.id}`}>
       <span className="desk-mark desk-mark--person" aria-hidden="true">{initials(user.displayName)}</span>
       <span className="desk-row-text"><strong>{user.displayName}</strong><span>{user.email}</span></span>
       <Icon name="chevron" size={18} />
      </Link>
     </li>)}
    </ul>}
 </section>
}
