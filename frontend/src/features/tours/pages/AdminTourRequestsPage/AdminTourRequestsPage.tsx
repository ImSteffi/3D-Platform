import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getAdminTourRequests, statusLabels, type TourSummary } from '../../api/tourRequests'
import '../TourRequestPage/TourRequests.css'

const adminStatus: Partial<Record<TourSummary['status'], string>> = {
 SUBMITTED: 'Needs capture plan',
 PLAN_READY: 'Waiting for photos',
 PHOTOS_SUBMITTED: 'Photos to review',
}

export default function AdminTourRequestsPage() {
 const [tours, setTours] = useState<TourSummary[] | null>(null)
 const [error, setError] = useState('')
 useEffect(() => {
  let active = true
  getAdminTourRequests().then(loaded => { if (active) setTours(loaded) })
   .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load tour requests.') })
  return () => { active = false }
 }, [])
 return <main className="dashboard tr-page">
  <header><h1>Tour requests</h1></header>
  {error && <p className="tr-error" role="alert">{error}</p>}
  {!error && !tours && <p className="tr-list-empty" role="status">Loading tour requests…</p>}
  {tours && !tours.length && <p className="tr-list-empty">No tour requests have been submitted yet.</p>}
  {tours && !!tours.length && <ul className="tr-list">{tours.map(tour => {
   const waiting = tour.status === 'SUBMITTED' || tour.status === 'PHOTOS_SUBMITTED'
   return <li key={tour.id}><Link to={'/tour-requests/' + tour.id}>
    <span className="tr-list-text"><strong>{tour.name}</strong><small>{tour.ownerName} · {tour.areaCount} {tour.areaCount === 1 ? 'area' : 'areas'} · {new Date(tour.createdAt).toLocaleDateString()}</small></span>
    <span className={'status-pill' + (waiting ? '' : ' status-pill--ready')}>{adminStatus[tour.status] ?? statusLabels[tour.status]}</span>
   </Link></li>
  })}</ul>}
 </main>
}
