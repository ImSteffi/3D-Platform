import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../../../shared/ui'
import '../../../../shared/ui/ConfirmDialog/ConfirmDialog.css'
import GalleryLinkControl from './GalleryLinkControl'
import './ShareDialog.css'

/** Admin: share this space with its owner. The link signs them in and opens this page; valid 7 days. */
export default function ShareDialog({ spaceId, ownerName, onClose }: { spaceId: number; ownerName: string; onClose: () => void }) {
 const dialog = useRef<HTMLDialogElement>(null)
 useEffect(() => {
  const element = dialog.current!
  element.showModal()
  return () => element.close()
 }, [])
 return createPortal(<dialog ref={dialog} className="confirm-dialog share-dialog" aria-labelledby="share-dialog-title"
  onCancel={event => { event.preventDefault(); onClose() }}
  onClick={event => { if (event.target === dialog.current) onClose() }}>
  <h2 id="share-dialog-title">Share with {ownerName || 'the customer'}</h2>
  <p className="confirm-dialog-description">This link opens only this space, with no sign-in. Whoever has it can add floors, floor plans and photos and send them to us, and nothing else in {ownerName ? `${ownerName}’s` : 'the'} account. It works for 7 days.</p>
  <GalleryLinkControl spaceId={spaceId} />
  <div className="confirm-dialog-actions">
   <Button variant="secondary" onClick={onClose}>Done</Button>
  </div>
 </dialog>, document.body)
}
