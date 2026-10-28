import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { importBatchStudents, listBatchStudents } from "../api/cycles";
import { readableError } from "../errors";
import { extractEmails } from "../teams";
import type { BatchImportResult, BatchStudent, Cycle } from "../types";
import { NotSignedInTag } from "./TeamPanels";

/**
 * A core course's batch list. Every student of the batch takes part; this is
 * where the faculty register students who have not signed in yet, so they can
 * be found by leaders and placed in teams.
 */
export function BatchPanel({ cycle }: { cycle: Cycle }) {
  const [students, setStudents] = useState<BatchStudent[] | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closed = cycle.status === "CLOSED";
  const pasted = extractEmails(text);
  const waiting = students?.filter((student) => !student.signedIn).length ?? 0;

  const load = useCallback(() => {
    listBatchStudents(cycle.id)
      .then(setStudents)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);
  useEffect(load, [load]);

  const register = async (emails: string[]) => {
    setBusy(true);
    setError("");
    try {
      setResult(await importBatchStudents(cycle.id, emails));
      setText("");
      load();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void register(pasted);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const emails = extractEmails(await file.text());
    if (emails.length === 0) {
      setError("No email addresses found in that file.");
      return;
    }
    await register(emails);
  };

  return (
    <section className="team-panel" aria-labelledby="batch-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Core course</p>
          <h2 id="batch-heading">
            Batch {cycle.batchYear} students
            {students ? ` (${students.length})` : ""}
          </h2>
        </div>
      </div>
      <p className="field-hint">
        Every student of batch {cycle.batchYear} takes part. Students appear
        here once they sign in; register the others from the batch list so
        leaders can find them and you can place them in teams. They keep their
        account when they first sign in. Emails of other batches are reported,
        not added.
        {students && ` ${waiting} not signed in yet.`}
      </p>
      {!closed && (
        <form className="team-editor" onSubmit={submit}>
          <label>
            Batch student emails
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              placeholder="One per line, or separated by commas"
            />
          </label>
          <div className="row-actions">
            <label className="file-button">
              Upload batch CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={upload}
              />
            </label>
            <button
              className="primary-button compact"
              disabled={busy || pasted.length === 0}
            >
              Register {pasted.length > 0 ? pasted.length : ""}
            </button>
          </div>
        </form>
      )}
      {result && (
        <div className="notice" role="status">
          Registered {result.registered.length} · already registered{" "}
          {result.alreadyRegistered.length} · not added {result.rejected.length}
          {result.rejected.length > 0 && (
            <ul>
              {result.rejected.map((row) => (
                <li key={row.email}>
                  {row.email}: {row.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {students && students.length === 0 && (
        <p className="muted">No student of this batch is known yet.</p>
      )}
      {students && students.length > 0 && (
        <details className="batch-list">
          <summary>Show all {students.length} students</summary>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.userId}>
                  <td>
                    {student.name}
                    {!student.signedIn && <NotSignedInTag />}
                  </td>
                  <td>{student.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
