/**
 * A cheap "is this photo too dark" check. It is plain pixel arithmetic on a tiny copy of the photo,
 * nothing more: it cannot judge focus, framing or whether the photo is usable.
 */

/** Longest side, in pixels, of the copy that is measured. */
export const SAMPLE_SIZE = 64

/**
 * Mean luma (0 = black, 255 = white) under which a photo is called dark. Deliberately low: an evenly lit
 * room averages around 100 to 140 and a dim but usable one around 60 to 80, so only clearly underexposed
 * photos trip it.
 */
export const DARK_LUMA = 45

/** Mean Rec. 601 luma (0 to 255) of RGBA pixel data. Pure. Returns 255 for no pixels, so nothing is flagged. */
export function meanLuma(rgba: ArrayLike<number>): number {
 const pixels = Math.floor(rgba.length / 4)
 if (!pixels) return 255
 let sum = 0
 for (let i = 0; i < pixels * 4; i += 4) sum += .299 * rgba[i] + .587 * rgba[i + 1] + .114 * rgba[i + 2]
 return sum / pixels
}

/** True when the pixels average darker than the threshold. Pure. */
export function looksDark(rgba: ArrayLike<number>, threshold = DARK_LUMA): boolean {
 return meanLuma(rgba) < threshold
}

/** Draws the image scaled down to SAMPLE_SIZE on a canvas and reports whether it looks dark. False if it cannot be read. */
export function imageLooksDark(source: CanvasImageSource, width: number, height: number): boolean {
 if (!width || !height) return false
 const scale = SAMPLE_SIZE / Math.max(width, height)
 const canvas = document.createElement('canvas')
 canvas.width = Math.max(1, Math.round(width * scale))
 canvas.height = Math.max(1, Math.round(height * scale))
 const context = canvas.getContext('2d', { willReadFrequently: true })
 if (!context) return false
 try {
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return looksDark(context.getImageData(0, 0, canvas.width, canvas.height).data)
 } catch {
  return false
 }
}
