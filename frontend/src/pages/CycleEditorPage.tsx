import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { createCycle, getCycle, updateCycle } from "../api/cycles";
import { isoDate, localDateInput } from "../dates";
import { readableError } from "../errors";
import type { Cycle, CycleInput } from "../types";

const NUMBER_FIELDS: (keyof CycleInput)[] = [
  "batchYear",
  "semester",
  "minTeamSize",
  "maxTeamSize",
];
const DATE_FIELDS: (keyof CycleInput)[] = [
  "submissionStartAt",
  "submissionDeadline",
  "teamFormationDeadline",
];

/** Form values (local date inputs) to API values (ISO timestamps). */
function toPayload<T extends Partial<CycleInput>>(fields: T): T {
  const payload: Partial<CycleInput> = { ...fields };
  for (const field of DATE_FIELDS) {
    const value = payload[field];
    if (typeof value === "string") {
      Object.assign(payload, { [field]: isoDate(value) });
    }
  }
  return payload as T;
}

/**
 * Only what the faculty member changed. A published cycle rejects any locked
 * field in the request, even with its current value.
 */
function changedFields(before: CycleInput, after: CycleInput) {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([field, value]) => before[field as keyof CycleInput] !== value,
    ),
  ) as Partial<CycleInput>;
}

export function CycleEditorPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loadedForm, setLoadedForm] = useState<CycleInput | null>(null);
  // The API refuses to move a formation deadline that has passed: those teams are fixed.
  const [formationEnded, setFormationEnded] = useState(false);
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
    minTeamSize: 1,
    maxTeamSize: 4,
    teamFormationDeadline: localDateInput(),
  });
  useEffect(() => {
    if (cycleId)
      getCycle(cycleId)
        .then((loaded) => {
          const loadedValues: CycleInput = {
            courseName: loaded.courseName,
            title: loaded.title,
            description: loaded.description || "",
            batchYear: loaded.batchYear,
            semester: loaded.semester,
            academicYear: loaded.academicYear,
            submissionStartAt: localDateInput(loaded.submissionStartAt),
            submissionDeadline: localDateInput(loaded.submissionDeadline),
            minTeamSize: loaded.minTeamSize,
            maxTeamSize: loaded.maxTeamSize,
            teamFormationDeadline: localDateInput(loaded.teamFormationDeadline),
          };
          setCycle(loaded);
          setLoadedForm(loadedValues);
          setFormationEnded(
            loaded.status !== "DRAFT" &&
              Date.parse(loaded.teamFormationDeadline) <= Date.now(),
          );
          setForm(loadedValues);
        })
        .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);
  const setField = (field: keyof CycleInput, value: string) =>
    setForm((current) => ({
      ...current,
      [field]: NUMBER_FIELDS.includes(field) ? Number(value) : value,
    }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved =
        cycle && loadedForm
          ? await updateCycle(
              cycle.id,
              toPayload(changedFields(loadedForm, form)),
            )
          : await createCycle(toPayload(form));
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
        <fieldset className="form-section">
          <legend>Teams</legend>
          <p className="field-hint">
            Students form teams of this size, leader included. Teams and
            project ideas are due by the formation deadline; members are fixed
            after it. Sizes cannot change once the cycle is published.
          </p>
          <div className="form-grid">
            <label>
              Minimum team size
              <input
                type="number"
                value={form.minTeamSize}
                onChange={(event) => setField("minTeamSize", event.target.value)}
                disabled={published}
                min={1}
                max={10}
                required
              />
            </label>
            <label>
              Maximum team size
              <input
                type="number"
                value={form.maxTeamSize}
                onChange={(event) => setField("maxTeamSize", event.target.value)}
                disabled={published}
                min={1}
                max={10}
                required
              />
            </label>
            <label className="wide">
              Team formation deadline
              <input
                type="datetime-local"
                value={form.teamFormationDeadline}
                onChange={(event) =>
                  setField("teamFormationDeadline", event.target.value)
                }
                disabled={formationEnded}
                required
              />
            </label>
          </div>
        </fieldset>
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
