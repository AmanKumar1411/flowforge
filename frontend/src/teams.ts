import type { Cycle, TeamOrigin } from "./types";

/**
 * Mirrors the API's rule for display only; the API decides. `now` comes from
 * the caller (read once per mount) so rendering stays pure.
 */
export function isFormationOpen(cycle: Cycle, now: number) {
  return cycle.status === "PUBLISHED" && now < Date.parse(cycle.teamDeadline);
}

/** The faculty's window: from the team deadline until the idea deadline. */
export function isPlacementOpen(cycle: Cycle, now: number) {
  return (
    cycle.status === "PUBLISHED" &&
    Date.parse(cycle.teamDeadline) <= now &&
    now < Date.parse(cycle.ideaDeadline)
  );
}

const ORIGIN_LABELS: Record<TeamOrigin, string> = {
  STUDENT: "Students",
  FACULTY: "Faculty",
  AUTO_GROUP: "Auto-group",
};

export function originLabel(origin: TeamOrigin) {
  return ORIGIN_LABELS[origin];
}

// Anything shaped like an email in pasted text or a CSV file.
export function extractEmails(text: string) {
  return [...new Set(text.match(/[^\s,;"'<>()]+@[^\s,;"'<>()]+/g) ?? [])];
}

export function describeTeamSize(cycle: Pick<Cycle, "minTeamSize" | "maxTeamSize">) {
  return cycle.minTeamSize === cycle.maxTeamSize
    ? `Exactly ${cycle.minTeamSize}`
    : `${cycle.minTeamSize} to ${cycle.maxTeamSize}`;
}

// The API accepts letters, digits, spaces and . @ ' - in a search.
export function cleanSearch(value: string) {
  return value.replace(/[^\p{L}\p{M}\p{N} .@'-]/gu, "").trim();
}
