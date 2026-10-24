export type SharingStatus = {
 enabled: boolean
 hostingEnabled: boolean
 path: string | null
 url: string | null
}

export async function getSharingStatus(scanId: number, signal?: AbortSignal): Promise<SharingStatus> {
 const response = await fetch('/api/scans/' + scanId + '/share', { signal, cache: 'no-store' })
 if (!response.ok) throw new Error('Could not load sharing settings. Please refresh to try again.')
 return response.json()
}

export async function setShareable(scanId: number, enabled: boolean): Promise<SharingStatus> {
 const csrfResponse = await fetch('/api/auth/csrf')
 if (!csrfResponse.ok) throw new Error('Could not prepare sharing. Please sign in again.')
 const csrf: { headerName: string; token: string } = await csrfResponse.json()
 const response = await fetch('/api/scans/' + scanId + '/share', {
  method: enabled ? 'POST' : 'DELETE',
  headers: { [csrf.headerName]: csrf.token },
 })
 if (!response.ok) throw new Error(response.status === 403
  ? 'Hosted sharing is unavailable for this scan.'
  : 'Could not update sharing. Please try again.')
 return getSharingStatus(scanId)
}

export function sharingUrl(status: SharingStatus): string {
 if (!status.path) throw new Error('Enable Shareable before copying a link.')
 return status.url ?? new URL(status.path, window.location.origin).href
}