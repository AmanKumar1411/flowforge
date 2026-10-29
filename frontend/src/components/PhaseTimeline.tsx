import { formatDay } from "../dates";
import type { Phase, PhaseState } from "../phases";

const STATE_TEXT: Record<PhaseState, string> = {
  done: "Done",
  current: "Now",
  upcoming: "Later",
};

/**
 * Phases as one horizontal bar (a vertical list on narrow screens), each
 * segment as wide as the phase is long. With `now`, finished phases are
 * ticked, the current one is marked "Now" and a "Today" line sits inside it;
 * every state is written out, so colour is never the only signal.
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
  return (
    <ol className="phase-timeline" aria-label={label}>
      {phases.map((phase) => {
        const state = stateOf(phase);
        const share = length(phase) / total;
        const todayAt =
          state === "current" && phase.end && now !== undefined
            ? (now - Date.parse(phase.start)) / (length(phase) || 1)
            : null;
        return (
          <li
            key={phase.key}
            className={`phase phase-${phase.key}${state ? ` is-${state}` : ""}`}
            style={{ flexGrow: Math.max(share, 0.12) }}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="phase-name">
              {state === "done" && <span aria-hidden="true">✓ </span>}
              {phase.label}
              {state && <span className="phase-state"> · {STATE_TEXT[state]}</span>}
            </span>
            <span className="phase-dates">
              {phase.end
                ? `${formatDay(phase.start)} – ${formatDay(phase.end)}`
                : `${state === "current" ? "Since" : "After"} ${formatDay(phase.start)}`}
            </span>
            {todayAt !== null && (
              <span
                className="today-marker"
                style={{
                  left: `${Math.min(Math.max(todayAt, 0), 1) * 100}%`,
                  // Near either end the label stays inside the bar.
                  transform: `translateX(${todayAt < 0.1 ? 0 : todayAt > 0.9 ? -100 : -50}%)`,
                }}
              >
                Today
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
