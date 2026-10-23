import OrganizationMark from "../../../../shared/ui/OrganizationMark/OrganizationMark";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  getOrganizations,
  type Organization,
} from "../../../organizations/api/organizations";
import { getProjects } from "../../../projects/api/projects";
import { getScans } from "../../../scans/api/scans";
import Card from "../../../../shared/ui/Card/Card";
import Icon from "../../../../shared/ui/Icon/Icon";
import "./AdminOverview.css";
export default function AdminOverview() {
  const [data, setData] = useState<{
    organizations: Organization[];
    projects: number;
    scans: number;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const organizations = await getOrganizations();
        const groups = await Promise.all(
          organizations.map((org) => getProjects(org.id)),
        );
        const projects = groups.flat();
        const scans = await Promise.all(
          projects.map((p) => getScans(p.organizationId, p.id)),
        );
        if (active)
          setData({
            organizations,
            projects: projects.length,
            scans: scans.flat().filter((s) => s.status === "READY").length,
          });
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load workspace.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <p className="page-message field-error" role="alert">
        {error}
      </p>
    );
  if (!data)
    return (
      <p className="page-message" role="status">
        Loading your workspace…
      </p>
    );
  return (
    <>
      <div className="admin-stats">
        <Card title="Organizations" value={String(data.organizations.length)} />
        <Card title="Projects" value={String(data.projects)} />
        <Card title="Published scans" value={String(data.scans)} />
      </div>
      <section className="admin-organizations">
        <div className="section-heading">
          <div>
            <h2>Organizations</h2>
          </div>
          <Link className="text-link" to="/organizations">
            View all <Icon name="arrow" size={14} />
          </Link>
        </div>
        {data.organizations.length === 0 ? (
          <div className="empty-state">
            <Icon name="building" size={28} />
            <h3>No organizations yet.</h3>
            <Link className="btn btn-primary" to="/organizations">
              Add organization
            </Link>
          </div>
        ) : (
          <ul>
            {data.organizations.slice(0, 6).map((org, i) => (
              <li key={org.id}>
                <Link to={`/organizations/${org.id}`}>
                  <OrganizationMark variant={i} />
                  <span>
                    <strong>{org.name}</strong>
                  </span>
                  <Icon name="arrow" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
