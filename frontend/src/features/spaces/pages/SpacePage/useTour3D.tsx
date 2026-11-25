import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
 getSpaceTour, getSplats, splatSourceUrl, startSplats, uploadSplatFile, type SpaceTour, type SplatStatus, type TourArea, type TourDetail,
} from '../../../tours/api/tourRequests'
import type { ConvertWhat } from './splatConvert'
import { entriesOf } from './spaceModel'
import TourEditor from './TourEditor'
import Floor3DCard, { type Converting } from './Floor3DCard'
import './Tour3DPanel.css'

/** How often the floors ask again while a 3DGS is being made. */
const SPLAT_POLL_MS = 10_000

export type Tour3D = {
 /** A floor's 3D (team only), shown in its floor card; null when the 3D is not shown here. */
 stage: (area: TourArea) => ReactNode
 /** The teleport editor while it is open. */
 editor: ReactNode
}

/** Team only: each floor's 3D work, shown inside the floor's own card. Does nothing (and fetches nothing) when not enabled. */
export function useTour3D(tour: TourDetail, enabled: boolean): Tour3D {
 const counts = useMemo(() => {
  const entries = entriesOf(tour)
  return Object.fromEntries(tour.areas.map(area => [area.id,
   entries.filter(entry => entry.area.id === area.id && entry.point.hasPhoto).length + (area.photos?.length ?? 0)]))
 }, [tour])
 const [splats, setSplats] = useState<SplatStatus[]>([])
 const anyMaking = splats.some(splat => splat.status === 'RUNNING')
 const [refresh, setRefresh] = useState(0)
 useEffect(() => {
  if (!enabled) return
  let live = true
  let timer: number | undefined
  const load = () => getSplats(tour.id)
   .then(found => { if (!live) return; setSplats(found); if (found.some(splat => splat.status === 'RUNNING')) timer = window.setTimeout(load, SPLAT_POLL_MS) })
   .catch(() => { if (live) timer = window.setTimeout(load, SPLAT_POLL_MS) })
  void load()
  return () => { live = false; window.clearTimeout(timer) }
 }, [tour.id, anyMaking, refresh, enabled])
 const splatOf = (areaId: number) => splats.find(splat => splat.areaId === areaId) ?? null
 /** Each floor's visible 3DGS, by floor id: what the tour viewer loads. */
 const scenes = useMemo(() => {
  const found: Record<number, string> = {}
  for (const splat of splats) if (splat.scene) found[splat.areaId] = splat.scene
  return found
 }, [splats])
 /** Floors that can be walked: the only ones teleports can be placed on and lead to. */
 const walkableScenes = useMemo(() => {
  const found: Record<number, string> = {}
  for (const splat of splats) if (splat.scene && splat.voxelsReady) found[splat.areaId] = splat.scene
  return found
 }, [splats])
 async function generate(areaId: number) {
  try {
   const started = await startSplats(tour.id, areaId)
   setSplats(current => [...current.filter(splat => splat.areaId !== areaId), started])
   return ''
  } catch (reason) { return reason instanceof Error ? reason.message : 'That did not go through. Please try again.' }
 }

 // Conversions run in this browser, one at a time (each uses a lot of memory and the GPU).
 const [converting, setConverting] = useState<Converting | null>(null)
 const [convertErrors, setConvertErrors] = useState<Record<number, { what: ConvertWhat; message: string }>>({})
 const running = useRef(false)
 /** Floors prepared in this visit: the list may not show it yet, and a floor is never prepared twice. */
 const prepared = useRef(new Set<number>())
 const convert = useCallback(async (areaId: number, what: ConvertWhat) => {
  if (running.current) return
  running.current = true
  setConvertErrors(current => { const next = { ...current }; delete next[areaId]; return next })
  const step = (text: string) => setConverting({ areaId, what, step: text })
  step('Starting…')
  try {
   const { convertSplat } = await import('./splatConvert')
   const files = await convertSplat(splatSourceUrl(tour.id, areaId), what, step)
   // The voxels' .bin goes first: the .json completes them.
   const order = (name: string) => name.endsWith('.json') ? 1 : 0
   for (const file of [...files].sort((a, b) => order(a.name) - order(b.name))) {
    step(`Uploading ${file.name}…`)
    await uploadSplatFile(tour.id, areaId, file.name, file.bytes)
   }
   if (what === 'sog') prepared.current.add(areaId)
  } catch (reason) {
   const message = reason instanceof Error ? reason.message : String(reason)
   setConvertErrors(current => ({ ...current, [areaId]: { what, message: `${what === 'sog' ? 'Preparing the 3DGS' : 'Generating the voxels'} failed: ${message}` } }))
  } finally {
   running.current = false
   setConverting(null)
   setRefresh(n => n + 1)
  }
 }, [tour.id])
 // A made 3DGS gets its viewer file right away, in this browser, without a button.
 useEffect(() => {
  if (converting) return
  const next = splats.find(splat => splat.status === 'SUCCEEDED' && !splat.sogReady && !convertErrors[splat.areaId]
   && !prepared.current.has(splat.areaId))
  if (!next) return
  // Started after this render, not inside it.
  const timer = window.setTimeout(() => { void convert(next.areaId, 'sog') }, 0)
  return () => window.clearTimeout(timer)
 }, [splats, converting, convertErrors, convert])
 // Closing the tab stops a conversion: ask first.
 useEffect(() => {
  if (!converting) return
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
  window.addEventListener('beforeunload', warn)
  return () => window.removeEventListener('beforeunload', warn)
 }, [converting])

 const [saved, setSaved] = useState<SpaceTour | null>(null)
 const [editing, setEditing] = useState<number | null>(null)
 const [version, setVersion] = useState(0)

 useEffect(() => {
  if (!enabled) return
  let live = true
  getSpaceTour(tour.id).then(found => { if (live) setSaved(found) }).catch(() => {})
  return () => { live = false }
 }, [tour.id, enabled])

 /** A floor's 3DGS shows the teleports once they are saved for it. */
 const tourIdFor = (areaId: number) => saved && scenes[areaId] ? saved.publicId : null

 return {
  stage: area => enabled ? <Floor3DCard key={area.id} tour={tour} area={area} photoCount={counts[area.id] ?? 0} splat={splatOf(area.id)}
   converting={converting?.areaId === area.id ? converting : null} busyElsewhere={!!converting && converting.areaId !== area.id}
   convertError={convertErrors[area.id] ?? null} tourId={tourIdFor(area.id)} version={version}
   onEdit={() => setEditing(area.id)} onGenerate={() => generate(area.id)} onConvert={what => { void convert(area.id, what) }} /> : null,
  editor: enabled && editing !== null ? <TourEditor tour={tour} areaId={editing} scenes={walkableScenes} saved={saved} onSaved={setSaved}
   onClose={() => { setEditing(null); setVersion(current => current + 1) }} /> : null,
 }
}
