import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Icon from '../../../../shared/ui/Icon/Icon'
import { getTourRequests, statusLabels, type TourSummary } from '../../api/tourRequests'
import './GeneratePage.css'
import '../TourRequestPage/TourRequests.css'

export default function GeneratePage() {
 const [tours, setTours] = useState<TourSummary[] | null>(null)
 const [error, setError] = useState('')
 useEffect(() => {
  let active = true
  getTourRequests().then(loaded => { if (active) setTours(loaded) })
   .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your tours.') })
  return () => { active = false }
 }, [])
 return <main className="dashboard generate-page">
  <header className="generate-heading"><h1>Generate</h1></header>
  <div className="generate-cards">
   <Link to="/generate/tour" className="generate-card"><span className="generate-card-icon"><Icon name="scan" size={30} /></span><h2>Tour</h2></Link>
   <Link to="/generate/object" className="generate-card"><span className="generate-card-icon"><Icon name="cube" size={30} /></span><h2>Object</h2></Link>
  </div>
  <div className="generate-lists">
   <section id="tours" className="generate-list" aria-labelledby="tours-heading">
    <h2 id="tours-heading">My tours</h2>
    {error && <p className="tr-error" role="alert">{error}</p>}
    <ul className="tr-list" aria-label="My tours">
     {tours && !tours.length && <li className="tr-list-empty">No tours yet. Choose Tour above to start one.</li>}
     {tours?.map(tour => <li key={tour.id}><Link to={'/generate/tour/' + tour.id}>
      <span className="tr-list-text"><strong>{tour.name}</strong><small>{tour.areaCount} {tour.areaCount === 1 ? 'area' : 'areas'} · {new Date(tour.createdAt).toLocaleDateString()}</small></span>
      <span className={'status-pill' + (tour.status === 'PLAN_READY' || tour.status === 'APPROVED' ? ' status-pill--ready' : '')}>{statusLabels[tour.status]}</span>
     </Link></li>)}
    </ul>
   </section>
   <section id="objects" className="generate-list" aria-labelledby="objects-heading">
    <h2 id="objects-heading">My objects</h2>
    <ul aria-label="My objects" />
   </section>
  </div>
 </main>
}
