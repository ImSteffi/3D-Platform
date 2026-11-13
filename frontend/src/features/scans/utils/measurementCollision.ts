import { Vec3 } from 'playcanvas'

type Metadata = {
 version?: string
 gridBounds: { min: number[]; max: number[] }
 voxelResolution: number
 leafSize: number
 treeDepth: number
 nodeCount: number
 leafDataCount: number
}
export type MeasurementCollision = { pick(origin: Vec3, direction: Vec3, maxDistance: number): Vec3 | null }

// Read the same sparse voxel format and legacy coordinate convention as SuperSplat.
export function createMeasurementCollision(meta: Metadata, data: Uint32Array): MeasurementCollision {
 const resolution = meta.voxelResolution
 if (!(resolution > 0) || meta.leafSize !== 4 || data.length < meta.nodeCount + meta.leafDataCount) {
  throw new Error('Invalid measurement collision data.')
 }
 const minimum = meta.gridBounds.min
 const maximum = meta.gridBounds.max
 const size = minimum.map((value, axis) => Math.round((maximum[axis] - value) / resolution))
 const flip = !meta.version || parseFloat(meta.version) < 1.1
 const mixed = (node: number, cell: number[]) => {
  const bit = (cell[2] & 3) * 16 + (cell[1] & 3) * 4 + (cell[0] & 3)
  const word = meta.nodeCount + (node & 0xffffff) * 2 + (bit >= 32 ? 1 : 0)
  return ((data[word] >>> (bit & 31)) & 1) !== 0
 }
 const solid = (cell: number[]) => {
  if (!meta.nodeCount || cell.some((value, axis) => value < 0 || value >= size[axis])) return false
  let index = 0
  for (let level = meta.treeDepth - 1; level >= 0; level--) {
   const node = data[index] >>> 0
   if (node === 0xff000000) return true
   const mask = node >>> 24
   if (!mask) return mixed(node, cell)
   const octant = ((cell[0] >>> (level + 2)) & 1)
    | (((cell[1] >>> (level + 2)) & 1) << 1)
    | (((cell[2] >>> (level + 2)) & 1) << 2)
   if (!(mask & (1 << octant))) return false
   let prefix = mask & ((1 << octant) - 1)
   let count = 0
   while (prefix) { prefix &= prefix - 1; count++ }
   index = (node & 0xffffff) + count
  }
  const node = data[index] >>> 0
  return node === 0xff000000 || mixed(node, cell)
 }
 return {
  pick(origin, direction, maxDistance) {
   const o = [origin.x, origin.y, origin.z]
   const d = [direction.x, direction.y, direction.z]
   if (flip) { o[0] *= -1; o[1] *= -1; d[0] *= -1; d[1] *= -1 }
   let enter = 0
   let exit = maxDistance
   for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(d[axis]) < 1e-12) {
     if (o[axis] < minimum[axis] || o[axis] >= maximum[axis]) return null
    } else {
     const first = (minimum[axis] - o[axis]) / d[axis]
     const last = (maximum[axis] - o[axis]) / d[axis]
     enter = Math.max(enter, Math.min(first, last))
     exit = Math.min(exit, Math.max(first, last))
    }
   }
   if (enter > exit) return null
   const cell = o.map((value, axis) => Math.min(size[axis] - 1, Math.max(0,
    Math.floor((value + d[axis] * (enter + resolution * 1e-6) - minimum[axis]) / resolution))))
   const step = d.map(Math.sign)
   const delta = d.map(value => Math.abs(value) < 1e-12 ? Infinity : resolution / Math.abs(value))
   const next = d.map((value, axis) => Math.abs(value) < 1e-12 ? Infinity
    : (minimum[axis] + (cell[axis] + (step[axis] > 0 ? 1 : 0)) * resolution - o[axis]) / value)
   let distance = enter
   // If the camera starts in a solid cell, find its exit rather than measuring the near plane.
   const exiting = enter === 0 && solid(cell)
   const limit = size.reduce((sum, count) => sum + count, 3)
   for (let iteration = 0; iteration < limit && distance <= exit; iteration++) {
    if (solid(cell) !== exiting) {
     return origin.clone().add(direction.clone().mulScalar(distance))
    }
    const boundary = Math.min(...next)
    if (!Number.isFinite(boundary)) return null
    distance = boundary
    for (let axis = 0; axis < 3; axis++) {
     if (next[axis] <= boundary + 1e-10) {
      cell[axis] += step[axis]
      next[axis] += delta[axis]
     }
    }
   }
   return null
  },
 }
}

export async function loadMeasurementCollision(url: string, signal: AbortSignal): Promise<MeasurementCollision | null> {
 const metadataUrl = new URL(url, location.href)
 if (!metadataUrl.pathname.endsWith('.voxel.json')) return null
 const binaryUrl = new URL(metadataUrl)
 binaryUrl.pathname = binaryUrl.pathname.replace(/\.voxel\.json$/, '.voxel.bin')
 const [metadataResponse, binaryResponse] = await Promise.all([
  fetch(metadataUrl, { signal }), fetch(binaryUrl, { signal }),
 ])
 if (!metadataResponse.ok || !binaryResponse.ok) throw new Error('Could not load measurement collision.')
 const metadata: Metadata = await metadataResponse.json()
 return createMeasurementCollision(metadata, new Uint32Array(await binaryResponse.arrayBuffer()))
}
