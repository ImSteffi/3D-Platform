import { useEffect, useState } from 'react'
import { Button, InlineError } from '../../../../shared/ui'
import { createGalleryLink, getGalleryLink, revokeGalleryLink, type GalleryLink } from '../../../tours/api/tourRequests'

const fullUrl = (link: GalleryLink) => link.url ?? `${window.location.origin}${link.path}`
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

/** The link sent to a customer: opening it signs them in to their account and opens this space. Valid 7 days. */
export default function GalleryLinkControl({ spaceId }: { spaceId: number }) {
 const [link, setLink] = useState<GalleryLink | null | undefined>(undefined)
 const [busy, setBusy] = useState(false)
 const [copied, setCopied] = useState(false)
 const [error, setError] = useState('')

 useEffect(() => {
  let active = true
  getGalleryLink(spaceId).then(found => { if (active) setLink(found) })
   .catch(() => { if (active) setLink(null) })
  return () => { active = false }
 }, [spaceId])

 async function run(action: () => Promise<void>) {
  setBusy(true); setError('')
  try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Try again.') }
  finally { setBusy(false) }
 }

 async function copy(target: GalleryLink) {
  try { await navigator.clipboard.writeText(fullUrl(target)); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
  catch { setError('Could not copy. Select the link and copy it by hand.') }
 }

 if (link === undefined) return null

 return <div className="gallery-link">
  {link ? <>
   <input className="gallery-link-url" readOnly value={fullUrl(link)} onFocus={event => event.currentTarget.select()} aria-label="Gallery link" />
   <span className="gallery-link-expiry">Expires in {daysLeft(link.expiresAt)} {daysLeft(link.expiresAt) === 1 ? 'day' : 'days'}</span>
   <Button variant="secondary" icon={copied ? 'check' : 'copy'} onClick={() => copy(link)}>{copied ? 'Copied' : 'Copy'}</Button>
   <Button variant="quiet" loading={busy} onClick={() => run(async () => { setLink(await createGalleryLink(spaceId)) })}
    title="Make a new link valid for 7 days. The old link stops working.">Renew</Button>
   <Button variant="quiet" disabled={busy} onClick={() => run(async () => { await revokeGalleryLink(spaceId); setLink(null) })}>Turn off</Button>
  </> : <Button variant="secondary" icon="link" loading={busy}
   onClick={() => run(async () => { const made = await createGalleryLink(spaceId); setLink(made); await copy(made) })}>
   Create gallery link
  </Button>}
  {error && <InlineError>{error}</InlineError>}
 </div>
}
