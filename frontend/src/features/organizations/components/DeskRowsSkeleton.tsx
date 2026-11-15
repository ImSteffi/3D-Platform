import { Skeleton } from '../../../shared/ui'
import '../styles/customers.css'

const widths = ['42%', '58%', '34%', '50%', '38%']

/** Rows of a desk list while they load: the mark (initials or icon), the name, and for people the email line. */
export default function DeskRowsSkeleton({ mark, rows = 4, start = 0 }: { mark: 'organization' | 'person' | 'space'; rows?: number; start?: number }) {
 return <ul className="desk-list">
  {widths.slice(0, rows).map((width, row) => <li key={row}><div className="desk-row">
   <Skeleton width={40} height={40} radius={mark === 'person' ? 999 : 12} index={start + row} />
   <span className="desk-row-text">
    <Skeleton width={width} height={15} index={start + row + 1} />
    {mark === 'person' && <Skeleton width="30%" height={12} index={start + row + 1} style={{ marginTop: 4 }} />}
   </span>
   {mark !== 'person' && <Skeleton width={18} height={18} radius={999} index={start + row + 2} />}
  </div></li>)}
 </ul>
}
