import type { TourArea, TourDetail, TourPoint, TourStatus } from '../../../tours/api/tourRequests'


/** Runs one change at a time; resolves true when it worked. Errors land in the page's inline error. */
export type Run = (action: () => Promise<TourDetail>, changesImages?: boolean) => Promise<boolean>
export type SpaceProps = {
 tour: TourDetail
 /** Bumped whenever an image on the server changed, so image URLs refetch. */
 version: number
 busy: boolean
 run: Run
 /** Shows a problem in the page's inline error; '' clears it. */
 fail: (text: string) => void
 /** Takes a fresh copy of the space from a call made outside `run`. */
 apply: (tour: TourDetail) => void
}

export const message = (reason: unknown, fallback = 'Something went wrong. Please try again.') =>
 reason instanceof Error && reason.message ? reason.message : fallback
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
export const pad = (value: number) => String(value).padStart(2, '0')

/** A capture point with its area and its number in the order the whole space is captured (1, 2, 3 … across areas). */
export type Entry = { point: TourPoint; area: TourArea; number: number }
export function entriesOf(tour: Pick<TourDetail, 'areas'>): Entry[] {
 let number = 0
 return tour.areas.flatMap(area => [...area.points].sort((a, b) => a.seq - b.seq).map(point => ({ point, area, number: ++number })))
}


/**
 * Where one floor stands. Floors move on their own: a floor added late still needs its plan while the others
 * already have photos. 'no-plan', 'retake' and 'photos' are the states that need the customer.
 */
export type FloorState = 'no-plan' | 'plan-added' | 'marking' | 'retake' | 'photos' | 'photos-in' | 'checking' | 'building'
export function floorState(status: TourStatus, area: TourArea): FloorState {
 if (!area.hasPlan) return 'no-plan'
 if (status === 'DRAFT') return 'plan-added'
 if (!area.points.length || status === 'SUBMITTED') return 'marking'
 if (status === 'PHOTOS_SUBMITTED') return 'checking'
 if (status !== 'PLAN_READY') return 'building'
 if (area.points.some(point => point.retakeNote)) return 'retake'
 return area.points.some(point => !point.hasPhoto) ? 'photos' : 'photos-in'
}
export const needsYou = (state: FloorState) => state === 'no-plan' || state === 'retake' || state === 'photos'
