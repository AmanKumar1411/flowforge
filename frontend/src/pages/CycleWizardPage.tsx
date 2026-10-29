import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  createCycle,
  getCycle,
  listMyCycles,
  publishCycle,
  updateCycle,
} from "../api/cycles";
import {
  BasicsStep,
  PublishDialog,
  ReviewStep,
  StepIndicator,
  SummaryPanel,
  TeamsStep,
  TimelineStep,
  type Update,
} from "../components/CycleWizardSteps";
import { semesterFor } from "../cycle-plan";
import {
  blankState,
  createPayload,
  scheduleOf,
  stateFromCycle,
  stateFromTemplate,
  stepProblems,
  STEPS,
  updatePayload,
  type WizardMode,
  type WizardState,
} from "../cycle-wizard";
import { readableError } from "../errors";
import type { Cycle } from "../types";

const STEP_HEADINGS = [
  "What is this cycle?",
  "How do students team up?",
  "When does each phase happen?",
  "Check and save",
];

/**
 * Create or edit a cycle in four steps: basics, teams, timeline, review. The
 * draft lives here while the faculty move between steps; each step is
 * checked before the next one opens, and a live summary describes the plan.
 */
export function CycleWizardPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [templates, setTemplates] = useState<Cycle[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [state, setState] = useState<WizardState | null>(null);
  const [step, setStep] = useState(0);
  const [reachable, setReachable] = useState(0);
  // Problems show on a step once the faculty tried to leave it.
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const [autoSemester, setAutoSemester] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now] = useState(() => new Date());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (cycleId) {
      getCycle(cycleId)
        .then((loaded) => {
          setCycle(loaded);
          setState(stateFromCycle(loaded));
          setReachable(STEPS.length - 1);
        })
        .catch((caught) => setLoadError(readableError(caught)));
      return;
    }
    listMyCycles()
      .then((mine) => {
        setTemplates(mine);
        setState(blankState(mine));
      })
      .catch(() => setState(blankState([])));
  }, [cycleId]);

  // Keyboard and screen-reader users land on the new step's heading.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);

  const mode: WizardMode = !cycle
    ? "create"
    : cycle.status === "DRAFT"
      ? "draft"
      : "published";
  const update: Update = useCallback(
    (change) => setState((current) => (current ? change(current) : current)),
    [],
  );
  const closeDialog = useCallback(() => setConfirming(false), []);

  if (loadError) {
    return (
      <section className="form-page">
        <button className="back-button" onClick={() => navigate("/faculty/cycles")}>
          ← Back to cycles
        </button>
        <p className="form-error banner">{loadError}</p>
      </section>
    );
  }
  if (!state) return <p className="loading">Loading…</p>;
  if (cycle?.status === "CLOSED") {
    return (
      <section className="form-page">
        <button className="back-button" onClick={() => navigate(`/faculty/cycles/${cycle.id}`)}>
          ← Back to the cycle
        </button>
        <p className="notice">This cycle is closed, so it can no longer change.</p>
      </section>
    );
  }

  const problemsFor = (index: number) =>
    stepProblems(STEPS[index].key, state, mode, cycle, now);
  const shownProblems = checked.has(step) ? problemsFor(step) : {};
  const schedule = scheduleOf(state, mode, cycle, now);
  const firstBlocked = STEPS.findIndex((_, index) => Object.keys(problemsFor(index)).length > 0);

  const goTo = (index: number) => {
    moved.current = true;
    setAnnouncement("");
    setStep(index);
    setReachable((current) => Math.max(current, index));
  };
  const next = () => {
    const problems = problemsFor(step);
    const count = Object.keys(problems).length;
    if (count > 0) {
      setChecked((current) => new Set(current).add(step));
      setAnnouncement(
        `${count === 1 ? "One thing needs" : `${count} things need`} fixing on this step.`,
      );
      return;
    }
    goTo(step + 1);
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((entry) => entry.id === id);
    setState(template ? stateFromTemplate(template) : blankState(templates));
    setAutoSemester(true);
    setChecked(new Set());
  };
  const changeBatch = (batchYear: number) =>
    update((current) => ({
      ...current,
      batchYear,
      semester:
        autoSemester && Number.isInteger(batchYear)
          ? semesterFor(batchYear, now)
          : current.semester,
    }));
  // A semester the faculty typed stays; until then it follows the batch.
  const changeSemester = (semester: number) => {
    setAutoSemester(false);
    update((current) => ({ ...current, semester }));
  };

  /** Saves the cycle; with `publish`, also publishes it. Returns the saved cycle's id. */
  const save = async (publish: boolean) => {
    if (firstBlocked >= 0) {
      setChecked(new Set(STEPS.map((_, index) => index)));
      goTo(firstBlocked);
      setConfirming(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let saved = cycle;
      if (!saved) {
        saved = await createCycle(createPayload(state, now));
        // A failed publish below must not create the cycle twice.
        setCycle(saved);
        setState(stateFromCycle(saved));
      } else {
        const changes = updatePayload(state, saved, mode);
        if (Object.keys(changes).length > 0) {
          saved = await updateCycle(saved.id, changes);
        }
      }
      if (publish) await publishCycle(saved.id);
      navigate(`/faculty/cycles/${saved.id}`);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step < STEPS.length - 1) next();
  };

  const isReview = step === STEPS.length - 1;
  const stepProps = { state, update, problems: shownProblems, mode };
  return (
    <section className="wizard-page">
      <button
        className="back-button"
        onClick={() => navigate(cycle ? `/faculty/cycles/${cycle.id}` : "/faculty/cycles")}
      >
        ← {cycle ? "Back to the cycle" : "Back to cycles"}
      </button>
      <p className="eyebrow">
        {mode === "create" ? "New course cycle" : mode === "draft" ? "Edit draft" : "Edit published cycle"}
      </p>
      <h1>{mode === "create" ? "Set up a cycle" : cycle?.title}</h1>
      <StepIndicator current={step} reachable={reachable} onSelect={goTo} />
      <div className="wizard-layout">
        <form className="cycle-form wizard-form" onSubmit={submit} noValidate>
          <h2 className="wizard-heading" ref={headingRef} tabIndex={-1}>
            <span className="visually-hidden">
              Step {step + 1} of {STEPS.length}:{" "}
            </span>
            {STEP_HEADINGS[step]}
          </h2>
          {/* Always present, so screen readers announce what appears in it. */}
          <p
            className={announcement ? "form-error" : "visually-hidden"}
            role="status"
            aria-live="polite"
          >
            {announcement}
          </p>
          {step === 0 && (
            <BasicsStep
              {...stepProps}
              templates={templates}
              templateId={templateId}
              onTemplate={chooseTemplate}
              onBatchChange={changeBatch}
              onSemesterChange={changeSemester}
            />
          )}
          {step === 1 && <TeamsStep {...stepProps} schedule={schedule} />}
          {step === 2 && (
            <TimelineStep {...stepProps} schedule={schedule} cycle={cycle} now={now} />
          )}
          {isReview && <ReviewStep state={state} schedule={schedule} onEdit={goTo} />}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="wizard-nav">
            {step > 0 && (
              <button type="button" className="text-button" onClick={() => goTo(step - 1)}>
                ← Back
              </button>
            )}
            {!isReview && (
              <button type="submit" className="primary-button">
                Next: {STEPS[step + 1].label}
              </button>
            )}
            {isReview && mode === "published" && (
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void save(false)}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            )}
            {isReview && mode !== "published" && (
              <div className="review-actions">
                <div>
                  <button
                    type="button"
                    className="dark-button"
                    disabled={busy}
                    onClick={() => void save(false)}
                  >
                    {mode === "create" ? "Save as draft" : "Save draft"}
                  </button>
                  <span className="field-hint">Students can't see it yet.</span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => (firstBlocked >= 0 ? void save(true) : setConfirming(true))}
                >
                  Publish to students
                </button>
              </div>
            )}
          </div>
        </form>
        <SummaryPanel state={state} schedule={schedule} mode={mode} />
      </div>
      {confirming && (
        <PublishDialog
          audience={
            state.kind === "ELECTIVE"
              ? "The students you enroll"
              : `Students of batch ${state.batchYear}`
          }
          opensAt={schedule?.submissionStartAt ?? null}
          busy={busy}
          error={error}
          onCancel={closeDialog}
          onConfirm={() => void save(true)}
        />
      )}
    </section>
  );
}
