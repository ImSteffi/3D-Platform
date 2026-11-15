import type { StatusTone } from '../../../../shared/ui'
import type { TourStatus } from '../../api/tourRequests'

/** Status words from the operator's side of the desk. */
export const operatorStatus: Record<TourStatus, string> = {
 DRAFT: 'Draft',
 SUBMITTED: 'Needs a plan',
 PLAN_READY: 'Waiting for photos',
 PHOTOS_SUBMITTED: 'Photos to review',
 APPROVED: 'Ready to deliver',
 DELIVERED: 'Delivered',
}

/** Colour only where it means something: green once the tour is delivered. */
export const statusTone = (status: TourStatus): StatusTone => status === 'DELIVERED' ? 'green' : 'neutral'

export const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Point numbers are always two digits: 04, 12. */
export const pad = (value: number) => String(value).padStart(2, '0')

export function formatDate(iso: string) {
 const date = new Date(iso)
 if (Number.isNaN(date.getTime())) return ''
 return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
