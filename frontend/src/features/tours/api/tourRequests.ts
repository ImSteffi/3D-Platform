export type TourStatus = 'DRAFT' | 'SUBMITTED' | 'PLAN_READY' | 'PHOTOS_SUBMITTED' | 'APPROVED' | 'DELIVERED'
export type AreaKind = 'FLOOR' | 'BUILDING' | 'OUTDOOR'

export type TourSummary = {
 id: number
 name: string
 status: TourStatus
 createdAt: string
 areaCount: number
 ownerName: string
 /** Set once the tour is delivered. Older backends omit these. */
 scanId?: number | null
 scanName?: string | null
 projectId?: number | null
 /** Floors that have a plan but no capture points yet: the team still has to mark where to stand. Older backends omit this. */
 areasToPlan?: number
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
 /** Set once the tour is delivered. Older backends omit these. */
 scanId?: number | null
 scanName?: string | null
 projectId?: number | null
 /** Floors that have a plan but no capture points yet: the team still has to mark where to stand. Older backends omit this. */
 areasToPlan?: number
}

export type DeliverableScan = { scanId: number; scanName: string; projectId: number; projectName: string; organizationName: string }

export type PointInput = { x: number; y: number; direction: number; note: string | null }

export const MAX_POINTS_PER_GROUP = 64
export const imageAccept = 'image/jpeg,image/png,image/webp'

export const statusLabels: Record<TourStatus, string> = {
 DRAFT: 'Draft',
 SUBMITTED: 'Waiting for capture plan',
 PLAN_READY: 'Ready for photos',
 PHOTOS_SUBMITTED: 'Photos in review',
 APPROVED: 'Approved',
 DELIVERED: 'Tour delivered',
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

export const getDeliverableScans = (id: number) => get<DeliverableScan[]>(`${adminRoot}/${id}/deliverable-scans`)
export const deliverTour = (id: number, scanId: number) =>
 send<TourDetail>('POST', `${adminRoot}/${id}/deliver`, { scanId })

/** Who has the next move, from the CUSTOMER's side: 'you' = the customer, 'team' = the team, 'done' = tour delivered. */
export function whoseMove(status: TourStatus): 'you' | 'team' | 'done' {
 if (status === 'DELIVERED') return 'done'
 return status === 'DRAFT' || status === 'PLAN_READY' ? 'you' : 'team'
}

export type JourneyStepKey = 'plan' | 'photos' | 'build' | 'tour' | 'share'
export type JourneyStep = { key: JourneyStepKey; label: string; state: 'done' | 'current' | 'later'; owner: 'you' | 'team' }

/**
 * The five steps of a Space's journey (Floor plan, Photos, Team builds, Your tour, Share) with their state for
 * this status. Fits the Steps component's `items` as is. `owner` says who acts on the step right now: while the
 * team is placing capture points (SUBMITTED) the Floor plan step is current and owned by the team.
 */
export function journeySteps(status: TourStatus): JourneyStep[] {
 const current: Record<TourStatus, number> = { DRAFT: 0, SUBMITTED: 0, PLAN_READY: 1, PHOTOS_SUBMITTED: 2, APPROVED: 2, DELIVERED: 3 }
 const steps: { key: JourneyStepKey; label: string; owner: 'you' | 'team' }[] = [
  { key: 'plan', label: 'Floor plan', owner: status === 'SUBMITTED' ? 'team' : 'you' },
  { key: 'photos', label: 'Photos', owner: 'you' },
  { key: 'build', label: 'Team builds', owner: 'team' },
  { key: 'tour', label: 'Your tour', owner: 'you' },
  { key: 'share', label: 'Share', owner: 'you' },
 ]
 const at = current[status] ?? 0
 return steps.map((step, index) => ({ ...step, state: index < at ? 'done' : index === at ? 'current' : 'later' }))
}

/**
 * Photo progress across every area. `taken` counts photos that are in and not flagged; `retakes` counts points the
 * team asked to shoot again; `total` is every capture point. Still to shoot for the first time = total - taken - retakes.
 */
export function photoCounts(tour: Pick<TourDetail, 'areas'>): { total: number; taken: number; retakes: number } {
 const points = tour.areas.flatMap(area => area.points)
 return {
  total: points.length,
  taken: points.filter(point => point.hasPhoto && !point.retakeNote).length,
  retakes: points.filter(point => !!point.retakeNote).length,
 }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * One short plain sentence saying whose move it is and what happens next, for the customer:
 * "Your move: 11 photos to go", "With the team: preparing your capture plan", "Your tour is ready".
 * Give it a TourDetail to get real photo counts; a TourSummary gets generic wording.
 */
export function nextMoveLine(tour: TourSummary | TourDetail): string {
 switch (tour.status) {
  case 'DRAFT': return 'Your move: add your floor plan'
  case 'SUBMITTED': return 'With the team: preparing your capture plan'
  case 'PLAN_READY': {
   if (!('areas' in tour)) return 'Your move: take your photos'
   const { total, taken, retakes } = photoCounts(tour)
   const left = total - taken - retakes
   if (left > 0) return `Your move: ${plural(left, 'photo')} to go`
   if (retakes > 0) return `Your move: ${plural(retakes, 'photo')} to retake`
   return 'Your move: send your photos to the team'
  }
  case 'PHOTOS_SUBMITTED': return 'With the team: checking your photos'
  case 'APPROVED': return 'With the team: building your tour'
  case 'DELIVERED': return 'Your tour is ready'
  default: return 'With the team'
 }
}

export function validImage(file: File, maxMb: number): string | null {
 if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG or WebP image.'
 if (file.size > maxMb * 1024 * 1024) return `Images can be up to ${maxMb} MB.`
 if (!file.size) return 'That file is empty.'
 return null
}

/* Admin: one customer's page, and floor editing on any request until it is delivered. */
export type AdminUser = { id: number; displayName: string; email: string; organizations: { id: number; name: string }[] }

/** Like `get`, but a 404 or 405 says the person is missing or the server is not updated yet, not "Tour not found". */
async function adminGet<T>(url: string, missing: string): Promise<T> {
 const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
 if (response.status === 404 || response.status === 405) throw new Error(missing)
 await check(response)
 return response.json()
}

const adminUsersRoot = '/api/admin/users'
export const getAdminUser = (userId: number) =>
 adminGet<AdminUser>(`${adminUsersRoot}/${userId}`, 'We could not find this person, or the server does not offer this page yet.')
export const getAdminUserTourRequests = (userId: number) =>
 adminGet<TourSummary[]>(`${adminUsersRoot}/${userId}/tour-requests`, 'The server does not list this person’s spaces yet.')
export const adminAddArea = (id: number, name: string, kind: AreaKind) =>
 send<TourDetail>('POST', `${adminRoot}/${id}/areas`, { name, kind })
export const adminUploadPlan = (id: number, areaId: number, file: File) =>
 send<TourDetail>('PUT', `${adminRoot}/${id}/areas/${areaId}/plan`, undefined, file)
export const adminRemoveArea = (id: number, areaId: number) =>
 send<TourDetail>('DELETE', `${adminRoot}/${id}/areas/${areaId}`)
export const adminUpdateArea = (id: number, areaId: number, changes: { name?: string; kind?: AreaKind }) =>
 send<TourDetail>('PATCH', `${adminRoot}/${id}/areas/${areaId}`, changes)

/* Admin: spatial context for one floor (World Labs Atlas images2PosedRGBD: a camera and a depth map per photo). */
export type SpatialCamera = {
 /** Camera-to-world pose. quaternion is XYZW; coordinateSystem 'rub' = right, up, back (looks along -Z, like three.js). */
 extrinsics: { position: [number, number, number]; quaternion: [number, number, number, number]; coordinateSystem: string }
 /** Pixels on a width x height grid, origin top-left, +y down. */
 intrinsics: { width: number; height: number; fx: number; fy: number; cx: number; cy: number }
}
export type SpatialFrame = {
 index: number
 pointId: number | null
 pointSeq: number
 camera: SpatialCamera | null
 imageUrl: string | null
 depthUrl: string | null
 confidenceUrl: string | null
}
export type SpatialContext = {
 runId: number | null
 status: 'NONE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
 error: string | null
 createdAt: string | null
 finishedAt: string | null
 photoCount: number
 /** False when the server has no WLT_API_KEY. */
 configured: boolean
 frames: SpatialFrame[]
}
const spatialUrl = (id: number, areaId: number) => `${adminRoot}/${id}/areas/${areaId}/spatial-context`
export const getSpatialContext = (id: number, areaId: number) => get<SpatialContext>(spatialUrl(id, areaId))
export const startSpatialContext = (id: number, areaId: number) => send<SpatialContext>('POST', spatialUrl(id, areaId))
