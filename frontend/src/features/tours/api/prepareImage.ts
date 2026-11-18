/**
 * Turns whatever a customer picks into an image the server takes (JPG, PNG or WebP within the size limit),
 * or explains in plain words why it cannot be used. Customers send from any device, so the type is read
 * from the file's own bytes, not its name or the browser's guess (Windows often gives HEIC no type at all).
 *
 * - JPG, PNG, WebP within the limit: sent as they are, byte for byte (duplicate checks keep working).
 * - iPhone HEIC/HEIF: converted to JPG. PDF (plans only): the first page becomes an image.
 * - AVIF, GIF, BMP and anything else the browser can draw: converted to JPG.
 * - Too large: scaled down and saved as JPG.
 * - Refused with a reason: videos, panoramas (photos only), TIFF and camera RAW files.
 */
import { heicToJpeg } from './convertHeic'
import { ImageProblem } from './imageProblem'
import { pdfFirstPage } from './convertPdf'

export type ImagePurpose = 'photo' | 'plan'

const LIMIT_MB: Record<ImagePurpose, number> = { photo: 30, plan: 20 }
/**
 * Longest side after scaling down. Photos: a normal 12 MP phone photo (4032 px) is plenty for a tour;
 * a 48 MP iPhone photo is scaled to that, which makes it 3-4 times smaller and quicker to send.
 * Plans keep more detail so small room names stay readable.
 */
const MAX_SIDE: Record<ImagePurpose, number> = { photo: 4032, plan: 8000 }
/** Wider than this (long side to short side) is a panorama. A normal phone photo is 4:3, so 1.33. */
const PANORAMA_RATIO = 2.2
const JPEG_QUALITY = 0.9

type Kind = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif' | 'gif' | 'bmp' | 'tiff' | 'pdf' | 'video' | 'raw' | 'unknown'

const RAW_EXTENSIONS = ['dng', 'cr2', 'cr3', 'nef', 'arw', 'orf', 'rw2', 'raf', 'srw', 'pef']
const VIDEO_EXTENSIONS = ['mov', 'mp4', 'm4v', 'avi', 'mkv', 'webm', '3gp', 'hevc']


export { ImageProblem }

async function sniff(file: File): Promise<Kind> {
 const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())
 const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
 const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
 if (file.type.startsWith('video/') || VIDEO_EXTENSIONS.includes(extension)) return 'video'
 if (RAW_EXTENSIONS.includes(extension)) return 'raw'
 if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
 if (bytes[0] === 0x89 && text(1, 4) === 'PNG') return 'png'
 if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'webp'
 if (text(0, 4) === 'GIF8') return 'gif'
 if (text(0, 2) === 'BM') return 'bmp'
 if (text(0, 4) === '%PDF') return 'pdf'
 if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 0x2a)) return 'tiff'
 if (text(4, 8) === 'ftyp') {
  const brand = text(8, 12)
  if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic'
  if (brand === 'avif' || brand === 'avis') return 'avif'
  return 'video'
 }
 return 'unknown'
}

async function decode(blob: Blob): Promise<ImageBitmap | null> {
 try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }) }
 catch { return null }
}

/** Draws the image as a JPG, scaled down so its longest side is at most MAX_SIDE. */
async function toJpeg(bitmap: ImageBitmap, name: string, maxBytes: number, maxSide: number): Promise<File> {
 let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
 for (let attempt = 0; attempt < 4; attempt++) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) break
  // JPG has no transparency: a white background keeps plans with see-through parts readable.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (blob && blob.size <= maxBytes) return new File([blob], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  scale *= 0.75
 }
 throw new ImageProblem(`${name} could not be prepared. Send it as a JPG.`)
}

/**
 * Returns a file the server accepts, or throws an ImageProblem with a message for the customer.
 * Photos that are panoramas are refused; plans may have any shape.
 */
export async function prepareImage(file: File, purpose: ImagePurpose): Promise<File> {
 const name = file.name || 'This file'
 const maxBytes = LIMIT_MB[purpose] * 1024 * 1024
 if (!file.size) throw new ImageProblem(`${name} is empty.`)
 const kind = await sniff(file)

 switch (kind) {
  case 'video': throw new ImageProblem(`${name} is a video. We only take photos.`)
  case 'raw': throw new ImageProblem(`${name} is a camera RAW file. Send it as a JPG.`)
  case 'tiff': throw new ImageProblem(`${name} is a TIFF file. Send it as a JPG.`)
  case 'pdf':
   if (purpose !== 'plan') throw new ImageProblem(`${name} is a PDF. Photos need to be images, for example JPG.`)
   return await toJpeg(await pdfFirstPage(file), name, maxBytes, MAX_SIDE.plan)
 }

 // HEIC is decoded and scaled in a worker; what comes back is already a JPG of the right size.
 const heic = kind === 'heic' ? await heicToJpeg(file, MAX_SIDE[purpose]) : null
 const bitmap = await decode(heic ?? file)
 if (!bitmap) throw new ImageProblem(`${name} is not an image we can open. Send it as a JPG.`)
 try {
  const long = Math.max(bitmap.width, bitmap.height), short = Math.min(bitmap.width, bitmap.height)
  if (purpose === 'photo' && long / short > PANORAMA_RATIO)
   throw new ImageProblem(`${name} is a panorama. We need normal photos: stand still and take one photo at a time.`)
  if (heic && heic.size <= maxBytes) return new File([heic], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  const ready = kind === 'jpeg' || kind === 'png' || kind === 'webp'
  // Sent untouched when it already fits: same bytes, same quality, duplicate checks still match.
  if (ready && file.size <= maxBytes && long <= MAX_SIDE[purpose] && (kind !== 'jpeg' || await jpegOrientation(file) <= 1)) return file.type ? file : new File([file], name, { type: `image/${kind}` })
  return await toJpeg(bitmap, name, maxBytes, MAX_SIDE[purpose])
 } finally { bitmap.close() }
}

/** Prepares several files; the ones that cannot be used are left out and explained in one message. */
export async function prepareImages(files: File[], purpose: ImagePurpose): Promise<{ ready: File[]; problem: string | null }> {
 const ready: File[] = [], problems: string[] = []
 for (const file of files) {
  try { ready.push(await prepareImage(file, purpose)) }
  catch (reason) { problems.push(reason instanceof ImageProblem ? reason.message : `${file.name} could not be prepared. Try again.`) }
 }
 const problem = !problems.length ? null
  : problems.length === 1 ? problems[0]
  : `${problems.length} files were skipped. ${problems.slice(0, 3).join(' ')}${problems.length > 3 ? ' …' : ''}`
 return { ready, problem }
}

/** What the file pickers offer. Broad on purpose: anything is checked above. */
export const imagePickerAccept = 'image/*,.heic,.heif'
export const planPickerAccept = 'image/*,.heic,.heif,application/pdf,.pdf'

/**
 * The EXIF orientation of a JPG (1 = upright). Phones often store a portrait photo sideways with a
 * "rotate me" tag. Browsers obey the tag, but Atlas does not say it does, so such photos are redrawn
 * upright before sending (createImageBitmap applies the tag).
 */
async function jpegOrientation(file: File): Promise<number> {
 const view = new DataView(await file.slice(0, 128 * 1024).arrayBuffer())
 let offset = 2
 while (offset + 4 < view.byteLength) {
  if (view.getUint8(offset) !== 0xff) return 1
  const marker = view.getUint8(offset + 1)
  const length = view.getUint16(offset + 2)
  if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) { // APP1 "Exif"
   const tiff = offset + 10
   const little = view.getUint16(tiff) === 0x4949
   const entries = view.getUint16(tiff + view.getUint32(tiff + 4, little), little)
   const first = tiff + view.getUint32(tiff + 4, little) + 2
   for (let i = 0; i < entries; i++) {
    const entry = first + i * 12
    if (entry + 10 > view.byteLength) return 1
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little)
   }
   return 1
  }
  if (marker === 0xda) return 1 // image data starts: no EXIF before it
  offset += 2 + length
 }
 return 1
}
