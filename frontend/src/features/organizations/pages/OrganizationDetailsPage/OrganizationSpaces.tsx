import { useEffect, useState } from 'react'
import { SpaceCard, type DetailCache } from '../../../spaces/pages/SpacesPage/SpacesPage'
import '../../../spaces/pages/SpacesPage/SpacesPage.css'
import { InlineError, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { getAdminUserTourRequests, type TourSummary } from '../../../tours/api/tourRequests'
import type { OrganizationUser } from '../../api/organizationUsers'
import '../CustomerPage/CustomerPage.css'

/** Every space the customer's people have asked for, shown straight on the customer page above the tours. */
type Owned = TourSummary & { owner: OrganizationUser }

export default function OrganizationSpaces({ users }: { users: OrganizationUser[] }) {
 const [spaces, setSpaces] = useState<Owned[] | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [cache] = useState<DetailCache>(() => new Map())
 const key = users.map(user => user.id).join(',')

 useEffect(() => {
  let active = true
  Promise.all(users.map(user => getAdminUserTourRequests(user.id).then(list => list.map(space => ({ ...space, owner: user })))))
   // Spaces are shared within the organization, so each person's list has the same ones: keep each once.
   .then(lists => { if (active) setSpaces([...new Map(lists.flat().map(space => [space.id, space])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) })
   .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load the spaces. Try again.') })
  return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [key, attempt])

 return <section className="desk-section person-page" aria-labelledby="org-spaces-title">
  <div className="desk-section-head"><h2 id="org-spaces-title">Spaces{spaces && <span className="desk-count">{spaces.length}</span>}</h2></div>
  {error ? <InlineError onRetry={() => { setError(''); setSpaces(null); setAttempt(v => v + 1) }}>{error}</InlineError>
   : !spaces ? <SkeletonGroup label="Loading spaces"><Skeleton height={64} radius="var(--r-card)" index={0} /></SkeletonGroup>
   : spaces.length === 0 ? <p className="person-row-none">No spaces yet.</p>
   : <ul className="spaces-grid" aria-label="Spaces">{spaces.map(space => <li key={space.id}><SpaceCard tour={space} cache={cache} /></li>)}</ul>}
 </section>
}
