import BackLink from '../../../../shared/ui/BackLink/BackLink'
import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { Button, EmptyState, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import ScanCard from '../../../scans/components/ScanCard/ScanCard'
import { adminCreateSpaceForUser, getAdminUser, getAdminUserTourRequests, type AdminUser, type TourSummary } from '../../../tours/api/tourRequests'
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

 function retry() { setUser(null); setUserError(''); setSpaces(null); setSpacesError(''); setAttempt(value => value + 1) }
 const validId = Number.isInteger(id) && id > 0

 // A tour belongs to the space it was delivered to. The rest have no space yet.
 const delivered = new Set(spaces?.map(space => space.scanId).filter(Boolean))
 const unlinked = tours?.filter(tour => !delivered.has(tour.id)) ?? []
 const cards = (list: CustomerTour[]) => <ul className="tour-grid">
  {list.map(tour => <li key={tour.id}><ScanCard scan={tour} onDeleted={remove} compact /></li>)}
 </ul>

 return <main className="page customer-page person-page">
  <h1 className="visually-hidden">{user?.displayName ?? 'Customer'}</h1>
  <BackLink to={`/organizations/${orgId}`} />

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
