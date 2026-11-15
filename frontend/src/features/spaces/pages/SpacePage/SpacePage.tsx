import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useBackdrop } from '../../../../shared/layout/Backdrop'
import { Button, EmptyState, Icon, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import { getTourRequest, photoUrl, type TourDetail } from '../../../tours/api/tourRequests'
import SpaceSections from './SpaceSections'
import DeliveredSpace from './DeliveredSpace'
import { message, plural, type Run, type SpaceProps } from './spaceModel'
import './SpacePage.css'
import BackLink from '../../../../shared/ui/BackLink/BackLink'
import '../../../organizations/styles/customers.css'


/** The space page's shape while it loads: the header, then two floors with their plan on the left and photo frames on the right. */
function SpaceSkeleton() {
 return <SkeletonGroup label="Loading your space">
  <header className="page-header space-head">
   <div className="space-head-title">
    <Skeleton width="42%" height={30} index={0} />
    <Skeleton width="24%" height={14} index={1} style={{ marginTop: 10 }} />
   </div>
   <Skeleton className="space-skel-help" width={232} height={52} radius={26} index={2} />
  </header>
  <div className="sections">
   {[0, 1].map(floor => {
    const at = 3 + floor * 10
    return <Panel key={floor} as="section" padding="none" className="area">
     <div className="area-head"><div className="area-name">
      <Skeleton width={floor ? 120 : 156} height={22} index={at} />
      <Skeleton width={floor ? 104 : 88} height={13} index={at + 1} style={{ marginTop: 6 }} />
     </div></div>
     <div className="area-body">
      <Skeleton className="space-skel-plan" height={260} radius="var(--r-card)" index={at + 2} />
      <div className="area-photos">
       <Skeleton width={floor ? '34%' : '42%'} height={15} index={at + 3} />
       <div className="frames">
        {[0, 1, 2, 3, 4, 5].map(frame => <Skeleton key={frame} height="auto" radius={12} index={at + 4 + frame} style={{ aspectRatio: '4 / 3' }} />)}
       </div>
      </div>
     </div>
    </Panel>
   })}
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
    <BackLink to="/spaces" />
    <h1>{tour.name}</h1>
    <p>{line}</p>
   </div>
   <Link to="/learn" className="space-help" aria-label="How to take a good photo"><Icon name="help" size={18} /><span>How to take a good photo</span></Link>
  </header>
  <InlineError>{error}</InlineError>
  {/* One page per space. The old tab segments (plan, photos, tour, share) all land here; "share" opens the share cards. */}
  {tour.status === 'DELIVERED' ? <DeliveredSpace {...props} share={tab === 'share'} /> : <SpaceSections {...props} />}
 </main>
}
