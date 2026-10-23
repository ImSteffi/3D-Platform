export type ClientProject = {
  id: number
  name: string
  organizationId: number
  organizationName: string
  publishedScanCount: number
}

export type ClientProjectDetail = {
  id: number
  name: string
  organizationName: string
  scans: { id: number; name: string; fileCount: number; sizeBytes: number; files: { relativePath: string; sizeBytes: number }[] }[]
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' })
  if (response.status === 401) {
    window.location.replace('/login')
    throw new Error('Session expired.')
  }
  if (response.status === 404) throw new Error('Project not found.')
  if (!response.ok) throw new Error('Could not load projects. Please try again.')
  return response.json()
}

export function getClientProjects() {
  return get<ClientProject[]>('/api/client/projects')
}

export function getClientProject(id: number) {
  return get<ClientProjectDetail>(`/api/client/projects/${id}`)
}
