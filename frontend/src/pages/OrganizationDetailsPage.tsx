import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import Button from "../components/Button.tsx";
import TextField from "../components/TextField.tsx";
import { getOrganizations, type Organization } from "../organizations";
import {
  createOrganizationUser,
  getOrganizationUsers,
  type OrganizationUser,
} from "../organizationUsers";

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
    <main className="dashboard">
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
          <h1>{organization.name}</h1>

          <div className="organizations-heading">
            <h2>Users</h2>

            {!formOpen && (
              <Button type="button" onClick={() => setFormOpen(true)}>
                Add user
              </Button>
            )}
          </div>

          {formOpen && (
            <section className="organization-form-panel">
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
            </section>
          )}

          <section className="organization-list" aria-label="Users">
            {organizationUsers.length === 0 ? (
              <p>No users added yet.</p>
            ) : (
              <ul>
                {organizationUsers.map((user) => (
                  <li key={user.id}>
                    <strong>{user.displayName}</strong>
                    <div>{user.email}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
