import { useEffect, useState } from 'react'

/** The tour's saved preview image. Renders nothing while there is none, so the card's placeholder shows through. */
export default function ScanPreview({ scanId }: { scanId: number }) {
 const [url, setUrl] = useState('')
 // Which scan's first request has finished, so the shimmer shows only while the picture is on its way.
 const [settledFor, setSettledFor] = useState<number | null>(null)
 useEffect(() => {
  let active = true
  let currentUrl = ''
  let request: AbortController | undefined
  async function load() {
   request?.abort()
   const controller = new AbortController()
   request = controller
   try {
    const response = await fetch('/api/scans/' + scanId + '/preview', { signal: controller.signal, cache: 'no-store' })
    if (response.status !== 200) return
    const image = await response.blob()
    if (!active || controller.signal.aborted) return
    const next = URL.createObjectURL(image)
    const previous = currentUrl
    currentUrl = next
    setUrl(next)
    if (previous) URL.revokeObjectURL(previous)
   } catch { /* A missing or unavailable preview leaves the placeholder visible. */ } finally {
    if (active && !controller.signal.aborted) setSettledFor(scanId)
   }
  }
  const refresh = (event: Event) => {
   if ((event as CustomEvent<{ scanId: number }>).detail.scanId === scanId) void load()
  }
  void load()
  window.addEventListener('scan-preview-updated', refresh)
  return () => {
   active = false
   request?.abort()
   if (currentUrl) URL.revokeObjectURL(currentUrl)
   window.removeEventListener('scan-preview-updated', refresh)
  }
 }, [scanId])
 if (url) return <img className="tour-card-image" src={url} alt="" />
 return settledFor === scanId ? null : <span className="tour-card-image skeleton-bg" aria-hidden="true" />
}
