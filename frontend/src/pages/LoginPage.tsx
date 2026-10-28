import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { devLogin, googleSignInUrl, listDemoAccounts } from "../api/auth";
import { dashboardFor, useAuth } from "../auth/useAuth";
import { apiBaseUrl, devLoginEnabled } from "../config";
import { messageForCode, readableError } from "../errors";
import type { DemoAccount } from "../types";

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
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // An API with dev login off answers 404; the form then simply has no list.
    listDemoAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  const signIn = async (account: { email: string; name: string }) => {
    setBusy(true);
    setError("");
    try {
      await devLogin(account.email, account.name);
      navigate("/auth/callback", { replace: true });
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void signIn({ email, name });
  };

  return (
    <form className="dev-login" onSubmit={submit}>
      <p className="card-kicker">Dev login (local only)</p>
      {accounts.length > 0 && (
        <DemoAccountPicker
          accounts={accounts}
          disabled={busy}
          onPick={signIn}
        />
      )}
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

/** Admins (coordinators included), faculty, then students one batch at a time. */
function groupDemoAccounts(accounts: DemoAccount[]) {
  const batches = [
    ...new Set(
      accounts.flatMap((account) =>
        account.role === "STUDENT" && account.batchYear
          ? [account.batchYear]
          : [],
      ),
    ),
  ].sort();
  return [
    {
      title: "Admin and coordinators",
      members: accounts.filter((account) => account.role === "ADMIN"),
    },
    {
      title: "Faculty",
      members: accounts.filter((account) => account.role === "FACULTY"),
    },
    ...batches.map((batch) => ({
      title: `Students, batch ${batch}`,
      members: accounts.filter(
        (account) => account.role === "STUDENT" && account.batchYear === batch,
      ),
    })),
  ].filter((group) => group.members.length > 0);
}

function DemoAccountPicker({
  accounts,
  disabled,
  onPick,
}: {
  accounts: DemoAccount[];
  disabled: boolean;
  onPick: (account: DemoAccount) => void;
}) {
  return (
    <div className="demo-accounts" role="group" aria-label="Demo accounts">
      <p className="demo-hint">
        One click signs in. Run <code>npm run seed:demo</code> in backend/ first
        so staff get their roles.
      </p>
      {groupDemoAccounts(accounts).map(({ title, members }) => (
        <div key={title}>
          <p className="demo-group">{title}</p>
          <ul className="demo-list">
            {members.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="demo-account"
                  title={account.email}
                  disabled={disabled}
                  onClick={() => onPick(account)}
                >
                  {account.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="demo-group">Or any university email</p>
    </div>
  );
}
