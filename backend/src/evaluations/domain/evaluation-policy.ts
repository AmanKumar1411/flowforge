import { EvaluationDomainError } from "./evaluation.errors";
import { EvaluationActor, GradingCycle, GradingTeam } from "./evaluation";

/**
 * Who may see or write evaluations (ADR 020). Only the owning faculty grade;
 * admins read; a team's members read their own team's released results.
 * Anything else is reported as not found, so a guessed id reveals nothing.
 */
export class EvaluationPolicy {
  isOwner(actor: EvaluationActor, cycle: GradingCycle): boolean {
    return actor.role === "FACULTY" && cycle.createdByFacultyId === actor.id;
  }

  /** The grading view and every team's evaluation: the owner and admins. */
  assertCanReadGrading(actor: EvaluationActor, cycle: GradingCycle): void {
    if (!this.isOwner(actor, cycle) && actor.role !== "ADMIN") {
      throw this.notFound();
    }
  }

  assertCanGrade(actor: EvaluationActor, cycle: GradingCycle): void {
    if (!this.isOwner(actor, cycle)) throw this.notFound();
  }

  /** A team's evaluations: its members (released only), the owner, admins. */
  assertCanReadTeam(
    actor: EvaluationActor,
    cycle: GradingCycle,
    team: GradingTeam,
  ): void {
    const member =
      actor.role === "STUDENT" && team.memberIds.includes(actor.id);
    if (
      team.cycleId !== cycle.id ||
      !(member || this.isOwner(actor, cycle) || actor.role === "ADMIN")
    ) {
      throw this.notFound();
    }
  }

  /** Students see only what has been released. */
  releasedOnly(actor: EvaluationActor): boolean {
    return actor.role === "STUDENT";
  }

  private notFound(): EvaluationDomainError {
    return new EvaluationDomainError("TEAM_NOT_FOUND", "Team not found");
  }
}
