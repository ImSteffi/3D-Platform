import BackLink from '../../../../shared/ui/BackLink/BackLink'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { Button, ConfirmDialog, EmptyState, Field, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { initials } from '../../utils/initials'
import ScanCard from '../../../scans/components/ScanCard/ScanCard'
import { adminCreateSpaceForUser, deleteCustomer, getAdminUser, getCustomerRemoval, updateCustomer, type CustomerRemoval, getAdminUserTourRequests, type AdminUser, type TourSummary } from '../../../tours/api/tourRequests'
import { SpaceCard, type DetailCache } from '../../../spaces/pages/SpacesPage/SpacesPage'
import '../../../spaces/pages/SpacesPage/SpacesPage.css'
import { useCustomerTours, type CustomerTour } from './CustomerTours'
import '../../styles/customers.css'
import '../../../scans/components/ProjectScanList/ProjectScanList.css'
import './CustomerPage.css'

const errorOf = (reason: unknown, fallback: string) => reason instanceof Error && reason.message ? reason.message : fallback

/** Route: /organizations/:organizationId/people/:userId. One customer's spaces, each with the tour delivered to it beside it. */
export default function CustomerPage() {
 useShellMode('desk')
 const { organizationId, userId } = useParams()
 const orgId = Number(organizationId)
 const id = Number(userId)

 const [user, setUser] = useState<AdminUser | null>(null)
 const [userError, setUserError] = useState('')
 const [spaces, setSpaces] = useState<TourSummary[] | null>(null)
 const [spacesError, setSpacesError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [cache] = useState<DetailCache>(() => new Map())

 useEffect(() => {
  let active = true
  getAdminUser(id).then(found => { if (active) setUser(found) })
   .catch(reason => { if (active) setUserError(errorOf(reason, 'Could not load this person. Try again.')) })
  getAdminUserTourRequests(id)
   .then(found => { if (active) setSpaces([...found].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) })
   .catch(reason => { if (active) setSpacesError(errorOf(reason, 'Could not load this person’s spaces. Try again.')) })
  return () => { active = false }
 }, [id, attempt])

 const { tours, error: toursError, retry: retryTours, remove } = useCustomerTours(user?.organizations ?? null)

 const [address, setAddress] = useState('')
 const [creating, setCreating] = useState(false)
 const [createError, setCreateError] = useState('')
 async function createSpace(event: FormEvent) {
  event.preventDefault()
  const name = address.trim()
  if (!name) return
  setCreating(true); setCreateError('')
  try {
   const made = await adminCreateSpaceForUser(id, name)
   setSpaces(current => [{ id: made.id, name: made.name, status: made.status, createdAt: made.createdAt, areaCount: 0, ownerName: made.ownerName }, ...(current ?? [])])
   setAddress('')
  } catch (reason) { setCreateError(errorOf(reason, 'Could not create the space. Try again.')) }
  finally { setCreating(false) }
 }

 // The person's own details: edit them, or remove the account.
 const navigate = useNavigate()
 const [editing, setEditing] = useState(false)
 const [name, setName] = useState('')
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [saving, setSaving] = useState(false)
 const [editError, setEditError] = useState('')
 const [removal, setRemoval] = useState<CustomerRemoval | null>(null)
 const [removing, setRemoving] = useState(false)
 const [removeError, setRemoveError] = useState('')
 function startEdit() {
  if (!user) return
  setName(user.displayName); setEmail(user.email); setPassword(''); setEditError(''); setEditing(true)
 }
 async function save(event: FormEvent) {
  event.preventDefault()
  if (!name.trim() || !email.trim()) { setEditError('Enter a name and an email.'); return }
  if (password && password.length < 8) { setEditError('The new password needs at least 8 characters.'); return }
  setSaving(true); setEditError('')
  try {
   const saved = await updateCustomer(id, { displayName: name.trim(), email: email.trim(), password: password || undefined })
   setUser(current => current && { ...current, displayName: saved.displayName, email: saved.email })
   setEditing(false)
  } catch (reason) { setEditError(errorOf(reason, 'Could not save. Try again.')) }
  finally { setSaving(false) }
 }
 async function askRemove() {
  setRemoveError('')
  try { setRemoval(await getCustomerRemoval(id)) }
  catch (reason) { setEditError(errorOf(reason, 'Could not check this person\u2019s spaces. Try again.')) }
 }
 async function removePerson() {
  setRemoving(true); setRemoveError('')
  try { await deleteCustomer(id); navigate(`/organizations/${orgId}`, { replace: true }) }
  catch (reason) { setRemoveError(errorOf(reason, 'Could not delete this person. Try again.')); setRemoving(false) }
 }

 function retry() { setUser(null); setUserError(''); setSpaces(null); setSpacesError(''); setAttempt(value => value + 1) }
 const validId = Number.isInteger(id) && id > 0

 // A tour belongs to the space it was delivered to. The rest have no space yet.
 const delivered = new Set(spaces?.map(space => space.scanId).filter(Boolean))
 const unlinked = tours?.filter(tour => !delivered.has(tour.id)) ?? []
 const cards = (list: CustomerTour[]) => <ul className="tour-grid">
  {list.map(tour => <li key={tour.id}><ScanCard scan={tour} onDeleted={remove} compact /></li>)}
 </ul>

 return <main className="page customer-page person-page">
  <BackLink to={`/organizations/${orgId}`} />
  {user ? <header className="person-head">
   <span className="desk-mark desk-mark--person person-head-mark" aria-hidden="true">{initials(user.displayName)}</span>
   <div className="person-head-text">
    <h1>{user.displayName}</h1>
    <p>{user.email}</p>
   </div>
   {!editing && <Button variant="secondary" icon="edit" onClick={startEdit}>Edit</Button>}
  </header>
  : !userError && <SkeletonGroup label="Loading person"><header className="person-head">
   <Skeleton width={48} height={48} radius={999} index={0} />
   <div className="person-head-text"><Skeleton width={180} height={24} index={1} /><Skeleton width={220} height={14} index={2} style={{ marginTop: 8 }} /></div>
  </header></SkeletonGroup>}

  {editing && user && <Panel variant="well" className="desk-form person-edit">
   <form onSubmit={save} noValidate>
    <fieldset className="desk-form-fields" disabled={saving}>
     <Field name="personName" label="Name" value={name} onChange={setName} autoComplete="off" maxLength={200} autoFocus />
     <Field name="personEmail" label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" maxLength={254} />
     <Field name="personPassword" label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password"
      hint="Leave empty to keep the current password. At least 8 characters." error={editError} />
     <div className="desk-form-actions person-edit-actions">
      <Button type="submit" loading={saving}>Save</Button>
      <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
      <Button variant="danger" icon="trash" className="person-edit-delete" onClick={() => { void askRemove() }}>Delete person</Button>
     </div>
    </fieldset>
   </form>
  </Panel>}

  {removal && user && <ConfirmDialog title={`Delete ${user.displayName}?`} confirmLabel="Delete person" busy={removing} busyLabel="Deleting\u2026"
   error={removeError} onConfirm={() => { void removePerson() }} onCancel={() => setRemoval(null)}>
   <p>{user.email} can no longer sign in. This cannot be undone.</p>
   {removal.spaces > 0 && (removal.heirName
    ? <p>Their {removal.spaces === 1 ? 'space moves' : `${removal.spaces} spaces move`} to <strong>{removal.heirName}</strong> ({removal.heirEmail}), who already shares them in the organization.</p>
    : <p>They have {removal.spaces === 1 ? 'a space' : `${removal.spaces} spaces`} and nobody else in the organization. Add another person first, or the delete is refused.</p>)}
  </ConfirmDialog>}

  {userError && <Panel><InlineError onRetry={retry}>{userError}</InlineError></Panel>}

  {!validId ? <Panel><EmptyState icon="user" title="Person not found" text="The link is not quite right."
   action={<Button variant="secondary" to={`/organizations/${orgId}`} icon="back">Back to the customer</Button>} /></Panel>
   : spacesError ? <Panel><InlineError onRetry={retry}>{spacesError}</InlineError></Panel>
   : !spaces ? <SkeletonGroup label="Loading spaces"><div className="person-rows">
     {[0, 1].map(index => <div key={index} className="person-row">
      <div className="person-row-main"><Skeleton height={64} radius="var(--r-card)" index={index} /></div>
      <div className="person-row-tours" />
     </div>)}
    </div></SkeletonGroup>
   : <div className="person-rows">
    <form className="new-space-form" onSubmit={createSpace}>
     <input className="new-space-input" value={address} onChange={event => setAddress(event.target.value)} maxLength={100}
      placeholder="Property address, e.g. Tamme 12, Tartu" aria-label="Address of the new space" />
     <Button type="submit" variant="secondary" icon="plus" loading={creating} disabled={!address.trim()}>New space</Button>
     {createError && <InlineError>{createError}</InlineError>}
    </form>
    {/* The same grid of cards the customer sees; a delivered space shows its tour on the card. */}
    {spaces.length > 0 ? <ul className="spaces-grid" aria-label="Spaces">
     {spaces.map(space => <li key={space.id}><SpaceCard tour={space} cache={cache} /></li>)}
    </ul>
    : null}
    {(unlinked.length > 0 || toursError) && <div className="person-row">
     <div className="person-row-main">
      <h2 className="admin-space-name">Not linked to a space</h2>
      <p className="person-row-hint">Tours uploaded for this customer that have not been delivered to a space. Deliver one from the Queue to put it next to its space.</p>
     </div>
     <div className="person-row-tours">
      {toursError ? <InlineError onRetry={retryTours}>{toursError}</InlineError> : cards(unlinked)}
     </div>
    </div>}
   </div>}
 </main>
}
