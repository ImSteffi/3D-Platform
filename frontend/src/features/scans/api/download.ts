export async function downloadScan(scanId: number): Promise<void> {
 const url = '/api/scans/' + scanId + '/download'
 const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin' })
 if (!response.ok) throw new Error(response.status === 401
  ? 'Your session expired. Please sign in again.'
  : response.status === 403 || response.status === 404
   ? 'This scan is unavailable or you do not have access.'
   : 'Could not prepare the download. Please try again.')
 // Let the browser stream the ZIP to disk instead of creating a large in-memory Blob.
 window.location.assign(url)
}
