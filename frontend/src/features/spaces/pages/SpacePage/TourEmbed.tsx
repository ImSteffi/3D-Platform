import { useEffect, useState } from 'react'
import { Button } from '../../../../shared/ui'

/** Test scene until generated tours exist: every floor shows Fred's tour. */
export const testTourPath = '/tour-viewer/fred/index.html'

type Kind = 'url' | 'iframe'

/** The floor's 3D tour. URL and IFRAME copy the link or an iframe snippet to the clipboard. */
export default function TourEmbed({ title }: { title: string }) {
 const [copied, setCopied] = useState<Kind | null>(null)
 const url = window.location.origin + testTourPath
 const iframe = `<iframe src="${url}" title="${title.replace(/"/g, '&quot;')}" allow="fullscreen; xr-spatial-tracking; pointer-lock" style="width:100%;height:70vh;border:0"></iframe>`

 useEffect(() => {
  if (!copied) return
  const timer = setTimeout(() => setCopied(null), 2000)
  return () => clearTimeout(timer)
 }, [copied])

 const copy = async (kind: Kind) => {
  try { await navigator.clipboard.writeText(kind === 'url' ? url : iframe); setCopied(kind) } catch { setCopied(null) }
 }

 return <div className="area-tour">
  <iframe className="area-tour-frame" src={testTourPath} title={title} allow="fullscreen; xr-spatial-tracking; pointer-lock" />
  <div className="area-tour-share" aria-live="polite">
   <Button variant="secondary" icon={copied === 'url' ? 'check' : 'link'} onClick={() => copy('url')}>{copied === 'url' ? 'Copied to clipboard' : 'URL'}</Button>
   <Button variant="secondary" icon={copied === 'iframe' ? 'check' : 'code'} onClick={() => copy('iframe')}>{copied === 'iframe' ? 'Copied to clipboard' : 'IFRAME'}</Button>
  </div>
 </div>
}
