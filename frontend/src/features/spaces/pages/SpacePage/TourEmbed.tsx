import { useEffect, useState } from 'react'
import { Icon } from '../../../../shared/ui'

type Kind = 'url' | 'iframe'

/** A 3D tour page in a frame. URL and IFRAME copy its link or an iframe snippet to the clipboard. */
export default function TourEmbed({ title, path }: { title: string; path: string }) {
 const [copied, setCopied] = useState<Kind | null>(null)
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
