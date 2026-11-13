import { useEffect, useRef, useState } from 'react'
import Icon from '../../../../shared/ui/Icon/Icon'

export default function TourCamera({ onCapture, onClose }: {
 onCapture: (file: File) => void
 onClose: () => void
}) {
 const video = useRef<HTMLVideoElement>(null)
 const stream = useRef<MediaStream | null>(null)
 const recorder = useRef<MediaRecorder | null>(null)
 const alive = useRef(false)
 const [error, setError] = useState('')
 const [ready, setReady] = useState(false)
 const [recording, setRecording] = useState(false)
 const [processing, setProcessing] = useState(false)
 const [seconds, setSeconds] = useState(0)
 useEffect(() => {
  alive.current = true
  let disposed = false
  if (!navigator.mediaDevices?.getUserMedia) {
   setError('Camera access is unavailable. Use HTTPS or upload existing photos or a video instead.')
   return () => { disposed = true; alive.current = false }
  }
  void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(media => {
   if (disposed) { media.getTracks().forEach(track => track.stop()); return }
   stream.current = media
   media.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
    if (!disposed) { setReady(false); setError('Camera disconnected. Close the camera and try again.') }
   }))
   if (video.current) {
    video.current.srcObject = media
    void video.current.play().catch(() => { if (!disposed) setError('Could not start the camera preview. Close the camera and try again.') })
   }
  }).catch(() => {
   if (!disposed) setError('Could not open the camera. Allow camera access in your browser, or upload existing files.')
  })
  return () => {
   disposed = true
   alive.current = false
   if (recorder.current?.state === 'recording') recorder.current.stop()
   stream.current?.getTracks().forEach(track => track.stop())
   stream.current = null
  }
 }, [])
 useEffect(() => {
  if (!recording) return
  const timer = setInterval(() => setSeconds(value => value + 1), 1000)
  return () => clearInterval(timer)
 }, [recording])
 function takePhoto() {
  if (!video.current || !ready || processing) return
  const canvas = document.createElement('canvas')
  canvas.width = video.current.videoWidth
  canvas.height = video.current.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || !canvas.height) return
  context.drawImage(video.current, 0, 0)
  setProcessing(true)
  canvas.toBlob(blob => {
   if (!alive.current) return
   setProcessing(false)
   if (blob) onCapture(new File([blob], 'photo-' + Date.now() + '.jpg', { type: 'image/jpeg' }))
   else setError('Could not capture this photo. Please try again.')
  }, 'image/jpeg', .92)
 }
 function startRecording() {
  if (!stream.current || !ready || typeof MediaRecorder === 'undefined') return
  try {
   const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(value => MediaRecorder.isTypeSupported(value))
   const instance = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined)
   recorder.current = instance
   const chunks: Blob[] = []
   instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
   instance.onerror = () => { if (alive.current) setError('Recording failed. Please try again or upload a video.') }
   instance.onstop = () => {
    if (!alive.current) return
    setRecording(false)
    setProcessing(false)
    const blob = new Blob(chunks, { type: instance.mimeType || 'video/webm' })
    if (blob.size) onCapture(new File([blob], 'video-' + Date.now() + (blob.type.includes('mp4') ? '.mp4' : '.webm'), { type: blob.type }))
    else setError('No video was recorded. Please try again.')
   }
   instance.start(1000)
   setSeconds(0)
   setRecording(true)
  } catch { setError('Video recording is unavailable in this browser. Try taking photos or uploading a video.') }
 }
 return <section className="tour-camera" aria-label="Camera">
  <div className="tour-panel-heading"><h2>Capture your space</h2><div className="tour-camera-header-actions">
   <button type="button" className="btn btn-ghost" onClick={onClose}>Close camera</button>
  </div></div>
  <div className="tour-camera-preview">
   <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} />
   {!ready && !error && <p role="status">Opening camera…</p>}

  </div>
  {error && <p className="tour-input-error" role="alert">{error}</p>}
  <div className="tour-camera-actions">
   <button type="button" className="btn btn-primary" disabled={!ready || recording || processing} onClick={takePhoto}><Icon name="plus" />Take photo</button>
   {recording
    ? <button type="button" className="btn btn-ghost" disabled={processing} onClick={() => { setProcessing(true); recorder.current?.stop() }}>Stop recording · {seconds}s</button>
    : <button type="button" className="btn btn-ghost" disabled={!ready || processing || typeof MediaRecorder === 'undefined'} onClick={startRecording}>Record video</button>}
  </div>
 </section>
}
