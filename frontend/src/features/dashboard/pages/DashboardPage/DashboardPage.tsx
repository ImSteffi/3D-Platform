import { useState } from 'react'
import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import { Link } from 'react-router'
import Icon from '../../../../shared/ui/Icon/Icon'
import AdminOverview from '../../components/AdminOverview/AdminOverview'
import './DashboardPage.css'

export default function DashboardPage() {
 const user = useWorkspaceUser()
 const [generateOpen, setGenerateOpen] = useState(false)
 return <main className={`dashboard overview-page${user.platformAdmin ? '' : ' overview-page--launcher'}`}>
  {user.platformAdmin && <header className="overview-heading"><h1>Overview</h1></header>}
  {user.platformAdmin ? <AdminOverview /> : <div className="overview-destinations">
   <Link to="/projects" className="overview-destination">
    <span className="overview-destination-icon"><Icon name="folder" size={28} /></span>
    <span className="overview-destination-title">Projects</span>
   </Link>
   {generateOpen ? <div className="overview-destination overview-generate-split" aria-label="Generate options">
    <Link autoFocus to="/generate/tour" className="overview-generate-option">
     <Icon name="scan" size={28} /><span>Tour</span>
    </Link>
    <Link to="/generate/object" className="overview-generate-option">
     <Icon name="cube" size={28} /><span>Object</span>
    </Link>
    <button type="button" className="overview-generate-close" aria-label="Close Generate options" onClick={() => setGenerateOpen(false)}><Icon name="close" size={18} /></button>
   </div> : <button type="button" className="overview-destination overview-generate-button" aria-expanded={false} onClick={() => setGenerateOpen(true)}>
    <span className="overview-destination-icon"><Icon name="scan" size={28} /></span>
    <span className="overview-destination-title">Generate</span>
   </button>}
   <Link to="/planner" className="overview-destination">
    <span className="overview-destination-icon"><Icon name="planner" size={28} /></span>
    <span className="overview-destination-title">Planner</span>
   </Link>
  </div>}
 </main>
}
