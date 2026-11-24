import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../../shared/ui'
import './SharePanel.css'

/** The code that shows a floor's 3DGS on another website. */
const embedCode = (url: string, name: string) =>
 `<iframe src="${url}" title="${name.replace(/"/g, '&quot;')}" style="width:100%;height:600px;border:0;border-radius:16px" loading="lazy" allow="fullscreen; xr-spatial-tracking; pointer-lock" allowfullscreen></iframe>`

/** Share: copy a floor's 3DGS as a link or as iframe code. */
export default function SharePanel({ url, name }: { url: string; name: string }) {
 const [copied, setCopied] = useState<'url' | 'iframe' | null>(null)
 const [error, setError] = useState('')
 const timer = useRef<number | undefined>(undefined)
 useEffect(() => () => window.clearTimeout(timer.current), [])
 const code = embedCode(url, name)
 async function copy(kind: 'url' | 'iframe') {
  try {
   await navigator.clipboard.writeText(kind === 'url' ? url : code)
   setError('')
   setCopied(kind)
   window.clearTimeout(timer.current)
   timer.current = window.setTimeout(() => setCopied(null), 2000)
  } catch { setError('Your browser did not let us copy. Please try again.') }
 }
 return <div className="panel3d-share">
  <div className="panel3d-share-btns">
   <Button variant="secondary" icon={copied === 'url' ? 'check' : 'link'} onClick={() => { void copy('url') }}>{copied === 'url' ? 'URL copied' : 'Copy URL'}</Button>
   <Button variant="secondary" icon={copied === 'iframe' ? 'check' : 'code'} onClick={() => { void copy('iframe') }}>{copied === 'iframe' ? 'Iframe copied' : 'Copy iframe'}</Button>
  </div>
  {error && <p className="panel3d-share-error" role="alert">{error}</p>}
  <span className="visually-hidden" role="status">{copied === 'url' ? 'Link copied' : copied === 'iframe' ? 'Iframe code copied' : ''}</span>
 </div>
}
