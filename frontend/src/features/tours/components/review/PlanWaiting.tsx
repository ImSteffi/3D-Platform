import { WhoseMove } from '../../../../shared/ui'
import { type TourDetail } from '../../api/tourRequests'
import PhotoDesk from './PhotoDesk'
import { plural } from './reviewText'
import './review.css'

type Props = { tour: TourDetail; onTour: (tour: TourDetail) => void }

/** PLAN_READY: the plan is with the customer. Their photos so far, and the plan beside them, still editable. */
export default function PlanWaiting({ tour, onTour }: Props) {
 // Floors the customer added after the plan was sent: they have a drawing but no capture points yet.
 const toPlan = tour.areas.filter(area => area.hasPlan && !area.points.length)
 const noDrawing = tour.areas.filter(area => !area.hasPlan && !area.points.length)

 return <div className="pw">
  {toPlan.length > 0 && <section className="pw-new" aria-labelledby="pw-new-title">
   <div className="pw-new-head">
    <WhoseMove who="team" perspective="operator" />
    <h2 id="pw-new-title">New floor to plan</h2>
    <p>{tour.ownerName} added {toPlan.length === 1 ? toPlan[0].name : plural(toPlan.length, 'floor')} after the plan was sent. Pick it in the plan beside the photos and place the points; each one shows to the customer straight away.</p>
   </div>
  </section>}
  {noDrawing.map(area => <p key={area.id} className="pw-nodrawing"><b>{area.name}.</b> The customer has not added this floor's plan yet.</p>)}
  <PhotoDesk tour={tour} onTour={onTour} mode="browse" editable />
 </div>
}
