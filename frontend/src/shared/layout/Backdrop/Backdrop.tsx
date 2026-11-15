import { useEffect } from 'react'
import type { ShellMode } from './backdropContext'
import './Backdrop.css'

export type BackdropProps = {
 /** Default 'place'. */
 mode?: ShellMode
 /** Ignored: the ground is always the soft ambient colour field, never a photo. Kept so callers need not change. */
 url?: string | null
}

/**
 * The fixed full-viewport layer behind everything: the soft ambient ground (dark in 'lens' mode).
 * WorkspaceLayout renders it for routed pages; pages outside the shell (sign in) render their own.
 * Sets data-mode on <html> so global styles can react.
 */
export default function Backdrop({ mode = 'place' }: BackdropProps) {
 useEffect(() => {
  const root = document.documentElement
  root.dataset.mode = mode
  return () => { delete root.dataset.mode }
 }, [mode])
 return <div className={`backdrop backdrop--${mode}`} aria-hidden="true" />
}
