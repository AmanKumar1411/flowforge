import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { planSummary, type BuiltSchedule, type SummaryPart } from "../cycle-plan";
import {
  deadlineIsOpen,
  EDITABLE_AFTER_PUBLISH,
  hasPlacingWindow,
  LOCKED_AFTER_PUBLISH,
  STEPS,
  type Problems,
  type PublishedDeadlines,
  type WizardMode,
  type WizardState,
} from "../cycle-wizard";
import { formatDate, formatFullDay, isoDate } from "../dates";
import type { Cycle } from "../types";
import { cyclePhases } from "../phases";
import { PhaseTimeline } from "./PhaseTimeline";

export type Update = (change: (state: WizardState) => WizardState) => void;

interface StepProps {
  state: WizardState;
  update: Update;
  /** Shown only after the faculty tried to move on. */
  problems: Problems;
  mode: WizardMode;
}

export function StepIndicator({
  current,
  reachable,
  onSelect,
}: {
  current: number;
  /** Steps the faculty may jump back to. */
  reachable: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="wizard-steps" aria-label="Steps">
      {STEPS.map((step, index) => {
        const state =
          index === current ? "current" : index < current ? "done" : "upcoming";
        const label = (
          <>
            <span className="wizard-step-number" aria-hidden="true">
              {index < current ? "✓" : index + 1}
            </span>
            {step.label}
            {index < current && <span className="visually-hidden"> (done)</span>}
          </>
        );
        return (
          <li
            key={step.key}
            className={`wizard-step is-${state}`}
            aria-current={index === current ? "step" : undefined}
          >
            {index <= reachable && index !== current ? (
              <button type="button" onClick={() => onSelect(index)}>
                {label}
              </button>
            ) : (
              <span>{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A labelled control with its hint or problem below, tied together for screen readers. */
function Field({
  label,
  hint,
  problem,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  problem?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = problem ?? hint;
  return (
    <div className="wizard-field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-describedby": note ? noteId : undefined,
        "aria-invalid": problem ? true : undefined,
      })}
      {note && (
        <span id={noteId} className={problem ? "field-problem" : "field-hint"}>
          {note}
        </span>
      )}
    </div>
  );
}

const LOCKED = "Fixed once the cycle is published.";

export function BasicsStep({
  state,
  update,
  problems,
  mode,
  templates,
  templateId,
  onTemplate,
  onBatchChange,
  onSemesterChange,
}: StepProps & {
  templates: Cycle[];
  templateId: string;
  onTemplate: (id: string) => void;
  onBatchChange: (batchYear: number) => void;
  onSemesterChange: (semester: number) => void;
}) {
  const locked = mode === "published";
  const [advanced, setAdvanced] = useState(state.kind === "ELECTIVE");
  return (
    <>
      {mode === "create" && templates.length > 0 && (
        <div className="template-picker">
          <Field
            label="Start from"
            hint="A previous cycle copies its settings and moves its dates to start today."
          >
            {(props) => (
              <select
                {...props}
                value={templateId}
                onChange={(event) => onTemplate(event.target.value)}
              >
                <option value="">A blank cycle</option>
                {templates.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.courseName} · {cycle.title} (batch {cycle.batchYear})
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}
      <div className="form-grid">
        <Field
          label="Course name"
          hint={locked ? LOCKED : "The subject, for example “Software Design”."}
          problem={problems.courseName}
        >
          {(props) => (
            <input
              {...props}
              value={state.courseName}
              onChange={(event) =>
                update((current) => ({ ...current, courseName: event.target.value }))
              }
              disabled={locked}
              maxLength={120}
            />
          )}
        </Field>
        <Field
          label="Cycle title"
          hint={
            locked
              ? LOCKED
              : "This project round, for example “Mid-semester project”. A course can run several cycles."
          }
          problem={problems.title}
        >
          {(props) => (
            <input
              {...props}
              value={state.title}
              onChange={(event) =>
                update((current) => ({ ...current, title: event.target.value }))
              }
              disabled={locked}
              maxLength={120}
            />
          )}
        </Field>
      </div>
      <Field
        label="Description (optional)"
        hint="What students should know: goals, rules, useful links."
        problem={problems.description}
      >
        {(props) => (
          <textarea
            {...props}
            value={state.description}
            onChange={(event) =>
              update((current) => ({ ...current, description: event.target.value }))
            }
            rows={3}
            maxLength={2000}
          />
        )}
      </Field>
      <div className="form-grid three">
        <Field
          label="Batch year"
          hint={locked ? LOCKED : "The year these students joined."}
          problem={problems.batchYear}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              value={Number.isNaN(state.batchYear) ? "" : state.batchYear}
              onChange={(event) => onBatchChange(event.target.valueAsNumber)}
              disabled={locked}
            />
          )}
        </Field>
        <Field
          label="Semester"
          hint={locked ? LOCKED : "Worked out from the batch and today."}
          problem={problems.semester}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              value={Number.isNaN(state.semester) ? "" : state.semester}
              onChange={(event) => onSemesterChange(event.target.valueAsNumber)}
              disabled={locked}
              min={1}
              max={12}
            />
          )}
        </Field>
        <Field
          label="Academic year"
          hint={locked ? LOCKED : "Worked out from today, like 2026-27."}
          problem={problems.academicYear}
        >
          {(props) => (
            <input
              {...props}
              value={state.academicYear}
              onChange={(event) =>
                update((current) => ({ ...current, academicYear: event.target.value }))
              }
              disabled={locked}
            />
          )}
        </Field>
      </div>
      <details
        className="wizard-advanced"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>Advanced: course type</summary>
        <fieldset className="choice-list" disabled={locked}>
          <legend className="visually-hidden">Course type</legend>
          <label>
            <input
              type="radio"
              name="kind"
              checked={state.kind === "CORE"}
              onChange={() => update((current) => ({ ...current, kind: "CORE" }))}
            />
            <span>
              <strong>Core course</strong>: every student of the batch takes part.
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              checked={state.kind === "ELECTIVE"}
              onChange={() => update((current) => ({ ...current, kind: "ELECTIVE" }))}
            />
            <span>
              <strong>Elective</strong>: only the students you enroll take part (you
              add them on the cycle page).
            </span>
          </label>
          {locked && <p className="field-hint">{LOCKED}</p>}
        </fieldset>
      </details>
    </>
  );
}

export function TeamsStep({
  state,
  update,
  problems,
  mode,
  schedule,
}: StepProps & { schedule: BuiltSchedule | null }) {
  const locked = mode === "published";
  const solo = state.minTeamSize === 1;
  const [advanced, setAdvanced] = useState(state.timeline.placingWindow);
  const sizeProblem = problems.minTeamSize ?? problems.maxTeamSize;
  const setPlacing = (placingWindow: boolean) =>
    update((current) => ({
      ...current,
      timeline: { ...current.timeline, placingWindow },
      timelineTouched: true,
    }));
  return (
    <>
      <fieldset className="team-size">
        <legend>Team size</legend>
        <div className="inline-fields">
          <span aria-hidden="true">from</span>
          <input
            id="min-team-size"
            aria-label="Minimum team size"
            aria-describedby="team-size-note"
            type="number"
            inputMode="numeric"
            value={Number.isNaN(state.minTeamSize) ? "" : state.minTeamSize}
            onChange={(event) =>
              update((current) => ({ ...current, minTeamSize: event.target.valueAsNumber }))
            }
            disabled={locked || solo}
            min={1}
            max={10}
            aria-invalid={problems.minTeamSize ? true : undefined}
          />
          <span aria-hidden="true">to</span>
          <input
            id="max-team-size"
            aria-label="Maximum team size"
            aria-describedby="team-size-note"
            type="number"
            inputMode="numeric"
            value={Number.isNaN(state.maxTeamSize) ? "" : state.maxTeamSize}
            onChange={(event) =>
              update((current) => ({ ...current, maxTeamSize: event.target.valueAsNumber }))
            }
            disabled={locked}
            min={1}
            max={10}
            aria-invalid={problems.maxTeamSize ? true : undefined}
          />
          <span>students (including the leader)</span>
        </div>
        <span
          id="team-size-note"
          className={sizeProblem ? "field-problem" : "field-hint"}
        >
          {sizeProblem ?? (locked ? LOCKED : "Students create their own teams in this range.")}
        </span>
      </fieldset>
      <label className="check-row">
        <input
          type="checkbox"
          checked={solo}
          disabled={locked}
          onChange={(event) =>
            update((current) => ({
              ...current,
              minTeamSize: event.target.checked ? 1 : 2,
              maxTeamSize: Math.max(current.maxTeamSize, event.target.checked ? 1 : 2),
            }))
          }
        />
        Allow solo projects (a team of one)
      </label>
      <details
        className="wizard-advanced"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>Advanced: extra time to place students</summary>
        <p className="field-hint">
          When the students' team deadline passes, anyone still without a team is
          listed for you. With extra time, you add them to teams by hand or
          auto-group them before ideas are due.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={state.timeline.placingWindow}
            disabled={locked}
            onChange={(event) => setPlacing(event.target.checked)}
          />
          Give me extra time to place students without a team
        </label>
        {state.timeline.placingWindow && !locked && (
          <Field
            label="Extra days for placing students"
            hint={
              schedule?.teamCompletionDeadline
                ? `You place them until ${formatDate(schedule.teamCompletionDeadline)}, after the students' deadline (${formatDate(schedule.teamFormationDeadline)}).`
                : "Counted from the students' team deadline."
            }
            problem={problems.placing}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                inputMode="numeric"
                className="short-input"
                value={
                  Number.isNaN(state.timeline.durations.placing)
                    ? ""
                    : state.timeline.durations.placing
                }
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    timeline: {
                      ...current.timeline,
                      durations: {
                        ...current.timeline.durations,
                        placing: event.target.valueAsNumber,
                      },
                    },
                    timelineTouched: true,
                  }))
                }
                min={1}
              />
            )}
          </Field>
        )}
        {locked && <p className="field-hint">{LOCKED}</p>}
      </details>
    </>
  );
}

function startIso(day: string) {
  return new Date(`${day}T00:00`).toISOString();
}

export function TimelineStep({
  state,
  update,
  problems,
  mode,
  schedule,
  cycle,
  now,
}: StepProps & {
  schedule: BuiltSchedule | null;
  cycle: Cycle | null;
  now: Date;
}) {
  if (mode === "published" && cycle) {
    return (
      <PublishedTimeline
        state={state}
        update={update}
        problems={problems}
        cycle={cycle}
        now={now}
      />
    );
  }
  const { timeline } = state;
  const change = (next: Partial<typeof timeline>) =>
    update((current) => ({
      ...current,
      timeline: { ...current.timeline, ...next },
      timelineTouched: true,
    }));
  const duration = (field: "teams" | "ideas", value: number) =>
    change({ durations: { ...timeline.durations, [field]: value } });
  const workDays =
    schedule &&
    Math.round(
      (Date.parse(schedule.submissionDeadline) - Date.parse(schedule.submissionStartAt)) /
        86_400_000,
    );
  return (
    <>
      <p className="field-hint">
        Set when the cycle starts and how long each phase lasts; the dates follow.
        Phases end at 11:59 PM on their last day.
      </p>
      <Field
        label="Start date"
        hint={
          problems.start
            ? undefined
            : `${formatFullDay(`${timeline.start}T12:00`)}. Students can form teams from this day once you publish.`
        }
        problem={problems.start}
      >
        {(props) => (
          <input
            {...props}
            type="date"
            className="short-input"
            value={timeline.start}
            onChange={(event) => change({ start: event.target.value })}
          />
        )}
      </Field>
      <div className="form-grid">
        <Field
          label="Days to form teams"
          hint={
            schedule ? `Students' team deadline: ${formatDate(schedule.teamFormationDeadline)}.` : undefined
          }
          problem={problems.teams}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              className="short-input"
              value={Number.isNaN(timeline.durations.teams) ? "" : timeline.durations.teams}
              onChange={(event) => duration("teams", event.target.valueAsNumber)}
              min={1}
            />
          )}
        </Field>
        <Field
          label="Days for ideas"
          hint={
            schedule
              ? `Ideas due ${formatDate(schedule.ideaDeadline)}${schedule.teamCompletionDeadline ? ", after your extra time" : ""}.`
              : undefined
          }
          problem={problems.ideas}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              className="short-input"
              value={Number.isNaN(timeline.durations.ideas) ? "" : timeline.durations.ideas}
              onChange={(event) => duration("ideas", event.target.valueAsNumber)}
              min={1}
            />
          )}
        </Field>
      </div>
      <Field
        label="Final deadline"
        hint={
          schedule && workDays !== null
            ? `${formatDate(schedule.submissionDeadline)}. Teams get ${workDays} ${workDays === 1 ? "day" : "days"} for their work, from the start of ${formatFullDay(schedule.submissionStartAt)}.`
            : undefined
        }
        problem={problems.finalDeadline}
      >
        {(props) => (
          <input
            {...props}
            type="date"
            className="short-input"
            value={timeline.finalDeadline}
            onChange={(event) => change({ finalDeadline: event.target.value })}
          />
        )}
      </Field>
      {schedule && (
        <PhaseTimeline
          label="The plan, phase by phase"
          phases={cyclePhases(schedule, startIso(timeline.start))}
        />
      )}
    </>
  );
}

const DEADLINE_LABELS: Record<keyof PublishedDeadlines, string> = {
  teamFormationDeadline: "Students form teams until",
  teamCompletionDeadline: "You place students until",
  ideaDeadline: "Ideas due by",
  submissionStartAt: "Submissions open",
  submissionDeadline: "Final submission deadline",
};

function PublishedTimeline({
  state,
  update,
  problems,
  cycle,
  now,
}: Omit<StepProps, "mode"> & { cycle: Cycle; now: Date }) {
  const fields = (Object.keys(DEADLINE_LABELS) as (keyof PublishedDeadlines)[]).filter(
    (field) => field !== "teamCompletionDeadline" || hasPlacingWindow(cycle),
  );
  return (
    <>
      <PhaseTimeline
        label="The cycle's phases"
        now={now.getTime()}
        phases={cyclePhases(
          {
            ...cycle,
            teamCompletionDeadline: hasPlacingWindow(cycle) ? cycle.teamCompletionDeadline : null,
          },
          cycle.publishedAt ?? cycle.createdAt,
        )}
      />
      <p className="field-hint">
        Students already see this cycle. A deadline can move while its phase is
        still running, and only to a time in the future.
      </p>
      <div className="form-grid">
        {fields.map((field) => {
          const open = deadlineIsOpen(cycle, field, now);
          const value = state.deadlines[field];
          return (
            <Field
              key={field}
              label={DEADLINE_LABELS[field]}
              hint={
                open
                  ? value && !Number.isNaN(Date.parse(value))
                    ? formatDate(isoDate(value))
                    : undefined
                  : field === "submissionStartAt"
                    ? `${formatDate(cycle.submissionStartAt)}. Fixed once the cycle is published.`
                    : `${formatDate(cycle[field])}. This phase has ended.`
              }
              problem={problems[field]}
            >
              {(props) => (
                <input
                  {...props}
                  type="datetime-local"
                  value={value}
                  disabled={!open}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      deadlines: { ...current.deadlines, [field]: event.target.value },
                    }))
                  }
                />
              )}
            </Field>
          );
        })}
      </div>
    </>
  );
}

function Sentences({ sentences }: { sentences: SummaryPart[][] }) {
  return (
    <>
      {sentences.map((parts, index) => (
        <p key={index}>
          {parts.map((part, partIndex) =>
            part.strong ? <strong key={partIndex}>{part.text}</strong> : <span key={partIndex}>{part.text}</span>,
          )}
        </p>
      ))}
    </>
  );
}

/** The plan in sentences, updated as the faculty type. */
export function SummaryPanel({
  state,
  schedule,
  mode,
}: {
  state: WizardState;
  schedule: BuiltSchedule | null;
  mode: WizardMode;
}) {
  return (
    <aside className="wizard-panel" aria-labelledby="plan-heading">
      <h2 id="plan-heading">Your plan</h2>
      {schedule ? (
        <Sentences sentences={planSummary({ ...state, schedule })} />
      ) : (
        <p className="muted">Fix the marked fields to see the plan.</p>
      )}
      <p className="field-hint">
        {mode === "published"
          ? "Students already see this cycle."
          : "Students can't see this until you publish it."}
      </p>
    </aside>
  );
}

function ReviewSection({
  title,
  onEdit,
  editLabel,
  children,
}: {
  title: string;
  onEdit: () => void;
  editLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="review-section">
      <div className="review-heading">
        <h3>{title}</h3>
        <button type="button" className="text-button" onClick={onEdit} aria-label={editLabel}>
          Edit
        </button>
      </div>
      <dl>{children}</dl>
    </section>
  );
}

export function ReviewStep({
  state,
  schedule,
  onEdit,
}: {
  state: WizardState;
  schedule: BuiltSchedule | null;
  onEdit: (step: number) => void;
}) {
  return (
    <>
      {schedule && (
        <div className="review-summary">
          <Sentences sentences={planSummary({ ...state, schedule })} />
        </div>
      )}
      <ReviewSection title="Basics" onEdit={() => onEdit(0)} editLabel="Edit the basics">
        <dt>Course</dt>
        <dd>{state.courseName || "—"}</dd>
        <dt>Cycle title</dt>
        <dd>{state.title || "—"}</dd>
        <dt>Batch</dt>
        <dd>
          {state.batchYear}, semester {state.semester}, {state.academicYear}
        </dd>
        <dt>Course type</dt>
        <dd>{state.kind === "ELECTIVE" ? "Elective: enrolled students only" : "Core: the whole batch"}</dd>
        {state.description.trim() && (
          <>
            <dt>Description</dt>
            <dd>{state.description.trim()}</dd>
          </>
        )}
      </ReviewSection>
      <ReviewSection title="Teams" onEdit={() => onEdit(1)} editLabel="Edit the teams">
        <dt>Team size</dt>
        <dd>
          {state.minTeamSize === state.maxTeamSize
            ? state.maxTeamSize
            : `${state.minTeamSize} to ${state.maxTeamSize}`}{" "}
          students, leader included{state.minTeamSize === 1 ? " (solo projects allowed)" : ""}
        </dd>
        <dt>Extra time to place students</dt>
        <dd>
          {schedule?.teamCompletionDeadline
            ? `Until ${formatDate(schedule.teamCompletionDeadline)}`
            : "None"}
        </dd>
      </ReviewSection>
      <ReviewSection title="Timeline" onEdit={() => onEdit(2)} editLabel="Edit the timeline">
        {schedule ? (
          <>
            <dt>Students form teams until</dt>
            <dd>{formatDate(schedule.teamFormationDeadline)}</dd>
            <dt>Ideas due by</dt>
            <dd>{formatDate(schedule.ideaDeadline)}</dd>
            <dt>Submissions open</dt>
            <dd>From the start of {formatFullDay(schedule.submissionStartAt)}</dd>
            <dt>Final submission deadline</dt>
            <dd>{formatDate(schedule.submissionDeadline)}</dd>
          </>
        ) : (
          <dd>The timeline needs fixing.</dd>
        )}
      </ReviewSection>
    </>
  );
}

/** What publishing changes, from the API's rules, before the faculty confirm it. */
export function PublishDialog({
  audience,
  opensAt,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  audience: string;
  opensAt: string | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        aria-describedby="publish-body"
      >
        <h2 id="publish-title">Publish to students?</h2>
        <div id="publish-body">
          <p>{audience} will see this cycle and can start forming teams.</p>
          <p>After publishing, these can no longer change:</p>
          <ul>
            {LOCKED_AFTER_PUBLISH.map((item) => (
              <li key={item}>
                {item}
                {item === "the date submissions open" && opensAt ? ` (${formatDate(opensAt)})` : ""}
              </li>
            ))}
          </ul>
          <p>{EDITABLE_AFTER_PUBLISH}</p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Keep editing
          </button>
          <button
            type="button"
            ref={confirmRef}
            className="primary-button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Publishing…" : "Publish to students"}
          </button>
        </div>
      </div>
    </div>
  );
}
