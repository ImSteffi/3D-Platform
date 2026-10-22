import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import Button from "../components/Button.tsx";
import TextField from "../components/TextField.tsx";
import { getOrganizations, type Organization } from "../organizations";

type PreviewUser = {
  id: string;
  organizationId: number;
  username: string;
};

export default function OrganizationDetailsPage() {
  const { organizationId } = useParams();
  const id = Number(organizationId);

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [users, setUsers] = useState<PreviewUser[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganization() {
      try {
        const organizations = await getOrganizations();
        const found = organizations.find((item) => item.id === id);

        if (active) {
          setOrganization(found ?? null);
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
    setUsername("");
    setPassword("");
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password) {
      setFormError("Enter a username and password.");
      return;
    }

    setUsers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        organizationId: id,
        username: trimmedUsername,
      },
    ]);

    closeForm();
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

          <p className="lede">
            User creation preview only. No accounts are saved or able to log in.
            Preview entries disappear when you leave this page.
          </p>

          {formOpen && (
            <section className="organization-form-panel">
              <h2>New user</h2>

              <form
                className="organization-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <TextField
                  id="new-username"
                  name="username"
                  label="Username"
                  value={username}
                  autoComplete="off"
                  onChange={setUsername}
                />

                <TextField
                  id="new-password"
                  name="password"
                  label="Initial password"
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
                  <Button type="submit">Add preview user</Button>

                  <Button type="button" variant="ghost" onClick={closeForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </section>
          )}

          <section className="organization-list" aria-label="Users">
            {organizationUsers.length === 0 ? (
              <p>No preview users added yet.</p>
            ) : (
              <ul>
                {organizationUsers.map((user) => (
                  <li key={user.id}>{user.username}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
