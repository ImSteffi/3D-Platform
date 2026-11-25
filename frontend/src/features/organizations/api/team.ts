/** The team: everyone who works in the platform as an admin. Only the owner adds or removes members. */
export type TeamMember = { id: number; displayName: string; email: string; owner: boolean }

export async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
 const headers: Record<string, string> = {}
 if (method !== 'GET') {
  const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  if (!csrf.ok) throw new Error('That did not go through. Try again.')
  const { headerName, token } = await csrf.json() as { headerName: string; token: string }
  headers[headerName] = token
 }
 if (body !== undefined) headers['Content-Type'] = 'application/json'
 const response = await fetch(url, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) })
 if (response.status === 401) { window.location.replace('/login'); throw new Error('Your session expired. Sign in again.') }
 if (!response.ok) {
  const text = await response.json().then(data => (data as { message?: string }).message, () => undefined)
  throw new Error(text || (response.status === 403 ? 'You do not have permission to do this.' : 'That did not go through. Try again.'))
 }
 return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const getTeam = () => call<TeamMember[]>('GET', '/api/admin/team')
export const addTeamMember = (displayName: string, email: string, password: string) =>
 call<TeamMember>('POST', '/api/admin/team', { displayName, email, password })
export const removeTeamMember = (id: number) => call<void>('DELETE', `/api/admin/team/${id}`)

/** Admin only: give a customer a new name. */
export const renameOrganization = (id: number, name: string) =>
 call<{ id: number; name: string }>('PUT', `/api/admin/organizations/${id}`, { name })

/** What deleting an organization removes: its people, their spaces and everything in them. */
export type OrganizationRemoval = { name: string; people: number; spaces: number; floors: number; photos: number; tours: number }
export const getOrganizationRemoval = (id: number) => call<OrganizationRemoval>('GET', `/api/admin/organizations/${id}/removal`)
/** Admin only: delete an organization for good, with its people, spaces and files. */
export const deleteOrganization = (id: number) => call<void>('DELETE', `/api/admin/organizations/${id}`)
