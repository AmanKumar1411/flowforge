import type { Role } from "../../auth/domain/role";
import { IdeaDomainError } from "./idea.errors";
import {
  Idea,
  IdeaContent,
  IdeaCycle,
  IdeaDecision,
  IdeaTeam,
  SubmissionAction,
} from "./idea";

export type IdeaActor = { id: string; role: Role };

/**
 * The idea rules of a cycle, free of I/O (ADR 013). The leader submits the
 * first idea before the idea deadline and may change it until then while it
 * waits for review. A rejected idea can be revised and resubmitted until
 * submissions open. The owning faculty review any submitted version while the
 * cycle is published. An approved idea is final. The team never changes
 * because of its idea.
 */
export class IdeaRules {
  /** Whether the leader can submit a first idea now. */
  isSubmissionOpen(cycle: IdeaCycle, now: Date): boolean {
    return cycle.status === "PUBLISHED" && now < cycle.ideaDeadline;
  }

  /** Whether a rejected idea can still be resubmitted now. */
  isResubmissionOpen(cycle: IdeaCycle, now: Date): boolean {
    return cycle.status === "PUBLISHED" && now < cycle.submissionStartAt;
  }

  assertLeader(actor: IdeaActor, team: IdeaTeam): void {
    if (team.leaderId !== actor.id) {
      throw new IdeaDomainError(
        "NOT_TEAM_LEADER",
        "Only the team leader can submit or change the idea",
      );
    }
  }

  /** What saving the leader's content does to the current idea, or why it cannot be saved. */
  submissionAction(
    current: Pick<Idea, "status"> | null,
    cycle: IdeaCycle,
    now: Date,
  ): SubmissionAction {
    if (current?.status === "APPROVED") {
      throw new IdeaDomainError(
        "IDEA_ALREADY_APPROVED",
        "This idea is approved and can no longer change",
      );
    }
    if (current?.status === "REJECTED") {
      if (this.isResubmissionOpen(cycle, now)) return "RESUBMIT";
      throw new IdeaDomainError(
        "IDEA_RESUBMISSION_CLOSED",
        "A rejected idea can be resubmitted only until submissions open",
      );
    }
    if (this.isSubmissionOpen(cycle, now)) {
      return current ? "EDIT" : "CREATE";
    }
    throw new IdeaDomainError(
      "IDEA_SUBMISSION_CLOSED",
      current
        ? "The idea deadline has passed; your idea waits for the faculty's review"
        : "The idea deadline for this cycle has passed",
    );
  }

  /** Only the faculty who own the cycle review its ideas. */
  assertReviewer(actor: IdeaActor, cycle: IdeaCycle): void {
    if (actor.role !== "FACULTY" || cycle.createdByFacultyId !== actor.id) {
      throw new IdeaDomainError("TEAM_NOT_FOUND", "Team not found");
    }
  }

  /** The faculty decide on the version they read, while it waits and the cycle is published. */
  assertCanReview(idea: Idea, cycle: IdeaCycle, seenVersion: number): void {
    if (cycle.status !== "PUBLISHED") {
      throw new IdeaDomainError(
        "IDEA_REVIEW_CLOSED",
        "Ideas can be reviewed only while the cycle is published",
      );
    }
    if (idea.status !== "SUBMITTED") {
      throw new IdeaDomainError(
        "IDEA_NOT_AWAITING_REVIEW",
        idea.status === "APPROVED"
          ? "This idea is already approved"
          : "This idea was rejected and waits for the team to resubmit it",
      );
    }
    if (idea.version !== seenVersion) {
      throw new IdeaDomainError(
        "IDEA_CHANGED",
        "The team changed the idea since you opened it; review the new version",
      );
    }
  }

  /** A rejection always tells the team why; feedback is optional on an approval. */
  feedbackFor(
    decision: IdeaDecision,
    raw: string | null | undefined,
  ): string | null {
    const feedback = raw?.trim() || null;
    if (decision === "REJECTED" && !feedback) {
      throw new IdeaDomainError(
        "IDEA_FEEDBACK_REQUIRED",
        "Tell the team why the idea is rejected",
      );
    }
    return feedback;
  }

  /** Trimmed content; an empty link means none. */
  clean(content: IdeaContent): IdeaContent {
    return {
      title: content.title.trim(),
      problem: content.problem.trim(),
      solution: content.solution.trim(),
      link: content.link?.trim() || null,
    };
  }
}
