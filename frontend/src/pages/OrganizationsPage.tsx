import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import Button from "../components/Button.tsx";
import TextField from "../components/TextField.tsx";
import {
  createOrganization,
  getOrganizations,
  type Organization,
} from "../organizations";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadOrganizations() {
      try {
        const data = await getOrganizations();

        if (active) {
          setOrganizations(data);
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not connect to the server.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrganizations();

    return () => {
      active = false;
    };
  }, []);

  function closeForm() {
    setFormOpen(false);
    setName("");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    const trimmedName = name.trim();

    if (!trimmedName || trimmedName.length > 200) {
      setError("Enter an organization name of 1–200 characters.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const organization = await createOrganization(trimmedName);

      setOrganizations((current) => [...current, organization]);
      closeForm();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not connect to the server.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="dashboard">
      <Link to="/dashboard">← Back to dashboard</Link>

      <div className="organizations-heading">
        <h1>Organizations</h1>

        {!formOpen && (
          <Button type="button" onClick={() => setFormOpen(true)}>
            Add organization
          </Button>
        )}
      </div>

      <p className="lede">
        View prototype. Data added will be lost on page refresh.
      </p>

      {!formOpen && !loading && !loadError && (
        <section className="organization-form-panel">
          <h2>New organization</h2>

          <form
            className="organization-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <fieldset disabled={saving} className="organization-form-fields">
              <TextField
                id="organization-name"
                name="organizationName"
                label="Organization name"
                value={name}
                error={error}
                onChange={(value) => {
                  setName(value);
                  setError("");
                }}
              />
            </fieldset>

            <div className="organization-form-actions">
              <Button type="submit">
                {saving ? "Saving…" : "Save organization"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="organization-list" aria-label="Organization list">
        {loading ? (
          <p>Loading organizations…</p>
        ) : loadError ? (
          <p className="field-error" role="alert">
            {loadError}
          </p>
        ) : organizations.length === 0 ? (
          <p>No organizations added yet.</p>
        ) : (
          <ul>
            {organizations.map((organization) => (
              <li key={organization.id}>{organization.name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
