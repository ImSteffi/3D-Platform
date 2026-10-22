import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { login } from "../Auth.ts";
import Button from "../components/Button.tsx";
import TextField from "../components/TextField.tsx";

export default function LoginPage() {
  const [username, setUsername] = useState("");
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
      await login(username, password);
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
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Login</h1>
        <p className="lede">Enter username and password.</p>
        <TextField
          id="username"
          name="username"
          label="Username"
          value={username}
          autoComplete="username"
          onChange={setUsername}
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

        <Button type="submit">{submitting ? "Logging in…" : "Login"}</Button>
      </form>
    </main>
  );
}
