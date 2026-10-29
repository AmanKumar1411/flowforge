import type { Role } from "../../auth/domain/role";
import { IdeaDomainError } from "./idea.errors";
import {
  CatalogIdea,
  CatalogIdeaContent,
  Idea,
  IdeaContent,
  IdeaCycle,
  IdeaDecision,
  IdeaTeam,
  IdeaVersionContent,
  SubmissionAction,
} from "./idea";

export type IdeaActor = { id: string; role: Role };

/**
 * The idea rules of a cycle, free of I/O (ADRs 013 and 014). The leader
 * either proposes the team's own idea or picks one from the faculty's
 * catalog; the first idea is due by the idea deadline, and a waiting proposal
 * can change until then. After a rejection, the team revises (or picks
 * instead) for as many rounds as it takes, while the cycle is published. The
 * owning faculty review any submitted version while the cycle is published.
 * An approved or picked idea is final. The team never changes because of its
 * idea. The cycle's idea source decides whether teams may propose, pick, or
 * both, and its link requirement which links a proposal carries.
 */
export class IdeaRules {
  /** Whether the leader can submit a first idea now. */
  isSubmissionOpen(cycle: IdeaCycle, now: Date): boolean {
    return cycle.status === "PUBLISHED" && now < cycle.ideaDeadline;
  }

  /** Whether a rejected idea can be revised now: in every round, while the cycle is published. */
  isResubmissionOpen(cycle: IdeaCycle): boolean {
    return cycle.status === "PUBLISHED";
  }

  /** A cycle limited to the faculty's list takes no proposals. */
  assertProposalsAllowed(cycle: IdeaCycle): void {
    if (cycle.ideaSource === "FACULTY_LIST") {
      throw new IdeaDomainError(
        "PROPOSALS_NOT_ALLOWED",
        "This project's ideas come from the faculty's list; pick one of them",
      );
    }
  }

  /** A cycle limited to teams' own proposals has no list to pick from or add to. */
  assertCatalogAllowed(cycle: IdeaCycle): void {
    if (cycle.ideaSource === "STUDENT_PROPOSALS") {
      throw new IdeaDomainError(
        "CATALOG_NOT_ALLOWED",
        "In this project teams propose their own ideas; there is no list to pick from",
      );
    }
  }

  assertLeader(actor: IdeaActor, team: IdeaTeam): void {
    if (team.leaderId !== actor.id) {
      throw new IdeaDomainError(
        "NOT_TEAM_LEADER",
        "Only the team leader can submit or change the idea",
      );
    }
  }

  /** What saving the leader's proposal or pick does to the current idea, or why it cannot be saved. */
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
      if (this.isResubmissionOpen(cycle)) return "RESUBMIT";
      throw new IdeaDomainError(
        "IDEA_RESUBMISSION_CLOSED",
        "The cycle is closed; the idea can no longer change",
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

  /** Trimmed proposal content, with its links checked against the cycle's requirement. */
  clean(content: IdeaContent, cycle: IdeaCycle): IdeaVersionContent {
    return {
      title: content.title.trim(),
      problem: content.problem.trim(),
      solution: content.solution.trim(),
      links: cycle.ideaLinkRequirement.check(content.links),
      source: "PROPOSAL",
      catalogIdeaId: null,
    };
  }

  /** A pick copies the catalog idea's text, so later edits never change the team's idea; it copies no links. */
  pickContent(catalogIdea: CatalogIdea): IdeaVersionContent {
    return {
      title: catalogIdea.title,
      problem: catalogIdea.description,
      solution: null,
      links: [],
      source: "CATALOG",
      catalogIdeaId: catalogIdea.id,
    };
  }

  /** Only the owning faculty change the catalog, until the cycle closes. */
  assertCatalogEditor(actor: IdeaActor, cycle: IdeaCycle): void {
    if (actor.role !== "FACULTY" || cycle.createdByFacultyId !== actor.id) {
      throw new IdeaDomainError("CATALOG_IDEA_NOT_FOUND", "Idea not found");
    }
    if (cycle.status === "CLOSED") {
      throw new IdeaDomainError(
        "CATALOG_CLOSED",
        "The cycle is closed; its idea list can no longer change",
      );
    }
  }

  /** Teams keep what they picked, so a picked idea stays in the list. */
  assertCanRemove(catalogIdea: CatalogIdea): void {
    if (catalogIdea.pickCount > 0) {
      throw new IdeaDomainError(
        "CATALOG_IDEA_PICKED",
        `${catalogIdea.pickCount === 1 ? "A team has" : `${catalogIdea.pickCount} teams have`} picked this idea, so it cannot be removed`,
      );
    }
  }

  /** Trimmed catalog content; an empty link means none. */
  cleanCatalog(content: CatalogIdeaContent): CatalogIdeaContent {
    return {
      title: content.title.trim(),
      description: content.description.trim(),
      link: content.link?.trim() || null,
    };
  }
}
