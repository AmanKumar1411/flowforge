import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  closeCycle,
  getCycle,
  listBatchStudents,
  listEnrollments,
  publishCycle,
} from "../api/cycles";
import { listCatalog, listCycleIdeas } from "../api/ideas";
import { listCycleSubmissions } from "../api/submissions";
import { getCompletionOverview } from "../api/teams";
import { BatchPanel } from "../components/BatchPanel";
import { FacultyCatalogSection } from "../components/CatalogPanel";
import { CycleSection } from "../components/CycleSection";
import { PublishDialog } from "../components/CycleWizardSteps";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { FacultyTeamsSection } from "../components/FacultyTeamPanels";
import { FacultyIdeasSection } from "../components/IdeaPanels";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { FacultySubmissionsSection } from "../components/SubmissionPanels";
import { StudentTeamPanel } from "../components/TeamPanels";
import {
  attentionItems,
  phaseOf,
  primaryAction,
  sectionFor,
  sectionSummary,
  type CycleCounts,
  type SectionKey,
} from "../cycle-page";
import { formatDay } from "../dates";
import { readableError } from "../errors";
import { cyclePhases } from "../phases";
import { describeTeamSize } from "../teams";
import type { Cycle } from "../types";

const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "students", title: "Students" },
  { key: "catalog", title: "Idea list" },
  { key: "teams", title: "Teams" },
  { key: "ideas", title: "Ideas" },
  { key: "submissions", title: "Submissions" },
];

/** Counts for the summaries and the attention card, from the calls the sections make themselves. */
function useCycleCounts(cycle: Cycle | null, version: number) {
  const [counts, setCounts] = useState<CycleCounts>({});
  useEffect(() => {
    if (!cycle) return;
    let live = true;
    const merge = (part: CycleCounts) =>
      live &&
      setCounts((current) => ({
        ...current,
        ...part,
        failed: { ...current.failed, ...part.failed },
      }));
    const fail = (...sections: SectionKey[]) => () =>
      merge({ failed: Object.fromEntries(sections.map((key) => [key, true])) });
    const roster =
      cycle.kind === "ELECTIVE" ? listEnrollments(cycle.id) : listBatchStudents(cycle.id);
    roster
      .then((list) =>
        merge({
          roster: {
            total: list.length,
            notSignedIn: list.filter((student) => !student.signedIn).length,
          },
        }),
      )
      .catch(fail("students"));
    listCatalog(cycle.id)
      .then((list) =>
        merge({
          catalog: {
            offered: list.length,
            picked: list.reduce((sum, idea) => sum + idea.pickCount, 0),
          },
        }),
      )
      .catch(fail("catalog"));
    if (cycle.status !== "DRAFT") {
      listCycleIdeas(cycle.id)
        .then((rows) => {
          const count = (status: string | null) =>
            rows.filter((row) => (row.idea?.status ?? null) === status).length;
          merge({
            teams: rows.length,
            ideas: {
              waiting: count("SUBMITTED"),
              approved: count("APPROVED"),
              rejected: count("REJECTED"),
              none: count(null),
            },
          });
        })
        .catch(fail("teams", "ideas"));
      getCompletionOverview(cycle.id)
        .then((overview) => merge({ unplaced: overview.unassigned.length }))
        .catch(fail("teams"));
      listCycleSubmissions(cycle.id)
        .then((rows) => merge({ submissions: { submitted: rows.filter((row) => row.latest).length } }))
        .catch(fail("submissions"));
    }
    return () => {
      live = false;
    };
  }, [cycle, version]);
  return counts;
}

function openSectionsKey(cycleId: string) {
  return `flowforge:cycle-sections:${cycleId}`;
}

/** What this viewer opened or closed on this device; the current phase's section opens on its own. */
interface SectionChoices {
  opened: SectionKey[];
  closed: SectionKey[];
}

function rememberedChoices(cycleId: string): SectionChoices {
  try {
    const saved = JSON.parse(localStorage.getItem(openSectionsKey(cycleId)) ?? "null");
    if (Array.isArray(saved?.opened) && Array.isArray(saved?.closed)) return saved;
  } catch {
    // Unreadable or blocked storage: start from the defaults.
  }
  return { opened: [], closed: [] };
}

export function CycleDetailPage({ faculty }: { faculty: boolean }) {
  const { cycleId = "" } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  // Refreshes the counts when a section is opened or closed, after the faculty may have changed something.
  const [version, setVersion] = useState(0);
  // Null until the viewer opens or closes a section on this visit.
  const [choices, setChoices] = useState<SectionChoices | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const backTo = faculty ? "/faculty/cycles" : "/student/cycles";

  const load = useCallback(() => {
    getCycle(cycleId)
      .then(setCycle)
      .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);
  useEffect(load, [load]);
  const counts = useCycleCounts(faculty ? cycle : null, version);

  // The current phase's section starts open, plus what the viewer opened, minus what they closed.
  const chosen = choices ?? (cycle ? rememberedChoices(cycle.id) : { opened: [], closed: [] });
  const open = new Set(
    [...(cycle ? [sectionFor(phaseOf(cycle, now))] : []), ...chosen.opened].filter(
      (key) => !chosen.closed.includes(key),
    ),
  );

  const toggle = (key: SectionKey, isOpen: boolean) => {
    const without = (list: SectionKey[]) => list.filter((entry) => entry !== key);
    const next: SectionChoices = {
      opened: isOpen ? [...without(chosen.opened), key] : without(chosen.opened),
      closed: isOpen ? without(chosen.closed) : [...without(chosen.closed), key],
    };
    setChoices(next);
    try {
      localStorage.setItem(openSectionsKey(cycleId), JSON.stringify(next));
    } catch {
      // Not remembering open sections is fine.
    }
    setVersion((current) => current + 1);
  };
  const reveal = (key: SectionKey) => {
    if (!open.has(key)) toggle(key, true);
    // After the section renders open, bring it into view and move focus to it.
    requestAnimationFrame(() => {
      const section = document.getElementById(`section-${key}`);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      section?.querySelector("summary")?.focus();
    });
  };

  if (error)
    return (
      <section>
        <button className="back-button" onClick={() => navigate(backTo)}>
          ← Back
        </button>
        <p className="form-error banner">{error}</p>
      </section>
    );
  if (!cycle) return <p className="loading">Loading cycle…</p>;

  const phase = phaseOf(cycle, now);
  const action = primaryAction(phase, counts);
  const attention = faculty ? attentionItems(cycle, phase, counts) : [];
  const phases = cyclePhases(
    {
      ...cycle,
      teamCompletionDeadline:
        Date.parse(cycle.teamCompletionDeadline) > Date.parse(cycle.teamFormationDeadline)
          ? cycle.teamCompletionDeadline
          : null,
    },
    cycle.publishedAt ?? cycle.createdAt,
    cycle.status === "CLOSED" ? cycle.closedAt : null,
    faculty ? "You place students" : "Faculty place students",
  );

  const runAction = async () => {
    if (action.kind === "open") return reveal(action.section);
    if (action.kind === "publish") return setPublishing(true);
    if (!window.confirm("Close this cycle? Nothing can change afterwards, and students can no longer submit.")) return;
    setBusy(true);
    setActionError("");
    try {
      setCycle(await closeCycle(cycle.id));
    } catch (caught) {
      setActionError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setActionError("");
    try {
      setCycle(await publishCycle(cycle.id));
      setPublishing(false);
    } catch (caught) {
      setActionError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="detail-page">
      <button className="back-button" onClick={() => navigate(backTo)}>
        ← Back to cycles
      </button>
      <header className="cycle-header">
        <div className="cycle-heading">
          <p className="cycle-kicker">
            <span className={`status status-${cycle.status.toLowerCase()}`}>
              {cycle.status === "PUBLISHED" ? "Open" : cycle.status === "DRAFT" ? "Draft" : "Closed"}
            </span>
            <span className="eyebrow">
              {cycle.courseName} / Batch {cycle.batchYear}
              {cycle.kind === "ELECTIVE" && " / Elective"}
            </span>
          </p>
          <h1>{cycle.title}</h1>
          {cycle.description && <p className="cycle-description">{cycle.description}</p>}
          <p className="cycle-facts">
            {cycle.kind === "ELECTIVE" ? "Elective: enrolled students" : "Core course: the whole batch"} ·
            Teams of {describeTeamSize(cycle)} members · Semester {cycle.semester}, {cycle.academicYear}
          </p>
        </div>
        {faculty && (
          <div className="cycle-actions">
            <button className="primary-button" disabled={busy} onClick={() => void runAction()}>
              {action.label}
            </button>
            {cycle.status !== "CLOSED" && (
              <button
                className="text-button"
                onClick={() => navigate(`/faculty/cycles/${cycle.id}/edit`)}
              >
                Edit cycle
              </button>
            )}
          </div>
        )}
      </header>
      {actionError && !publishing && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      <PhaseTimeline
        label={cycle.status === "DRAFT" ? "Planned phases" : "Where the cycle is"}
        phases={phases}
        now={cycle.status === "DRAFT" ? undefined : now}
      />
      {cycle.status === "DRAFT" && faculty && (
        <p className="field-hint">
          Students can't see this cycle yet. Publish it when the plan is ready; students
          can then form teams until {formatDay(cycle.teamFormationDeadline)}.
        </p>
      )}
      <div className="cycle-layout">
        {attention.length > 0 && (
          <section className="attention-card" aria-labelledby="attention-heading">
            <h2 id="attention-heading">Needs your attention</h2>
            <ul>
              {attention.map((item) => (
                <li key={item.key}>
                  <span>{item.text}</span>
                  <button className="text-button" onClick={() => reveal(item.section)}>
                    {item.action}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="cycle-main">
          {faculty ? (
            SECTIONS.map(({ key, title }) => (
              <CycleSection
                key={key}
                id={`section-${key}`}
                title={title}
                summary={sectionSummary(key, cycle, phase, counts)}
                open={open.has(key)}
                onToggle={(isOpen) => toggle(key, isOpen)}
              >
                <SectionBody section={key} cycle={cycle} counts={counts} phase={phase} />
              </CycleSection>
            ))
          ) : (
            <StudentTeamPanel cycle={cycle} />
          )}
        </div>
        {faculty && (
          <aside className="cycle-side" aria-label="The cycle at a glance">
            <section className="side-card" aria-labelledby="glance-heading">
              <h2 id="glance-heading">At a glance</h2>
              <dl className="glance">
                <dt>Students</dt>
                <dd>{sectionSummary("students", cycle, phase, counts)}</dd>
                <dt>Submissions</dt>
                <dd>{sectionSummary("submissions", cycle, phase, counts)}</dd>
              </dl>
            </section>
          </aside>
        )}
      </div>
      {publishing && (
        <PublishDialog
          audience={
            cycle.kind === "ELECTIVE"
              ? "The students you enroll"
              : `Students of batch ${cycle.batchYear}`
          }
          opensAt={cycle.submissionStartAt}
          busy={busy}
          error={actionError}
          onCancel={() => setPublishing(false)}
          onConfirm={() => void publish()}
        />
      )}
    </section>
  );
}

/** A section's panel, or one helpful line when there is nothing to show yet. */
function SectionBody({
  section,
  cycle,
  counts,
  phase,
}: {
  section: SectionKey;
  cycle: Cycle;
  counts: CycleCounts;
  phase: ReturnType<typeof phaseOf>;
}) {
  const closed = phase === "closed";
  switch (section) {
    case "students":
      return cycle.kind === "ELECTIVE" ? <EnrollmentPanel cycle={cycle} /> : <BatchPanel cycle={cycle} />;
    case "catalog":
      return <FacultyCatalogSection cycle={cycle} />;
    case "teams":
      if (phase === "draft") {
        return <p className="muted">Students form teams once you publish the cycle.</p>;
      }
      return <FacultyTeamsSection cycle={cycle} />;
    case "ideas":
      if (phase === "draft") {
        return <p className="muted">Teams pick or propose ideas once they have formed.</p>;
      }
      if (counts.teams === 0) {
        return (
          <p className="muted">
            {closed
              ? "No teams were formed, so there were no ideas."
              : "Ideas appear here once teams form. You can list ideas for teams to pick in the idea list meanwhile."}
          </p>
        );
      }
      return <FacultyIdeasSection cycle={cycle} canReview />;
    case "submissions":
      if (phase === "draft") {
        return (
          <p className="muted">
            Teams submit work from {formatDay(cycle.submissionStartAt)} to{" "}
            {formatDay(cycle.submissionDeadline)}, once their idea is approved.
          </p>
        );
      }
      if (counts.teams === 0) {
        return (
          <p className="muted">
            {closed ? "No teams were formed, so no work was submitted." : "Submissions appear here once teams form."}
          </p>
        );
      }
      return <FacultySubmissionsSection cycle={cycle} />;
  }
}
