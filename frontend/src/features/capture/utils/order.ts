import type { TourArea, TourDetail, TourPoint } from '../../tours/api/tourRequests'

/** One capture point with its area and its place in the overall order (areas in order, points by seq). */
export type OrderedPoint = { point: TourPoint; area: TourArea; index: number }

export type PointState = 'taken' | 'retake' | 'todo'

export function orderedPoints(tour: Pick<TourDetail, 'areas'>): OrderedPoint[] {
 const list: OrderedPoint[] = []
 for (const area of tour.areas) {
  for (const point of [...area.points].sort((a, b) => a.seq - b.seq)) list.push({ point, area, index: list.length })
 }
 return list
}

export const isRetake = (point: TourPoint) => !!point.retakeNote
export const needsPhoto = (point: TourPoint) => !point.hasPhoto || isRetake(point)
export const pointState = (point: TourPoint): PointState => isRetake(point) ? 'retake' : point.hasPhoto ? 'taken' : 'todo'

/**
 * Where a session opens: the asked-for point if it exists, else the first retake, else the first point
 * without a photo. -1 when nothing is left to photograph.
 */
export function startIndex(list: OrderedPoint[], startPointId?: number): number {
 if (startPointId !== undefined) {
  const asked = list.findIndex(item => item.point.id === startPointId)
  if (asked >= 0) return asked
 }
 const retake = list.findIndex(item => isRetake(item.point))
 return retake >= 0 ? retake : list.findIndex(item => !item.point.hasPhoto)
}

/**
 * The point to go to after `from` (which is left out, so "Skip for now" always moves on when it can).
 * Retakes come first; within retakes, and then within points that have no photo, it is the next one
 * after `from` in capture order, wrapping round to the start. -1 when no other point needs a photo.
 */
export function nextIndex(list: OrderedPoint[], from: number): number {
 const after = (wanted: (point: TourPoint) => boolean) => {
  for (let step = 1; step < list.length + 1; step++) {
   const index = (((from + step) % list.length) + list.length) % list.length
   if (index !== from && wanted(list[index].point)) return index
  }
  return -1
 }
 if (!list.length) return -1
 const retake = after(isRetake)
 return retake >= 0 ? retake : after(point => !point.hasPhoto)
}
