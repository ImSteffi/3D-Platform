import Icon from '../../../../shared/ui/Icon/Icon'
import SceneArtwork from '../../../../shared/ui/SceneArtwork/SceneArtwork'
import './LoginPage.css'
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { login } from "../../api/auth.ts";
import Button from "../../../../shared/ui/Button/Button.tsx";
import TextField from "../../../../shared/ui/TextField/TextField.tsx";

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
      navigate("/dashboard", { replace: true });
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
      <aside className="login-story">
        <a href="/" className="login-brand"><Icon name="cube" size={28} />3D Platform</a>
        <div className="login-story-body"><span className="eyebrow">YOUR WORLD, IN A NEW DIMENSION</span><h1>Every space.<br />A new perspective.</h1><p>Step closer to your projects. Explore captured spaces in one connected workspace.</p><SceneArtwork /></div>
      </aside>
      <div className="login-form-side"><form className="login-card" onSubmit={handleSubmit}>
        
        
        <TextField
          id="email"
          name="email"
          label="Email"
          type="email"
          value={email}
          autoComplete="username"
          onChange={setEmail}
        />
        <TextField
          id="password"
          name="password"
          label="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={setPassword}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <fieldset disabled={submitting} className="login-submit"><Button type="submit">{submitting ? "Signing in…" : "Sign in"}<Icon name="arrow" size={16} /></Button></fieldset>
      <p className="login-support">Need access? Contact your platform administrator.</p></form></div>
    </main>
  );
}
