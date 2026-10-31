import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addToAllowlist,
  approveFacultyRequest,
  correctBatch,
  listAllowlist,
  listFacultyRequests,
  listUsers,
  rejectFacultyRequest,
  removeFromAllowlist,
  setUserActive,
  type UserFilters,
} from "../api/admin";
import { useAuth } from "../auth/useAuth";
import { formatDate } from "../dates";
import { readableError } from "../errors";
import type {
  AdminUser,
  AllowlistEntry,
  FacultyRequest,
  FacultyRequestStatus,
  UserRole,
} from "../types";

export function AdminPage() {
  return (
    <section className="admin-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1>People and access</h1>
        </div>
      </div>
      <FacultyRequests />
      <FacultyAllowlist />
      <Users />
    </section>
  );
}

function FacultyRequests() {
  const [status, setStatus] = useState<FacultyRequestStatus>("PENDING");
  const [requests, setRequests] = useState<FacultyRequest[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    listFacultyRequests(status)
      .then(setRequests)
      .catch((caught) => setError(readableError(caught)));
  }, [status]);
  useEffect(load, [load]);

  const decide = async (request: FacultyRequest, approve: boolean) => {
    setError("");
    try {
      await (approve
        ? approveFacultyRequest(request.id)
        : rejectFacultyRequest(request.id));
      load();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  return (
    <div className="admin-panel">
      <div className="panel-heading">
        <h2>Faculty access requests</h2>
        <select
          aria-label="Show requests that are"
          value={status}
          onChange={(event) => setStatus(event.target.value as FacultyRequestStatus)}
        >
          <option value="PENDING">Pending</option>
          <option value="REJECTED">Rejected</option>
          <option value="APPROVED">Approved</option>
        </select>
      </div>
      {error && <p className="form-error banner">{error}</p>}
      {requests.length === 0 ? (
        <p className="muted">No {status.toLowerCase()} requests.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Requested</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.userName}</td>
                <td>{request.email}</td>
                <td>{formatDate(request.createdAt)}</td>
                <td className="row-actions">
                  {request.status !== "APPROVED" && (
                    <button
                      className="primary-button compact"
                      onClick={() => decide(request, true)}
                    >
                      Approve
                    </button>
                  )}
                  {request.status === "PENDING" && (
                    <button className="text-button" onClick={() => decide(request, false)}>
                      Reject
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FacultyAllowlist() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    listAllowlist()
      .then(setEntries)
      .catch((caught) => setError(readableError(caught)));
  }, []);
  useEffect(load, [load]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await addToAllowlist(email, name);
      setEmail("");
      setName("");
      load();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  const remove = async (entry: AllowlistEntry) => {
    if (!window.confirm(`Remove ${entry.email}? Their faculty access ends at once.`)) {
      return;
    }
    try {
      await removeFromAllowlist(entry.id);
      load();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  return (
    <div className="admin-panel">
      <div className="panel-heading">
        <h2>Faculty allowlist</h2>
      </div>
      <form className="inline-form" onSubmit={add}>
        <input
          type="email"
          aria-label="Faculty email"
          placeholder="firstname.s@nst.rishihood.edu.in"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          aria-label="Faculty name (optional)"
          placeholder="Name (optional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
        />
        <button className="primary-button compact">Add faculty</button>
      </form>
      {error && <p className="form-error banner">{error}</p>}
      {entries.length === 0 ? (
        <p className="muted">Nobody is on the allowlist yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Source</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.email}</td>
                <td>{entry.name ?? "—"}</td>
                <td>{entry.source.replace("_", " ").toLowerCase()}</td>
                <td>{formatDate(entry.createdAt)}</td>
                <td className="row-actions">
                  <button className="text-button" onClick={() => remove(entry)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Users() {
  const { state } = useAuth();
  const selfId = state.status === "signed-in" ? state.user.id : "";
  const [filters, setFilters] = useState<UserFilters>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    (cursor?: string) => {
      listUsers({ ...filters, cursor })
        .then((page) => {
          setUsers((current) => (cursor ? [...current, ...page.items] : page.items));
          setNextCursor(page.nextCursor);
        })
        .catch((caught) => setError(readableError(caught)));
    },
    [filters],
  );
  useEffect(() => load(), [load]);

  const replace = (updated: AdminUser) =>
    setUsers((current) =>
      current.map((user) => (user.id === updated.id ? updated : user)),
    );

  const run = async (action: () => Promise<AdminUser>) => {
    setError("");
    try {
      replace(await action());
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  return (
    <div className="admin-panel">
      <div className="panel-heading">
        <h2>Users</h2>
        <div className="filters">
          <select
            aria-label="Role"
            value={filters.role ?? ""}
            onChange={(event) =>
              setFilters({
                ...filters,
                role: (event.target.value || undefined) as UserRole | undefined,
              })
            }
          >
            <option value="">All roles</option>
            <option value="STUDENT">Students</option>
            <option value="FACULTY">Faculty</option>
            <option value="ADMIN">Admins</option>
            <option value="PENDING_STAFF">Pending staff</option>
          </select>
          <input
            type="number"
            aria-label="Batch year"
            placeholder="Batch"
            value={filters.batchYear ?? ""}
            onChange={(event) =>
              setFilters({
                ...filters,
                batchYear: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
      {error && <p className="form-error banner">{error}</p>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Batch</th>
            <th>Last login</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === selfId}
              onCorrectBatch={(batchYear) => run(() => correctBatch(user.id, batchYear))}
              onToggleActive={() =>
                run(() => setUserActive(user.id, user.status === "DEACTIVATED"))
              }
            />
          ))}
        </tbody>
      </table>
      {nextCursor && (
        <button className="text-button" onClick={() => load(nextCursor)}>
          Load more
        </button>
      )}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onCorrectBatch,
  onToggleActive,
}: {
  user: AdminUser;
  isSelf: boolean;
  onCorrectBatch: (batchYear: number) => void;
  onToggleActive: () => void;
}) {
  const [batch, setBatch] = useState(String(user.batchYear ?? ""));
  const deactivated = user.status === "DEACTIVATED";
  return (
    <tr className={deactivated ? "row-muted" : undefined}>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>
        <span className="role-chip">{user.role.replace("_", " ")}</span>
        {deactivated && <span className="status status-closed">Deactivated</span>}
      </td>
      <td>
        {user.role === "STUDENT" ? (
          <span className="batch-editor">
            <input
              type="number"
              aria-label={`Batch year of ${user.name}`}
              value={batch}
              onChange={(event) => setBatch(event.target.value)}
            />
            {Number(batch) !== user.batchYear && (
              <button
                className="text-button"
                aria-label={`Save the batch year of ${user.name}`}
                onClick={() => onCorrectBatch(Number(batch))}
              >
                Save
              </button>
            )}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</td>
      <td className="row-actions">
        {!isSelf && (
          <button className="text-button" onClick={onToggleActive}>
            {deactivated ? "Reactivate" : "Deactivate"}
          </button>
        )}
      </td>
    </tr>
  );
}
