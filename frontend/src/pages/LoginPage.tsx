import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { devLogin, googleSignInUrl } from "../api/auth";
import { dashboardFor, useAuth } from "../auth/useAuth";
import { apiBaseUrl, devLoginEnabled } from "../config";
import { messageForCode, readableError } from "../errors";

export function LoginPage() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  const denial = messageForCode(params.get("error"));

  if (state.status === "signed-in") {
    return <Navigate to={dashboardFor(state.user)} replace />;
  }

  return (
    <main className="login-layout">
      <section className="login-intro">
        <p className="eyebrow">FlowForge / Course cycles</p>
        <h1>Turn a semester into a clear runway.</h1>
        <p>
          Faculty set the context. Students see the right brief for their batch.
          Every cycle has one source of truth.
        </p>
        <div className="intro-rule">
          <span />
          <span />
          <span />
        </div>
      </section>
      <div className="login-card">
        <p className="card-kicker">Welcome back</p>
        <h2>Sign in to continue</h2>
        {denial && <p className="form-error banner">{denial}</p>}
        <a className="primary-button google-button" href={googleSignInUrl}>
          Sign in with Google
        </a>
        <p className="login-hint">
          Use your <strong>@nst.rishihood.edu.in</strong> account. Your role comes
          from FlowForge, never from the browser.
        </p>
        {devLoginEnabled && <DevLoginForm />}
        <small>API: {apiBaseUrl}</small>
      </div>
    </main>
  );
}

/** Sets the same refresh cookie as Google, then finishes on the same /auth/callback page. */
function DevLoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await devLogin(email, name);
      navigate("/auth/callback", { replace: true });
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="dev-login" onSubmit={submit}>
      <p className="card-kicker">Dev login (local only)</p>
      <label>
        University email
        <input
          type="email"
          value={email}
          placeholder="rahul.25csai@nst.rishihood.edu.in"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="dark-button" disabled={busy}>
        {busy ? "Signing in…" : "Dev sign in"}
      </button>
    </form>
  );
}
