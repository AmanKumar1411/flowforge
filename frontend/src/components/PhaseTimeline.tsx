import { formatDay } from "../dates";
import type { Phase, PhaseState } from "../phases";

const STATE_TEXT: Record<PhaseState, string> = {
  done: "Done",
  current: "Now",
  upcoming: "Later",
};

/**
 * Phases as one horizontal bar (a vertical list where it is narrow). Each
 * phase is at least as wide as its two lines of text and grows a little with
 * its length, so short phases stay readable. A phase that starts where the
 * previous one ended shows only its end, so each deadline appears once. With
 * `now`, finished phases are ticked, the current one is marked "Now" and a
 * "Today" tag sits above it; every state is written out, so colour is never
 * the only signal.
 */
export function PhaseTimeline({
  phases,
  now,
  label,
}: {
  phases: Phase[];
  now?: number;
  label: string;
}) {
  const length = (phase: Phase) =>
    phase.end ? Math.max(Date.parse(phase.end) - Date.parse(phase.start), 0) : 0;
  const total = phases.reduce((sum, phase) => sum + length(phase), 0) || 1;
  const stateOf = (phase: Phase): PhaseState | null => {
    if (phase.state) return phase.state;
    if (now === undefined) return null;
    if (phase.end && now > Date.parse(phase.end)) return "done";
    return now >= Date.parse(phase.start) ? "current" : "upcoming";
  };
  const dates = (phase: Phase, index: number, state: PhaseState | null) => {
    if (!phase.end) return `${state === "current" ? "Since" : "After"} ${formatDay(phase.start)}`;
    const follows = index > 0 && phases[index - 1].end === phase.start;
    return follows
      ? `Until ${formatDay(phase.end)}`
      : `${formatDay(phase.start)} – ${formatDay(phase.end)}`;
  };
  return (
    <div className="phase-frame">
      <ol className={`phase-timeline${now === undefined ? "" : " has-today"}`} aria-label={label}>
        {phases.map((phase, index) => {
          const state = stateOf(phase);
          const todayAt =
            state === "current" && phase.end && now !== undefined
              ? (now - Date.parse(phase.start)) / (length(phase) || 1)
              : null;
          return (
            <li
              key={phase.key}
              className={`phase phase-${phase.key}${state ? ` is-${state}` : ""}`}
              style={{ flexGrow: 1 + 3 * (length(phase) / total) }}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="phase-name">
                {state === "done" && <span aria-hidden="true">✓ </span>}
                {phase.label}
                {state && <span className="phase-state"> · {STATE_TEXT[state]}</span>}
              </span>
              <span className="phase-dates">{dates(phase, index, state)}</span>
              {todayAt !== null && (
                <span
                  className="today-marker"
                  style={{
                    left: `${Math.min(Math.max(todayAt, 0), 1) * 100}%`,
                    // Near either end the tag stays over its phase.
                    transform: `translateX(${todayAt < 0.15 ? 0 : todayAt > 0.85 ? -100 : -50}%)`,
                  }}
                >
                  Today
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
