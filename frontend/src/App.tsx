import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  closeCycle,
  createCycle,
  getCycle,
  listCycles,
  listMyCycles,
  login,
  publishCycle,
  updateCycle,
} from "./api";
import { apiBaseUrl } from "./config";
import type { AuthResponse, Cycle, CycleInput, User } from "./types";
import "./App.css";

const tokenKey = "flowforge.token";
const userKey = "flowforge.user";

function readUser(): User | null {
  const value = localStorage.getItem(userKey);
  return value ? (JSON.parse(value) as User) : null;
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not published";
}

function localDateInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 86400000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoDate(value: string) {
  return new Date(value).toISOString();
}

function readableError(error: unknown) {
  if (!(error instanceof ApiError))
    return "Something went wrong. Check the API and try again.";
  const messages: Record<string, string> = {
    CYCLE_FIELD_LOCKED: "That field is locked once a cycle is published.",
    CYCLE_ALREADY_CLOSED: "Closed cycles are immutable.",
    INVALID_DEADLINE: "The submission start must be before the deadline.",
    NOT_CYCLE_OWNER: "Only the faculty owner can manage this cycle.",
    UNAUTHORIZED_BATCH_ACCESS: "This cycle is not available for your batch.",
    CYCLE_NOT_FOUND: "That cycle is not available.",
  };
  return (error.code && messages[error.code]) || error.message;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey));
  const [user, setUser] = useState<User | null>(readUser);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  };

  const completeLogin = (response: AuthResponse) => {
    localStorage.setItem(tokenKey, response.accessToken);
    localStorage.setItem(userKey, JSON.stringify(response.user));
    setToken(response.accessToken);
    setUser(response.user);
    navigate(
      response.user.role === "FACULTY" ? "/faculty/cycles" : "/student/cycles",
    );
  };

  const logout = () => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setToken(null);
    setUser(null);
    navigate("/");
  };

  if (!token || !user) return <LoginScreen onLogin={completeLogin} />;

  return (
    <div className="app-frame">
      <header className="topbar">
        <button
          className="brand"
          onClick={() =>
            navigate(
              user.role === "FACULTY" ? "/faculty/cycles" : "/student/cycles",
            )
          }
        >
          <span className="brand-mark">F</span>
          <span>FlowForge</span>
        </button>
        <div className="account-menu">
          <span>{user.name}</span>
          <span className="role-chip">{user.role}</span>
          <button className="text-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page-content">
        {user.role === "FACULTY" ? (
          <FacultyArea path={path} token={token} navigate={navigate} />
        ) : (
          <StudentArea
            path={path}
            token={token}
            user={user}
            navigate={navigate}
          />
        )}
      </main>
    </div>
  );
}

function LoginScreen({
  onLogin,
}: {
  onLogin: (response: AuthResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await login(email, password));
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

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
      <form className="login-card" onSubmit={submit}>
        <p className="card-kicker">Welcome back</p>
        <h2>Sign in to continue</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <small>API: {apiBaseUrl}</small>
      </form>
    </main>
  );
}

function FacultyArea({
  path,
  token,
  navigate,
}: {
  path: string;
  token: string;
  navigate: (path: string) => void;
}) {
  const editMatch = path.match(/^\/faculty\/cycles\/([^/]+)\/edit$/);
  const detailMatch = path.match(/^\/faculty\/cycles\/([^/]+)$/);
  if (path === "/faculty/cycles/new")
    return <CycleEditor token={token} navigate={navigate} />;
  if (editMatch)
    return (
      <CycleEditor token={token} cycleId={editMatch[1]} navigate={navigate} />
    );
  if (detailMatch)
    return (
      <CycleDetail
        token={token}
        cycleId={detailMatch[1]}
        faculty
        navigate={navigate}
      />
    );
  return <FacultyList token={token} navigate={navigate} />;
}

function StudentArea({
  path,
  token,
  user,
  navigate,
}: {
  path: string;
  token: string;
  user: User;
  navigate: (path: string) => void;
}) {
  const detailMatch = path.match(/^\/student\/cycles\/([^/]+)$/);
  if (detailMatch)
    return (
      <CycleDetail
        token={token}
        cycleId={detailMatch[1]}
        faculty={false}
        navigate={navigate}
      />
    );
  return <StudentList token={token} user={user} navigate={navigate} />;
}

function CycleListShell({
  eyebrow,
  title,
  action,
  error,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  error: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {error && <p className="form-error banner">{error}</p>}
      {children}
    </section>
  );
}

function FacultyList({
  token,
  navigate,
}: {
  token: string;
  navigate: (path: string) => void;
}) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    listMyCycles(token)
      .then(setCycles)
      .catch((caught) => setError(readableError(caught)));
  }, [token]);
  const transition = async (cycle: Cycle, action: "publish" | "close") => {
    if (
      !window.confirm(
        `${action === "publish" ? "Publish" : "Close"} this cycle?`,
      )
    )
      return;
    try {
      const updated =
        action === "publish"
          ? await publishCycle(token, cycle.id)
          : await closeCycle(token, cycle.id);
      setCycles((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(readableError(caught));
    }
  };
  return (
    <CycleListShell
      eyebrow="Faculty workspace"
      title="Course cycles"
      action={
        <button
          className="primary-button compact"
          onClick={() => navigate("/faculty/cycles/new")}
        >
          + New cycle
        </button>
      }
      error={error}
    >
      {cycles.length === 0 ? (
        <EmptyState
          title="No cycles yet"
          body="Create the academic context your students will work inside."
        />
      ) : (
        <div className="cycle-grid">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              faculty
              onOpen={() => navigate(`/faculty/cycles/${cycle.id}`)}
              onEdit={() => navigate(`/faculty/cycles/${cycle.id}/edit`)}
              onAction={(action) => transition(cycle, action)}
            />
          ))}
        </div>
      )}
    </CycleListShell>
  );
}

function StudentList({
  token,
  user,
  navigate,
}: {
  token: string;
  user: User;
  navigate: (path: string) => void;
}) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    listCycles(token)
      .then(setCycles)
      .catch((caught) => setError(readableError(caught)));
  }, [token]);
  return (
    <CycleListShell
      eyebrow={`Student workspace / Batch ${user.batchYear ?? "unassigned"}`}
      title="Open cycles"
      error={error}
    >
      {cycles.length === 0 ? (
        <EmptyState
          title="Nothing open for your batch"
          body="Published course cycles for your cohort will appear here."
        />
      ) : (
        <div className="cycle-grid">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              onOpen={() => navigate(`/student/cycles/${cycle.id}`)}
            />
          ))}
        </div>
      )}
    </CycleListShell>
  );
}

function CycleCard({
  cycle,
  faculty,
  onOpen,
  onEdit,
  onAction,
}: {
  cycle: Cycle;
  faculty?: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onAction?: (action: "publish" | "close") => void;
}) {
  return (
    <article className="cycle-card">
      <button className="card-link" onClick={onOpen}>
        <div className="card-top">
          <span className={`status status-${cycle.status.toLowerCase()}`}>
            {cycle.status === "PUBLISHED" ? "Open" : cycle.status}
          </span>
          <span>Batch {cycle.batchYear}</span>
        </div>
        <h2>{cycle.title}</h2>
        <p className="course-name">
          {cycle.courseName} · Semester {cycle.semester}
        </p>
        <p className="card-description">
          {cycle.description || "No description added yet."}
        </p>
        <div className="card-footer">
          <span>{cycle.academicYear}</span>
          <span>Due {formatDate(cycle.submissionDeadline)}</span>
        </div>
      </button>
      {faculty && (
        <div className="card-actions">
          {cycle.status === "DRAFT" && (
            <>
              <button className="text-button" onClick={onEdit}>
                Edit
              </button>
              <button
                className="primary-button compact"
                onClick={() => onAction?.("publish")}
              >
                Publish
              </button>
            </>
          )}
          {cycle.status === "PUBLISHED" && (
            <>
              <button className="text-button" onClick={onEdit}>
                Edit
              </button>
              <button
                className="dark-button compact"
                onClick={() => onAction?.("close")}
              >
                Close
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">○</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function CycleDetail({
  token,
  cycleId,
  faculty,
  navigate,
}: {
  token: string;
  cycleId: string;
  faculty: boolean;
  navigate: (path: string) => void;
}) {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getCycle(token, cycleId)
      .then(setCycle)
      .catch((caught) => setError(readableError(caught)));
  }, [token, cycleId]);
  if (error)
    return (
      <section>
        <button
          className="back-button"
          onClick={() =>
            navigate(faculty ? "/faculty/cycles" : "/student/cycles")
          }
        >
          ← Back
        </button>
        <p className="form-error banner">{error}</p>
      </section>
    );
  if (!cycle) return <p className="loading">Loading cycle…</p>;
  return (
    <section className="detail-page">
      <button
        className="back-button"
        onClick={() =>
          navigate(faculty ? "/faculty/cycles" : "/student/cycles")
        }
      >
        ← Back to cycles
      </button>
      <div className="detail-header">
        <div>
          <span className={`status status-${cycle.status.toLowerCase()}`}>
            {cycle.status === "PUBLISHED" ? "Open" : cycle.status}
          </span>
          <p className="eyebrow">
            {cycle.courseName} / Batch {cycle.batchYear}
          </p>
          <h1>{cycle.title}</h1>
          <p>{cycle.description || "No description added."}</p>
        </div>
        {faculty && cycle.status === "DRAFT" && (
          <button
            className="primary-button"
            onClick={() => navigate(`/faculty/cycles/${cycle.id}/edit`)}
          >
            Edit cycle
          </button>
        )}
      </div>
      <div className="detail-grid">
        <Info label="Semester" value={`Semester ${cycle.semester}`} />
        <Info label="Academic year" value={cycle.academicYear} />
        <Info
          label="Submissions open"
          value={formatDate(cycle.submissionStartAt)}
        />
        <Info label="Deadline" value={formatDate(cycle.submissionDeadline)} />
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CycleEditor({
  token,
  cycleId,
  navigate,
}: {
  token: string;
  cycleId?: string;
  navigate: (path: string) => void;
}) {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const [form, setForm] = useState<CycleInput>({
    courseName: "",
    title: "",
    description: "",
    batchYear: year,
    semester: 1,
    academicYear: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
    submissionStartAt: localDateInput(),
    submissionDeadline: localDateInput(),
  });
  useEffect(() => {
    if (cycleId)
      getCycle(token, cycleId)
        .then((loaded) => {
          setCycle(loaded);
          setForm({
            courseName: loaded.courseName,
            title: loaded.title,
            description: loaded.description || "",
            batchYear: loaded.batchYear,
            semester: loaded.semester,
            academicYear: loaded.academicYear,
            submissionStartAt: localDateInput(loaded.submissionStartAt),
            submissionDeadline: localDateInput(loaded.submissionDeadline),
          });
        })
        .catch((caught) => setError(readableError(caught)));
  }, [token, cycleId]);
  const setField = (field: keyof CycleInput, value: string) =>
    setForm((current) => ({
      ...current,
      [field]:
        field === "batchYear" || field === "semester" ? Number(value) : value,
    }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      submissionStartAt: isoDate(form.submissionStartAt),
      submissionDeadline: isoDate(form.submissionDeadline),
    };
    try {
      const saved = cycle
        ? await updateCycle(token, cycle.id, payload)
        : await createCycle(token, payload);
      navigate(`/faculty/cycles/${saved.id}`);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };
  if (cycleId && !cycle && !error)
    return <p className="loading">Loading cycle…</p>;
  const published = cycle?.status === "PUBLISHED";
  return (
    <section className="form-page">
      <button
        className="back-button"
        onClick={() => navigate("/faculty/cycles")}
      >
        ← Back to cycles
      </button>
      <p className="eyebrow">{cycle ? "Edit cycle" : "New course cycle"}</p>
      <h1>{cycle ? "Refine the brief." : "Set the context."}</h1>
      <p className="page-lead">
        Define the academic runway once. Students will see the published version
        for their batch.
      </p>
      <form className="cycle-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Course name
            <input
              value={form.courseName}
              onChange={(event) => setField("courseName", event.target.value)}
              disabled={published}
              required
              maxLength={120}
            />
          </label>
          <label>
            Cycle title
            <input
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              disabled={published}
              required
              maxLength={120}
            />
          </label>
          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
          <label>
            Batch year
            <input
              type="number"
              value={form.batchYear}
              onChange={(event) => setField("batchYear", event.target.value)}
              disabled={published}
              min={1900}
              max={3000}
              required
            />
          </label>
          <label>
            Semester
            <input
              type="number"
              value={form.semester}
              onChange={(event) => setField("semester", event.target.value)}
              disabled={published}
              min={1}
              max={12}
              required
            />
          </label>
          <label>
            Academic year
            <input
              value={form.academicYear}
              onChange={(event) => setField("academicYear", event.target.value)}
              disabled={published}
              placeholder="2026-27"
              required
            />
          </label>
          <label>
            Submission opens
            <input
              type="datetime-local"
              value={form.submissionStartAt}
              onChange={(event) =>
                setField("submissionStartAt", event.target.value)
              }
              disabled={published}
              required
            />
          </label>
          <label>
            Submission deadline
            <input
              type="datetime-local"
              value={form.submissionDeadline}
              onChange={(event) =>
                setField("submissionDeadline", event.target.value)
              }
              required
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => navigate("/faculty/cycles")}
          >
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : cycle ? "Save changes" : "Create draft"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default App;
