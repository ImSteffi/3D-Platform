/// <reference lib="webworker" />
/**
 * Decodes one iPhone HEIC photo off the page and returns it as a JPG no larger than `maxSide`.
 * Several of these run side by side (convertHeic.ts), because decoding a 48 MP photo takes seconds.
 */
import { heicTo } from 'heic-to'

type Job = { id: number; file: Blob; maxSide: number; quality: number }

self.onmessage = async (event: MessageEvent<Job>) => {
 const { id, file, maxSide, quality } = event.data
 try {
  const bitmap = await heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no canvas')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  self.postMessage({ id, jpeg })
 } catch (reason) {
  self.postMessage({ id, error: String(reason) })
 }
}
