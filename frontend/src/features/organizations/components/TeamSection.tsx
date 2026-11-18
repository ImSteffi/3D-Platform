import { useEffect, useState, type FormEvent } from 'react'
import { Button, ConfirmDialog, Field, InlineError, Panel } from '../../../shared/ui'
import { useWorkspaceUser } from '../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import { addTeamMember, getTeam, removeTeamMember, type TeamMember } from '../api/team'
import { initials } from '../utils/initials'

/** The admins. Everyone on the team sees it; only the owner adds or removes people, and the owner stays. */
export default function TeamSection() {
 const me = useWorkspaceUser()
 const [team, setTeam] = useState<TeamMember[] | null>(null)
 const [error, setError] = useState('')
 const [formOpen, setFormOpen] = useState(false)
 const [name, setName] = useState('')
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [formError, setFormError] = useState('')
 const [saving, setSaving] = useState(false)
 const [removing, setRemoving] = useState<TeamMember | null>(null)
 const [removeError, setRemoveError] = useState('')
 const [busy, setBusy] = useState(false)

 useEffect(() => {
  let active = true
  getTeam().then(found => { if (active) setTeam(found) })
   .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the team.') })
  return () => { active = false }
 }, [])

 function closeForm() { setFormOpen(false); setName(''); setEmail(''); setPassword(''); setFormError('') }

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (saving) return
  if (!name.trim() || !email.trim()) { setFormError('Enter a name and an email.'); return }
  if (password.length < 8) { setFormError('The password needs at least 8 characters.'); return }
  setSaving(true); setFormError('')
  try { const added = await addTeamMember(name.trim(), email.trim(), password); setTeam(current => [...(current ?? []), added]); closeForm() }
  catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not add this admin.') }
  finally { setSaving(false) }
 }

 async function remove() {
  if (!removing) return
  setBusy(true); setRemoveError('')
  try { await removeTeamMember(removing.id); setTeam(current => (current ?? []).filter(member => member.id !== removing.id)); setRemoving(null) }
  catch (reason) { setRemoveError(reason instanceof Error ? reason.message : 'Could not remove this admin.') }
  finally { setBusy(false) }
 }

 return <section className="desk-section" aria-labelledby="team-title">
  <div className="desk-section-head">
   <h2 id="team-title">Team{team && <span className="desk-count">{team.length}</span>}</h2>
   {me.owner && !formOpen && <Button variant="secondary" icon="plus" onClick={() => setFormOpen(true)}>Add an admin</Button>}
  </div>
  {formOpen && <Panel variant="well" className="desk-form">
   <form onSubmit={submit} noValidate>
    <h3>Add an admin</h3>
    <p>They can add customers and do all the work, but cannot change the team.</p>
    <fieldset className="desk-form-fields" disabled={saving}>
     <Field name="adminName" label="Name" value={name} onChange={setName} autoComplete="off" autoFocus maxLength={200} />
     <Field name="adminEmail" label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" maxLength={254} />
     <Field name="adminPassword" label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password"
      hint="At least 8 characters. Send it to them yourself." error={formError} />
     <div className="desk-form-actions">
      <Button type="submit" loading={saving}>{saving ? 'Adding admin' : 'Add admin'}</Button>
      <Button variant="secondary" onClick={closeForm}>Cancel</Button>
     </div>
    </fieldset>
   </form>
  </Panel>}
  {error ? <InlineError>{error}</InlineError>
   : team && <ul className="desk-list" aria-label="Team">
    {team.map(member => <li key={member.id}>
     <div className="desk-row">
      <span className="desk-mark desk-mark--person" aria-hidden="true">{initials(member.displayName)}</span>
      <span className="desk-row-text"><strong>{member.displayName}{member.owner ? ' · Owner' : ''}</strong><span>{member.email}</span></span>
      {me.owner && !member.owner && <Button variant="quiet" icon="trash" onClick={() => { setRemoveError(''); setRemoving(member) }}>Remove</Button>}
     </div>
    </li>)}
   </ul>}
  {removing && <ConfirmDialog title={`Remove ${removing.displayName}?`} confirmLabel="Remove admin" busy={busy} busyLabel="Removing…"
   error={removeError} onConfirm={() => { void remove() }} onCancel={() => setRemoving(null)}>
   <p>{removing.email} can no longer sign in. This cannot be undone.</p>
  </ConfirmDialog>}
 </section>
}
