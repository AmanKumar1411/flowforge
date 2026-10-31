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

/** The kinds of link a faculty member can ask for. */
export type LinkType = "GITHUB" | "DRIVE" | "DEMO" | "REPORT";

export interface Link {
  type: LinkType;
  url: string;
}

/** Which links are required and which optional; any other type is not allowed. */
export interface LinkRequirement {
  required: LinkType[];
  optional: LinkType[];
}

/** Where ideas come from: teams' own proposals, the faculty's list, or either. */
export type CycleIdeaSource = "STUDENT_PROPOSALS" | "FACULTY_LIST" | "BOTH";

/** One checkpoint (M1…Mn): a submission window and an evaluation day. */
export interface Milestone {
  id: string;
  position: number;
  name: string;
  description: string | null;
  submissionOpensAt: string;
  /** Versions are accepted strictly before this moment. */
  submissionDueAt: string;
  evaluationAt: string;
  linkRequirement: LinkRequirement;
}

export interface MilestoneRef {
  id: string;
  position: number;
  name: string;
}

/** Where a cycle is, computed by the API from its dates. */
export type CycleStage =
  | { kind: "DRAFT" | "TEAMS" | "IDEAS" | "WRAP_UP" | "CLOSED" }
  | {
      kind: "MILESTONE";
      milestone: MilestoneRef;
      phase: "UPCOMING" | "OPEN" | "AWAITING_EVALUATION";
    };

export type CycleEventKind =
  | "TEAM_DEADLINE"
  | "IDEA_DEADLINE"
  | "SUBMISSION_OPENS"
  | "SUBMISSION_DUE"
  | "EVALUATION";

export interface CycleEvent {
  kind: CycleEventKind;
  at: string;
  milestone?: MilestoneRef;
}

/** An event of one of the student's projects (`GET /me/upcoming`). */
export interface UpcomingEvent extends CycleEvent {
  cycle: { id: string; courseName: string; title: string };
}

export interface Cycle {
  id: string;
  courseName: string;
  title: string;
  description: string | null;
  batchYear: number;
  semester: number;
  academicYear: string;
  minTeamSize: number;
  maxTeamSize: number;
  /** Students change their own teams until this moment; the faculty then place the rest until `ideaDeadline`. */
  teamDeadline: string;
  /** Teams submit or pick their first idea until this moment; after a rejection, rounds continue while the cycle is published. */
  ideaDeadline: string;
  ideaSource: CycleIdeaSource;
  ideaLinkRequirement: LinkRequirement;
  /** In order, M1 first. */
  milestones: Milestone[];
  kind: CourseKind;
  status: CycleStatus;
  currentStage: CycleStage;
  /** The next three events. */
  nextEvents: CycleEvent[];
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A milestone as the API takes it: `id` keeps an existing one. */
export interface MilestonePayload {
  id?: string;
  name: string;
  description: string | null;
  submissionOpensAt: string;
  submissionDueAt: string;
  evaluationAt: string;
  linkRequirement: LinkRequirement;
}

/** What the API takes to create or edit a cycle. */
export interface CyclePayload {
  courseName: string;
  title: string;
  description?: string;
  batchYear: number;
  semester: number;
  academicYear: string;
  minTeamSize: number;
  maxTeamSize: number;
  teamDeadline: string;
  ideaDeadline: string;
  ideaSource: CycleIdeaSource;
  ideaLinkRequirement: LinkRequirement;
  kind: CourseKind;
  milestones: MilestonePayload[];
}

/** One problem among several the API reports at once. */
export interface ErrorDetail {
  code: string;
  message: string;
}

/** What publishing would report now. */
export interface PublishChecks {
  blocking: ErrorDetail[];
  warnings: ErrorDetail[];
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
  /** Checked against the cycle's idea link requirement; a pick has none. */
  links: Link[];
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
  /** Checked against the milestone's link requirement. */
  links: Link[];
  notes: string | null;
}

/** One version of a team's work for a milestone; the highest version is the current one. */
export interface Submission extends SubmissionContent {
  id: string;
  teamId: string;
  cycleId: string;
  milestoneId: string;
  version: number;
  submittedBy: { id: string; name: string };
  submittedAt: string;
}

export interface CycleSubmission {
  team: CycleIdea["team"];
  idea: { title: string; status: IdeaStatus; source: IdeaSource } | null;
  latest: Submission | null;
  /** How many versions the team has; the history is read per team, a page at a time (H4). */
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

/** A milestone's grading for its faculty (Phase 9, ADR 020). */
export interface Grading {
  milestone: { id: string; position: number; name: string; submissionDueAt: string };
  /** Whether this version gives marks; without them grading is feedback only (H3). */
  marksEnabled: boolean;
  /** Present only when marks are enabled. */
  maxMarks?: number | null;
  releasedAt: string | null;
  /** Evaluations can be saved now: from the due date while the project is published. */
  open: boolean;
  rows: GradingRow[];
}

export interface GradingRow {
  team: { id: string; name: string; memberCount: number };
  evaluation: { id: string; marks?: number | null; feedback: string | null; version: number; updatedAt: string } | null;
  /** Null when the team submitted nothing. */
  latestWork: { version: number; submittedAt: string } | null;
}

/** A team's evaluation as the team (or its faculty) reads it. */
export interface TeamEvaluation {
  milestoneId: string;
  /** Present only when marks are enabled, like `maxMarks`. */
  marks?: number | null;
  maxMarks?: number | null;
  feedback: string | null;
  releasedAt: string | null;
  updatedAt: string;
  updatedAfterRelease: boolean;
}

export interface CycleSummary {
  id: string;
  courseName: string;
  title: string;
  kind: CourseKind;
  status: CycleStatus;
}

/** "all" is the single-page view old links (/student/cycles/:id) open; it has no tab of its own. */
export type ProjectTab = "overview" | "team" | "idea" | "milestones" | "all";

export interface UpNextItem {
  cycle: CycleSummary;
  kind: string;
  at: string | null;
  text: string;
  action?: { tab: "team" | "idea" | "milestones"; actionable: boolean };
}

export interface DashboardUpdate {
  cycle: CycleSummary;
  kind: "JOINED_TEAM" | "IDEA_APPROVED" | "IDEA_REJECTED" | "RESULTS_RELEASED" | "RESULTS_UPDATED";
  at: string;
  text: string;
  tab: "team" | "idea" | "milestones";
}

export interface ProjectCard {
  cycle: CycleSummary;
  currentStage: CycleStage;
  nextEvent: CycleEvent | null;
  myTeam: { id: string; name: string; memberCount: number } | null;
  myRole: "LEADER" | "MEMBER" | "NO_TEAM";
  todo: string | null;
  results: {
    milestoneId: string;
    label: string;
    /** Present only when marks are enabled. */
    marks?: number | null;
    maxMarks?: number | null;
    feedback: string | null;
    releasedAt: string;
    updatedAfterRelease: boolean;
  }[];
}

export interface StudentDashboard {
  upNext: UpNextItem[];
  updates: DashboardUpdate[];
  projects: { active: ProjectCard[]; past: ProjectCard[] };
}
