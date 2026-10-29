import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  deadlineOpen,
  linksSummary,
  MAX_MILESTONES,
  milestoneLocked,
  newMilestone,
  STEP_OF_CODE,
  STEPS,
  termOf,
  withIdeaDeadline,
  type MilestoneDraft,
  type Problems,
  type StepKey,
  type WizardMode,
  type WizardState,
} from "../cycle-wizard";
import { formatDate, isoDate } from "../dates";
import { LINK_LABELS, LINK_TYPES } from "../links";
import { cyclePhases } from "../phases";
import { SEMESTERS } from "../semester";
import type { Cycle, CycleIdeaSource, ErrorDetail, LinkType } from "../types";
import { PhaseTimeline } from "./PhaseTimeline";

export type Update = (change: (state: WizardState) => WizardState) => void;

interface StepProps {
  state: WizardState;
  update: Update;
  /** Shown once the faculty tried to move on (milestone problems show as they type). */
  problems: Problems;
  mode: WizardMode;
}

const LOCKED = "Fixed once the project is published.";

export function StepIndicator({
  steps,
  current,
  reachable,
  onSelect,
}: {
  steps: StepKey[];
  current: number;
  /** Steps the faculty may jump to. */
  reachable: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="wizard-steps" aria-label="Steps">
      {steps.map((key, index) => {
        const state = index === current ? "current" : index < current ? "done" : "upcoming";
        const label = (
          <>
            <span className="wizard-step-number" aria-hidden="true">
              {index < current ? "✓" : index + 1}
            </span>
            {STEPS.find((step) => step.key === key)!.label}
            {index < current && <span className="visually-hidden"> (done)</span>}
          </>
        );
        return (
          <li key={key} className={`wizard-step is-${state}`} aria-current={index === current ? "step" : undefined}>
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
  describedBy,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  problem?: string;
  /** Another element that describes the control, besides its hint. */
  describedBy?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = problem ?? hint;
  return (
    <div className="wizard-field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-describedby": [note ? noteId : "", describedBy ?? ""].join(" ").trim() || undefined,
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

const numberValue = (value: number) => (Number.isNaN(value) ? "" : value);

export function DetailsStep({
  state,
  update,
  problems,
  mode,
  onBatchChange,
  onSemesterChange,
  templates = [],
  templateId = "",
  onTemplate,
}: StepProps & {
  onBatchChange: (batchYear: number) => void;
  onSemesterChange: (semester: number) => void;
  /** The faculty's previous projects, to start from one (new projects only). */
  templates?: Cycle[];
  templateId?: string;
  onTemplate?: (id: string) => void;
}) {
  const locked = mode === "published";
  const termId = useId();
  const term = termOf(state);
  // A semester outside 1–8 (from an older cycle) stays visible until changed.
  const semesters = Array.from({ length: SEMESTERS }, (_, index) => index + 1);
  if (Number.isInteger(state.semester) && !semesters.includes(state.semester)) semesters.push(state.semester);
  const set = <K extends keyof WizardState>(field: K, value: WizardState[K]) =>
    update((current) => ({ ...current, [field]: value }));
  return (
    <>
      {mode === "create" && templates.length > 0 && (
        <div className="template-picker">
          <Field
            label="Start from"
            hint="A previous project copies its settings and milestones, with its dates moved to start today."
          >
            {(props) => (
              <select {...props} value={templateId} onChange={(event) => onTemplate?.(event.target.value)}>
                <option value="">A blank project</option>
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
              onChange={(event) => set("courseName", event.target.value)}
              disabled={locked}
              maxLength={120}
            />
          )}
        </Field>
        <Field
          label="Project title"
          hint={locked ? LOCKED : "For example “Mid-semester project”. A course can run several projects."}
          problem={problems.title}
        >
          {(props) => (
            <input
              {...props}
              value={state.title}
              onChange={(event) => set("title", event.target.value)}
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
            onChange={(event) => set("description", event.target.value)}
            rows={3}
            maxLength={2000}
          />
        )}
      </Field>
      <fieldset className="choice-list" disabled={locked}>
        <legend>Who takes part</legend>
        <label>
          <input type="radio" name="kind" checked={state.kind === "CORE"} onChange={() => set("kind", "CORE")} />
          <span>
            <strong>Core course</strong>: every student of the batch takes part.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            checked={state.kind === "ELECTIVE"}
            onChange={() => set("kind", "ELECTIVE")}
          />
          <span>
            <strong>Elective</strong>: only the students you enroll take part (you add them in step 5).
          </span>
        </label>
        {locked && <p className="field-hint">{LOCKED}</p>}
      </fieldset>
      <div className="form-grid three">
        <Field label="Batch year" hint={locked ? LOCKED : "The year these students joined."} problem={problems.batchYear}>
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              value={numberValue(state.batchYear)}
              onChange={(event) => onBatchChange(event.target.valueAsNumber)}
              disabled={locked}
            />
          )}
        </Field>
        <Field
          label="Semester"
          hint={locked ? LOCKED : "Worked out from the batch and today; change it if needed."}
          problem={problems.semester}
          describedBy={termId}
        >
          {(props) => (
            <select
              {...props}
              value={numberValue(state.semester)}
              onChange={(event) => onSemesterChange(Number(event.target.value))}
              disabled={locked}
            >
              {semesters.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Academic year"
          hint={locked ? LOCKED : "Follows the semester; type another if needed."}
          problem={problems.academicYear}
        >
          {(props) => (
            <input
              {...props}
              value={state.academicYear}
              placeholder="2026-27"
              onChange={(event) =>
                update((current) => ({ ...current, academicYear: event.target.value, academicYearTouched: true }))
              }
              disabled={locked}
              maxLength={7}
            />
          )}
        </Field>
      </div>
      <p className="term-display" id={termId}>
        {term ? (
          <strong>
            Semester {term.semester} · {term.label}
          </strong>
        ) : (
          <span>Enter the batch to see the semester's dates.</span>
        )}
      </p>
      <div className="form-grid">
        <Field label="Smallest team" hint={locked ? LOCKED : "Leader included."} problem={problems.minTeamSize}>
          {(props) => (
            <input
              {...props}
              type="number"
              min={1}
              max={10}
              value={numberValue(state.minTeamSize)}
              onChange={(event) => set("minTeamSize", event.target.valueAsNumber)}
              disabled={locked}
            />
          )}
        </Field>
        <Field label="Largest team" hint={locked ? LOCKED : "Up to 10."} problem={problems.maxTeamSize}>
          {(props) => (
            <input
              {...props}
              type="number"
              min={1}
              max={10}
              value={numberValue(state.maxTeamSize)}
              onChange={(event) => set("maxTeamSize", event.target.valueAsNumber)}
              disabled={locked}
            />
          )}
        </Field>
      </div>
    </>
  );
}

/** For each link type: required, optional, or not asked. */
function LinkRequirementPicker({
  legend,
  required,
  optional,
  disabled,
  problem,
  onChange,
}: {
  legend: string;
  required: LinkType[];
  optional: LinkType[];
  disabled?: boolean;
  problem?: string;
  onChange: (required: LinkType[], optional: LinkType[]) => void;
}) {
  const choiceOf = (type: LinkType) =>
    required.includes(type) ? "required" : optional.includes(type) ? "optional" : "none";
  const choose = (type: LinkType, choice: string) => {
    const without = (list: LinkType[]) => list.filter((entry) => entry !== type);
    const keep = (list: LinkType[], add: boolean) =>
      LINK_TYPES.filter((entry) => (entry === type ? add : without(list).includes(entry)));
    onChange(keep(required, choice === "required"), keep(optional, choice === "optional"));
  };
  return (
    <fieldset className="link-picker" disabled={disabled}>
      <legend>{legend}</legend>
      {LINK_TYPES.map((type) => (
        <label key={type}>
          <span>{LINK_LABELS[type]}</span>
          <select value={choiceOf(type)} onChange={(event) => choose(type, event.target.value)}>
            <option value="required">Required</option>
            <option value="optional">Optional</option>
            <option value="none">Not asked</option>
          </select>
        </label>
      ))}
      {problem && <span className="field-problem">{problem}</span>}
    </fieldset>
  );
}

const IDEA_SOURCES: { value: CycleIdeaSource; title: string; text: string }[] = [
  { value: "BOTH", title: "Either", text: "teams propose their own idea or pick one from your list." },
  { value: "STUDENT_PROPOSALS", title: "Teams' own ideas", text: "you review each proposal." },
  { value: "FACULTY_LIST", title: "Your list only", text: "teams pick from the ideas you add in step 4." },
];

export function TeamsStep({ state, update, problems, mode, cycle, now }: StepProps & { cycle: Cycle | null; now: Date }) {
  const locked = mode === "published";
  const deadline = (field: "teamDeadline" | "ideaDeadline", label: string, hint: string) => {
    const open = deadlineOpen(cycle, field, now);
    return (
      <Field label={label} hint={open ? hint : "This stage has ended, so its deadline is fixed."} problem={problems[field]}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            value={state[field]}
            disabled={!open}
            onChange={(event) => {
              const value = event.target.value;
              update((current) =>
                field === "ideaDeadline"
                  ? withIdeaDeadline(current, value, mode)
                  : { ...current, teamDeadline: value, planAuto: false },
              );
            }}
          />
        )}
      </Field>
    );
  };
  return (
    <>
      <div className="form-grid">
        {deadline(
          "teamDeadline",
          "Team deadline",
          "Students form and change their own teams until then. Teams are fixed afterwards.",
        )}
        {deadline(
          "ideaDeadline",
          "Idea deadline",
          "Each team proposes or picks its first idea by then. Until then you also place students left without a team. Milestones that would open earlier move later with it.",
        )}
      </div>
      <fieldset className="choice-list" disabled={locked}>
        <legend>Where ideas come from</legend>
        {IDEA_SOURCES.map((source) => (
          <label key={source.value}>
            <input
              type="radio"
              name="ideaSource"
              checked={state.ideaSource === source.value}
              onChange={() => update((current) => ({ ...current, ideaSource: source.value }))}
            />
            <span>
              <strong>{source.title}</strong>: {source.text}
            </span>
          </label>
        ))}
        {locked && <p className="field-hint">{LOCKED}</p>}
      </fieldset>
      <LinkRequirementPicker
        legend="Links a proposal includes"
        required={state.ideaRequired}
        optional={state.ideaOptional}
        disabled={locked}
        problem={problems.ideaLinks}
        onChange={(required, optional) =>
          update((current) => ({ ...current, ideaRequired: required, ideaOptional: optional }))
        }
      />
    </>
  );
}

/** The plan as a bar: teams, ideas, then each milestone's window. */
function MilestoneTimeline({ state, now }: { state: WizardState; now: Date }) {
  const valid = (value: string) => !Number.isNaN(Date.parse(value));
  if (!valid(state.teamDeadline) || !valid(state.ideaDeadline)) return null;
  const milestones = state.milestones.filter((m) => valid(m.opensAt) && valid(m.dueAt));
  const start = new Date(Math.min(now.getTime(), Date.parse(state.teamDeadline) - 7 * 86_400_000)).toISOString();
  return (
    <PhaseTimeline
      label="The plan"
      phases={cyclePhases(
        {
          teamDeadline: isoDate(state.teamDeadline),
          ideaDeadline: isoDate(state.ideaDeadline),
          milestones: milestones.map((m, index) => ({
            position: index + 1,
            name: m.name || "Unnamed",
            submissionOpensAt: isoDate(m.opensAt),
            submissionDueAt: isoDate(m.dueAt),
          })),
        },
        start,
      )}
    />
  );
}

export function MilestonesStep({
  state,
  update,
  problems,
  mode,
  cycle,
  now,
}: StepProps & { cycle: Cycle | null; now: Date }) {
  const published = mode === "published";
  const change = (key: string, patch: Partial<MilestoneDraft>) =>
    update((current) => ({
      ...current,
      planAuto: false,
      milestones: current.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  const move = (index: number, by: number) =>
    update((current) => {
      const milestones = [...current.milestones];
      [milestones[index], milestones[index + by]] = [milestones[index + by], milestones[index]];
      return { ...current, planAuto: false, milestones };
    });
  const flagged = Object.entries(problems).filter(([key]) => key.startsWith("m") || key === "milestones");
  return (
    <>
      <MilestoneTimeline state={state} now={now} />
      {flagged.length > 0 ? (
        <div className="notice warning" role="status">
          <strong>Check the plan:</strong>
          <ul>
            {flagged.map(([key, text]) => {
              const index = /^m(\d+)\./.exec(key)?.[1];
              return <li key={key}>{index === undefined ? text : `M${Number(index) + 1}: ${text}`}</li>;
            })}
          </ul>
        </div>
      ) : (
        <p className="field-hint">The milestones follow each other without overlapping.</p>
      )}
      <ol className="milestone-rows">
        {state.milestones.map((milestone, index) => {
          const locked = milestoneLocked(cycle, milestone, now);
          const at = (field: string) => problems[`m${index}.${field}`];
          const date = (field: "opensAt" | "dueAt" | "evaluationAt", label: string) => (
            <Field label={label} problem={at(field)}>
              {(props) => (
                <input
                  {...props}
                  type="datetime-local"
                  value={milestone[field]}
                  disabled={locked}
                  onChange={(event) => change(milestone.key, { [field]: event.target.value })}
                />
              )}
            </Field>
          );
          return (
            <li key={milestone.key} className="milestone-row">
              <div className="milestone-row-head">
                <h3>M{index + 1}</h3>
                {locked && <span className="field-hint">Open since {formatDate(cycle!.milestones.find((m) => m.id === milestone.id)!.submissionOpensAt)}, so it is fixed.</span>}
                {!published && (
                  <div className="row-actions">
                    <button type="button" className="text-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move M${index + 1} earlier`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={index === state.milestones.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move M${index + 1} later`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          planAuto: false,
                          milestones: current.milestones.filter((m) => m.key !== milestone.key),
                        }))
                      }
                    >
                      Remove M{index + 1}
                    </button>
                  </div>
                )}
              </div>
              <div className="form-grid">
                <Field label="Name" hint={published ? LOCKED : "For example “Design review” or “Final”."} problem={at("name")}>
                  {(props) => (
                    <input
                      {...props}
                      value={milestone.name}
                      disabled={published}
                      maxLength={80}
                      onChange={(event) => change(milestone.key, { name: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="What to hand in (optional)" problem={at("description")}>
                  {(props) => (
                    <input
                      {...props}
                      value={milestone.description}
                      disabled={locked}
                      maxLength={2000}
                      onChange={(event) => change(milestone.key, { description: event.target.value })}
                    />
                  )}
                </Field>
              </div>
              <div className="form-grid three">
                {date("opensAt", "Submissions open")}
                {date("dueAt", "Due")}
                {date("evaluationAt", "Evaluation")}
              </div>
              <LinkRequirementPicker
                legend={`Links for M${index + 1}: ${linksSummary(milestone.required, milestone.optional)}`}
                required={milestone.required}
                optional={milestone.optional}
                disabled={published}
                problem={at("links")}
                onChange={(required, optional) => change(milestone.key, { required, optional })}
              />
            </li>
          );
        })}
      </ol>
      {!published && state.milestones.length < MAX_MILESTONES && (
        <button
          type="button"
          className="dark-button"
          onClick={() =>
            update((current) => ({ ...current, planAuto: false, milestones: [...current.milestones, newMilestone(current)] }))
          }
        >
          + Add milestone M{state.milestones.length + 1}
        </button>
      )}
      {published && <p className="field-hint">Milestones can't be added or removed once the project is published.</p>}
    </>
  );
}

export function TermWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="notice warning" role="status">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  );
}

/** Publish-check results, each with a link to the step that fixes it. */
export function CheckList({
  title,
  details,
  onGoTo,
  steps,
}: {
  title: string;
  details: ErrorDetail[];
  onGoTo: (step: StepKey) => void;
  steps: StepKey[];
}) {
  if (details.length === 0) return null;
  return (
    <div className="check-list">
      <h3>{title}</h3>
      <ul>
        {details.map((detail) => {
          const step = STEP_OF_CODE[detail.code];
          return (
            <li key={detail.code + detail.message}>
              <span>{detail.message}</span>
              {step && steps.includes(step) && (
                <button type="button" className="text-button" onClick={() => onGoTo(step)}>
                  Go to {STEPS.find((entry) => entry.key === step)!.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ReviewStep({
  state,
  steps,
  onGoTo,
}: {
  state: WizardState;
  steps: StepKey[];
  onGoTo: (step: StepKey) => void;
}) {
  const section = (step: StepKey, title: string, lines: string[]) => (
    <section className="review-section" key={step}>
      <div className="review-heading">
        <h3>{title}</h3>
        <button type="button" className="text-button" onClick={() => onGoTo(step)}>
          Edit
        </button>
      </div>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
  const size =
    state.minTeamSize === state.maxTeamSize ? `Teams of ${state.maxTeamSize}` : `Teams of ${state.minTeamSize}–${state.maxTeamSize}`;
  const term = termOf(state);
  const when = (value: string) => formatDate(isoDate(value));
  const source = IDEA_SOURCES.find((entry) => entry.value === state.ideaSource)!;
  return (
    <div className="review">
      {section("details", "Details", [
        `${state.courseName} · ${state.title}`,
        `${state.kind === "CORE" ? `Core: every student of batch ${state.batchYear}` : "Elective: enrolled students only"} · ${size}`,
        `Semester ${state.semester}${term ? ` (${term.label})` : ""} · academic year ${state.academicYear}`,
      ])}
      {section("teams", "Teams & ideas", [
        `Teams fixed on ${when(state.teamDeadline)}`,
        `First ideas due ${when(state.ideaDeadline)}; you place students without a team until then`,
        `${source.title}: ${source.text}`,
        `Proposal links: ${linksSummary(state.ideaRequired, state.ideaOptional)}`,
      ])}
      {section(
        "milestones",
        `Milestones (${state.milestones.length})`,
        state.milestones.map(
          (m, index) =>
            `M${index + 1} · ${m.name}: ${when(m.opensAt)} to ${when(m.dueAt)}, evaluated ${when(m.evaluationAt)} · ${linksSummary(m.required, m.optional)}`,
        ),
      )}
      {steps.includes("ideas") && section("ideas", "Idea list", ["Ideas you offer, managed in step 4"])}
      {section("students", "Students", [
        state.kind === "ELECTIVE" ? "The students you enrolled in step 5" : `Every student of batch ${state.batchYear}`,
      ])}
    </div>
  );
}

export function PublishDialog({
  audience,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  audience: string;
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
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title" aria-describedby="publish-body">
        <h2 id="publish-title">Publish to students?</h2>
        <div id="publish-body">
          <p>{audience} will see this project and can start forming teams.</p>
          <p>
            After publishing, the details, team sizes and idea rules are fixed, and milestones can't be added or
            removed. You can still edit the description, move a deadline while its stage is open, and move a
            milestone that hasn't opened yet.
          </p>
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
          <button type="button" ref={confirmRef} className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? "Publishing…" : "Publish to students"}
          </button>
        </div>
      </div>
    </div>
  );
}
