/**
 * Converts a floor's 3DGS from Atlas (.spz) into what the tour viewer loads, in this browser, so the server only stores
 * files. The same splat-transform steps the first test tours were made with:
 * - 'sog': the 3DGS rotated upright as scene.sog (makes it visible, in fly mode);
 * - 'voxels': its solid parts (opacity ≥ 0.5, simplified to 250 000 splats) as scene.voxel.json/.bin, 5 cm voxels
 *   (adds walking and teleports).
 * The GPU work uses WebGPU (a recent Chrome or Brave), and the library and PlayCanvas only load when a conversion starts.
 */
export type ConvertWhat = 'sog' | 'voxels'

/** One converted file, ready to upload. */
export type ConvertedFile = { name: string; bytes: Uint8Array }

export async function convertSplat(sourceUrl: string, what: ConvertWhat, onStep: (text: string) => void): Promise<ConvertedFile[]> {
 if (!('gpu' in navigator)) throw new Error('This browser has no WebGPU. Use a recent Chrome, Edge or Brave.')
 onStep('Loading the converter…')
 const [st, pc] = await Promise.all([import('@playcanvas/splat-transform'), import('playcanvas')])

 // One GPU device for the whole conversion, made when a step first needs it.
 const gpu: { device?: InstanceType<typeof pc.WebgpuGraphicsDevice> } = {}
 const createDevice = async () => {
  if (gpu.device) return gpu.device
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const created = new pc.WebgpuGraphicsDevice(canvas, { antialias: false, depth: false, stencil: false })
  await created.createDevice()
  gpu.device = created
  return created
 }

 // The reader needs a full address: this site's, so the session cookie goes with it.
 const absolute = new URL(sourceUrl, window.location.href).href
 const slash = absolute.lastIndexOf('/')
 const fileSystem = new st.UrlReadFileSystem(absolute.slice(0, slash + 1))
 const pool = st.createChunkDataPool()
 onStep('Downloading the 3DGS…')
 const [source] = await st.readFile({ filename: absolute.slice(slash + 1), inputFormat: 'spz', fileSystem })
 if (!source) throw new Error('The 3DGS file is empty.')
 try {
  const options = { createDevice }
  // Atlas's world turned upright for the viewer, as for every tour so far.
  const upright = await st.processSourceBridged(source, [{ kind: 'rotate', value: new pc.Vec3(0, 0, 180) }], pool, options)
  const out = new st.MemoryFileSystem()
  if (what === 'sog') {
   onStep('Making the viewer file…')
   await st.writeSource({ filename: 'scene.sog', outputFormat: st.getOutputFormat('scene.sog', {}), source: upright, pool, options: {}, createDevice }, out)
  } else {
   onStep('Finding the walls and floor…')
   const solid = await st.processSourceBridged(upright, [{ kind: 'filterByValue', columnName: 'opacity', comparator: 'gte', value: 0.5 }], pool, options)
   onStep('Simplifying…')
   const proxy = await st.decimateSource(solid, pool, { targetCount: 250_000, createDevice })
   onStep('Building the voxels…')
   await st.writeSource({ filename: 'scene.voxel.json', outputFormat: 'voxel', source: proxy, pool,
    options: { voxelResolution: 0.05, opacityCutoff: 0.1 }, createDevice }, out)
  }
  return [...out.results.entries()].map(([name, bytes]) => ({ name: name.replace(/^.*\//, ''), bytes }))
 } finally {
  source.close?.()
  gpu.device?.destroy()
 }
}
