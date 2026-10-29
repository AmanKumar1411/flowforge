import type { CycleEvent, CycleStage } from "./types";

/** The API's computed stage and events (ADR 017) in words. */

const label = (milestone: { position: number; name: string }) =>
  `M${milestone.position} · ${milestone.name}`;

/** "Teams forming", "M2 · Beta open", "Wrapping up"… */
export function stageLabel(stage: CycleStage): string {
  switch (stage.kind) {
    case "DRAFT":
      return "Draft";
    case "TEAMS":
      return "Teams forming";
    case "IDEAS":
      return "Ideas due";
    case "WRAP_UP":
      return "Wrapping up";
    case "CLOSED":
      return "Closed";
    case "MILESTONE": {
      const phase = {
        UPCOMING: "opens next",
        OPEN: "open for submissions",
        AWAITING_EVALUATION: "waiting for evaluation",
      }[stage.phase];
      return `${label(stage.milestone)} ${phase}`;
    }
  }
}

/** "Team deadline", "M1 · Design review due"… */
export function eventLabel(event: CycleEvent): string {
  switch (event.kind) {
    case "TEAM_DEADLINE":
      return "Team deadline";
    case "IDEA_DEADLINE":
      return "Idea deadline";
    case "SUBMISSION_OPENS":
      return `${label(event.milestone!)} opens`;
    case "SUBMISSION_DUE":
      return `${label(event.milestone!)} due`;
    case "EVALUATION":
      return `${label(event.milestone!)} evaluation`;
  }
}
