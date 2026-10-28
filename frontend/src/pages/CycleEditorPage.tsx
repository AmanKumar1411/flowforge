import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { createCycle, getCycle, updateCycle } from "../api/cycles";
import { isoDate, localDateInput } from "../dates";
import { readableError } from "../errors";
import {
  defaultSchedule,
  scheduleProblems,
  scheduleSummary,
  twoDaysAfter,
  type ScheduleField,
} from "../schedule";
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
  "teamCompletionDeadline",
  "ideaDeadline",
];

/** The deadlines that end one stage after another before submissions open. */
const STAGE_FIELDS: (keyof CycleInput)[] = [
  "teamFormationDeadline",
  "teamCompletionDeadline",
  "ideaDeadline",
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
  // The API refuses to move a stage deadline that has passed: that stage is over.
  const [ended, setEnded] = useState({
    formation: false,
    completion: false,
    idea: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Whether the faculty keep time after the students' deadline to place students without a team.
  const [placing, setPlacing] = useState(false);
  const year = new Date().getFullYear();
  const [form, setForm] = useState<CycleInput>(() => ({
    courseName: "",
    title: "",
    description: "",
    batchYear: year,
    semester: 1,
    academicYear: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
    minTeamSize: 1,
    maxTeamSize: 4,
    kind: "CORE",
    ...defaultSchedule(),
  }));
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
            teamCompletionDeadline: localDateInput(
              loaded.teamCompletionDeadline,
            ),
            ideaDeadline: localDateInput(loaded.ideaDeadline),
            kind: loaded.kind,
          };
          setCycle(loaded);
          setLoadedForm(loadedValues);
          const now = Date.now();
          const passed = (deadline: string) =>
            loaded.status !== "DRAFT" && Date.parse(deadline) <= now;
          setEnded({
            formation: passed(loaded.teamFormationDeadline),
            completion: passed(loaded.teamCompletionDeadline),
            idea: passed(loaded.ideaDeadline),
          });
          setPlacing(
            loaded.teamCompletionDeadline !== loaded.teamFormationDeadline,
          );
          setForm(loadedValues);
        })
        .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);
  const setField = (field: keyof CycleInput, value: string) =>
    setForm((current) => {
      const next = {
        ...current,
        [field]: NUMBER_FIELDS.includes(field) ? Number(value) : value,
      };
      // As on the server: a later stage that ended together with this one moves with it.
      const index = STAGE_FIELDS.indexOf(field);
      for (
        let later = index + 1;
        index >= 0 && later < STAGE_FIELDS.length;
        later += 1
      ) {
        const [before, after] = [STAGE_FIELDS[later - 1], STAGE_FIELDS[later]];
        if (current[after] !== current[before]) break;
        Object.assign(next, { [after]: next[before] });
      }
      return next;
    });
  // Switching the placing window off makes it end with the students' deadline again.
  const togglePlacing = (on: boolean) => {
    setPlacing(on);
    setForm((current) => ({
      ...current,
      teamCompletionDeadline: on
        ? twoDaysAfter(current.teamFormationDeadline)
        : current.teamFormationDeadline,
    }));
  };
  const problems = scheduleProblems(form, placing);
  const scheduleOk = Object.keys(problems).length === 0;
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
            Course type
            <select
              value={form.kind}
              onChange={(event) => setField("kind", event.target.value)}
              disabled={published}
            >
              <option value="CORE">Core course: the whole batch</option>
              <option value="ELECTIVE">Elective: enrolled students only</option>
            </select>
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
        </div>
        <fieldset className="form-section">
          <legend>Schedule</legend>
          <p className="field-hint">
            The project runs in three steps, one after another. Students see
            these dates on the cycle page.
          </p>
          <ol className="schedule-steps">
            <li>
              <h3>Teams</h3>
              <p className="field-hint">
                Students create their own teams and add batch-mates. After the
                date below, teams are fixed for students. Team sizes include the
                leader and cannot change once the cycle is published.
              </p>
              <div className="form-grid">
                <label>
                  Minimum team size
                  <input
                    type="number"
                    value={form.minTeamSize}
                    onChange={(event) =>
                      setField("minTeamSize", event.target.value)
                    }
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
                    onChange={(event) =>
                      setField("maxTeamSize", event.target.value)
                    }
                    disabled={published}
                    min={1}
                    max={10}
                    required
                  />
                </label>
                <DateField
                  field="teamFormationDeadline"
                  label="Students form teams until"
                  value={form.teamFormationDeadline}
                  onChange={setField}
                  disabled={ended.formation}
                  note={ended.formation ? "This step has ended." : undefined}
                  problem={problems.teamFormationDeadline}
                />
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={placing}
                  onChange={(event) => togglePlacing(event.target.checked)}
                  disabled={ended.formation || ended.completion}
                />
                Give me time after that to place students who are still
                without a team (by hand or by auto-grouping)
              </label>
              {placing && (
                <div className="form-grid">
                  <DateField
                    field="teamCompletionDeadline"
                    label="You place students without a team until"
                    value={form.teamCompletionDeadline}
                    onChange={setField}
                    disabled={ended.completion}
                    note={ended.completion ? "This step has ended." : undefined}
                    problem={problems.teamCompletionDeadline}
                  />
                </div>
              )}
            </li>
            <li>
              <h3>Project ideas</h3>
              <p className="field-hint">
                Each team picks one of the ideas you list on the cycle page, or
                proposes its own for you to review. If you reject an idea, the
                team can revise it until the cycle closes.
              </p>
              <div className="form-grid">
                <DateField
                  field="ideaDeadline"
                  label="Ideas due by"
                  value={form.ideaDeadline}
                  onChange={setField}
                  disabled={ended.idea}
                  note={ended.idea ? "This step has ended." : undefined}
                  problem={problems.ideaDeadline}
                />
              </div>
            </li>
            <li>
              <h3>Project work</h3>
              <p className="field-hint">
                Teams with an approved idea submit links to their work, as
                often as they like. The last version before the final deadline
                counts.
              </p>
              <div className="form-grid">
                <DateField
                  field="submissionStartAt"
                  label="Submissions open"
                  value={form.submissionStartAt}
                  onChange={setField}
                  disabled={published}
                  note={
                    published ? "Fixed once the cycle is published." : undefined
                  }
                  problem={problems.submissionStartAt}
                />
                <DateField
                  field="submissionDeadline"
                  label="Final submission deadline"
                  value={form.submissionDeadline}
                  onChange={setField}
                  problem={problems.submissionDeadline}
                />
              </div>
            </li>
          </ol>
          {scheduleOk && (
            <p className="schedule-summary" role="status">
              {scheduleSummary(form, placing)}
            </p>
          )}
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
          <button className="primary-button" disabled={busy || !scheduleOk}>
            {busy ? "Saving…" : cycle ? "Save changes" : "Create draft"}
          </button>
        </div>
        {!scheduleOk && (
          <p className="field-hint form-actions-note">
            Fix the dates marked in the schedule to continue.
          </p>
        )}
      </form>
    </section>
  );
}

/** A date with its problem (or a note) below it, outside the label so its name stays short. */
function DateField({
  field,
  label,
  value,
  onChange,
  disabled = false,
  note,
  problem,
}: {
  field: ScheduleField;
  label: string;
  value: string;
  onChange: (field: ScheduleField, value: string) => void;
  disabled?: boolean;
  note?: string;
  problem?: string;
}) {
  const hintId = `${field}-hint`;
  const hint = problem ?? note;
  return (
    <div className="date-field">
      <label>
        {label}
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
          disabled={disabled}
          aria-invalid={problem ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          required
        />
      </label>
      {hint && (
        <span
          id={hintId}
          className={problem ? "field-problem" : "field-hint"}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
