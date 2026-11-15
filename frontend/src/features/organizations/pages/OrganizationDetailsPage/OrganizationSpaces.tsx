import { useEffect, useState } from 'react'
import { InlineError, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { getAdminUserTourRequests, type TourSummary } from '../../../tours/api/tourRequests'
import AdminSpace from '../CustomerPage/AdminSpace'
import '../CustomerPage/CustomerPage.css'

/** Every space the customer's people have asked for, shown straight on the customer page above the tours. */
export default function OrganizationSpaces({ userIds }: { userIds: number[] }) {
 const [spaces, setSpaces] = useState<TourSummary[] | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const key = userIds.join(',')

 useEffect(() => {
  let active = true
  Promise.all(userIds.map(id => getAdminUserTourRequests(id)))
   .then(lists => { if (active) setSpaces(lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))) })
   .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load the spaces. Try again.') })
  return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [key, attempt])

 return <section className="desk-section person-page" aria-labelledby="org-spaces-title">
  <div className="desk-section-head"><h2 id="org-spaces-title">Spaces{spaces && <span className="desk-count">{spaces.length}</span>}</h2></div>
  {error ? <InlineError onRetry={() => { setError(''); setSpaces(null); setAttempt(v => v + 1) }}>{error}</InlineError>
   : !spaces ? <SkeletonGroup label="Loading spaces"><Skeleton height={64} radius="var(--r-card)" index={0} /></SkeletonGroup>
   : spaces.length === 0 ? <p className="person-row-none">No spaces yet.</p>
   : <div className="person-rows">{spaces.map(space => <div key={space.id} className="person-row person-row--single">
      <div className="person-row-main"><AdminSpace summary={space} /></div>
     </div>)}</div>}
 </section>
}
