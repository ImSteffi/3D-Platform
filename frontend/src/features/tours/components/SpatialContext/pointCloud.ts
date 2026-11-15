import { DataTexture, FloatType, Quaternion, Vector3 } from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import type { SpatialCamera } from '../../api/tourRequests'

/** Points kept per photo, at most. The depth grid is subsampled evenly to stay under it. */
const POINTS_PER_FRAME = 60_000
/** Pixels whose confidence is below this share of the frame's highest confidence are dropped (0 always is). */
const MIN_CONFIDENCE = 0.3

// Photo pixels are sRGB; three.js expects linear vertex colours.
const toLinear = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })

export type FrameCloud = { positions: Float32Array; colors: Float32Array; count: number; medianDepth: number }

export async function loadImage(url: string): Promise<HTMLImageElement> {
 const image = new Image()
 image.decoding = 'async'
 image.src = url
 await image.decode()
 return image
}

/** Pixels of an image drawn onto a w x h grid (RGBA, top row first). */
function pixels(image: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
 const canvas = document.createElement('canvas')
 canvas.width = width; canvas.height = height
 const context = canvas.getContext('2d', { willReadFrequently: true })!
 context.drawImage(image, 0, 0, width, height)
 return context.getImageData(0, 0, width, height).data
}

async function loadDepth(url: string): Promise<{ data: Float32Array; width: number; height: number; channels: number }> {
 const loader = new EXRLoader().setDataType(FloatType)
 const texture = await loader.loadAsync(url) as DataTexture
 const { data, width, height } = texture.image as { data: Float32Array; width: number; height: number }
 texture.dispose()
 return { data, width, height, channels: Math.max(1, Math.round(data.length / (width * height))) }
}

/**
 * Unprojects one frame's linear z-depth EXR into world points coloured from its photo. RUB camera: pixel (u, v) with
 * depth z is ((u - cx) / fx * z, -(v - cy) / fy * z, -z) in camera space; the pose is camera-to-world. Three.js reads
 * EXR rows bottom-up, so image row v is data row height - 1 - v.
 */
export async function buildFrameCloud(camera: SpatialCamera, depthUrl: string, image: HTMLImageElement, confidenceUrl: string | null): Promise<FrameCloud> {
 const depth = await loadDepth(depthUrl)
 const { width, height } = depth
 const intrinsics = camera.intrinsics
 // The intrinsics may describe a different grid than the depth map: scale them onto it.
 const sx = width / (intrinsics.width || width), sy = height / (intrinsics.height || height)
 const fx = intrinsics.fx * sx, fy = intrinsics.fy * sy, cx = intrinsics.cx * sx, cy = intrinsics.cy * sy
 const color = pixels(image, width, height)
 let confidence: Uint8ClampedArray | null = null
 let threshold = 1
 if (confidenceUrl) {
  try {
   confidence = pixels(await loadImage(confidenceUrl), width, height)
   let max = 0
   for (let i = 0; i < confidence.length; i += 4) if (confidence[i] > max) max = confidence[i]
   threshold = Math.max(1, max * MIN_CONFIDENCE)
  } catch { confidence = null }
 }

 const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / POINTS_PER_FRAME)))
 const capacity = Math.ceil(width / stride) * Math.ceil(height / stride)
 const positions = new Float32Array(capacity * 3), colors = new Float32Array(capacity * 3)
 const [px, py, pz] = camera.extrinsics.position
 const [qx, qy, qz, qw] = camera.extrinsics.quaternion
 const rotation = new Quaternion(qx, qy, qz, qw).normalize()
 const point = new Vector3()
 const depths: number[] = []
 let count = 0
 for (let v = 0; v < height; v += stride) {
  const row = height - 1 - v
  for (let u = 0; u < width; u += stride) {
   const z = depth.data[(row * width + u) * depth.channels]
   if (!Number.isFinite(z) || z <= 0) continue
   const pixel = (v * width + u) * 4
   if (confidence && confidence[pixel] < threshold) continue
   point.set((u - cx) / fx * z, -(v - cy) / fy * z, -z).applyQuaternion(rotation)
   positions[count * 3] = point.x + px; positions[count * 3 + 1] = point.y + py; positions[count * 3 + 2] = point.z + pz
   colors[count * 3] = toLinear[color[pixel]]; colors[count * 3 + 1] = toLinear[color[pixel + 1]]; colors[count * 3 + 2] = toLinear[color[pixel + 2]]
   if ((count & 63) === 0) depths.push(z)
   count++
  }
 }
 depths.sort((a, b) => a - b)
 return { positions, colors, count, medianDepth: depths.length ? depths[depths.length >> 1] : 1 }
}
