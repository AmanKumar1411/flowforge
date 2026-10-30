import type {
  CycleView,
  StudentEvent,
} from "../../../course-cycles/application/cycle-views";
import type { MemberEvaluationView } from "../../../evaluations/application/evaluation-views";
import type { Role } from "../../../auth/domain/role";

export type DashboardActor = {
  id: string;
  role: Role;
  batchYear: number | null;
  email: string;
};

export interface DashboardTeam {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: { userId: string; addedAt: Date }[];
}

export interface DashboardIdea {
  teamId: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  reviews: {
    version: number;
    decision: "APPROVED" | "REJECTED";
    reviewedAt: Date;
  }[];
}

/**
 * Everything the dashboard reads, through the other modules' exported
 * services (ADR 021). Each method is one batched read for all of the
 * student's teams, so the number of queries does not grow with projects.
 */
export abstract class StudentSources {
  /** Published projects the student can see, with stage and next events. */
  abstract activeCycles(actor: DashboardActor): Promise<CycleView[]>;
  /** Closed projects in which the student was in a team (S4). */
  abstract pastCycles(actor: DashboardActor): Promise<CycleView[]>;
  /** The next events of the student's visible projects, soonest first. */
  abstract upcomingEvents(actor: DashboardActor): Promise<StudentEvent[]>;
  abstract myTeams(actor: DashboardActor): Promise<DashboardTeam[]>;
  abstract ideasOf(teamIds: readonly string[]): Promise<DashboardIdea[]>;
  abstract submittedMilestones(
    teamIds: readonly string[],
  ): Promise<{ teamId: string; milestoneId: string }[]>;
  /** Released results only, for teams the student is in (filtered in SQL). */
  abstract releasedResults(
    userId: string,
    teamIds: readonly string[],
  ): Promise<MemberEvaluationView[]>;
}
