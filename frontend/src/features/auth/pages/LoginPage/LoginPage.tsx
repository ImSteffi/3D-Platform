import './LoginPage.css'
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { login } from "../../api/auth.ts";
import Backdrop from "../../../../shared/layout/Backdrop/Backdrop.tsx";
import { Button, Field, Icon, InlineError, Panel } from "../../../../shared/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      await login(email, password);
      navigate("/home", { replace: true });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Connection to server failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <Backdrop />
      <Panel as="div" padding="lg" className="login-panel">
        <p className="login-brand"><span className="login-brand-symbol"><Icon name="cube" size={18} /></span>3D Platform</p>
        <h1>Sign in</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <Field
            id="email"
            name="email"
            label="Email"
            type="email"
            value={email}
            autoComplete="username"
            inputMode="email"
            required
            onChange={setEmail}
          />
          <Field
            id="password"
            name="password"
            label="Password"
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={setPassword}
          />
          <InlineError>{error}</InlineError>
          <Button type="submit" size="lg" block loading={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="login-support">No account yet? Accounts are set up by our team. Ask the person who arranged your tour.</p>
      </Panel>
    </main>
  );
}
