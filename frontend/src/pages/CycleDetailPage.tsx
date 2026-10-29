import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { closeCycle, getCycle, publishCycle } from "../api/cycles";
import { BatchPanel } from "../components/BatchPanel";
import { FacultyCatalogSection } from "../components/CatalogPanel";
import { CycleSection } from "../components/CycleSection";
import { PublishDialog } from "../components/CycleWizardSteps";
import { EnrollmentPanel } from "../components/EnrollmentPanel";
import { CompletionPanel } from "../components/FacultyTeamPanels";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { StudentTeamPanel } from "../components/TeamPanels";
import { TeamsList } from "../components/TeamsList";
import { countsOf, useCycleData } from "../cycle-data";
import {
  attentionItems,
  phaseOf,
  primaryAction,
  sectionFor,
  sectionSummary,
  type PageTarget,
  type SectionKey,
} from "../cycle-page";
import { formatDay } from "../dates";
import { readableError } from "../errors";
import { cyclePhases } from "../phases";
import { teamRows, type TeamFilter } from "../team-rows";
import { describeTeamSize } from "../teams";
import type { Cycle } from "../types";

const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "students", title: "Students" },
  { key: "catalog", title: "Idea list" },
];

function openSectionsKey(cycleId: string) {
  return `flowforge:cycle-sections:${cycleId}`;
}

/** What this viewer opened or closed on this device; the students start open in a draft. */
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

/** Brings a part of the page into view and moves focus to its heading. */
function scrollToPart(id: string) {
  requestAnimationFrame(() => {
    const part = document.getElementById(id);
    part?.scrollIntoView({ behavior: "smooth", block: "start" });
    part?.querySelector<HTMLElement>("summary, h2")?.focus();
  });
}

export function CycleDetailPage({ faculty }: { faculty: boolean }) {
  const { cycleId = "" } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  // Loads the page's parts again after the faculty changed something.
  const [version, setVersion] = useState(0);
  // Null until the viewer opens or closes a section on this visit.
  const [choices, setChoices] = useState<SectionChoices | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TeamFilter>("all");
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
  const data = useCycleData(faculty ? cycle : null, version);
  const counts = countsOf(data);
  const rows =
    data.teams && data.ideas && data.submissions
      ? teamRows(data.teams, data.ideas, data.submissions)
      : null;

  // The default section starts open, plus what the viewer opened, minus what they closed.
  const chosen = choices ?? (cycle ? rememberedChoices(cycle.id) : { opened: [], closed: [] });
  const defaultSection = cycle ? sectionFor(phaseOf(cycle, now)) : null;
  const open = new Set(
    [...(defaultSection ? [defaultSection] : []), ...chosen.opened].filter(
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
  const go = (target: PageTarget) => {
    if (target === "students" || target === "catalog") {
      if (!open.has(target)) toggle(target, true);
      return scrollToPart(`section-${target}`);
    }
    if (target === "review") {
      // One waiting proposal opens its team; several show only the waiting ones.
      const waiting = rows?.filter((row) => row.idea?.status === "SUBMITTED") ?? [];
      if (waiting.length === 1) return navigate(`/faculty/cycles/${cycleId}/teams/${waiting[0].id}`);
      setQuery("");
      setFilter("waiting");
    }
    scrollToPart(target === "completion" ? "completion" : "teams");
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
    if (action.kind === "go") return go(action.target);
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
                  <button className="text-button" onClick={() => go(item.target)}>
                    {item.action}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="cycle-main">
          {faculty ? (
            <>
              <TeamsList
                cycle={cycle}
                rows={rows}
                error={data.failed.teams ? "Couldn't load the teams. Reload the page to try again." : ""}
                query={query}
                filter={filter}
                onQuery={setQuery}
                onFilter={setFilter}
                empty={
                  <p className="muted">
                    {phase === "draft"
                      ? "Students form teams once you publish the cycle."
                      : phase === "closed"
                        ? "No teams were formed."
                        : "No teams yet. Students form their own teams now."}
                  </p>
                }
              />
              {data.teams && data.overview && (
                <div id="completion">
                  <CompletionPanel
                    cycle={cycle}
                    teams={data.teams}
                    overview={data.overview}
                    now={now}
                    onChanged={() => setVersion((current) => current + 1)}
                  />
                </div>
              )}
              {SECTIONS.map(({ key, title }) => (
                <CycleSection
                  key={key}
                  id={`section-${key}`}
                  title={title}
                  summary={sectionSummary(key, cycle, phase, counts)}
                  open={open.has(key)}
                  onToggle={(isOpen) => toggle(key, isOpen)}
                >
                  {key === "students" ? (
                    cycle.kind === "ELECTIVE" ? (
                      <EnrollmentPanel cycle={cycle} />
                    ) : (
                      <BatchPanel cycle={cycle} />
                    )
                  ) : (
                    <FacultyCatalogSection cycle={cycle} />
                  )}
                </CycleSection>
              ))}
            </>
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
