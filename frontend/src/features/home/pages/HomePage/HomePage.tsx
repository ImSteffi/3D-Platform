import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, Icon, InlineError, Panel, Skeleton, SkeletonGroup, Ticks, WhoseMove, type TickState } from '../../../../shared/ui'
import { useBackdrop, useShellMode } from '../../../../shared/layout/Backdrop'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import {
 getTourRequest, getTourRequests, nextMoveLine, photoCounts, photoUrl, whoseMove,
 type TourDetail, type TourSummary,
} from '../../../tours/api/tourRequests'
import './HomePage.css'

type StepState = 'done' | 'now' | 'next'
type Step = { who: 'you' | 'team'; text: string; state: StepState }

const previewUrl = (scanId: number) => `/api/scans/${scanId}/preview`

/** "Your move: 11 photos to go" -> "11 photos to go": the chip beside it already says whose move it is. */
function bareLine(line: string): string {
 const text = line.replace(/^(Your move|With the team): /, '')
 return text.charAt(0).toUpperCase() + text.slice(1)
}

function startedOn(createdAt: string): string | null {
 const date = new Date(createdAt)
 if (Number.isNaN(date.getTime())) return null
 return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function firstName(displayName: string): string | null {
 const first = displayName.trim().split(/\s+/)[0] ?? ''
 return first && !first.includes('@') ? first : null
}

/** One dominant space: your move first, then a delivered tour, then one with the team. Most recently started wins. */
function pickLeader(recent: TourSummary[]): TourSummary | null {
 return recent.find(tour => whoseMove(tour.status) === 'you')
  ?? recent.find(tour => tour.status === 'DELIVERED')
  ?? recent.find(tour => whoseMove(tour.status) === 'team')
  ?? null
}

function tickStates(detail: TourDetail): TickState[] {
 let nextGiven = false
 return detail.areas.flatMap(area => area.points).map(point => {
  if (point.retakeNote) return 'retake'
  if (point.hasPhoto) return 'taken'
  if (!nextGiven) { nextGiven = true; return 'next' }
  return 'todo'
 })
}

function lastPhotoUrl(detail: TourDetail): string | null {
 const taken = detail.areas.flatMap(area => area.points).filter(point => point.hasPhoto)
 const last = taken[taken.length - 1]
 return last ? photoUrl(detail.id, last.id) : null
}

function StepList({ steps, numbered = false }: { steps: Step[]; numbered?: boolean }) {
 const stateWord: Record<StepState, string> = { done: 'Done', now: 'Now', next: 'Next' }
 return <ol className="home-steps">
  {steps.map((step, index) => <li key={step.text} className={`home-step home-step--${step.state}`} aria-current={step.state === 'now' ? 'step' : undefined}>
   <span className="home-step-mark" aria-hidden="true">
    {step.state === 'done' ? <Icon name="check" size={15} /> : numbered ? index + 1 : null}
   </span>
   <div>
    <p className="home-step-who">{numbered ? '' : `${stateWord[step.state]} · `}{step.who === 'you' ? 'You' : 'The team'}</p>
    <p className="home-step-text">{step.text}</p>
   </div>
  </li>)}
 </ol>
}

function YourMoveCard({ tour, detail, detailLoading }: { tour: TourSummary; detail: TourDetail | null; detailLoading: boolean }) {
 const photosDue = tour.status === 'PLAN_READY'
 const counts = photosDue && detail ? photoCounts(detail) : null
 const left = counts ? counts.total - counts.taken - counts.retakes : 0
 const hero = counts && left > 0
  ? { value: left, label: left === 1 ? 'photo to go' : 'photos to go', of: counts.total }
  : counts && counts.retakes > 0
   ? { value: counts.retakes, label: counts.retakes === 1 ? 'photo to retake' : 'photos to retake', of: counts.total }
   : null
 let body: string
 if (!photosDue) body = 'Add a floor plan for each area of your space. You can upload one or sketch it. The team then marks where to stand for every photo.'
 else if (!counts || left > 0) body = 'The team has marked where to stand. Take one photo at each point, then send them to the team.'
 else if (counts.retakes > 0) body = 'The team asked for some photos again. Each one has a note that says what to fix.'
 else body = 'Every photo is in. Send them to the team, who check them and build your tour.'

 return <Panel className="home-lead home-lead--move" padding="lg" aria-labelledby="home-lead-title">
  <WhoseMove who="you" />
  {hero && <p className="home-hero">
   <b className="home-hero-num">{hero.value}</b>
   <span>{hero.label}<br />of {hero.of}</span>
  </p>}
  <h2 id="home-lead-title" className="home-lead-title">{tour.name}</h2>
  {!hero && <p className="home-lead-line">{bareLine(nextMoveLine(detail ?? tour))}</p>}
  <p className="home-lead-body">{body}</p>
  <div className="home-actions">
   <Button to={`/spaces/${tour.id}`} size="lg" iconAfter="arrow">Continue</Button>
   {photosDue && <Button to="/learn" size="lg" variant="secondary">How to take good photos</Button>}
  </div>
  {photosDue && detailLoading && <SkeletonGroup className="home-progress" label="Counting your photos">
   <div className="home-progress-head"><Skeleton width={64} height={16} index={0} /></div>
   <Skeleton height={8} radius={999} index={1} />
   <Skeleton width="72%" height={13} index={2} style={{ marginTop: 13 }} />
  </SkeletonGroup>}
  {counts && counts.total > 0 && detail && <div className="home-progress">
   <div className="home-progress-head">
    <b className="num">{counts.taken} / {counts.total}</b>
    {counts.retakes > 0 && <em>{counts.retakes} to retake</em>}
   </div>
   <Ticks states={tickStates(detail)} />
   <p>When all {counts.total} are in, the team checks them and builds your tour. That takes a few days.</p>
  </div>}
 </Panel>
}

function ReadyCard({ tour }: { tour: TourSummary }) {
 const [failedFor, setFailedFor] = useState<number | null>(null)
 const scanId = tour.scanId ?? null
 const showImage = scanId != null && failedFor !== scanId
 return <Panel className="home-lead home-lead--ready" padding="none" aria-labelledby="home-lead-title">
  <div className={showImage ? 'home-preview skeleton-bg' : 'home-preview'}>
   {showImage
    ? <img src={previewUrl(scanId)} alt={`Preview of the tour of ${tour.name}`} onError={() => setFailedFor(scanId)} />
    : <span className="home-preview-none"><Icon name="cube" size={28} /></span>}
  </div>
  <div className="home-ready-body">
   <WhoseMove who="done" />
   <h2 id="home-lead-title" className="home-lead-title">Your tour is ready</h2>
   <p className="home-lead-body">The team has finished the tour of {tour.name}. Walk through it, then share it with anyone you like.</p>
   <div className="home-actions">
    <Button to={`/spaces/${tour.id}/tour`} size="lg" icon="play">Walk through</Button>
    <Button to={`/spaces/${tour.id}/share`} size="lg" variant="secondary" icon="share">Share</Button>
   </div>
  </div>
 </Panel>
}

function teamSteps(status: TourSummary['status']): Step[] {
 if (status === 'SUBMITTED') return [
  { who: 'you', text: 'You added your floor plan.', state: 'done' },
  { who: 'team', text: 'Marking where to stand for each photo.', state: 'now' },
  { who: 'you', text: 'Take one photo at each point.', state: 'next' },
  { who: 'team', text: 'Builds your tour by hand. That takes a few days.', state: 'next' },
 ]
 if (status === 'PHOTOS_SUBMITTED') return [
  { who: 'you', text: 'You sent your photos.', state: 'done' },
  { who: 'team', text: 'Checking your photos. If one needs a retake, we will ask.', state: 'now' },
  { who: 'team', text: 'Builds your tour by hand. That takes a few days.', state: 'next' },
  { who: 'you', text: 'Walk through your tour and share it.', state: 'next' },
 ]
 return [
  { who: 'you', text: 'You sent your photos.', state: 'done' },
  { who: 'team', text: 'The team approved your photos.', state: 'done' },
  { who: 'team', text: 'Building your tour by hand. That takes a few days.', state: 'now' },
  { who: 'you', text: 'Walk through your tour and share it.', state: 'next' },
 ]
}

function TeamCard({ tour }: { tour: TourSummary }) {
 const started = startedOn(tour.createdAt)
 return <Panel className="home-lead home-lead--team" padding="lg" aria-labelledby="home-lead-title">
  <WhoseMove who="team" />
  <h2 id="home-lead-title" className="home-lead-title">{tour.name}</h2>
  <p className="home-lead-body">Nothing for you to do right now. We will show your next move here when it is your turn.</p>
  <StepList steps={teamSteps(tour.status)} />
  <div className="home-actions home-actions--split">
   <Button to={`/spaces/${tour.id}`} variant="secondary" iconAfter="arrow">Open space</Button>
   {started && <p className="home-started">Started {started}</p>}
  </div>
 </Panel>
}

const serviceSteps: Step[] = [
 { who: 'you', text: 'Add a floor plan of your space.', state: 'next' },
 { who: 'team', text: 'Marks where to stand for each photo.', state: 'next' },
 { who: 'you', text: 'Take the photos with your phone.', state: 'next' },
 { who: 'team', text: 'Builds your tour in a few days.', state: 'next' },
]

function FirstRunCard() {
 return <Panel className="home-lead home-lead--first" padding="lg" aria-labelledby="home-lead-title">
  <h2 id="home-lead-title" className="home-lead-title">A 3D tour of your place, in four steps</h2>
  <p className="home-lead-body">You do two of them. The team does the rest and tells you exactly where to stand.</p>
  <StepList steps={serviceSteps} numbered />
  <div className="home-actions">
   <Button to="/spaces/new" size="lg" icon="plus">Start your first space</Button>
   <Link to="/learn" className="home-quiet-link">See how the photos are taken<Icon name="arrow" size={16} /></Link>
  </div>
 </Panel>
}

export default function HomePage() {
 useShellMode('place')
 const user = useWorkspaceUser()
 const [attempt, setAttempt] = useState(0)
 const [list, setList] = useState<{ attempt: number; tours?: TourSummary[]; error?: string }>({ attempt: -1 })
 const [loaded, setLoaded] = useState<{ id: number; detail: TourDetail | null } | null>(null)

 useEffect(() => {
  let live = true
  getTourRequests().then(
   tours => { if (live) setList({ attempt, tours }) },
   (error: unknown) => { if (live) setList({ attempt, error: error instanceof Error ? error.message : 'Could not load your spaces.' }) },
  )
  return () => { live = false }
 }, [attempt])

 const loading = list.attempt !== attempt
 const tours = loading ? undefined : list.tours
 const recent = tours ? [...tours].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : []
 const leader = pickLeader(recent)
 const leaderId = leader?.id ?? null
 // Photo counts and the latest photo need the full space; a draft, a space waiting for its plan, or a delivered tour with a preview does not.
 const needsDetail = !!leader && leader.status !== 'DRAFT' && leader.status !== 'SUBMITTED' && !(leader.status === 'DELIVERED' && leader.scanId != null)

 useEffect(() => {
  if (leaderId == null || !needsDetail) return
  let live = true
  getTourRequest(leaderId).then(
   detail => { if (live) setLoaded({ id: leaderId, detail }) },
   () => { if (live) setLoaded({ id: leaderId, detail: null }) },
  )
  return () => { live = false }
 }, [leaderId, needsDetail])

 const detailSettled = loaded?.id === leaderId
 const detail = detailSettled ? loaded?.detail ?? null : null
 const delivered = recent.find(tour => tour.status === 'DELIVERED' && tour.scanId != null)
 useBackdrop(delivered?.scanId != null ? previewUrl(delivered.scanId) : detail ? lastPhotoUrl(detail) : null)

 const name = firstName(user.displayName)
 const others = recent.filter(tour => tour.id !== leaderId)
 const leaderMove = leader ? whoseMove(leader.status) : null
 const context = loading || list.error ? 'Your next move, in one place.'
  : !leader ? 'Welcome. Here is how it works.'
  : leaderMove === 'you' ? 'Here is your next move.'
  : leaderMove === 'done' ? 'Your tour has arrived.'
  : 'Your space is with the team.'

 return <main className="page home-page">
  <header className="page-header"><div><h1>{name ? `Hello, ${name}` : 'Hello'}</h1><p>{context}</p></div></header>

  {loading && <Panel className="home-lead" padding="lg">
   <SkeletonGroup label="Loading your spaces">
    <Skeleton width={112} height={28} radius={999} index={0} />
    <Skeleton width="58%" height={30} index={1} style={{ marginTop: 20 }} />
    <Skeleton width="82%" height={15} index={2} style={{ marginTop: 12 }} />
    <Skeleton width="64%" height={15} index={3} style={{ marginTop: 8 }} />
    <div className="home-actions"><Skeleton width={148} height={52} radius={999} index={4} /></div>
   </SkeletonGroup>
  </Panel>}

  {!loading && list.error && <Panel className="home-lead">
   <InlineError onRetry={() => setAttempt(value => value + 1)}>{list.error} Check your connection and try again.</InlineError>
  </Panel>}

  {tours && !leader && <FirstRunCard />}
  {tours && leader && leaderMove === 'you' && <YourMoveCard tour={leader} detail={detail} detailLoading={needsDetail && !detailSettled} />}
  {tours && leader && leaderMove === 'done' && <ReadyCard tour={leader} />}
  {tours && leader && leaderMove === 'team' && <TeamCard tour={leader} />}

  {others.length > 0 && <Panel className="home-others" padding="sm" aria-labelledby="home-others-title">
   <h2 id="home-others-title" className="home-others-title">Your other spaces</h2>
   <ul>
    {others.map(tour => <li key={tour.id}>
     <Link to={`/spaces/${tour.id}`} className="home-other">
      <span className="home-other-text">
       <span className="home-other-name">{tour.name}</span>
       <span className="home-other-line">{bareLine(nextMoveLine(tour))}</span>
      </span>
      <WhoseMove who={whoseMove(tour.status)} />
      <Icon name="chevron" size={16} />
     </Link>
    </li>)}
   </ul>
  </Panel>}
 </main>
}
