import Icon from '../../../../shared/ui/Icon/Icon'
import './OrganizationDetailsPage.css'
import FormPanel from '../../../../shared/ui/FormPanel/FormPanel'
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import Button from "../../../../shared/ui/Button/Button.tsx";
import TextField from "../../../../shared/ui/TextField/TextField.tsx";
import { getOrganizations, type Organization } from "../../api/organizations.ts";
import {
  createOrganizationUser,
  getOrganizationUsers,
  type OrganizationUser,
} from "../../api/organizationUsers.ts";
import OrganizationProjects from "../../../projects/components/OrganizationProjects/OrganizationProjects.tsx";

export default function OrganizationDetailsPage() {
  const { organizationId } = useParams();
  const id = Number(organizationId);

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganization() {
      try {
        const organizations = await getOrganizations();
        const found = organizations.find((item) => item.id === id);

        const members = found ? await getOrganizationUsers(id) : [];

        if (active) {
          setOrganization(found ?? null);
          setUsers(members);
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load the organization.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrganization();

    return () => {
      active = false;
    };
  }, [id]);

  function closeForm() {
    setFormOpen(false);
    setDisplayName("");
    setEmail("");
    setPassword("");
    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    const trimmedName = displayName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password.trim()) {
      setFormError("Enter a name, email and initial password.");
      return;
    }

    if (trimmedName.length > 200 || normalizedEmail.length > 254) {
      setFormError("Name or email is too long.");
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setFormError("Password must not exceed 72 bytes.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const user = await createOrganizationUser(id, {
        displayName: trimmedName,
        email: normalizedEmail,
        password,
      });

      setUsers((current) => [...current, user]);
      closeForm();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not connect to the server.",
      );
    } finally {
      setSaving(false);
    }
  }

  const organizationUsers = users.filter((user) => user.organizationId === id);

  return (
    <main className="dashboard organization-detail-page">
      <Link to="/organizations">← Back to organizations</Link>

      {loading ? (
        <p>Loading organization…</p>
      ) : loadError ? (
        <p className="field-error" role="alert">
          {loadError}
        </p>
      ) : !organization ? (
        <p>Organization not found.</p>
      ) : (
        <>
          <header className="organization-detail-heading"><div><span className="eyebrow">ORGANIZATION WORKSPACE</span><h1>{organization.name}</h1></div></header>

          <div className="organizations-heading">
            <div><h2>People</h2><p className="section-description">{organizationUsers.length} {organizationUsers.length === 1 ? 'member' : 'members'}</p></div>

            {!formOpen && (
              <Button type="button" onClick={() => setFormOpen(true)}>
                <Icon name="plus" size={14} /> Add user
              </Button>
            )}
          </div>

          {formOpen && (
            <FormPanel>
              <h2>New user</h2>

              <form className="organization-form" onSubmit={handleSubmit}>
                <fieldset
                  disabled={saving}
                  className="organization-form-fields"
                >
                  <TextField
                    id="new-display-name"
                    name="displayName"
                    label="Name"
                    value={displayName}
                    autoComplete="off"
                    onChange={setDisplayName}
                  />

                  <TextField
                    id="new-email"
                    name="email"
                    label="Email"
                    type="email"
                    value={email}
                    autoComplete="off"
                    onChange={setEmail}
                  />

                  <TextField
                    id="new-password"
                    name="password"
                    label="Password"
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    onChange={setPassword}
                  />

                  {formError && (
                    <p className="field-error" role="alert">
                      {formError}
                    </p>
                  )}

                  <div className="organization-form-actions">
                    <Button type="submit">
                      {saving ? "Creating…" : "Create user"}
                    </Button>

                    <Button type="button" variant="ghost" onClick={closeForm}>
                      Cancel
                    </Button>
                  </div>
                </fieldset>
              </form>
            </FormPanel>
          )}

          <section className="organization-list" aria-label="Users">
            {organizationUsers.length === 0 ? (
              <div className="empty-state"><Icon name="shield" size={26} /><h3>Invite your first client.</h3><p>Add a user to give them access to this organization’s projects.</p></div>
            ) : (
              <ul>
                {organizationUsers.map((user) => (
                  <li key={user.id}>
                    <span className="member-avatar">{user.displayName.slice(0,2).toUpperCase()}</span><span className="member-info"><strong>{user.displayName}</strong><span>{user.email}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <OrganizationProjects
            key={organization.id}
            organizationId={organization.id}
          />
        </>
      )}
    </main>
  );
}
