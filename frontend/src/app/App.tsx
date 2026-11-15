import { Navigate, Route, Routes, useParams } from 'react-router'
import LoginPage from '../features/auth/pages/LoginPage/LoginPage'
import SpacesPage from '../features/spaces/pages/SpacesPage/SpacesPage'
import NewSpacePage from '../features/spaces/pages/NewSpacePage/NewSpacePage'
import SpacePage from '../features/spaces/pages/SpacePage/SpacePage'
import LearnPage from '../features/learn/pages/LearnPage/LearnPage'
import AdminTourRequestsPage from '../features/tours/pages/AdminTourRequestsPage/AdminTourRequestsPage'
import AdminTourRequestPage from '../features/tours/pages/AdminTourRequestPage/AdminTourRequestPage'
import SharedViewerPage from '../features/scans/components/ScanViewer/SharedViewerPage'
import AdminProjectPage from '../features/projects/pages/AdminProjectPage/AdminProjectPage'
import OrganizationDetailsPage from '../features/organizations/pages/OrganizationDetailsPage/OrganizationDetailsPage'
import UsersPage from '../features/organizations/pages/UsersPage/UsersPage'
import CustomerPage from '../features/organizations/pages/CustomerPage/CustomerPage'
import ClientProjectPage from '../features/projects/pages/ClientProjectPage/ClientProjectPage'
import WorkspaceLayout from '../shared/layout/WorkspaceLayout/WorkspaceLayout'
import RequireRole from '../shared/layout/WorkspaceLayout/RequireRole'
import NotFoundPage from '../shared/pages/NotFoundPage/NotFoundPage'

/** Legacy redirect that keeps the id: /generate/tour/7 -> /spaces/7. */
function RedirectWithId({ to }: { to: string }) {
 const { id = '' } = useParams()
 return <Navigate to={`${to}/${encodeURIComponent(id)}`} replace />
}

export default function App() {
 return <Routes>
  <Route path="/view/:token" element={<SharedViewerPage />} />
  <Route path="/login" element={<LoginPage />} />
  <Route element={<WorkspaceLayout />}>
   <Route path="/" element={<Navigate to="/spaces" replace />} />
   <Route element={<RequireRole role="customer" />}>
    <Route path="/home" element={<Navigate to="/spaces" replace />} />
    <Route path="/spaces" element={<SpacesPage />} />
    <Route path="/spaces/new" element={<NewSpacePage />} />
    <Route path="/spaces/:spaceId/:tab?" element={<SpacePage />} />
    <Route path="/learn" element={<LearnPage />} />
    <Route path="/projects/:projectId" element={<ClientProjectPage />} />
   </Route>
   <Route element={<RequireRole role="operator" />}>
    <Route path="/review" element={<AdminTourRequestsPage />} />
    <Route path="/review/:tourId" element={<AdminTourRequestPage />} />
    <Route path="/organizations" element={<Navigate to="/users" replace />} />
    <Route path="/organizations/:organizationId/projects/:projectId" element={<AdminProjectPage />} />
    <Route path="/organizations/:organizationId/people/:userId" element={<CustomerPage />} />
    <Route path="/users" element={<UsersPage />} />
    <Route path="/organizations/:organizationId" element={<OrganizationDetailsPage />} />
   </Route>
   {/* Legacy paths */}
   <Route path="/dashboard" element={<Navigate to="/spaces" replace />} />
   <Route path="/projects" element={<Navigate to="/spaces" replace />} />
   <Route path="/generate" element={<Navigate to="/spaces" replace />} />
   <Route path="/generate/tour" element={<Navigate to="/spaces/new" replace />} />
   <Route path="/generate/tour/:id" element={<RedirectWithId to="/spaces" />} />
   <Route path="/tour-requests" element={<Navigate to="/review" replace />} />
   <Route path="/tour-requests/:id" element={<RedirectWithId to="/review" />} />
   <Route path="*" element={<NotFoundPage />} />
  </Route>
 </Routes>
}
