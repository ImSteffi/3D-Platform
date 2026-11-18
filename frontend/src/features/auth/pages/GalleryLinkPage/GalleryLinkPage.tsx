import { PLATFORM_NAME } from '../../../../shared/brand'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Icon, InlineError, Panel, Spinner } from '../../../../shared/ui'
import { getTourRequest, setGalleryToken, type TourDetail } from '../../../tours/api/tourRequests'
import { useLiveTour } from '../../../tours/api/useLiveTour'
import SpaceSections from '../../../spaces/pages/SpacePage/SpaceSections'
import { message, plural, type Run, type SpaceProps } from '../../../spaces/pages/SpacePage/spaceModel'
import '../../../spaces/pages/SpacePage/SpacePage.css'
import '../../../organizations/styles/customers.css'
import './GalleryLinkPage.css'

/**
 * Route: /g/:token. The link we send a customer. No sign-in: the link only reaches this one space,
 * where they add floors, plans and photos and send them to us. Nothing else in their account.
 */
export default function GalleryLinkPage() {
 const { token = '' } = useParams()
 const [tour, setTour] = useState<TourDetail | null>(null)
 const [gone, setGone] = useState('')
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const [version, setVersion] = useState(0)

 // Every space call on this page goes through the link.
 useState(() => setGalleryToken(token))
 useEffect(() => {
  setGalleryToken(token)
  return () => setGalleryToken(null)
 }, [token])

 useEffect(() => {
  const robots = document.createElement('meta')
  robots.name = 'robots'; robots.content = 'noindex, nofollow, noarchive'
  const referrer = document.createElement('meta')
  referrer.name = 'referrer'; referrer.content = 'no-referrer'
  document.head.append(robots, referrer)
  return () => { robots.remove(); referrer.remove() }
 }, [])

 useEffect(() => {
  let active = true
  getTourRequest(0).then(found => { if (active) setTour(found) })
   .catch(reason => { if (active) setGone(message(reason, 'This link has expired or is no longer valid. Ask us for a new one.')) })
  return () => { active = false }
 }, [token])

 const run: Run = useCallback(async (action, changesImages = false) => {
  if (busy) return false
  setBusy(true); setError('')
  try {
   setTour(await action())
   if (changesImages) setVersion(current => current + 1)
   return true
  } catch (reason) { setError(message(reason)); return false }
  finally { setBusy(false) }
 }, [busy])
 const apply = useCallback((updated: TourDetail) => setTour(updated), [])
 useLiveTour(tour ? tour.id : null, () => getTourRequest(0), apply, tour, busy)

 if (gone) return <main className="gallery-page gallery-page--center">
  <Panel className="gallery-gone" role="alert">
   <h1>This link has expired</h1>
   <p>{gone}</p>
  </Panel>
 </main>
 if (!tour) return <main className="gallery-page gallery-page--center"><Spinner label="Opening your space" block /></main>

 const points = tour.areas.reduce((sum, area) => sum + area.points.length, 0)
 const line = !tour.areas.length ? 'No floor plans yet' : plural(tour.areas.length, 'floor plan') + (points ? ` · ${plural(points, 'capture point')}` : '')
 const props: SpaceProps = { tour, version, busy, run, fail: setError, apply }
 return <main className="gallery-page page space">
  <div className="gallery-brand"><span className="gallery-brand-mark"><Icon name="cube" size={16} /></span>{PLATFORM_NAME}</div>
  <header className="page-header space-head">
   <div className="space-head-title">
    <h1>{tour.name}</h1>
    <p>{line}</p>
   </div>
  </header>
  <InlineError>{error}</InlineError>
  {tour.status === 'DELIVERED'
   ? <Panel><p>Your tour is ready. We will send it to you.</p></Panel>
   : <SpaceSections {...props} gallery />}
 </main>
}
