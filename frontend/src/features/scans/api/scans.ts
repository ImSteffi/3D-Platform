import type { ScanDraft } from '../types'

export type SavedScan = {
  id: number
  projectId: number
  name: string
  status: 'UPLOADING' | 'READY' | 'FAILED'
  files: { id: number; relativePath: string; sizeBytes: number }[]
}

async function check(response: Response) {
  if (response.status === 401) {
    window.location.replace('/login')
    throw new Error('Session expired.')
  }
  if (!response.ok) {
    let message = response.status === 403
      ? 'Permission denied or session expired. Log in again if needed.'
      : `Request failed (${response.status}). Please retry.`
    const body = await response.json().catch(() => null)
    if (body?.message) message = body.message
    throw new Error(message)
  }
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  await check(csrfResponse)
  const csrf: { headerName: string; token: string } = await csrfResponse.json()
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  await check(response)
  return response.status === 204 ? undefined as T : response.json()
}

function base(orgId: number, projectId: number) {
  return `/api/organizations/${orgId}/projects/${projectId}/scans`
}

export async function getScans(orgId: number, projectId: number): Promise<SavedScan[]> {
  const response = await fetch(base(orgId, projectId), { credentials: 'same-origin' })
  await check(response)
  return response.json()
}

// The caller retains the server record so Retry does not create another scan.
export async function publishScan(
  orgId: number,
  projectId: number,
  draft: ScanDraft,
  existing: SavedScan | null,
  onCreated: (scan: SavedScan) => void,
  onProgress: (message: string) => void,
): Promise<SavedScan> {
  const root = base(orgId, projectId)
  onProgress('Preparing upload…')
  const scan = existing ?? await post<SavedScan>(root, {
    name: draft.name,
    files: draft.files.map(({ file, relativePath }) => ({ relativePath, sizeBytes: file.size })),
  })
  onCreated(scan)
  const total = draft.files.reduce((sum, entry) => sum + entry.file.size, 0)
  let completed = 0
  for (const saved of scan.files) {
    const entry = draft.files.find(f => f.relativePath === saved.relativePath)
    if (!entry) throw new Error('A selected file is missing. Keep this page open while publishing.')
    const fileUrl = `${root}/${scan.id}/files/${saved.id}`
    const plan = await post<{ complete: boolean; partSize: number; partCount: number }>(`${fileUrl}/upload`)
    if (!plan.complete) {
      for (let part = 1; part <= plan.partCount; part++) {
        const start = (part - 1) * plan.partSize
        const blob = entry.file.slice(start, Math.min(start + plan.partSize, entry.file.size))
        // Retry a failed part rather than restarting the entire file.
        for (let attempt = 0; ; attempt++) {
          try {
            const { url } = await post<{ url: string }>(`${fileUrl}/parts/${part}`)
            const response = await fetch(url, { method: 'PUT', body: blob, credentials: 'omit' })
            if (!response.ok) throw new Error(`R2 upload failed (${response.status}).`)
            break
          } catch (error) {
            if (attempt >= 2) throw error
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
          }
        }
        const bytes = completed + Math.min(part * plan.partSize, entry.file.size)
        onProgress(`Uploading ${saved.relativePath} — ${total ? Math.floor(bytes / total * 100) : 100}%`)
      }
      onProgress(`Verifying ${saved.relativePath}…`)
      await post<void>(`${fileUrl}/complete`)
    }
    completed += entry.file.size
  }
  onProgress('Verifying scan…')
  return post<SavedScan>(`${root}/${scan.id}/complete`)
}
