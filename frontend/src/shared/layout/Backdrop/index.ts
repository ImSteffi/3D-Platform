/** Holds what pages declare; mounted once by WorkspaceLayout. */
export { default as BackdropProvider } from './BackdropProvider'
/** The fixed ground + place image layer. Only needed directly by pages outside the workspace shell. */
export { default as Backdrop } from './Backdrop'
export type { BackdropProps } from './Backdrop'
/** useBackdrop(url): declare the place image. useShellMode(mode): 'place' | 'desk' | 'lens'. */
export { useBackdrop, useShellMode, useBackdropState } from './backdropContext'
export type { ShellMode } from './backdropContext'
