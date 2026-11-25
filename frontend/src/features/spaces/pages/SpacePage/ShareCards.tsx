import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Icon, InlineError, Panel, Skeleton, SkeletonGroup, type IconName } from '../../../../shared/ui'
import { getSharingStatus, setShareable, sharingUrl, type SharingStatus } from '../../../scans/api/share'
import './ShareCards.css'

const embedCode = (url: string, name: string) =>
 `<iframe src="${url}" title="${name.replace(/"/g, '&quot;')}" style="width:100%;height:600px;border:0;border-radius:16px" loading="lazy" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`

function ShareCard({ icon, title, text, children }: { icon: IconName; title: string; text: string; children: ReactNode }) {
 return <Panel as="li" padding="lg" className="share-card">
  <span className="share-card-icon"><Icon name={icon} size={20} /></span>
  <h2>{title}</h2>
  <p className="share-card-text">{text}</p>
  <div className="share-card-body">{children}</div>
 </Panel>
}

/** Two plain-word ways to share a delivered tour: a link and an embed code. The tour itself is never handed out. */
export default function ShareCards({ scanId, name }: { scanId: number; name: string }) {
 const [status, setStatus] = useState<SharingStatus | null>(null)
 const [loadFailed, setLoadFailed] = useState(false)
 const [attempt, setAttempt] = useState(0)
 const [switching, setSwitching] = useState(false)
 const [linkError, setLinkError] = useState('')
 const [copied, setCopied] = useState<'link' | 'embed' | null>(null)
 const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
 useEffect(() => () => {
  if (copyTimer.current) clearTimeout(copyTimer.current)
 }, [])
 useEffect(() => {
  const request = new AbortController()
  getSharingStatus(scanId, request.signal).then(loaded => { setStatus(loaded); setLoadFailed(false) })
   .catch(() => { if (!request.signal.aborted) setLoadFailed(true) })
  return () => request.abort()
 }, [scanId, attempt])
 const retry = useCallback(() => { setLoadFailed(false); setAttempt(current => current + 1) }, [])

 async function turn(on: boolean) {
  if (switching) return
  setSwitching(true); setLinkError('')
  try {
   const next = await setShareable(scanId, on)
   setStatus(next)
   if (!next.enabled) setCopied(null)
  } catch { setLinkError(on ? 'We could not turn the link on. Please try again.' : 'We could not turn the link off. Please try again.') }
  finally { setSwitching(false) }
 }
 async function copy(kind: 'link' | 'embed', url: string) {
  try {
   await navigator.clipboard.writeText(kind === 'link' ? url : embedCode(url, name))
   setLinkError('')
   if (copyTimer.current) clearTimeout(copyTimer.current)
   setCopied(kind)
   copyTimer.current = setTimeout(() => setCopied(null), 2000)
  } catch { setLinkError(kind === 'link' ? 'Your browser did not let us copy. Select the link and copy it by hand.' : 'Your browser did not let us copy the code. Please try again.') }
 }

 if (loadFailed) return <Panel><InlineError onRetry={retry}>We could not load your sharing options. Check your connection and try again.</InlineError></Panel>
 if (!status) return <SkeletonGroup label="Loading your sharing options">
  <ul className="share-cards">
   {[0, 1].map(card => <Panel key={card} as="li" padding="lg" className="share-card">
    <Skeleton width={44} height={44} radius={14} index={card} />
    <Skeleton width={['58%', '72%', '64%'][card]} height={22} index={card + 1} style={{ marginTop: 16 }} />
    <Skeleton width="92%" height={14} index={card + 2} style={{ marginTop: 10 }} />
    <Skeleton width={['70%', '80%', '56%'][card]} height={14} index={card + 3} style={{ marginTop: 7 }} />
    <div className="share-card-body"><Skeleton width={card ? 150 : 176} height={44} radius={999} index={card + 4} /></div>
   </Panel>)}
  </ul>
 </SkeletonGroup>

 const live = status.enabled && status.hostingEnabled && !!status.path
 const url = live ? sharingUrl(status) : ''
 const unavailable = !status.hostingEnabled && !status.enabled
 return <>
  <InlineError>{linkError}</InlineError>
  <ul className="share-cards">
   <ShareCard icon="link" title="Send a link" text="Anyone with the link can walk through your tour in their browser. They do not need an account.">
    {live ? <>
     <div className="share-link">
      <input readOnly value={url} aria-label="Link to your tour" onFocus={event => event.currentTarget.select()} />
      <Button icon={copied === 'link' ? 'check' : 'copy'} onClick={() => { void copy('link', url) }}>{copied === 'link' ? 'Copied' : 'Copy'}</Button>
     </div>
     <button type="button" className="share-off" disabled={switching} onClick={() => { void turn(false) }}>{switching ? 'Turning the link off…' : 'Turn link off'}</button>
    </> : unavailable
     ? <p className="share-card-note">Link sharing is not switched on for your tour yet. Ask us to turn it on.</p>
     : <Button icon="link" loading={switching} onClick={() => { void turn(true) }}>Turn the link on</Button>}
   </ShareCard>
   <ShareCard icon="code" title="Put it on your website" text="A short piece of code shows the tour on a page of your site. Send this to whoever looks after your website.">
    <Button variant="secondary" icon={copied === 'embed' ? 'check' : 'copy'} disabled={!live} onClick={() => { void copy('embed', url) }}>{copied === 'embed' ? 'Code copied' : 'Copy the code'}</Button>
    {!live && <p className="share-card-note">Turn the link on first. The code uses the same link.</p>}
   </ShareCard>
  </ul>
  <span className="visually-hidden" role="status">{copied === 'link' ? 'Link copied' : copied === 'embed' ? 'Code copied' : ''}</span>
 </>
}

