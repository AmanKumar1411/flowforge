export type UserRole = "STUDENT" | "FACULTY" | "ADMIN" | "PENDING_STAFF";
export type UserStatus = "ACTIVE" | "DEACTIVATED";
export type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
/** CORE: the whole batch. ELECTIVE: only enrolled students. */
export type CourseKind = "CORE" | "ELECTIVE";
export type TeamOrigin = "STUDENT" | "FACULTY" | "AUTO_GROUP";
export type FacultyRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  batchYear: number | null;
  avatarUrl: string | null;
  facultyRequestStatus: FacultyRequestStatus | null;
}

export interface Cycle {
  id: string;
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  submissionStartAt: string;
  submissionDeadline: string;
  minTeamSize: number;
  maxTeamSize: number;
  /** Students change their own teams until this moment. */
  teamFormationDeadline: string;
  /** The owning faculty place students without a team until this moment; also the idea deadline. */
  teamCompletionDeadline: string;
  kind: CourseKind;
  status: CycleStatus;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CycleInput {
  courseName: string;
  title: string;
  description?: string;
  batchYear: number;
  semester: number;
  academicYear: string;
  submissionStartAt: string;
  submissionDeadline: string;
  minTeamSize: number;
  maxTeamSize: number;
  teamFormationDeadline: string;
  teamCompletionDeadline: string;
  kind: CourseKind;
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  isLeader: boolean;
  addedAt: string;
}

export interface Team {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  origin: TeamOrigin;
  /** Leader first. */
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export type CandidateAvailability =
  | "AVAILABLE"
  | "IN_YOUR_TEAM"
  | "IN_ANOTHER_TEAM";

export interface TeamCandidate {
  id: string;
  name: string;
  email: string;
  availability: CandidateAvailability;
  lookingForTeam: boolean;
  note: string | null;
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface UnassignedStudent extends Person {
  lookingForTeam: boolean;
  note: string | null;
}

export interface CompletionOverview {
  open: boolean;
  unassigned: UnassignedStudent[];
  /** Enrolled emails with no account yet. */
  notSignedIn: string[];
}

export interface ProposedTeam {
  name: string;
  leaderId: string;
  memberIds: string[];
}

export interface AutoGroupPreview {
  teams: { name: string; leader: Person; members: Person[] }[];
  unplaced: Person[];
}

export interface EnrolledStudent {
  email: string;
  /** Null until the student first signs in. */
  userId: string | null;
  name: string | null;
  enrolledAt: string;
}

export interface EnrollmentResult {
  added: string[];
  alreadyEnrolled: string[];
  rejected: { email: string; reason: string }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  batchYear: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserPage {
  items: AdminUser[];
  nextCursor: string | null;
}

export interface AllowlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: "MANUAL" | "APPROVED_REQUEST" | "CSV_IMPORT";
  addedById: string;
  createdAt: string;
}

export interface FacultyRequest {
  id: string;
  userId: string;
  userName?: string;
  email: string;
  status: FacultyRequestStatus;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}
