import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/features/scans/utils/measurementCollision.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } })
const { createMeasurementCollision } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
class Vector {
 constructor(x, y, z) { Object.assign(this, { x, y, z }) }
 clone() { return new Vector(this.x, this.y, this.z) }
 mulScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this }
 add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this }
}
const metadata = {
 version: '1.1', gridBounds: { min: [0, 0, 0], max: [4, 4, 4] },
 voxelResolution: 1, leafSize: 4, treeDepth: 0, nodeCount: 1, leafDataCount: 2,
}
test('ray hits collision boundary and misses parallel rays outside bounds', () => {
 const collision = createMeasurementCollision(metadata, new Uint32Array([0xff000000, 0, 0]))
 assert.deepEqual(collision.pick(new Vector(-2, 2, 2), new Vector(1, 0, 0), 10), new Vector(0, 2, 2))
 assert.equal(collision.pick(new Vector(-2, 5, 2), new Vector(1, 0, 0), 10), null)
 assert.equal(collision.pick(new Vector(-2, 2, 2), new Vector(1, 0, 0), 1), null)
})
test('sparse leaf masks select the actual occupied voxel', () => {
 // x=2, y=1, z=1 -> bit 22
 const collision = createMeasurementCollision(metadata, new Uint32Array([0, 1 << 22, 0]))
 assert.deepEqual(collision.pick(new Vector(-2, 1.5, 1.5), new Vector(1, 0, 0), 10), new Vector(2, 1.5, 1.5))
 assert.equal(collision.pick(new Vector(-2, 2.5, 1.5), new Vector(1, 0, 0), 10), null)
})
test('legacy coordinates flip X and Y', () => {
 const collision = createMeasurementCollision({ ...metadata, version: '1.0' }, new Uint32Array([0xff000000, 0, 0]))
 assert.deepEqual(collision.pick(new Vector(2, -2, 2), new Vector(-1, 0, 0), 10), new Vector(0, -2, 2))
})
test('octree child offsets and upper leaf masks work', () => {
 const meta = { ...metadata, gridBounds: { min: [0, 0, 0], max: [8, 8, 8] }, treeDepth: 1, nodeCount: 2 }
 // Only octant 7 exists. Its mixed leaf contains local x=1,y=1,z=3 (bit 53).
 const collision = createMeasurementCollision(meta, new Uint32Array([0x80000001, 0, 0, 1 << 21]))
 assert.deepEqual(collision.pick(new Vector(0, 5.5, 7.5), new Vector(1, 0, 0), 10), new Vector(5, 5.5, 7.5))
})
test('a camera inside solid collision measures the exit surface', () => {
 const collision = createMeasurementCollision(metadata, new Uint32Array([0xff000000, 0, 0]))
 assert.deepEqual(collision.pick(new Vector(2, 2, 2), new Vector(1, 0, 0), 10), new Vector(4, 2, 2))
})
