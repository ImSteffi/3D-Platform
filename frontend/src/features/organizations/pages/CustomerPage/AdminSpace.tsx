import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog, Icon, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import AreaSection from '../../../spaces/pages/SpacePage/AreaSection'
import { entriesOf, message, pad, plural, type Entry } from '../../../spaces/pages/SpacePage/spaceModel'
import { formatDate } from '../../../tours/components/review/reviewText'
import { deletePhoto, getTourRequest, photoUrl, type TourDetail, type TourSummary } from '../../../tours/api/tourRequests'
import '../../../spaces/pages/SpacePage/SpaceSections.css'

/** One of the customer's spaces on the operator's customer page: its head, then its floors. The operator marks spots; the floors and plans are the customer's. */
export default function AdminSpace({ summary, owner }: { summary: TourSummary; startOpen?: boolean; owner?: { displayName: string; email: string } }) {
 const expanded = true
 const [tour, setTour] = useState<TourDetail | null>(null)
 const [loadError, setLoadError] = useState('')
 const [attempt, setAttempt] = useState(0)
 const [version, setVersion] = useState(0)
 const [saving, setSaving] = useState(false)
 const [photoToDelete, setPhotoToDelete] = useState<Entry | null>(null)
 const [dialogError, setDialogError] = useState('')

 const id = summary.id
 useEffect(() => {
  if (!expanded) return
  let active = true
  getTourRequest(id).then(found => { if (active) setTour(found) })
   .catch(reason => { if (active) setLoadError(message(reason, 'We could not load this space.')) })
  return () => { active = false }
 }, [id, expanded, attempt])

 const status = tour?.status ?? summary.status
 const open = status !== 'DELIVERED'
 const entries = useMemo(() => tour ? entriesOf(tour) : [], [tour])

 async function removePhoto(entry: Entry) {
  setSaving(true); setDialogError('')
  try { setTour(await deletePhoto(id, entry.point.id)); setVersion(current => current + 1); setPhotoToDelete(null) }
  catch (reason) { setDialogError(message(reason, 'That did not go through. Please try again.')) }
  finally { setSaving(false) }
 }

 return <section className="admin-space" aria-labelledby={`admin-space-${id}`}>
  <header className="admin-space-head">
   <div className="admin-space-title">
    <h2 id={`admin-space-${id}`} className="admin-space-name"><span className="admin-space-pin" aria-hidden="true"><Icon name="pin" size={14} /></span>{summary.name}</h2>
    <div className="admin-space-meta">
     {owner ? <><span className="admin-space-owner">{owner.displayName}</span><span>{owner.email}</span></>
      : summary.ownerName && <span className="admin-space-owner">{summary.ownerName}</span>}
     <span>Created {formatDate(summary.createdAt)}</span>
     <span>{plural(tour?.areas.length ?? summary.areaCount, 'floor')}</span>
    </div>
   </div>
  </header>

  {expanded && (loadError ? <Panel><InlineError onRetry={() => { setLoadError(''); setAttempt(current => current + 1) }}>{loadError}</InlineError></Panel>
   : !tour ? <SkeletonGroup label={`Loading ${summary.name}`}>
     <Panel padding="none" className="area"><div className="area-body">
      <Skeleton height={220} radius="var(--r-card)" index={0} />
     </div></Panel>
    </SkeletonGroup>
   : <div className="sections">
    {tour.areas.map(area => <AreaSection key={area.id} tour={tour} area={area} entries={entries.filter(entry => entry.area.id === area.id)} version={version}
     busy={saving} primary={false} selected={null} waiting={[]} readOnly={!open}
     srcOf={entry => photoUrl(id, entry.point.id, version)}
     onSelect={() => {}} onFiles={() => {}} onCamera={() => {}} onPlan={() => {}} onSketch={() => {}} onRemove={() => {}}
     onDelete={entry => { setDialogError(''); setPhotoToDelete(entry) }}
     admin={{ markTo: `/review/${id}` }} />)}
    {tour.areas.length === 0 && <Panel><p className="sections-none">This space has no floors yet.</p></Panel>}
   </div>)}

  {photoToDelete && <ConfirmDialog title="Delete this photo?" confirmLabel="Delete photo" busy={saving} error={dialogError}
   onConfirm={() => { void removePhoto(photoToDelete) }} onCancel={() => setPhotoToDelete(null)}>
   <p>Photo <strong className="num">{pad(photoToDelete.number)}</strong> in {photoToDelete.area.name} will be removed. The customer can take it again.</p>
  </ConfirmDialog>}
 </section>
}
