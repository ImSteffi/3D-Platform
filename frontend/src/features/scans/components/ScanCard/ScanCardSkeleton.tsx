import { Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import '../ProjectScanList/ProjectScanList.css'
import './ScanCard.css'

const names = ['62%', '48%', '56%']
const metas = ['38%', '44%', '34%']

/** Tour cards while they load: the picture, the name with its pill, and the file line. Pass `head` to also sketch the Tours heading. */
export default function ScanCardSkeleton({ label, head = false }: { label: string; head?: boolean }) {
 const start = head ? 2 : 0
 const grid = <ul className="tour-grid">
  {names.map((name, card) => {
   const at = start + card * 4
   return <li key={card}><Panel as="article" padding="none" className="tour-card">
    <Skeleton className="tour-card-media" height="auto" radius={0} index={at} />
    <div className="tour-card-body">
     <div className="tour-card-head"><Skeleton width={name} height={20} index={at + 1} /><Skeleton width={64} height={24} radius={999} index={at + 2} /></div>
     <Skeleton width={metas[card]} height={13} index={at + 3} />
    </div>
   </Panel></li>
  })}
 </ul>
 return <SkeletonGroup label={label}>
  {head ? <div className="tour-list">
   <div className="tour-list-head"><div>
    <Skeleton width={84} height={22} index={0} />
    <Skeleton width={320} height={14} index={1} style={{ marginTop: 8 }} />
   </div></div>
   {grid}
  </div> : grid}
 </SkeletonGroup>
}
