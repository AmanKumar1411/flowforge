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

/** A ready-made account for dev login; `npm run seed:demo` gives it this role. */
export interface DemoAccount {
  email: string;
  name: string;
  role: "ADMIN" | "FACULTY" | "STUDENT";
  batchYear: number | null;
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
  /** The owning faculty place students without a team until this moment. */
  teamCompletionDeadline: string;
  /** Teams submit or pick their first idea until this moment; after a rejection, rounds continue while the cycle is published. */
  ideaDeadline: string;
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
  ideaDeadline: string;
  kind: CourseKind;
}

/** What the API takes: a null placing deadline means no faculty window. */
export type CyclePayload = Omit<CycleInput, "teamCompletionDeadline"> & {
  teamCompletionDeadline: string | null;
};

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
  /** False for a student the faculty registered who has not signed in yet; they can still be added. */
  signedIn: boolean;
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface UnassignedStudent extends Person {
  lookingForTeam: boolean;
  note: string | null;
  signedIn: boolean;
}

export interface CompletionOverview {
  open: boolean;
  unassigned: UnassignedStudent[];
  /** Elective emails enrolled before accounts were registered; enrolling them again registers them. */
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
  /** Null only for an email enrolled before accounts were registered. */
  userId: string | null;
  name: string | null;
  /** False until the student first signs in. */
  signedIn: boolean;
  enrolledAt: string;
}

export interface RejectedEmail {
  email: string;
  reason: string;
}

export interface EnrollmentResult {
  added: string[];
  alreadyEnrolled: string[];
  rejected: RejectedEmail[];
}

/** A student of a core cycle's batch: signed in, or registered by the faculty. */
export interface BatchStudent {
  userId: string;
  email: string;
  name: string;
  signedIn: boolean;
}

export interface BatchImportResult {
  registered: string[];
  alreadyRegistered: string[];
  rejected: RejectedEmail[];
}

export type IdeaStatus = "SUBMITTED" | "APPROVED" | "REJECTED";
export type IdeaDecision = "APPROVED" | "REJECTED";

export interface IdeaContent {
  title: string;
  problem: string;
  solution: string;
  link: string | null;
}

export interface IdeaReview {
  version: number;
  decision: IdeaDecision;
  feedback: string | null;
  reviewer: { id: string; name: string };
  reviewedAt: string;
}

/** PROPOSAL: the team's own idea, reviewed. CATALOG: picked from the faculty's list, approved at once. */
export type IdeaSource = "PROPOSAL" | "CATALOG";

export interface Idea extends Omit<IdeaContent, "solution"> {
  id: string;
  teamId: string;
  cycleId: string;
  /** Null for a pick from the catalog. */
  solution: string | null;
  source: IdeaSource;
  catalogIdeaId: string | null;
  status: IdeaStatus;
  /** Goes up with every change; a review sends back the version it read. */
  version: number;
  submittedBy: { id: string; name: string };
  submittedAt: string;
  /** Newest first. */
  reviews: IdeaReview[];
}

export interface CycleIdea {
  team: {
    id: string;
    name: string;
    leader: { id: string; name: string };
    memberCount: number;
  };
  idea: Idea | null;
}

export interface CatalogIdeaContent {
  title: string;
  description: string;
  link: string | null;
}

/** An idea the cycle's faculty offer; any number of teams can pick it. */
export interface CatalogIdea extends CatalogIdeaContent {
  id: string;
  cycleId: string;
  pickCount: number;
  createdAt: string;
}

export interface SubmissionContent {
  repositoryUrl: string;
  demoUrl: string | null;
  reportUrl: string | null;
  notes: string | null;
}

/** One version of a team's work; the highest version is the current one. */
export interface Submission extends SubmissionContent {
  id: string;
  teamId: string;
  cycleId: string;
  version: number;
  submittedBy: { id: string; name: string };
  submittedAt: string;
}

export interface CycleSubmission {
  team: CycleIdea["team"];
  idea: { title: string; status: IdeaStatus; source: IdeaSource } | null;
  latest: Submission | null;
  versionCount: number;
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
