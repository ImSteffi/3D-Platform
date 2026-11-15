import type { SelectedSceneFile } from './utils/sceneFiles'

export type ScanDraft = {
 id: string
 name: string
 files: SelectedSceneFile[]
}

/** Where an upload stands: what is happening now, and how much of the total has been sent (0–100). */
export type UploadProgressState = {
 label: string
 percent: number
}
