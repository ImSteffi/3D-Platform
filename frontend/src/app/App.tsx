import NewTourRequestPage from '../features/tours/pages/TourRequestPage/NewTourRequestPage'
import TourRequestPage from '../features/tours/pages/TourRequestPage/TourRequestPage'
import AdminTourRequestsPage from '../features/tours/pages/AdminTourRequestsPage/AdminTourRequestsPage'
import AdminTourRequestPage from '../features/tours/pages/AdminTourRequestPage/AdminTourRequestPage'
import GenerateObjectPage from '../features/tours/pages/GenerateTourPage/GenerateObjectPage'
import PlannerPage from '../features/planner/pages/PlannerPage/PlannerPage'
import GeneratePage from '../features/tours/pages/GenerateTourPage/GenerateTourPage'
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
   <Route path="/generate" element={<GeneratePage />} />
   <Route path="/generate/tour" element={<NewTourRequestPage />} />
   <Route path="/generate/tour/:tourId" element={<TourRequestPage />} />
   <Route path="/tour-requests" element={<AdminTourRequestsPage />} />
   <Route path="/tour-requests/:tourId" element={<AdminTourRequestPage />} />
   <Route path="/generate/object" element={<GenerateObjectPage />} />
   <Route path="/generate-tour" element={<Navigate to="/generate/tour" replace />} />
   <Route path="/planner" element={<PlannerPage />} />
   <Route path="/projects/:projectId" element={<ClientProjectPage />} />
   <Route path="/organizations" element={<OrganizationsPage />} />
   <Route path="/organizations/:organizationId/projects/:projectId" element={<AdminProjectPage />} />
   <Route path="/organizations/:organizationId" element={<OrganizationDetailsPage />} />
   <Route path="*" element={<NotFoundPage />} />
  </Route>
 </Routes>
}
