type ExportStatus = { id: string; status: 'PREPARING' | 'READY' | 'FAILED'; url: string | null }

async function waitForPoll(signal: AbortSignal): Promise<void> {
 await new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 1500)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
 })
}

function check(response: Response) {
 if (!response.ok) throw new Error(response.status === 401
  ? 'Your session expired. Please sign in again.'
  : response.status === 403 || response.status === 404
   ? 'This tour is unavailable. Refresh the page and try again.'
   : response.status === 429 ? 'Downloads are busy. Please try again shortly.'
   : 'Could not prepare the download. Please try again.')
}

export async function downloadScan(scanId: number, signal: AbortSignal): Promise<void> {
 const csrfResponse = await fetch('/api/auth/csrf', { signal })
 check(csrfResponse)
 const csrf: { headerName: string; token: string } = await csrfResponse.json()
 const base = '/api/scans/' + scanId + '/download'
 const response = await fetch(base, {
  method: 'POST', headers: { [csrf.headerName]: csrf.token }, signal,
 })
 check(response)
 const started: ExportStatus = await response.json()
 const deadline = Date.now() + 30 * 60 * 1000
 while (!signal.aborted) {
  const status = await fetch(base + '/' + encodeURIComponent(started.id), { signal, cache: 'no-store' })
  check(status)
  const job: ExportStatus = await status.json()
  if (job.status === 'FAILED') throw new Error('Could not prepare the ZIP. Please try Download again.')
  if (job.status === 'READY' && job.url) {
   // Native download directly from R2: no scene bytes or ZIP Blob pass through frontend JS.
   window.location.assign(job.url)
   return
  }
  if (Date.now() >= deadline) throw new Error('Preparing the download took too long. Please try again.')
  await waitForPoll(signal)
 }
}