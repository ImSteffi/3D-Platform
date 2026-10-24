export async function deleteScan(scanId: number): Promise<void> {
 const csrfResponse = await fetch('/api/auth/csrf')
 if (!csrfResponse.ok) throw new Error('Could not prepare deletion. Please sign in again.')
 const csrf: { headerName: string; token: string } = await csrfResponse.json()
 const response = await fetch('/api/scans/' + scanId, {
  method: 'DELETE',
  headers: { [csrf.headerName]: csrf.token },
 })
 if (!response.ok) throw new Error(response.status === 401
  ? 'Your session expired. Please sign in again.'
  : response.status === 403 ? 'Only a platform administrator can delete scans.'
  : 'Could not finish deletion. Please refresh or try Delete again.')
}