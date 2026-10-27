import type { Role, UserStatus } from "../../auth/domain/role";
import type { Cycle } from "../../course-cycles/domain/cycle.types";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  addedAt: Date;
}

/** A team inside one cycle. The leader is one of `members` and never changes. */
export interface Team {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: TeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTeam {
  cycleId: string;
  name: string;
  leaderId: string;
  /** The other members; the leader is added by the repository. */
  memberIds: readonly string[];
}

export interface TeamChange {
  name?: string;
  addMemberIds: readonly string[];
  removeMemberIds: readonly string[];
}

/** A student's place in a cycle: at most one per student, enforced by the database. */
export interface Membership {
  userId: string;
  teamId: string;
}

/** The part of a cycle the team rules need. */
export type TeamCycle = Pick<
  Cycle,
  | "id"
  | "status"
  | "batchYear"
  | "createdByFacultyId"
  | "minTeamSize"
  | "maxTeamSize"
  | "teamFormationDeadline"
>;

/** A user as the team rules see them: enough to decide whether they may join. */
export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  batchYear: number | null;
}

export type CandidateAvailability =
  "AVAILABLE" | "IN_YOUR_TEAM" | "IN_ANOTHER_TEAM";

export interface TeamCandidate {
  id: string;
  name: string;
  email: string;
  availability: CandidateAvailability;
}
