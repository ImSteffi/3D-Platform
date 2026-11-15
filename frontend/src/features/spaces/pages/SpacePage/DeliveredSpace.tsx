import { useContext, useEffect, useRef, useState } from 'react'
import { Button, Icon, Panel, StatusPill } from '../../../../shared/ui'
import { ScanViewerContext } from '../../../scans/components/ScanViewer/ScanViewerContext'
import ShareCards from './ShareCards'
import SpaceSections from './SpaceSections'
import type { SpaceProps } from './spaceModel'
import './DeliveredSpace.css'

type Props = SpaceProps & {
 /** Open with the share cards showing (the old /share link). */
 share: boolean
}

/** Delivered: the page is the result. The tour's preview is the backdrop; one panel opens it, sharing sits beneath. */
export default function DeliveredSpace({ share, ...props }: Props) {
 const { tour } = props
 const openViewer = useContext(ScanViewerContext)
 const [opened, setOpened] = useState(false)
 const cards = useRef<HTMLDivElement>(null)
 const scanId = tour.scanId
 const sharing = (share || opened) && scanId != null
 useEffect(() => {
  if (sharing) cards.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
 }, [sharing])
 return <div className="delivered">
  <div className="tour-stage">
   <Panel padding="lg" className="tour-ready">
    <StatusPill tone="green">Tour ready</StatusPill>
    <h2>Your tour is ready</h2>
    <p className="tour-ready-name">{tour.name}</p>
    {scanId != null ? <>
     <p className="tour-ready-text">We built it from your photos. Walk through it room by room, then share it with anyone you like.</p>
     <div className="tour-ready-actions">
      <Button size="lg" icon="play" disabled={!openViewer}
       onClick={event => openViewer?.({ id: scanId, name: tour.scanName || tour.name }, event.currentTarget as HTMLButtonElement)}>Walk through</Button>
      <Button size="lg" variant="secondary" icon="share" onClick={() => {
       setOpened(true)
       cards.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }}>Share</Button>
     </div>
    </> : <p className="tour-ready-text">We have delivered your tour, but it cannot be opened from this page yet. Reload the page in a moment. If it still does not open, get in touch with us.</p>}
   </Panel>
  </div>
  {sharing && <div ref={cards} className="delivered-share"><ShareCards scanId={scanId} name={tour.name} /></div>}
  {tour.areas.length > 0 && <details className="delivered-plans">
   <summary><Icon name="chevron" size={16} />Floor plans and photos</summary>
   <SpaceSections {...props} sectionsOnly />
  </details>}
 </div>
}
