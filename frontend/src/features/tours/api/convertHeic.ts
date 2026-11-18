import { ImageProblem } from './imageProblem'

/**
 * iPhone HEIC/HEIF to JPG in the browser (only Safari can show HEIC itself). Decoding a 48 MP photo
 * takes several seconds, so a few workers run side by side. The converter loads only when someone
 * actually picks a HEIC file. Most customers on an iPhone never get here: Safari sends JPG already.
 */
const WORKERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))

type Pending = { resolve: (jpeg: Blob) => void; reject: (reason: unknown) => void }
type Slot = { worker: Worker; busy: boolean }

let slots: Slot[] | null = null
const pending = new Map<number, Pending>()
const queue: { id: number; file: Blob; maxSide: number }[] = []
let nextId = 1

function pool(): Slot[] {
 if (slots) return slots
 slots = Array.from({ length: WORKERS }, () => {
  const slot: Slot = { worker: new Worker(new URL('./heicWorker.ts', import.meta.url), { type: 'module' }), busy: false }
  slot.worker.onmessage = (event: MessageEvent<{ id: number; jpeg?: Blob; error?: string }>) => {
   slot.busy = false
   const job = pending.get(event.data.id)
   pending.delete(event.data.id)
   if (event.data.jpeg) job?.resolve(event.data.jpeg)
   else job?.reject(new Error(event.data.error))
   pump()
  }
  return slot
 })
 return slots
}

function pump() {
 for (const slot of pool()) {
  if (slot.busy || !queue.length) continue
  const job = queue.shift()!
  slot.busy = true
  slot.worker.postMessage({ ...job, quality: 0.9 })
 }
}

/** The photo as a JPG whose longest side is at most `maxSide`. */
export async function heicToJpeg(file: File, maxSide: number): Promise<Blob> {
 try {
  return await new Promise<Blob>((resolve, reject) => {
   const id = nextId++
   pending.set(id, { resolve, reject })
   queue.push({ id, file, maxSide })
   pump()
  })
 } catch {
  throw new ImageProblem(`${file.name} could not be converted. On the iPhone, set Settings › Camera › Formats to Most Compatible, or send it as a JPG.`)
 }
}
