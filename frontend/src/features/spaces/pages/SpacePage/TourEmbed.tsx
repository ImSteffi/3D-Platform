import { useEffect, useState } from 'react'
import { Icon } from '../../../../shared/ui'

/** Test scene until generated tours exist: every floor shows Fred's tour. */
export const testTourPath = '/tour-viewer/fred/index.html'

type Kind = 'url' | 'iframe'

/** The floor's 3D tour. URL and IFRAME copy the link or an iframe snippet to the clipboard. */
export default function TourEmbed({ title, spaceId, floorId }: { title: string; spaceId: number; floorId: number }) {
 const [copied, setCopied] = useState<Kind | null>(null)
 // The address says which space and floor this is, so its views are counted there.
 const path = `${testTourPath}?space=${spaceId}&floor=${floorId}`
 const url = window.location.origin + path
 const iframe = `<iframe src="${url}" title="${title.replace(/"/g, '&quot;')}" allow="fullscreen; xr-spatial-tracking; pointer-lock" style="width:100%;height:70vh;border:0"></iframe>`

 useEffect(() => {
  if (!copied) return
  const timer = setTimeout(() => setCopied(null), 2000)
  return () => clearTimeout(timer)
 }, [copied])

 const copy = async (kind: Kind) => {
  try { await navigator.clipboard.writeText(kind === 'url' ? url : iframe); setCopied(kind) } catch { setCopied(null) }
 }

 const option = (kind: Kind, icon: 'link' | 'code', label: string, hint: string) =>
  <button type="button" className={`tour-share-btn${copied === kind ? ' is-copied' : ''}`} title={hint} onClick={() => { void copy(kind) }}>
   <Icon name={copied === kind ? 'check' : icon} size={15} />
   <span>{copied === kind ? 'Copied to clipboard' : label}</span>
  </button>

 return <div className="area-tour">
  <iframe className="area-tour-frame" src={path} title={title} allow="fullscreen; xr-spatial-tracking; pointer-lock" />
  <div className="tour-share" aria-live="polite">
   <div className="tour-share-group">
    {option('url', 'link', 'URL', 'Copy the link to this tour')}
    {option('iframe', 'code', 'IFRAME', 'Copy the code to embed this tour on a website')}
   </div>
  </div>
 </div>
}
