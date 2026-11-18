import { ImageProblem } from './imageProblem'

/** Longest side of the rendered page: sharp enough to read room names on a plan. */
const TARGET_SIDE = 4000

/**
 * The first page of a PDF floor plan as an image. pdf.js loads only when someone picks a PDF.
 * Agents often send plans as PDF; only the first page is used.
 */
export async function pdfFirstPage(file: File): Promise<ImageBitmap> {
 try {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
   const page = await pdf.getPage(1)
   const base = page.getViewport({ scale: 1 })
   const viewport = page.getViewport({ scale: TARGET_SIDE / Math.max(base.width, base.height) })
   const canvas = document.createElement('canvas')
   canvas.width = Math.round(viewport.width)
   canvas.height = Math.round(viewport.height)
   const context = canvas.getContext('2d')
   if (!context) throw new Error('no canvas')
   context.fillStyle = '#fff'
   context.fillRect(0, 0, canvas.width, canvas.height)
   await page.render({ canvas, canvasContext: context, viewport }).promise
   return await createImageBitmap(canvas)
  } finally { void task.destroy() }
 } catch {
  throw new ImageProblem(`${file.name} could not be opened. Send the plan as a JPG or PNG image.`)
 }
}
