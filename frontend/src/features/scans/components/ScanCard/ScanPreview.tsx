import { useEffect, useState } from 'react'

export default function ScanPreview({ scanId }: { scanId: number }) {
 const [url, setUrl] = useState('')
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
   } catch { /* A missing or unavailable preview leaves the play placeholder visible. */ }
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
 return url ? <img className="scan-preview-image" src={url} alt="" /> : null
}