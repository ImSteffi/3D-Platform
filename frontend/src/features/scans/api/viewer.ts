export type StartingView = {
 position: [number, number, number]
 target: [number, number, number]
 fov: number
}

export type ViewerManifest = {
 contentUrl: string
 contentFilename: string
 collisionUrl: string | null
 settings: unknown
}

export async function saveStartingView(scanId: number, view: StartingView, signal: AbortSignal) {
 const csrfResponse = await fetch('/api/auth/csrf', { signal })
 if (!csrfResponse.ok) throw new Error('Could not prepare the save. Please sign in again.')
 const csrf: { headerName: string; token: string } = await csrfResponse.json()
 const response = await fetch('/api/scans/' + scanId + '/viewer/starting-view', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
  body: JSON.stringify(view),
  signal,
 })
 if (!response.ok) throw new Error(response.status === 403
  ? 'Only a platform administrator can change the starting view.'
  : response.status === 401 ? 'Your session expired. Please sign in again.'
  : 'Could not save the starting view. Please try again.')
}

export async function savePreview(scanId: number, image: Blob, signal: AbortSignal) {
 const csrfResponse = await fetch('/api/auth/csrf', { signal })
 if (!csrfResponse.ok) throw new Error('Could not prepare the preview. Please sign in again.')
 const csrf: { headerName: string; token: string } = await csrfResponse.json()
 const response = await fetch('/api/scans/' + scanId + '/preview', {
  method: 'PUT',
  headers: { 'Content-Type': 'image/png', [csrf.headerName]: csrf.token },
  body: image,
  signal,
 })
 if (!response.ok) throw new Error('Could not save the preview. Please try again.')
 window.dispatchEvent(new CustomEvent('scan-preview-updated', { detail: { scanId } }))
}