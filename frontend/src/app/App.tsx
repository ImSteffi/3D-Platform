import SharedViewerPage from '../features/scans/components/ScanViewer/SharedViewerPage'
import AdminProjectPage from '../features/projects/pages/AdminProjectPage/AdminProjectPage'
import { Navigate, Route, Routes } from 'react-router'
import LoginPage from '../features/auth/pages/LoginPage/LoginPage'
import DashboardPage from '../features/dashboard/pages/DashboardPage/DashboardPage'
import OrganizationsPage from '../features/organizations/pages/OrganizationsPage/OrganizationsPage'
import OrganizationDetailsPage from '../features/organizations/pages/OrganizationDetailsPage/OrganizationDetailsPage'
import ClientProjectPage from '../features/projects/pages/ClientProjectPage/ClientProjectPage'
import ProjectsPage from '../features/projects/pages/ProjectsPage/ProjectsPage'
import WorkspaceLayout from '../shared/layout/WorkspaceLayout/WorkspaceLayout'
import NotFoundPage from '../shared/pages/NotFoundPage/NotFoundPage'
export default function App() {
 return <Routes>
  <Route path="/view/:token" element={<SharedViewerPage />} />
  <Route path="/login" element={<LoginPage />} />
  <Route element={<WorkspaceLayout />}>
   <Route path="/" element={<Navigate to="/dashboard" replace />} />
   <Route path="/dashboard" element={<DashboardPage />} />
   <Route path="/projects" element={<ProjectsPage />} />
   <Route path="/projects/:projectId" element={<ClientProjectPage />} />
   <Route path="/organizations" element={<OrganizationsPage />} />
   <Route path="/organizations/:organizationId/projects/:projectId" element={<AdminProjectPage />} />
   <Route path="/organizations/:organizationId" element={<OrganizationDetailsPage />} />
   <Route path="*" element={<NotFoundPage />} />
  </Route>
 </Routes>
}
