import { useEffect, useRef, useState } from 'react'
import './PhotoCamera.css'

type Props = {
 /** What the next photo is for, e.g. "Photo 2 of 5". */
 caption: string
 /** False once there is nothing left to photograph. */
 canCapture: boolean
 onCapture: (file: File) => void
 onClose: () => void
}

/** A live camera box that stays on the page, so the floor plan remains visible beside it. */
export default function PhotoCamera({ caption, canCapture, onCapture, onClose }: Props) {
 const video = useRef<HTMLVideoElement>(null)
 const [ready, setReady] = useState(false)
 const [working, setWorking] = useState(false)
 const [error, setError] = useState('')
 const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
 useEffect(() => {
  if (!supported) return
  let disposed = false
  let media: MediaStream | null = null
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }).then(stream => {
   if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
   media = stream
   if (video.current) {
    video.current.srcObject = stream
    video.current.play().catch(() => { if (!disposed) setError('Could not start the camera preview. Close the camera and try again.') })
   }
  }).catch(() => { if (!disposed) setError('Could not open the camera. Allow camera access in your browser, or use “Add photos” instead.') })
  return () => {
   disposed = true
   media?.getTracks().forEach(track => track.stop())
  }
 }, [supported])
 function capture() {
  const source = video.current
  if (!source || !ready || working || !canCapture) return
  const canvas = document.createElement('canvas')
  canvas.width = source.videoWidth
  canvas.height = source.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || !canvas.height) return
  context.drawImage(source, 0, 0)
  setWorking(true)
  canvas.toBlob(blob => {
   setWorking(false)
   if (blob) onCapture(new File([blob], 'photo-' + Date.now() + '.jpg', { type: 'image/jpeg' }))
   else setError('Could not capture this photo. Please try again.')
  }, 'image/jpeg', .92)
 }
 return <section className="photo-camera" aria-label="Camera">
  <div className="photo-camera-view">
   {supported && <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} />}
   {supported && !ready && !error && <p role="status">Opening camera…</p>}
   {!supported && <p role="alert">The camera is not available in this browser. Use “Add photos” instead.</p>}
  </div>
  {error && <p className="photo-camera-error" role="alert">{error}</p>}
  <div className="photo-camera-bar">
   <span>{caption}</span>
   <div className="photo-camera-actions">
    <button type="button" className="btn btn-ghost" onClick={onClose}>Close camera</button>
    <button type="button" className="btn btn-primary" disabled={!ready || working || !canCapture} onClick={capture}>Take photo</button>
   </div>
  </div>
 </section>
}
