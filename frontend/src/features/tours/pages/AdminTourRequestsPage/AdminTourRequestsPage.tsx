import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { Button, EmptyState, Icon, InlineError, Panel, Skeleton, SkeletonGroup, StatusPill, WhoseMove } from '../../../../shared/ui'
import { getAdminTourRequests, getTourRequest, photoCounts, whoseMove, type TourStatus, type TourSummary } from '../../api/tourRequests'
import { errorText, formatDate, operatorStatus, statusTone } from '../../components/review/reviewText'
import './AdminTourRequestsPage.css'

type Filter = 'SUBMITTED' | 'PHOTOS_SUBMITTED' | 'APPROVED' | 'PLAN_READY'
const actions: Partial<Record<TourStatus, string>> = { SUBMITTED: 'Place points', PHOTOS_SUBMITTED: 'Review photos', APPROVED: 'Deliver tour' }
/** A floor the customer added later needs points, whatever the request's status: it is the operator's move again. */
const newFloor = (tour: TourSummary) => tour.status !== 'SUBMITTED' && tour.status !== 'DRAFT' && tour.status !== 'DELIVERED' && (tour.areasToPlan ?? 0) > 0
/** Where a request is counted and listed. Each request appears once. */
const bucket = (tour: TourSummary): TourStatus => newFloor(tour) ? 'SUBMITTED' : tour.status
const mine = (tour: TourSummary) => { const at = bucket(tour); return at === 'SUBMITTED' || at === 'PHOTOS_SUBMITTED' || at === 'APPROVED' }
const oldestFirst = (a: TourSummary, b: TourSummary) => a.createdAt.localeCompare(b.createdAt)
const newestFirst = (a: TourSummary, b: TourSummary) => b.createdAt.localeCompare(a.createdAt)
/** Photo counts are not in the list the server sends, so they are read per request, for a bounded number of rows. */
const PROGRESS_ROWS = 16

type Progress = Record<number, { taken: number; total: number }>
type Loaded = { attempt: number; tours?: TourSummary[]; error?: string }

function Row({ tour, progress, action }: { tour: TourSummary; progress?: { taken: number; total: number }; action?: string }) {
 const path = '/review/' + tour.id
 return <li className={'q-row' + (action ? ' q-row--top' : '')}>
  <div className="q-row-name">
   <Link to={path} className="q-row-link">{tour.name}</Link>
   <span>{tour.ownerName}</span>
  </div>
  <span className="q-row-areas"><b className="num">{tour.areaCount}</b> {tour.areaCount === 1 ? 'area' : 'areas'}</span>
  <span className="q-row-progress">{progress && progress.total > 0 && <><b className="num">{progress.taken} / {progress.total}</b> photos</>}</span>
  <span className="q-row-pills">
   {newFloor(tour) ? <StatusPill tone="amber">New floor to plan</StatusPill> : <StatusPill tone={statusTone(tour.status)}>{operatorStatus[tour.status] ?? tour.status}</StatusPill>}
   {tour.status !== 'DELIVERED' && <WhoseMove who={newFloor(tour) ? 'team' : whoseMove(tour.status)} perspective="operator" />}
  </span>
  <time className="q-row-date num" dateTime={tour.createdAt}>{formatDate(tour.createdAt)}</time>
  <span className="q-row-end">
   {action ? <Button to={path} iconAfter="arrow" className="q-row-action">{action}</Button> : <Icon name="chevron" size={16} className="q-row-chevron" />}
  </span>
 </li>
}

const skeletonNames = ['46%', '62%', '38%', '54%', '42%']

/** The queue's shape while it loads: one group of rows. */
function QueueSkeleton() {
 return <SkeletonGroup label="Loading the queue" className="q-skeleton">
  <div className="q-group">
   <Skeleton width={112} height={18} index={6} />
   <ul className="q-list">
    {skeletonNames.map((width, row) => <li key={row} className="q-row">
     <div className="q-row-name"><Skeleton width={width} height={15} index={row + 7} /><Skeleton width="34%" height={12} index={row + 7} style={{ marginTop: 6 }} /></div>
     <span className="q-row-areas"><Skeleton width={52} height={13} index={row + 8} /></span>
     <span className="q-row-progress"><Skeleton width={row % 2 ? 72 : 88} height={13} index={row + 9} /></span>
     <span className="q-row-pills"><Skeleton width={row % 2 ? 96 : 120} height={24} radius={999} index={row + 10} /></span>
     <span className="q-row-date"><Skeleton width={76} height={13} index={row + 11} /></span>
     <span className="q-row-end"><Skeleton width={16} height={16} radius={999} index={row + 12} /></span>
    </li>)}
   </ul>
  </div>
 </SkeletonGroup>
}

export default function AdminTourRequestsPage() {
 useShellMode('desk')
 const [attempt, setAttempt] = useState(0)
 const [loaded, setLoaded] = useState<Loaded | null>(null)
 const [progress, setProgress] = useState<Progress>({})
 const filter = null as Filter | null
 const search: string = ''

 useEffect(() => {
  let active = true
  getAdminTourRequests().then(async tours => {
   if (!active) return
   setLoaded({ attempt, tours })
   const counted = tours.filter(tour => tour.status === 'PHOTOS_SUBMITTED' || tour.status === 'PLAN_READY').sort(oldestFirst).slice(0, PROGRESS_ROWS)
   await Promise.all(counted.map(tour => getTourRequest(tour.id).then(detail => {
    const { taken, total } = photoCounts(detail)
    if (active) setProgress(current => ({ ...current, [tour.id]: { taken, total } }))
   }).catch(() => { /* The row simply shows no photo count. */ })))
  }).catch(reason => { if (active) setLoaded({ attempt, error: errorText(reason) }) })
  return () => { active = false }
 }, [attempt])

 const state = loaded?.attempt === attempt ? loaded : null
 const tours = state?.tours
 const header = <header className="page-header">
  <div>
   <h1>Queue</h1>
   <p>Every capture, by who has the next move.</p>
  </div>
 </header>

 if (!tours) return <main className="page q-page">
  {header}
  <Panel padding="lg" className="q-window">
   {state?.error
    ? <InlineError onRetry={() => setAttempt(value => value + 1)}>Could not load the queue. {state.error}</InlineError>
    : <QueueSkeleton />}
  </Panel>
 </main>

 const query = search.trim().toLowerCase()
 const shown = tours.filter(tour => (!filter || bucket(tour) === filter)
  && (!query || tour.name.toLowerCase().includes(query) || (tour.ownerName ?? '').toLowerCase().includes(query)))
 const yours = shown.filter(mine).sort(oldestFirst)
 const waiting = shown.filter(tour => !mine(tour) && tour.status !== 'DELIVERED').sort(oldestFirst)
 const delivered = shown.filter(tour => tour.status === 'DELIVERED').sort(newestFirst)
 const narrowed = !!filter || !!query
 const needsYou = tours.filter(mine).length
 const clear = () => {}

 return <main className="page q-page">
  {header}
  <Panel padding="lg" className="q-window">
   {!tours.length && <EmptyState icon="queue" title="Nothing needs you right now."
    text="When a customer sends a space, it appears here with the next thing to do." />}
   {!!tours.length && !shown.length && <EmptyState icon="search" title="Nothing matches"
    text="No capture fits this search or filter." action={<Button variant="secondary" onClick={clear}>Show everything</Button>} />}

   {!!tours.length && !narrowed && !needsYou && <div className="q-clear" role="status">
    <span className="q-clear-icon"><Icon name="check" size={20} /></span>
    <div><h2>Nothing needs you right now.</h2><p>Captures waiting on customers are listed below.</p></div>
   </div>}

   {!!yours.length && <section className="q-group" aria-labelledby="q-yours">
    <h2 id="q-yours">Your move <span className="num">{yours.length}</span></h2>
    <ul className="q-list">{yours.map((tour, index) => <Row key={tour.id} tour={tour} progress={progress[tour.id]} action={index === 0 ? actions[bucket(tour)] : undefined} />)}</ul>
   </section>}

   {!!waiting.length && <section className="q-group q-group--waiting" aria-labelledby="q-waiting">
    <h2 id="q-waiting">Waiting on customer <span className="num">{waiting.length}</span></h2>
    <ul className="q-list">{waiting.map(tour => <Row key={tour.id} tour={tour} progress={progress[tour.id]} />)}</ul>
   </section>}

   {!!delivered.length && <details className="q-group q-delivered" open={!!query || undefined}>
    <summary><Icon name="chevron" size={16} /><h2>Delivered <span className="num">{delivered.length}</span></h2></summary>
    <ul className="q-list">{delivered.map(tour => <Row key={tour.id} tour={tour} />)}</ul>
   </details>}

  </Panel>
 </main>
}
