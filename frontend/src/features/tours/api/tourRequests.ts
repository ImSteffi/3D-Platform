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
 /** Came in through a gallery link: the link may delete it. */
 photoViaLink?: boolean
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
 /** The team has placed spots on this floor (the client may not see them yet), so its plan can no longer change. Older backends omit this. */
 locked?: boolean
 /** Photos added to the floor directly (ids, oldest first). Older backends omit this. */
 photos?: number[]
 /** Photos that came in through a gallery link: the only ones a link may delete. */
 linkPhotos?: number[]
 /** The team has made this floor's spatial context: its tour is being made. */
 spatialReady?: boolean
 /** An earlier or a newer plan to switch to (undo / redo). */
 canUndoPlan?: boolean
 canRedoPlan?: boolean
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

/** Set on the public gallery page: the space's calls then go through its link instead of a signed-in session. */
let galleryToken: string | null = null
export function setGalleryToken(token: string | null) { galleryToken = token }
/** True on a gallery link page: such a link may delete only the photos it added. */
export const onGalleryLink = () => galleryToken !== null
const base = (id: number) => galleryToken ? `/api/gallery/${encodeURIComponent(galleryToken)}` : `${root}/${id}`
const adminRoot = '/api/admin/tour-requests'

export const getTourRequests = () => get<TourSummary[]>(root)
export const getTourRequest = (id: number) => get<TourDetail>(`${base(id)}`)
export type AnalyticsCount = { label: string; views: number }
export type TourAnalytics = {
 totals: { views: number; visitors: number; averageSeconds: number; embeds: number }
 days: { day: string; views: number; visitors: number }[]
 sources: AnalyticsCount[]; devices: AnalyticsCount[]; regions: AnalyticsCount[]
 hours: number[]; weekdays: number[]
}
export const analyticsCsvUrl = (id: number) => `${base(id)}/analytics.csv`
export const getTourAnalytics = (id: number) => get<TourAnalytics>(`${base(id)}/analytics`)
export const createTourRequest = (name: string, notes: string) =>
 send<TourDetail>('POST', root, { name, notes: notes || null })
export const deleteTourRequest = (id: number) => send<void>('DELETE', `${base(id)}`)
export const addArea = (id: number, name: string, kind: AreaKind) =>
 send<TourDetail>('POST', `${base(id)}/areas`, { name, kind })
export const renameArea = (id: number, areaId: number, name: string) =>
 send<TourDetail>('PATCH', `${base(id)}/areas/${areaId}`, { name })
export const removeArea = (id: number, areaId: number) =>
 send<TourDetail>('DELETE', `${base(id)}/areas/${areaId}`)
/** Takes the plan off a floor; the floor and its photos stay. */
export const removePlan = (id: number, areaId: number) =>
 send<TourDetail>('DELETE', `${base(id)}/areas/${areaId}/plan`)
/** Undo (back) or redo (forward) a plan change. */
export const stepPlan = (id: number, areaId: number, forward: boolean) =>
 send<TourDetail>('POST', `${base(id)}/areas/${areaId}/plan/${forward ? 'forward' : 'back'}`)
export const uploadPlan = (id: number, areaId: number, file: File) =>
 send<TourDetail>('PUT', `${base(id)}/areas/${areaId}/plan`, undefined, file)
export const submitTourRequest = (id: number) => send<TourDetail>('POST', `${base(id)}/submit`)
export const uploadPhoto = (id: number, pointId: number, file: File) =>
 send<TourDetail>('PUT', `${base(id)}/points/${pointId}/photo`, undefined, file)
export const deletePhoto = (id: number, pointId: number) =>
 send<TourDetail>('DELETE', `${base(id)}/points/${pointId}/photo`)
export const submitPhotos = (id: number) => send<TourDetail>('POST', `${base(id)}/photos/submit`)

export const planUrl = (id: number, areaId: number, version = 0) =>
 `${base(id)}/areas/${areaId}/plan?v=${version}`
export const photoUrl = (id: number, pointId: number, version = 0) =>
 `${base(id)}/points/${pointId}/photo?v=${version}`

export const getAdminTourRequests = () => get<TourSummary[]>(adminRoot)
export const saveAreaPoints = (id: number, areaId: number, captureGroup: number, points: PointInput[]) =>
 send<TourDetail>('PUT', `${adminRoot}/${id}/areas/${areaId}/points`, { captureGroup, points })
export const createPoint = (id: number, areaId: number, point: PointInput) =>
 send<TourDetail>('POST', `${adminRoot}/${id}/areas/${areaId}/points`, point)
export const updatePoint = (id: number, pointId: number, changes: Partial<PointInput>) =>
 send<TourDetail>('PATCH', `${adminRoot}/${id}/points/${pointId}`, changes)
export const deletePoint = (id: number, pointId: number) =>
 send<TourDetail>('DELETE', `${adminRoot}/${id}/points/${pointId}`)
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
 * "11 photos to go", "With the team: preparing your capture plan", "Your tour is ready".
 * Give it a TourDetail to get real photo counts; a TourSummary gets generic wording.
 */
export function nextMoveLine(tour: TourSummary | TourDetail): string {
 switch (tour.status) {
  case 'DRAFT': return 'Add your floor plan'
  case 'SUBMITTED': return 'With the team: preparing your capture plan'
  case 'PLAN_READY': {
   if (!('areas' in tour)) return 'Take your photos'
   const { total, taken, retakes } = photoCounts(tour)
   const left = total - taken - retakes
   if (left > 0) return `${plural(left, 'photo')} to go`
   if (retakes > 0) return `${plural(retakes, 'photo')} to retake`
   return 'Send your photos to the team'
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
/* Admin: change or remove a customer's account (admins are managed on the Team list). */
const adminCustomersRoot = '/api/admin/customers'
export type CustomerRemoval = { spaces: number; heirName: string | null; heirEmail: string | null }
export const updateCustomer = (userId: number, changes: { displayName: string; email: string; password?: string }) =>
 send<{ id: number; displayName: string; email: string }>('PUT', `${adminCustomersRoot}/${userId}`, changes)
export const getCustomerRemoval = (userId: number) => send<CustomerRemoval>('GET', `${adminCustomersRoot}/${userId}/removal`)
export const deleteCustomer = (userId: number) => send<void>('DELETE', `${adminCustomersRoot}/${userId}`)
export const getAdminUserTourRequests = (userId: number) =>
 adminGet<TourSummary[]>(`${adminUsersRoot}/${userId}/tour-requests`, 'The server does not list this person’s spaces yet.')
export const adminAddArea = (id: number, name: string, kind: AreaKind) =>
 send<TourDetail>('POST', `${adminRoot}/${id}/areas`, { name, kind })
export const adminUploadPlan = (id: number, areaId: number, file: File) =>
 send<TourDetail>('PUT', `${adminRoot}/${id}/areas/${areaId}/plan`, undefined, file)
export const adminStepPlan = (id: number, areaId: number, forward: boolean) =>
 send<TourDetail>('POST', `${adminRoot}/${id}/areas/${areaId}/plan/${forward ? 'forward' : 'back'}`)
export const adminRemovePlan = (id: number, areaId: number) =>
 send<TourDetail>('DELETE', `${adminRoot}/${id}/areas/${areaId}/plan`)
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
 /** While running: our photos going to Atlas, or Atlas working on them. Runs on the server. */
 phase: 'UPLOADING' | 'PROCESSING' | null
 uploaded: number
 total: number
 error: string | null
 createdAt: string | null
 finishedAt: string | null
 photoCount: number
 /** False when the server has no WLT_API_KEY. */
 configured: boolean
 frames: SpatialFrame[]
 /** Gallery photos added after this run: not in it yet. */
 newPhotoIds?: number[]
 /** Photos the run used that were deleted since: it should be made again. */
 removedPhotos?: number
}
const spatialUrl = (id: number, areaId: number) => `${adminRoot}/${id}/areas/${areaId}/spatial-context`
export const getSpatialContext = (id: number, areaId: number) => get<SpatialContext>(spatialUrl(id, areaId))
export const startSpatialContext = (id: number, areaId: number) => send<SpatialContext>('POST', spatialUrl(id, areaId))
/** Deletes the floor's spatial context, to generate it again from the right photos. */
export const deleteSpatialContext = (id: number, areaId: number) => send<SpatialContext>('DELETE', spatialUrl(id, areaId))

/* Admin: a space the team starts for a customer, named after the address. */
export const adminCreateSpaceForUser = (userId: number, name: string) =>
 send<TourDetail>('POST', `${adminUsersRoot}/${userId}/tour-requests`, { name })

/* Admin: the gallery link. Opening it signs the space's owner in and opens the space. Valid 7 days. */
export type GalleryLink = { path: string; url: string | null; expiresAt: string }
const galleryUrl = (id: number) => `${adminRoot}/${id}/gallery-link`
export async function getGalleryLink(id: number): Promise<GalleryLink | null> {
 const response = await fetch(galleryUrl(id), { credentials: 'same-origin', cache: 'no-store' })
 await check(response)
 const text = await response.text()
 return text ? JSON.parse(text) : null
}
export const createGalleryLink = (id: number) => send<GalleryLink>('POST', galleryUrl(id))
export const revokeGalleryLink = (id: number) => send<void>('DELETE', galleryUrl(id))


/* Photos added to a floor straight away, without a plan or capture points. */
export const addFloorPhoto = (id: number, areaId: number, file: File) =>
 send<TourDetail>('POST', `${base(id)}/areas/${areaId}/photos`, undefined, file)
export const deleteFloorPhoto = (id: number, photoId: number) =>
 send<TourDetail>('DELETE', `${base(id)}/floor-photos/${photoId}`)
export const floorPhotoUrl = (id: number, photoId: number) => `${base(id)}/floor-photos/${photoId}`

/** The team's overview of the whole platform (Analytics page). */
export type AdminCount = { label: string; count: number }
export type AdminAnalytics = {
 totals: { customers: number; organizations: number; spaces: number; floors: number; views: number; visitors: number; averageSeconds: number; embeds: number }
 days: { day: string; spaces: number; photos: number; views: number }[]
 topSpaces: { id: number; name: string; customer: string; views: number; averageSeconds: number }[]
 sources: AdminCount[]; devices: AdminCount[]; regions: AdminCount[]
}
export const getAdminAnalytics = () => get<AdminAnalytics>('/api/admin/analytics')

/* Admin: a space's combined 3D tour, its floors' 3DGS joined by teleports the team places. */
/** Where people stand and look: eye position, heading and up/down angle in degrees (pitch 0 is level). */
export type TourPose = { areaId: number; position: [number, number, number]; yaw: number; pitch?: number | null }
/** A portal: a ring at `position` on `from` leads to `arrive`; a ring at `arrive` leads back to `back`. */
export type Teleport = { id: string; from: number; position: [number, number, number]; to: number; arrive: TourPose; back?: TourPose | null; label: string
 /** The second ring's own name; empty shows the floor it leads to (as for `label` on the first ring). */
 backLabel?: string
 /** Each ring's radius in metres (first ring, then the way back); unset is the viewer's default 0.45. */
 radius?: number | null
 backRadius?: number | null }
export type SpaceTourDefinition = { start: TourPose | null; scenes: Record<string, string>; teleports: Teleport[]
 /** Where people start on each floor (by floor id) when they open it directly, not through a teleport. */
 spawns?: Record<string, TourPose> }
export type SpaceTour = { publicId: string; definition: SpaceTourDefinition; updatedAt: string }
const spaceTourUrl = (id: number) => `${adminRoot}/${id}/space-tour`
/** The saved tour, or null when the space has none yet. */
export async function getSpaceTour(id: number): Promise<SpaceTour | null> {
 const response = await fetch(spaceTourUrl(id), { credentials: 'same-origin', cache: 'no-store' })
 await check(response)
 return response.status === 204 ? null : response.json()
}
export const saveSpaceTour = (id: number, definition: SpaceTourDefinition) => send<SpaceTour>('PUT', spaceTourUrl(id), definition)
/** The page that shows a combined tour; its address is what gets shared. */
export const spaceTourPath = (publicId: string) => `/tour-viewer/tour.html?tour=${encodeURIComponent(publicId)}`

/* Admin: a floor's 3DGS, made by Atlas posedImages2Splats from its spatial context and converted for the tour viewer. */
export type SplatStatus = {
 areaId: number
 status: 'NONE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
 /** While running: our files going to Atlas, Atlas making it, or our server storing its result. Once failed: STORING if Atlas had finished. */
 phase: 'UPLOADING' | 'PROCESSING' | 'STORING' | null
 error: string | null
 /** Files uploaded to Atlas so far, of all, while UPLOADING. */
 uploaded: number
 total: number
 /** The folder the tour viewer loads (?scene=), once it is made. */
 scene: string | null
 /** Made, and converted in a browser into the viewer's file: visible (fly mode). */
 sogReady: boolean
 /** Its voxels are made too: walking and teleports. */
 voxelsReady: boolean
 splatCount: number | null
 createdAt: string | null
 finishedAt: string | null
 configured: boolean
 /** Failed after Atlas finished: trying again only fetches the result again, without Atlas credits. */
 retryFree: boolean
}
export const getSplats = (id: number) => get<SplatStatus[]>(`${adminRoot}/${id}/splats`)
/** Spends Atlas credits, unless it only converts a kept result again (retryFree). */
export const startSplats = (id: number, areaId: number) => send<SplatStatus>('POST', `${adminRoot}/${id}/areas/${areaId}/splats`)
/** Atlas's .spz of a floor's made 3DGS, which the browser converts into the viewer's files. */
export const splatSourceUrl = (id: number, areaId: number) => `${adminRoot}/${id}/areas/${areaId}/splats/source.spz`
/** Uploads one converted file: scene.sog, or scene.voxel.bin then scene.voxel.json. */
export const uploadSplatFile = (id: number, areaId: number, name: string, bytes: Uint8Array) =>
 send<SplatStatus>('PUT', `${adminRoot}/${id}/areas/${areaId}/splats/files/${encodeURIComponent(name)}`, undefined,
  new File([bytes as BlobPart], name, { type: name.endsWith('.json') ? 'application/json' : 'application/octet-stream' }))
