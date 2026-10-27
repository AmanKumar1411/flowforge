import type { Cycle } from "./types";

/**
 * Mirrors the API's rule for display only; the API decides. `now` comes from
 * the caller (read once per mount) so rendering stays pure.
 */
export function isFormationOpen(cycle: Cycle, now: number) {
  return (
    cycle.status === "PUBLISHED" &&
    now < Date.parse(cycle.teamFormationDeadline)
  );
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
