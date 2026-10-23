import { useWorkspaceUser } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import ClientProjects from '../../../projects/components/ClientProjects/ClientProjects'
import AdminOverview from '../../components/AdminOverview/AdminOverview'
import './DashboardPage.css'

export default function DashboardPage() {
 const user = useWorkspaceUser()
 return <main className="dashboard overview-page">
  <header className="overview-heading"><h1>Overview</h1></header>
  {user.platformAdmin ? <AdminOverview /> : <ClientProjects featured />}
 </main>
}
