export type TourStatus = 'DRAFT' | 'SUBMITTED' | 'PLAN_READY' | 'PHOTOS_SUBMITTED' | 'APPROVED'
export type AreaKind = 'FLOOR' | 'BUILDING' | 'OUTDOOR'

export type TourSummary = {
 id: number
 name: string
 status: TourStatus
 createdAt: string
 areaCount: number
 ownerName: string
}

export type TourPoint = {
 id: number
 seq: number
 x: number
 y: number
 direction: number
 note: string | null
 hasPhoto: boolean
 retakeNote: string | null
}

export type TourArea = {
 id: number
 name: string
 kind: AreaKind
 captureGroup: number
 hasPlan: boolean
 dotSize: number
 lineLength: number
 points: TourPoint[]
}

export type TourDetail = {
 id: number
 name: string
 notes: string | null
 status: TourStatus
 createdAt: string
 ownerName: string
 ownerEmail: string
 areas: TourArea[]
}

export type PointInput = { x: number; y: number; direction: number; note: string | null }

export const MAX_POINTS_PER_GROUP = 64
export const imageAccept = 'image/jpeg,image/png,image/webp'

export const statusLabels: Record<TourStatus, string> = {
 DRAFT: 'Draft',
 SUBMITTED: 'Waiting for capture plan',
 PLAN_READY: 'Ready for photos',
 PHOTOS_SUBMITTED: 'Photos in review',
 APPROVED: 'Approved',
}

export const kindLabels: Record<AreaKind, string> = {
 FLOOR: 'Floor',
 BUILDING: 'Separate building',
 OUTDOOR: 'Outdoor area',
}

async function check(response: Response) {
 if (response.status === 401) {
  window.location.replace('/login')
  throw new Error('Session expired.')
 }
 if (!response.ok) {
  let message = response.status === 403
   ? 'Permission denied or session expired. Log in again if needed.'
   : response.status === 404 ? 'Tour not found.'
   : response.status === 413 ? 'That image is too large.'
   : `Request failed (${response.status}). Please retry.`
  const body = await response.json().catch(() => null)
  if (body?.message) message = body.message
  throw new Error(message)
 }
}

async function get<T>(url: string): Promise<T> {
 const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
 await check(response)
 return response.json()
}

async function send<T>(method: string, url: string, body?: unknown, file?: File): Promise<T> {
 const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
 await check(csrfResponse)
 const csrf: { headerName: string; token: string } = await csrfResponse.json()
 const headers: Record<string, string> = { [csrf.headerName]: csrf.token }
 if (file) headers['Content-Type'] = file.type || 'application/octet-stream'
 else if (body !== undefined) headers['Content-Type'] = 'application/json'
 const response = await fetch(url, {
  method,
  credentials: 'same-origin',
  headers,
  body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
 })
 await check(response)
 return response.status === 204 ? undefined as T : response.json()
}

const root = '/api/tour-requests'
const adminRoot = '/api/admin/tour-requests'

export const getTourRequests = () => get<TourSummary[]>(root)
export const getTourRequest = (id: number) => get<TourDetail>(`${root}/${id}`)
export const createTourRequest = (name: string, notes: string) =>
 send<TourDetail>('POST', root, { name, notes: notes || null })
export const deleteTourRequest = (id: number) => send<void>('DELETE', `${root}/${id}`)
export const addArea = (id: number, name: string, kind: AreaKind) =>
 send<TourDetail>('POST', `${root}/${id}/areas`, { name, kind })
export const removeArea = (id: number, areaId: number) =>
 send<TourDetail>('DELETE', `${root}/${id}/areas/${areaId}`)
export const uploadPlan = (id: number, areaId: number, file: File) =>
 send<TourDetail>('PUT', `${root}/${id}/areas/${areaId}/plan`, undefined, file)
export const submitTourRequest = (id: number) => send<TourDetail>('POST', `${root}/${id}/submit`)
export const uploadPhoto = (id: number, pointId: number, file: File) =>
 send<TourDetail>('PUT', `${root}/${id}/points/${pointId}/photo`, undefined, file)
export const deletePhoto = (id: number, pointId: number) =>
 send<TourDetail>('DELETE', `${root}/${id}/points/${pointId}/photo`)
export const submitPhotos = (id: number) => send<TourDetail>('POST', `${root}/${id}/photos/submit`)

export const planUrl = (id: number, areaId: number, version = 0) =>
 `${root}/${id}/areas/${areaId}/plan?v=${version}`
export const photoUrl = (id: number, pointId: number, version = 0) =>
 `${root}/${id}/points/${pointId}/photo?v=${version}`

export const getAdminTourRequests = () => get<TourSummary[]>(adminRoot)
export const saveAreaPoints = (id: number, areaId: number, captureGroup: number, points: PointInput[]) =>
 send<TourDetail>('PUT', `${adminRoot}/${id}/areas/${areaId}/points`, { captureGroup, points })
export const sendPlan = (id: number) => send<TourDetail>('POST', `${adminRoot}/${id}/plan/send`)
export const saveMarkerSizes = (id: number, areaId: number, dotSize: number, lineLength: number) =>
 send<TourDetail>('PUT', `${adminRoot}/${id}/areas/${areaId}/markers`, { dotSize, lineLength })
export const reopenPlan = (id: number) => send<TourDetail>('POST', `${adminRoot}/${id}/plan/reopen`)
export const reviewPhotos = (id: number, approve: boolean, retakes: { pointId: number; note: string }[]) =>
 send<TourDetail>('POST', `${adminRoot}/${id}/review`, { approve, retakes })

export function validImage(file: File, maxMb: number): string | null {
 if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG or WebP image.'
 if (file.size > maxMb * 1024 * 1024) return `Images can be up to ${maxMb} MB.`
 if (!file.size) return 'That file is empty.'
 return null
}
