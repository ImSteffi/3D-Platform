import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useBackdrop } from '../../../../shared/layout/Backdrop'
import { Button, EmptyState, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { getTourRequest, photoUrl, type TourDetail } from '../../../tours/api/tourRequests'
import { useLiveTour } from '../../../tours/api/useLiveTour'
import SpaceSections from './SpaceSections'
import DeliveredSpace from './DeliveredSpace'
import { message, plural, type Run, type SpaceProps } from './spaceModel'
import './SpacePage.css'
import BackLink from '../../../../shared/ui/BackLink/BackLink'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import ShareDialog from './ShareDialog'
import '../../../organizations/styles/customers.css'


/** The space page's shape while it loads: the header, then two floors with their plan on the left and photo frames on the right. */
function SpaceSkeleton() {
 // The same shapes as the loaded page, so nothing jumps when it arrives: back link, title, Add plan, then one floor card.
 return <SkeletonGroup label="Loading your space" className="space-skel">
  <header className="page-header space-head">
   <div className="space-head-title">
    <Skeleton width={64} height={14} radius={999} index={0} />
    <Skeleton width={180} height={32} radius={10} index={1} style={{ marginTop: 18 }} />
    <Skeleton width={96} height={14} radius={999} index={2} style={{ marginTop: 12 }} />
   </div>
  </header>
  <Skeleton width={130} height={46} radius={999} index={4} />
  <div className="sections">
   <Panel as="section" padding="none" className="area">
    <div className="area-head">
     <Skeleton width={120} height={24} radius={10} index={5} />
     <div className="space-skel-actions">
      {[118, 132, 92].map((width, i) => <Skeleton key={width} width={width} height={20} radius={999} index={6 + i} />)}
     </div>
    </div>
    <div className="area-body">
     <Skeleton className="space-skel-plan" height={380} radius="var(--r-card)" index={9} />
     <div className="area-photos">
      <div className="area-photos-head">
       <Skeleton width={70} height={18} radius={999} index={10} />
       <Skeleton width={140} height={44} radius={999} index={11} />
      </div>
      <div className="frames">
       {[0, 1, 2, 3].map(frame => <Skeleton key={frame} height="auto" radius={12} index={12 + frame} style={{ aspectRatio: '4 / 3' }} />)}
      </div>
     </div>
    </div>
   </Panel>
  </div>
 </SkeletonGroup>
}

/** The delivered tour's preview, else the last capture photo in the space, else nothing (the ambient ground shows). */
function backdropOf(tour: TourDetail | null): string | null {
 if (!tour) return null
 if (tour.status === 'DELIVERED' && tour.scanId != null) return `/api/scans/${tour.scanId}/preview`
 const taken = tour.areas.flatMap(area => area.points).filter(point => point.hasPhoto)
 return taken.length ? photoUrl(tour.id, taken[taken.length - 1].id) : null
}

/** Route: /spaces/:spaceId/:tab?. One page per customer space, from request to shared tour; the optional segment only keeps old links working. */
export default function SpacePage() {
 const { spaceId, tab } = useParams()
 const admin = useWorkspaceUser().platformAdmin
 const [sharing, setSharing] = useState(false)
 const id = Number(spaceId)
 const valid = Number.isInteger(id) && id > 0
 const [loaded, setLoaded] = useState<{ id: number; tour: TourDetail } | null>(null)
 const [failure, setFailure] = useState<{ id: number; text: string; attempt: number } | null>(null)
 const [attempt, setAttempt] = useState(0)
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const [version, setVersion] = useState(0)
 const tour = loaded?.id === id ? loaded.tour : null
 const loadError = failure?.id === id && failure.attempt === attempt ? failure.text : ''

 useEffect(() => {
  if (!valid) return
  let active = true
  getTourRequest(id).then(found => { if (active) { setLoaded({ id, tour: found }); setError('') } })
   .catch(reason => { if (active) setFailure({ id, text: message(reason, 'We could not load this space.'), attempt }) })
  return () => { active = false }
 }, [id, valid, attempt])

 useBackdrop(backdropOf(tour))


 const run: Run = useCallback(async (action, changesImages = false) => {
  if (busy) return false
  setBusy(true); setError('')
  try {
   const updated = await action()
   setLoaded({ id: updated.id, tour: updated })
   if (changesImages) setVersion(current => current + 1)
   return true
  } catch (reason) {
   setError(message(reason))
   return false
  } finally { setBusy(false) }
 }, [busy])
 const apply = useCallback((updated: TourDetail) => setLoaded({ id: updated.id, tour: updated }), [])
 // The team's changes (spots, review) and the other side's uploads show up here as they happen.
 useLiveTour(tour ? id : null, () => getTourRequest(id), apply, tour, busy)

 if (!valid || /not found/i.test(loadError)) return <main className="page page--narrow">
  <Panel><EmptyState icon="spaces" title="We cannot find this space"
   text="It may have been deleted, or the link is not quite right. Your spaces are all in one place."
   action={<Button to="/spaces" icon="back">All spaces</Button>} /></Panel>
 </main>
 if (loadError) return <main className="page page--narrow">
  <Panel><InlineError onRetry={() => setAttempt(current => current + 1)}>{loadError}</InlineError></Panel>
 </main>
 if (!tour) return <main className="page space"><SpaceSkeleton /></main>
 const points = tour.areas.reduce((sum, area) => sum + area.points.length, 0)
 const line = !tour.areas.length ? 'No floor plans yet' : plural(tour.areas.length, 'floor plan') + (points ? ` · ${plural(points, 'capture point')}` : '')
 const props: SpaceProps = { tour, version, busy, run, fail: setError, apply }
 return <main className="page space">
  <header className="page-header space-head">
   <div className="space-head-title">
    <BackLink to={admin ? '/users' : '/spaces'} />
    <h1>{tour.name}</h1>
    <p>{line}</p>
   </div>
   {/* Before delivery, Share sits next to Analytics; a delivered space has no such row, so it stays up here. */}
   {admin && tour.status === 'DELIVERED' && <div className="space-admin-tools">
    <Button icon="share" onClick={() => setSharing(true)}>Share</Button>
   </div>}
  </header>
  <InlineError>{error}</InlineError>
  {/* One page per space. The old tab segments (plan, photos, tour, share) all land here; "share" opens the share cards. */}
  {tour.status === 'DELIVERED' ? <DeliveredSpace {...props} share={tab === 'share'} /> : <SpaceSections {...props} admin={admin} onShare={admin ? () => setSharing(true) : undefined} />}
  {sharing && <ShareDialog spaceId={tour.id} ownerName={tour.ownerName} onClose={() => setSharing(false)} />}
 </main>
}
