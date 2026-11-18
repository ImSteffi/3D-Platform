import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { Button, Icon, InlineError, Panel, Skeleton, SkeletonGroup, WhoseMove } from '../../../../shared/ui'
import { getTourRequest, photoCounts, whoseMove, type TourDetail } from '../../api/tourRequests'
import { useLiveTour } from '../../api/useLiveTour'
import DeliverTour from '../../components/review/DeliverTour'
import PhotoDesk from '../../components/review/PhotoDesk'
import PlanEditor from '../../components/review/PlanEditor'
import PlanWaiting from '../../components/review/PlanWaiting'
import { errorText, formatDate } from '../../components/review/reviewText'
import './AdminTourRequestPage.css'

type Loaded = { key: string; tour?: TourDetail; error?: string }

/** The customer's photos stay reachable after approval, folded away under the delivery. */
function ApprovedPhotos({ tour, onTour }: { tour: TourDetail; onTour: (tour: TourDetail) => void }) {
 const [open, setOpen] = useState(false)
 const { total, taken } = photoCounts(tour)
 if (!total) return null
 return <details className="rq-photos" onToggle={event => setOpen(event.currentTarget.open)}>
  <summary><Icon name="chevron" size={16} /><span>The customer's photos</span><span className="num">{taken} / {total}</span></summary>
  {open && <PhotoDesk tour={tour} onTour={onTour} mode="browse" editable />}
 </details>
}

export default function AdminTourRequestPage() {
 useShellMode('desk')
 const id = Number(useParams().tourId)
 const [attempt, setAttempt] = useState(0)
 const [loaded, setLoaded] = useState<Loaded | null>(null)
 const key = id + ':' + attempt

 useEffect(() => {
  let active = true
  const current = id + ':' + attempt
  getTourRequest(id).then(tour => { if (active) setLoaded({ key: current, tour }) })
   .catch(reason => { if (active) setLoaded({ key: current, error: errorText(reason) }) })
  return () => { active = false }
 }, [id, attempt])

 const state = loaded?.key === key ? loaded : null
 const tour = state?.tour
 const setTour = (updated: TourDetail) => setLoaded({ key, tour: updated })
 // The customer's uploads and changes show up here as they happen.
 useLiveTour(tour ? id : null, () => getTourRequest(id), setTour, tour ?? null, false)
 const back = <Button variant="quiet" to="/review" icon="back" className="rq-back">Queue</Button>

 if (!tour) return <main className="page rq-page">
  <div className="rq-top">{back}</div>
  {state?.error
   ? <Panel padding="lg" className="rq-window"><InlineError onRetry={() => setAttempt(value => value + 1)}>Could not open this request. {state.error}</InlineError></Panel>
   : <SkeletonGroup label="Opening the request">
    <header className="page-header rq-header">
     <div className="rq-heading">
      <Skeleton width={260} height={30} index={0} />
      <Skeleton width={340} height={14} index={1} style={{ marginTop: 10 }} />
     </div>
     <div className="rq-meta">
      <Skeleton width={112} height={26} radius={999} index={2} />
      <Skeleton width={96} height={26} radius={999} index={3} />
      <Skeleton width={110} height={13} index={4} />
     </div>
    </header>
    <Panel padding="lg" className="rq-window">
     <div className="pd">
      <Skeleton className="rq-skel-well" height={440} radius="var(--r-card)" index={5} />
      <div className="rq-skel-side">
       <Skeleton width="54%" height={20} index={6} />
       <Skeleton width="88%" height={14} index={7} />
       <Skeleton width="70%" height={14} index={8} />
       <Skeleton height={120} radius="var(--r-card)" index={9} style={{ marginTop: 8 }} />
       <Skeleton width={164} height={52} radius={999} index={10} style={{ marginTop: 8 }} />
      </div>
     </div>
    </Panel>
   </SkeletonGroup>}
 </main>

 // A floor added after the plan was sent puts the next move back with the operator.
 const newFloor = tour.status === 'PLAN_READY' && tour.areas.some(area => area.hasPlan && !area.points.length)

 return <main className="page rq-page">
  <div className="rq-top">{back}</div>
  <header className="page-header rq-header">
   <div className="rq-heading">
    <h1>{tour.name}</h1>
    <p>
     <span>{tour.ownerName}</span>
     {tour.ownerEmail && <a href={'mailto:' + tour.ownerEmail} className="rq-mail">{tour.ownerEmail}</a>}
     <span className="rq-created">Created <time dateTime={tour.createdAt} className="num">{formatDate(tour.createdAt)}</time></span>
    </p>
   </div>
   <div className="rq-meta">
    {tour.status !== 'DELIVERED' && !newFloor && <WhoseMove who={whoseMove(tour.status)} perspective="operator" />}
   </div>
  </header>

  <Panel padding="lg" className="rq-window">
   {tour.notes && <p className="rq-notes"><Icon name="info" size={16} /><span><b>Note from the customer.</b> {tour.notes}</span></p>}
   {(tour.status === 'SUBMITTED' || tour.status === 'DRAFT') && <PlanEditor key={tour.id} tour={tour} onTour={setTour} />}
   {tour.status === 'PLAN_READY' && <PlanWaiting key={tour.id} tour={tour} onTour={setTour} />}
   {tour.status === 'PHOTOS_SUBMITTED' && <PhotoDesk key={tour.id} tour={tour} onTour={setTour} mode="review" editable />}
   {(tour.status === 'APPROVED' || tour.status === 'DELIVERED') && <>
    <DeliverTour key={tour.id + tour.status} tour={tour} onTour={setTour} />
    <ApprovedPhotos tour={tour} onTour={setTour} />
   </>}
  </Panel>
 </main>
}
