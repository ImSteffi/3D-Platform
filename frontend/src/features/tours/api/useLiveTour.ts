import { useEffect, useRef } from 'react'
import type { TourDetail } from './tourRequests'

const EVERY_MS = 4000

/**
 * Keeps a space live on screen: the customer and the team see each other's changes without reloading.
 * While the tab is visible it fetches the space every few seconds and hands it to `apply` only when it
 * changed. It skips a round while `paused` (an upload or save is in flight) so it never overwrites one.
 */
export function useLiveTour(id: number | null, load: () => Promise<TourDetail>, apply: (tour: TourDetail) => void,
 current: TourDetail | null, paused: boolean) {
 const latest = useRef({ load, apply, current, paused })
 useEffect(() => { latest.current = { load, apply, current, paused } })

 useEffect(() => {
  if (id == null) return
  let stopped = false
  const tick = async () => {
   const { load, current, paused } = latest.current
   if (stopped || paused || document.visibilityState !== 'visible' || !current) return
   try {
    const fresh = await load()
    const now = latest.current
    // Something started (or the page moved on) while this was loading: keep what is on screen.
    if (stopped || now.paused || now.current !== current) return
    if (JSON.stringify(fresh) !== JSON.stringify(current)) now.apply(fresh)
   } catch { /* A missed round is fine; the next one tries again. */ }
  }
  const timer = window.setInterval(() => { void tick() }, EVERY_MS)
  const onVisible = () => { if (document.visibilityState === 'visible') void tick() }
  document.addEventListener('visibilitychange', onVisible)
  return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
 }, [id])
}
