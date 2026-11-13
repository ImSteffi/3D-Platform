import { useEffect, useRef } from 'react'

export default function TourInputGuide({ onClose }: { onClose: () => void }) {
 const dialog = useRef<HTMLDialogElement>(null)
 useEffect(() => {
  const element = dialog.current!
  element.showModal()
  return () => element.close()
 }, [])
 return <dialog ref={dialog} className="tour-input-guide-dialog" aria-labelledby="tour-input-guide-heading" onCancel={onClose}>
  <section className="tour-capture-guide">
   <span className="tour-capture-guide-eyebrow">BEFORE YOU START</span>
   <h2 id="tour-input-guide-heading">Choose the right photos or video</h2>
   <ul>
    <li><strong>Show the same space.</strong> Use photos or a video of one room or connected area.</li>
    <li><strong>For photos:</strong> choose sharp, <strong className="tour-overlapping-emphasis">overlapping</strong> views with shared features visible between shots.</li>
    <li><strong>For video:</strong> use slow, steady movement. Avoid quick turns and sudden movements.</li>
    <li><strong>Keep it clear.</strong> Use good lighting and avoid blurry or unrelated shots.</li>
   </ul>
   <button type="button" className="btn btn-primary" autoFocus onClick={onClose}>Got it, continue</button>
  </section>
 </dialog>
}
