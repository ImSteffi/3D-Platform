import { useMemo, useState, type ReactNode } from 'react'
import { BackdropControlsContext, BackdropStateContext, type BackdropState, type ShellMode } from './backdropContext'

/** Holds the place image and shell mode that pages declare with useBackdrop / useShellMode. Mounted by WorkspaceLayout. */
export default function BackdropProvider({ children }: { children: ReactNode }) {
 const [url, setUrl] = useState<string | null>(null)
 const [mode, setMode] = useState<ShellMode | null>(null)
 const controls = useMemo(() => ({ setUrl, setMode }), [])
 const state = useMemo<BackdropState>(() => ({ url, mode }), [url, mode])
 return <BackdropControlsContext.Provider value={controls}>
  <BackdropStateContext.Provider value={state}>{children}</BackdropStateContext.Provider>
 </BackdropControlsContext.Provider>
}
