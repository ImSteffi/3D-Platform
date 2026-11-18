import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, EmptyState, Field, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import {
 getTourRequest, getTourRequests, nextMoveLine, planUrl, whoseMove,
 type TourDetail, type TourSummary,
} from '../../../tours/api/tourRequests'
import { getClientProjects, type ClientProject } from '../../../projects/api/clientProjects'
import './SpacesPage.css'

export type DetailCache = Map<number, Promise<TourDetail>>

function bareLine(line: string): string {
 const text = line.replace(/^(Your move|With the team): /, '')
 return text.charAt(0).toUpperCase() + text.slice(1)
}

function startedOn(createdAt: string): string | null {
 const date = new Date(createdAt)
 if (Number.isNaN(date.getTime())) return null
 return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

const messageOf = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

/** Quiet stand-in for a space that has no plan or tour yet: a small flat floor plan in the ink tokens. */
function PlanPlaceholder() {
 return <svg className="spaces-placeholder" viewBox="0 0 160 100" fill="none" aria-hidden="true">
  <rect x="34" y="18" width="92" height="64" rx="2" className="spaces-placeholder-floor" />
  <path d="M34 18h92v64H34zM82 18v22M82 52v30M82 46h16M110 46h16" className="spaces-placeholder-wall" />
  <circle cx="58" cy="50" r="5" className="spaces-placeholder-point" />
  <circle cx="104" cy="32" r="5" className="spaces-placeholder-point" />
  <circle cx="104" cy="66" r="5" className="spaces-placeholder-point" />
 </svg>
}

/** One space as a card that opens its page. Shared by the customer list and the team's page per customer. */
export function SpaceCard({ tour, cache }: { tour: TourSummary; cache: DetailCache }) {
 const ref = useRef<HTMLAnchorElement>(null)
 const [detail, setDetail] = useState<TourDetail | null>(null)
 const [failed, setFailed] = useState<string | null>(null)
 const scanId = tour.status === 'DELIVERED' ? tour.scanId ?? null : null
 const needsDetail = scanId == null

 // Fetch the full space only when its card scrolls into view, and only once per visit.
 useEffect(() => {
  const node = ref.current
  if (!needsDetail || !node) return
  let live = true
  const load = () => {
   let request = cache.get(tour.id)
   if (!request) {
    request = getTourRequest(tour.id)
    cache.set(tour.id, request)
   }
   request.then(value => { if (live) setDetail(value) }, () => { cache.delete(tour.id) })
  }
  if (typeof IntersectionObserver === 'undefined') { load(); return () => { live = false } }
  const observer = new IntersectionObserver(entries => {
   if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load() }
  }, { rootMargin: '200px' })
  observer.observe(node)
  return () => { live = false; observer.disconnect() }
 }, [tour.id, needsDetail, cache])

 const planArea = detail?.areas.find(area => area.hasPlan)
 const previewSrc = scanId != null ? `/api/scans/${scanId}/preview` : null
 const planSrc = planArea ? planUrl(tour.id, planArea.id) : null
 const src = previewSrc && failed !== previewSrc ? previewSrc : planSrc && failed !== planSrc ? planSrc : null
 const isPlan = !!src && src === planSrc
 const started = startedOn(tour.createdAt)

 return <Link ref={ref} to={`/spaces/${tour.id}`} className="spaces-card">
  <div className={`spaces-card-visual ${isPlan ? 'spaces-card-visual--plan' : ''} ${src && !isPlan ? 'skeleton-bg' : ''}`}>
   {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} /> : <PlanPlaceholder />}
  </div>
  <div className="spaces-card-body">
   <div className="spaces-card-top">
    <h2 className="spaces-card-name">{tour.name}</h2>
   </div>
   <span className="spaces-card-line">{bareLine(nextMoveLine(detail ?? tour))}</span>
   {started && <span className="spaces-card-date">Started <span className="num">{started}</span></span>}
  </div>
 </Link>
}

export default function SpacesPage() {
 useShellMode('place')
 const [params, setParams] = useSearchParams()
 const query = params.get('q') ?? ''
 const [cache] = useState<DetailCache>(() => new Map())
 const [attempt, setAttempt] = useState(0)
 const [list, setList] = useState<{ attempt: number; tours?: TourSummary[]; error?: string }>({ attempt: -1 })
 const [extraAttempt, setExtraAttempt] = useState(0)
 const [extra, setExtra] = useState<{ attempt: number; projects?: ClientProject[]; error?: string }>({ attempt: -1 })

 useEffect(() => {
  let live = true
  getTourRequests().then(
   tours => { if (live) setList({ attempt, tours }) },
   (error: unknown) => { if (live) setList({ attempt, error: messageOf(error, 'Could not load your spaces.') }) },
  )
  return () => { live = false }
 }, [attempt])

 useEffect(() => {
  let live = true
  getClientProjects().then(
   projects => { if (live) setExtra({ attempt: extraAttempt, projects }) },
   () => { if (live) setExtra({ attempt: extraAttempt, error: 'Could not load the other tours from the team.' }) },
  )
  return () => { live = false }
 }, [extraAttempt])

 const loading = list.attempt !== attempt
 const tours = loading ? undefined : list.tours
 const error = loading ? undefined : list.error
 const needle = query.trim().toLowerCase()
 const shown = tours ? tours.filter(tour => !needle || tour.name.toLowerCase().includes(needle)) : []
 const moves = tours ? tours.filter(tour => whoseMove(tour.status) === 'you').length : 0
 const extraLoading = extra.attempt !== extraAttempt

 const setQuery = (value: string) => setParams(current => {
  const next = new URLSearchParams(current)
  if (value) next.set('q', value)
  else next.delete('q')
  return next
 }, { replace: true })

 const context = !tours ? 'Every place you are capturing.'
  : tours.length === 0 ? 'Every place you are capturing will be here.'
  : moves > 0 ? `${moves === 1 ? 'One space is' : `${moves} spaces are`} waiting on you.`
  : ''

 return <main className="page spaces-page">
  <header className="page-header">
   <div><h1>Spaces</h1>{context && <p>{context}</p>}</div>
   {tours && tours.length > 0 && <div className="spaces-tools">
    <Field className="spaces-search" label="Search spaces by name" type="search" inputMode="search" name="q" value={query} onChange={setQuery} placeholder="Search spaces" autoComplete="off" />
    <Button to="/spaces/new" icon="plus">New space</Button>
   </div>}
  </header>

  {loading && <SkeletonGroup label="Loading your spaces">
   <ul className="spaces-grid">
    {[0, 1, 2].map(card => <li key={card}><div className="spaces-card spaces-card--skeleton">
     <Skeleton className="spaces-card-visual" height="auto" radius="var(--r-card)" index={card * 3} />
     <div className="spaces-card-body">
      <div className="spaces-card-top">
       <Skeleton width={['56%', '44%', '62%'][card]} height={20} index={card * 3 + 1} />
       <Skeleton width={84} height={24} radius={999} index={card * 3 + 2} />
      </div>
      <Skeleton width={['78%', '66%', '72%'][card]} height={14} index={card * 3 + 2} />
      <Skeleton width={['36%', '42%', '32%'][card]} height={13} index={card * 3 + 3} style={{ marginTop: 2 }} />
     </div>
    </div></li>)}
   </ul>
  </SkeletonGroup>}

  {error && <Panel>
   <InlineError onRetry={() => setAttempt(value => value + 1)}>{error} Check your connection and try again.</InlineError>
  </Panel>}

  {tours && tours.length === 0 && <Panel>
   <EmptyState icon="spaces" title="No spaces yet"
    text="A space is one place you want a tour of. Start one, add a floor plan, and the team will show you where to stand for each photo."
    action={<Button to="/spaces/new" icon="plus" size="lg">Start your first space</Button>} />
  </Panel>}

  {tours && tours.length > 0 && shown.length === 0 && <Panel>
   <EmptyState icon="search" title="No space with that name"
    text={<>Nothing matches “{query.trim()}”. Check the spelling or clear the search.</>}
    action={<Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>} />
  </Panel>}

  {shown.length > 0 && <ul className="spaces-grid" aria-label="Your spaces">
   {shown.map(tour => <li key={tour.id}><SpaceCard tour={tour} cache={cache} /></li>)}
  </ul>}

  {!loading && !extraLoading && extra.error && tours && <Panel padding="sm">
   <InlineError onRetry={() => setExtraAttempt(value => value + 1)}>{extra.error} Your spaces above are not affected.</InlineError>
  </Panel>}

 </main>
}
