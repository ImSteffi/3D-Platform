import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, EmptyState, Icon, InlineError, Skeleton, SkeletonGroup, StatusPill } from '../../../../shared/ui'
import { deliverTour, getDeliverableScans, type DeliverableScan, type TourDetail } from '../../api/tourRequests'
import { errorText, plural } from './reviewText'
import { useOrganizationLink } from './useOrganizationLink'
import './review.css'

/** The tour's own preview picture; a plain tile when there is none yet. */
function TourPreview({ scanId, className = '' }: { scanId: number | null | undefined; className?: string }) {
 const [failed, setFailed] = useState<number | null>(null)
 const missing = scanId == null || failed === scanId
 return <span className={`dt-preview ${missing ? 'dt-preview--none' : 'skeleton-bg'} ${className}`.trim()}>
  {missing ? <Icon name="cube" size={22} /> : <img src={`/api/scans/${scanId}/preview`} alt="" loading="lazy" onError={() => setFailed(scanId)} />}
 </span>
}

type Loaded = { attempt: number; scans?: DeliverableScan[]; error?: string }
type Props = { tour: TourDetail; onTour: (tour: TourDetail) => void }

/** APPROVED: pick the finished tour and deliver it. DELIVERED: what was delivered, and a way to change it. */
export default function DeliverTour({ tour, onTour }: Props) {
 const delivered = tour.status === 'DELIVERED'
 const [picking, setPicking] = useState(!delivered)
 const [attempt, setAttempt] = useState(0)
 const [loaded, setLoaded] = useState<Loaded | null>(null)
 const [chosen, setChosen] = useState<number | null>(tour.scanId ?? null)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const organizationLink = useOrganizationLink(tour.projectId)

 useEffect(() => {
  if (!picking) return
  let active = true
  getDeliverableScans(tour.id)
   .then(scans => { if (active) setLoaded({ attempt, scans: Array.isArray(scans) ? scans : [] }) })
   .catch(reason => { if (active) setLoaded({ attempt, error: errorText(reason) }) })
  return () => { active = false }
 }, [tour.id, picking, attempt])

 const current = loaded?.attempt === attempt ? loaded : null
 const scans = current?.scans
 const chosenScan = scans?.find(scan => scan.scanId === chosen)

 async function deliver() {
  if (busy || !chosenScan) return
  setBusy(true); setError('')
  try {
   const updated = await deliverTour(tour.id, chosenScan.scanId)
   // An older server may answer without the delivered tour's details.
   onTour({ ...updated, scanId: updated.scanId ?? chosenScan.scanId, scanName: updated.scanName ?? chosenScan.scanName, projectId: updated.projectId ?? chosenScan.projectId })
   setPicking(false)
  } catch (reason) {
   setError(`${errorText(reason)} The tour was not delivered. Try again; if it keeps failing, the server may need an update before tours can be delivered here.`)
  } finally { setBusy(false) }
 }

 const picker = <div className="dt-picker">
  {!current && <SkeletonGroup label="Loading this customer's finished tours">
   <ul className="dt-list">
    {['48%', '62%', '40%'].map((width, row) => <li key={row}><div className="dt-row dt-row--skeleton">
     <Skeleton width={20} height={20} radius={999} index={row * 2} />
     <Skeleton className="dt-preview" width={96} height={64} radius={12} index={row * 2 + 1} />
     <span className="dt-row-text">
      <Skeleton width={width} height={15} index={row * 2 + 2} />
      <Skeleton width="36%" height={13} index={row * 2 + 3} style={{ marginTop: 4 }} />
     </span>
    </div></li>)}
   </ul>
  </SkeletonGroup>}
  {current?.error && <InlineError onRetry={() => setAttempt(value => value + 1)}>
   Could not load this customer's finished tours. {current.error} If it keeps failing, the server may need an update before tours can be delivered here.
  </InlineError>}
  {scans && !scans.length && <EmptyState level={3} icon="cube" title="No finished tours for this customer yet"
   text="Upload the finished tour under the customer's organization in Customers. It will be listed here as soon as it is ready."
   action={<Button variant="secondary" to="/organizations" iconAfter="arrow">Open Customers</Button>} />}
  {scans && !!scans.length && <>
   <ul className="dt-list" aria-label="Finished tours">
    {scans.map(scan => {
     const isCurrent = delivered && scan.scanId === tour.scanId
     return <li key={scan.scanId}>
      <button type="button" className="dt-row" aria-pressed={scan.scanId === chosen} disabled={busy} onClick={() => { setChosen(scan.scanId); setError('') }}>
       <span className="dt-radio" aria-hidden="true" />
       <TourPreview scanId={scan.scanId} />
       <span className="dt-row-text">
        <strong>{scan.scanName}</strong>
        <small>{scan.projectName} · {scan.organizationName}</small>
       </span>
       {isCurrent && <StatusPill tone="green">Delivered now</StatusPill>}
      </button>
     </li>
    })}
   </ul>
   <InlineError>{error}</InlineError>
   <div className="dt-actions">
    <Button size="lg" loading={busy} disabled={!chosenScan || (delivered && chosenScan.scanId === tour.scanId)} onClick={() => { void deliver() }}>Deliver tour</Button>
    {delivered && <Button variant="quiet" disabled={busy} onClick={() => { setPicking(false); setError(''); setChosen(tour.scanId ?? null) }}>Cancel</Button>}
    <p className="rv-fine">{chosenScan ? `The customer will see “${chosenScan.scanName}” in their space and can share it.` : `Choose one of ${plural(scans.length, 'finished tour')}.`}</p>
   </div>
  </>}
 </div>

 if (!delivered) return <div className="dt">
  <div className="dt-head">
   <h2>Deliver the tour</h2>
   <p>Build the tour, upload it under the customer's organization in <Link to="/organizations" className="rv-link">Customers</Link>, then pick it here.</p>
  </div>
  {picker}
 </div>

 return <div className="dt">
  <div className="dt-delivered">
   <TourPreview scanId={tour.scanId} className="dt-preview--large" />
   <div className="dt-delivered-text">
    <StatusPill tone="green">Delivered</StatusPill>
    <h2>{tour.scanName || 'Tour delivered'}</h2>
    <p>{tour.ownerName} can open this tour in their space and share it.</p>
    <div className="dt-delivered-actions">
     {!picking && <Button variant="secondary" icon="retake" onClick={() => setPicking(true)}>Change delivered tour</Button>}
     <Button variant="quiet" to={organizationLink} iconAfter="arrow">Open the customer's organization</Button>
    </div>
   </div>
  </div>
  {picking && <div className="dt-change">
   <div className="dt-head">
    <h3>Change the delivered tour</h3>
    <p>Pick another finished tour. It replaces the one the customer sees now.</p>
   </div>
   {picker}
  </div>}
 </div>
}
