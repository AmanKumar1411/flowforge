import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import {
  createCycle,
  getCycle,
  getPublishChecks,
  listMyCycles,
  publishCycle,
  updateCycle,
} from "../api/cycles";
import { BatchPanel } from "../components/BatchPanel";
import { FacultyCatalogSection } from "../components/CatalogPanel";
import {
  CheckList,
  DetailsStep,
  MilestonesStep,
  PublishDialog,
  ReviewStep,
  StepIndicator,
  TeamsStep,
  TermWarnings,
  type Update,
} from "../components/CycleWizardSteps";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import {
  blankState,
  followTerm,
  milestoneProblems,
  payloadOf,
  planWarnings,
  stateFromCycle,
  stateFromTemplate,
  stepProblems,
  updatePayload,
  visibleSteps,
  type StepKey,
  type WizardMode,
  type WizardState,
} from "../cycle-wizard";
import { readableError } from "../errors";
import { currentSemester } from "../semester";
import type { Cycle, ErrorDetail, PublishChecks } from "../types";

const STEP_HEADINGS: Record<StepKey, string> = {
  details: "What is this project?",
  teams: "When do teams and ideas settle?",
  milestones: "What do teams hand in, and when?",
  ideas: "Which ideas do you offer?",
  students: "Who takes part?",
  review: "Check and publish",
};

/**
 * Create or edit a project in one guided flow: details, teams and ideas,
 * milestones, the idea list, students, review and publish. The draft is saved
 * when the faculty leave the first step and updated on every step after it,
 * so the idea list and the students (which belong to a saved project) can be
 * filled in the same flow. The step is in the URL (`?step=`), so a page can
 * link straight to one.
 */
export function CycleWizardPage() {
  const { cycleId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [state, setState] = useState<WizardState | null>(null);
  const [templates, setTemplates] = useState<Cycle[]>([]);
  const [templateId, setTemplateId] = useState("");
  // Problems show on a step once the faculty tried to leave it.
  const [checked, setChecked] = useState<Set<StepKey>>(() => new Set());
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<ErrorDetail[]>([]);
  // Each visit to the review step loads the checks again; older results are not shown.
  const [reviewVisit, setReviewVisit] = useState(0);
  const [loadedChecks, setLoadedChecks] = useState<{ visit: number; result: PublishChecks } | null>(null);
  const checks = loadedChecks?.visit === reviewVisit ? loadedChecks.result : null;
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [autoSemester, setAutoSemester] = useState(true);
  const [now] = useState(() => new Date());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  // The project this page already holds: saving the first step moves to its edit URL, and that
  // must not load it again over what the faculty type next.
  const heldId = useRef<string | null>(null);

  useEffect(() => {
    // A reply for an earlier run of this effect (React runs it twice in development) must not
    // replace what the faculty have typed since.
    let live = true;
    if (cycleId && heldId.current === cycleId) return;
    if (cycleId) {
      getCycle(cycleId)
        .then((loaded) => {
          if (!live) return;
          heldId.current = loaded.id;
          setCycle(loaded);
          setState(stateFromCycle(loaded));
        })
        .catch((caught) => live && setLoadError(readableError(caught)));
    } else {
      listMyCycles()
        .then((mine) => {
          if (!live) return;
          setTemplates(mine);
          setState(blankState(mine));
        })
        .catch(() => live && setState(blankState([])));
    }
    return () => {
      live = false;
    };
  }, [cycleId]);

  const steps = state ? visibleSteps(state) : [];
  const stepKey = (steps.includes(search.get("step") as StepKey) ? search.get("step") : "details") as StepKey;
  const step = Math.max(0, steps.indexOf(stepKey));

  // Keyboard and screen-reader users land on the new step's heading.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [stepKey]);

  // The review step shows what publishing would report now.
  useEffect(() => {
    if (stepKey !== "review" || !cycle || cycle.status !== "DRAFT") return;
    getPublishChecks(cycle.id)
      .then((result) => setLoadedChecks({ visit: reviewVisit, result }))
      .catch((caught) => setError(readableError(caught)));
  }, [stepKey, cycle, reviewVisit]);

  const mode: WizardMode = !cycle ? "create" : cycle.status === "DRAFT" ? "draft" : "published";
  const update: Update = useCallback(
    (change) => setState((current) => (current ? change(current) : current)),
    [],
  );
  const closeDialog = useCallback(() => setConfirming(false), []);

  if (loadError) {
    return (
      <section className="form-page">
        <button className="back-button" onClick={() => navigate("/faculty/cycles")}>
          ← Back to projects
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
          ← Back to the project
        </button>
        <p className="notice">This project is closed, so it can no longer change.</p>
      </section>
    );
  }

  const problemsOf = (key: StepKey) => stepProblems(key, state, mode, cycle, now);
  // Milestone problems show as the faculty type, so overlaps are flagged at once.
  const shown =
    stepKey === "milestones"
      ? milestoneProblems(state, mode, cycle, now)
      : checked.has(stepKey)
        ? problemsOf(stepKey)
        : {};
  const goTo = (key: StepKey, savedId = cycle?.id) => {
    moved.current = true;
    setError("");
    setBlocked([]);
    if (key === "review") setReviewVisit((current) => current + 1);
    if (savedId && savedId !== cycleId) {
      navigate(`/faculty/cycles/${savedId}/edit?step=${key}`, { replace: true });
    } else {
      setSearch({ step: key }, { replace: true });
    }
  };

  /** Saves the steps that hold the project's own fields; the idea list and students save themselves. */
  const save = async (): Promise<Cycle | null> => {
    if (!["details", "teams", "milestones"].includes(stepKey)) return cycle;
    if (!cycle) return createCycle(payloadOf(state));
    const changes = updatePayload(state, cycle, mode);
    if (Object.keys(changes).length === 0) return cycle;
    return updateCycle(cycle.id, changes);
  };

  const next = async (event?: FormEvent) => {
    event?.preventDefault();
    const problems = problemsOf(stepKey);
    if (Object.keys(problems).length > 0) {
      setChecked((current) => new Set(current).add(stepKey));
      setError("Fix the highlighted fields first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await save();
      if (saved) {
        heldId.current = saved.id;
        setCycle(saved);
        setState((current) => (current && saved !== cycle ? { ...stateFromCycle(saved) } : current));
      }
      goTo(steps[Math.min(step + 1, steps.length - 1)], saved?.id);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!cycle) return;
    setBusy(true);
    setError("");
    setBlocked([]);
    try {
      await publishCycle(cycle.id);
      navigate(`/faculty/cycles/${cycle.id}`);
    } catch (caught) {
      setConfirming(false);
      if (caught instanceof ApiError && caught.code === "PUBLISH_BLOCKED") setBlocked(caught.details);
      else setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const onBatchChange = (batchYear: number) =>
    update((current) =>
      followTerm({
        ...current,
        batchYear,
        semester:
          autoSemester && Number.isInteger(batchYear) ? currentSemester(batchYear, now) : current.semester,
      }),
    );
  const onSemesterChange = (semester: number) => {
    setAutoSemester(false);
    update((current) => followTerm({ ...current, semester }));
  };

  const body = () => {
    const props = { state, update, problems: shown, mode };
    switch (stepKey) {
      case "details":
        return (
          <DetailsStep
            {...props}
            onBatchChange={onBatchChange}
            onSemesterChange={onSemesterChange}
            templates={templates}
            templateId={templateId}
            onTemplate={(id) => {
              setTemplateId(id);
              const template = templates.find((entry) => entry.id === id);
              setState(template ? stateFromTemplate(template, now) : blankState(templates, now));
            }}
          />
        );
      case "teams":
        return <TeamsStep {...props} cycle={cycle} now={now} />;
      case "milestones":
        return <MilestonesStep {...props} cycle={cycle} now={now} />;
      case "ideas":
        return cycle && <FacultyCatalogSection cycle={cycle} />;
      case "students":
        return cycle && (cycle.kind === "ELECTIVE" ? <EnrollmentPanel cycle={cycle} /> : <BatchPanel cycle={cycle} />);
      case "review":
        return (
          <>
            <ReviewStep state={state} steps={steps} onGoTo={(key) => goTo(key)} />
            {mode === "draft" && (
              <>
                {!checks && <p className="loading">Checking the project…</p>}
                {checks && checks.blocking.length === 0 && blocked.length === 0 && (
                  <p className="notice success">Everything students need is in place.</p>
                )}
                <CheckList
                  title="Before you can publish"
                  details={blocked.length > 0 ? blocked : (checks?.blocking ?? [])}
                  steps={steps}
                  onGoTo={(key) => goTo(key)}
                />
                <CheckList title="Worth knowing" details={checks?.warnings ?? []} steps={steps} onGoTo={(key) => goTo(key)} />
              </>
            )}
          </>
        );
    }
  };

  const last = step === steps.length - 1;
  // The idea list and the students panels have forms of their own, so only the field steps are one form.
  const formStep = stepKey === "details" || stepKey === "teams" || stepKey === "milestones";
  return (
    <section className="wizard-page">
      <button
        className="back-button"
        onClick={() => navigate(cycle ? `/faculty/cycles/${cycle.id}` : "/faculty/cycles")}
      >
        ← {cycle ? "Back to the project" : "Back to projects"}
      </button>
      <p className="eyebrow">
        {mode === "create" ? "New project" : mode === "draft" ? "Draft · saved as you go" : "Published project"}
      </p>
      <div className="wizard-layout">
        <div className="cycle-form wizard-form">
          <StepIndicator
            steps={steps}
            current={step}
            reachable={cycle ? steps.length - 1 : 0}
            onSelect={(index) => goTo(steps[index])}
          />
          <h2 className="wizard-heading" ref={headingRef} tabIndex={-1}>
            <span className="visually-hidden">
              Step {step + 1} of {steps.length}:{" "}
            </span>
            {STEP_HEADINGS[stepKey]}
          </h2>
          {formStep ? (
            <form id="wizard-step-form" onSubmit={(event) => void next(event)} noValidate>
              {body()}
            </form>
          ) : (
            body()
          )}
          {(stepKey === "teams" || stepKey === "milestones") && <TermWarnings warnings={planWarnings(state)} />}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="wizard-nav">
            {step > 0 && (
              <button type="button" className="text-button" onClick={() => goTo(steps[step - 1])}>
                ← Back
              </button>
            )}
            {!last && (
              <button
                type={formStep ? "submit" : "button"}
                form={formStep ? "wizard-step-form" : undefined}
                onClick={formStep ? undefined : () => void next()}
                className="primary-button"
                disabled={busy}
              >
                {busy ? "Saving…" : mode === "create" ? "Save draft and continue" : "Save and continue"}
              </button>
            )}
            {last && mode === "draft" && (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !checks || checks.blocking.length > 0}
                onClick={() => setConfirming(true)}
              >
                Publish to students
              </button>
            )}
            {last && mode === "published" && (
              <button type="button" className="primary-button" onClick={() => navigate(`/faculty/cycles/${cycle!.id}`)}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
      {confirming && (
        <PublishDialog
          audience={state.kind === "ELECTIVE" ? "The students you enrolled" : `Students of batch ${state.batchYear}`}
          busy={busy}
          error={error}
          onCancel={closeDialog}
          onConfirm={() => void publish()}
        />
      )}
    </section>
  );
}
