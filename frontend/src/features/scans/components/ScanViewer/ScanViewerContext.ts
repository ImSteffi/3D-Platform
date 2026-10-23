import { createContext } from 'react'
export type ViewerScan = { id: number; name: string }
export const ScanViewerContext = createContext<((scan: ViewerScan, trigger: HTMLButtonElement) => void) | null>(null)