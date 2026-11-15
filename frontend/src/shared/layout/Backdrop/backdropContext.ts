import { createContext, useContext, useLayoutEffect } from 'react'

/** place: the customer's space fills the screen, glass panels float on it. desk: ambient ground only (operator). lens: full-bleed dark, no shell (camera, viewer). */
export type ShellMode = 'place' | 'desk' | 'lens'

export type BackdropState = { url: string | null; mode: ShellMode | null }
export type BackdropControls = { setUrl: (url: string | null) => void; setMode: (mode: ShellMode | null) => void }

const noop = () => {}
export const BackdropStateContext = createContext<BackdropState>({ url: null, mode: null })
export const BackdropControlsContext = createContext<BackdropControls>({ setUrl: noop, setMode: noop })

/**
 * Declare the place image behind the page (Place mode): the space's latest capture photo or tour preview.
 * Pass null/undefined while there is none; the ambient ground shows instead. Cleared when the page unmounts.
 * A failed image load falls back to the ground. Outside the workspace shell this does nothing.
 */
export function useBackdrop(url: string | null | undefined): void {
 const { setUrl } = useContext(BackdropControlsContext)
 useLayoutEffect(() => {
  setUrl(url || null)
  return () => setUrl(null)
 }, [url, setUrl])
}

/**
 * Override the shell mode for this page. Without it customers get 'place' and operators get 'desk'.
 * 'lens' removes the sidebar / bottom bar and turns the ground dark. Restored when the page unmounts.
 */
export function useShellMode(mode: ShellMode): void {
 const { setMode } = useContext(BackdropControlsContext)
 useLayoutEffect(() => {
  setMode(mode)
  return () => setMode(null)
 }, [mode, setMode])
}

/** What pages have declared. Read by the shell; pages do not need it. */
export function useBackdropState(): BackdropState {
 return useContext(BackdropStateContext)
}
