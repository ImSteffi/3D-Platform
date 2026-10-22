import { Navigate, Route, Routes } from "react-router";
import DashboardPage from "./pages/DashboardPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import OrganizationsPage from "./pages/OrganizationsPage.tsx";
import OrganizationDetailsPage from "./pages/OrganizationDetailsPage.tsx";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/organizations" element={<OrganizationsPage />} />
      <Route
        path="/organizations/:organizationId"
        element={<OrganizationDetailsPage />}
      />
      <Route path="*" element={<p>Page not found.</p>} />
    </Routes>
  );
}
