import type { Role } from "../../auth/domain/role";
import {
  SubmissionContent,
  SubmissionCycle,
  SubmissionIdea,
  SubmissionTeam,
  SubmissionWindow,
} from "./submission";
import { SubmissionDomainError } from "./submission.errors";

export type SubmissionActor = { id: string; role: Role };

/**
 * The submission rules of a cycle, free of I/O (ADR 015). Any member of a team
 * whose idea is approved (or picked from the catalog) adds a version while
 * submissions are open: from `submissionStartAt` until `submissionDeadline`,
 * while the cycle is published. There is no late work; the newest version
 * before the deadline is the team's final one.
 */
export class SubmissionRules {
  window(cycle: SubmissionCycle, now: Date): SubmissionWindow {
    if (cycle.status !== "PUBLISHED" || now >= cycle.submissionDeadline) {
      return "CLOSED";
    }
    return now < cycle.submissionStartAt ? "NOT_OPEN" : "OPEN";
  }

  assertCanSubmit(
    actor: SubmissionActor,
    team: SubmissionTeam,
    cycle: SubmissionCycle,
    idea: SubmissionIdea | null,
    now: Date,
  ): void {
    if (!team.members.some((member) => member.userId === actor.id)) {
      throw new SubmissionDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    const window = this.window(cycle, now);
    if (window === "NOT_OPEN") {
      throw new SubmissionDomainError(
        "SUBMISSION_NOT_OPEN",
        `Submissions open on ${cycle.submissionStartAt.toISOString()}`,
      );
    }
    if (window === "CLOSED") {
      throw new SubmissionDomainError(
        "SUBMISSION_CLOSED",
        "Submissions for this cycle are closed",
      );
    }
    if (idea?.status !== "APPROVED") {
      throw new SubmissionDomainError(
        "IDEA_NOT_APPROVED",
        "Your team needs an approved idea, or one picked from the faculty's list, before it can submit work",
      );
    }
  }

  /** Trimmed content; empty optional fields mean none. */
  clean(content: SubmissionContent): SubmissionContent {
    return {
      repositoryUrl: content.repositoryUrl.trim(),
      demoUrl: content.demoUrl?.trim() || null,
      reportUrl: content.reportUrl?.trim() || null,
      notes: content.notes?.trim() || null,
    };
  }
}
