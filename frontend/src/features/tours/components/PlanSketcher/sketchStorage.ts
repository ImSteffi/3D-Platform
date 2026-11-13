// Editable sketch shapes stay on the device that drew them; the server only keeps the image.
export const sketchKey = (areaId: number) => 'tour-sketch-' + areaId

export function loadSketch<T>(key: string): T[] {
 try {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
  return Array.isArray(value) ? value as T[] : []
 } catch { return [] }
}

export function saveSketch(key: string, shapes: unknown[]) {
 try { localStorage.setItem(key, JSON.stringify(shapes)) } catch { /* The sketch still uploads. */ }
}

export function forgetSketch(key: string) {
 try { localStorage.removeItem(key) } catch { /* Storage is optional. */ }
}
