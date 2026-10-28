import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  addEnrollments,
  listEnrollments,
  removeEnrollment,
} from "../api/cycles";
import { readableError } from "../errors";
import { extractEmails } from "../teams";
import type { Cycle, EnrolledStudent, EnrollmentResult } from "../types";
import { NotSignedInTag } from "./TeamPanels";

/** An elective's roster: only these students see the cycle and can be in its teams. */
export function EnrollmentPanel({ cycle }: { cycle: Cycle }) {
  const [students, setStudents] = useState<EnrolledStudent[] | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closed = cycle.status === "CLOSED";
  const pasted = extractEmails(text);

  const load = useCallback(() => {
    listEnrollments(cycle.id)
      .then(setStudents)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);
  useEffect(load, [load]);

  const enroll = async (emails: string[]) => {
    setBusy(true);
    setError("");
    try {
      setResult(await addEnrollments(cycle.id, emails));
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
    void enroll(pasted);
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
    await enroll(emails);
  };

  const remove = async (student: EnrolledStudent) => {
    if (!window.confirm(`Remove ${student.name ?? student.email} from this elective?`))
      return;
    setError("");
    try {
      await removeEnrollment(cycle.id, student.email);
      load();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  return (
    <section className="team-panel" aria-labelledby="enrollment-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Elective</p>
          <h2 id="enrollment-heading">
            Enrolled students{students ? ` (${students.length})` : ""}
          </h2>
        </div>
      </div>
      <p className="field-hint">
        Only enrolled students see this elective and can be in its teams, in
        any batch. Paste emails or upload a CSV; anything that is not a
        student email of this university is reported, not added. Students who
        have not signed in yet are registered, so they can be placed in teams
        right away.
      </p>
      {!closed && (
        <form className="team-editor" onSubmit={submit}>
          <label>
            Student emails
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              placeholder="One per line, or separated by commas"
            />
          </label>
          <div className="row-actions">
            <label className="file-button">
              Upload CSV
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
              Enroll {pasted.length > 0 ? pasted.length : ""}
            </button>
          </div>
        </form>
      )}
      {result && (
        <div className="notice" role="status">
          Added {result.added.length} · already enrolled{" "}
          {result.alreadyEnrolled.length} · not added {result.rejected.length}
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
        <p className="muted">Nobody is enrolled yet.</p>
      )}
      {students && students.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Email</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.email}>
                <td>
                  {student.name ?? <span className="muted">No account yet</span>}
                  {student.name && !student.signedIn && <NotSignedInTag />}
                </td>
                <td>{student.email}</td>
                <td className="row-actions">
                  {!closed && (
                    <button
                      className="text-button"
                      aria-label={`Remove ${student.email}`}
                      onClick={() => remove(student)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
