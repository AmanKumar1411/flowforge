import type { Role } from "../../auth/domain/role";
import {
  SubmissionContent,
  SubmissionCycle,
  SubmissionIdea,
  SubmissionMilestone,
  SubmissionTeam,
  SubmissionWindow,
} from "./submission";
import { SubmissionDomainError } from "./submission.errors";
import { Link } from "../../common/links/link-type";

export type SubmissionActor = { id: string; role: Role };

/**
 * The submission rules of a cycle, free of I/O (ADRs 015 and 016). Any member
 * of a team whose idea is approved (or picked from the catalog) adds a
 * version for a milestone while that milestone is open: from its
 * `submissionOpensAt` until its `submissionDueAt`, while the cycle is
 * published. There is no late work; the newest version before the due date
 * is the team's final one for that milestone.
 */
export class SubmissionRules {
  /** The cycle's milestone, or MILESTONE_NOT_FOUND. */
  milestoneOf(
    cycle: SubmissionCycle,
    milestoneId: string,
  ): SubmissionMilestone {
    const milestone = cycle.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new SubmissionDomainError(
        "MILESTONE_NOT_FOUND",
        "This project has no such milestone",
      );
    }
    return milestone;
  }

  window(
    cycle: SubmissionCycle,
    milestone: SubmissionMilestone,
    now: Date,
  ): SubmissionWindow {
    if (cycle.status !== "PUBLISHED" || now >= milestone.submissionDueAt) {
      return "CLOSED";
    }
    return now < milestone.submissionOpensAt ? "NOT_OPEN" : "OPEN";
  }

  assertCanSubmit(
    actor: SubmissionActor,
    team: SubmissionTeam,
    cycle: SubmissionCycle,
    milestone: SubmissionMilestone,
    idea: SubmissionIdea | null,
    now: Date,
  ): void {
    if (!team.members.some((member) => member.userId === actor.id)) {
      throw new SubmissionDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    const window = this.window(cycle, milestone, now);
    if (window === "NOT_OPEN") {
      throw new SubmissionDomainError(
        "SUBMISSION_NOT_OPEN",
        `Submissions for M${milestone.position} open on ${milestone.submissionOpensAt.toISOString()}`,
      );
    }
    if (window === "CLOSED") {
      throw new SubmissionDomainError(
        "SUBMISSION_CLOSED",
        `Submissions for M${milestone.position} are closed`,
      );
    }
    if (idea?.status !== "APPROVED") {
      throw new SubmissionDomainError(
        "IDEA_NOT_APPROVED",
        "Your team needs an approved idea, or one picked from the faculty's list, before it can submit work",
      );
    }
  }

  /**
   * Versions are permanent, so a team's history is capped (SEC-F1, H10): a
   * script cannot fill it, and every list of it stays bounded.
   */
  assertBelowVersionLimit(latestVersion: number, limit: number): void {
    if (latestVersion >= limit) {
      throw new SubmissionDomainError(
        "VERSION_LIMIT_REACHED",
        `Your team has submitted the most versions allowed for this milestone (${limit}); ask your faculty if you need another`,
      );
    }
  }

  /** The links checked against the milestone's requirement; empty notes mean none. */
  clean(
    content: SubmissionContent,
    milestone: SubmissionMilestone,
  ): { links: Link[]; notes: string | null } {
    return {
      links: milestone.linkRequirement.check(content.links),
      notes: content.notes?.trim() || null,
    };
  }
}
