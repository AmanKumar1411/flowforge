import type { Role, UserStatus } from "../../auth/domain/role";
import type { Cycle } from "../../course-cycles/domain/cycle.types";

/** Who formed the team: its leader, the faculty by hand, or the faculty's auto-group. */
export type TeamOrigin = "STUDENT" | "FACULTY" | "AUTO_GROUP";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  /** The leader, or the faculty member who placed the student. */
  addedById: string;
  addedAt: Date;
}

/** A team inside one cycle. The leader is one of `members` and never changes. */
export interface Team {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  origin: TeamOrigin;
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
  origin: TeamOrigin;
  /** Who placed the members: the leader themselves, or a faculty member. */
  addedById: string;
}

export interface TeamChange {
  name?: string;
  addMemberIds: readonly string[];
  removeMemberIds: readonly string[];
  addedById: string;
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
  | "kind"
  | "batchYear"
  | "createdByFacultyId"
  | "minTeamSize"
  | "maxTeamSize"
  | "teamFormationDeadline"
  | "teamCompletionDeadline"
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

/** A student without a team who asked to be found. */
export interface TeamSeeker {
  userId: string;
  note: string | null;
  createdAt: Date;
}

export type CandidateAvailability =
  "AVAILABLE" | "IN_YOUR_TEAM" | "IN_ANOTHER_TEAM";

export interface TeamCandidate {
  id: string;
  name: string;
  email: string;
  availability: CandidateAvailability;
  lookingForTeam: boolean;
  note: string | null;
}

/** A participant of the cycle who is in no team yet. */
export interface UnassignedStudent {
  id: string;
  name: string;
  email: string;
  lookingForTeam: boolean;
  note: string | null;
}

/** A team the faculty want created: by hand, or accepted from an auto-group preview. */
export interface ProposedTeam {
  name: string;
  leaderId: string;
  /** The other members. */
  memberIds: readonly string[];
}
