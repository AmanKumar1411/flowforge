import type { Cycle } from "../../course-cycles/domain/cycle.types";

/** What a team hands in: links and notes, no files (ADR 015). */
export interface SubmissionContent {
  /** Where the code lives; required. */
  repositoryUrl: string;
  demoUrl: string | null;
  reportUrl: string | null;
  notes: string | null;
}

export interface Person {
  id: string;
  name: string;
}

/** One version of a team's work. Versions are never changed; the newest is the current one. */
export interface Submission extends SubmissionContent {
  id: string;
  teamId: string;
  cycleId: string;
  version: number;
  submittedBy: Person;
  submittedAt: Date;
}

export interface NewSubmission extends SubmissionContent {
  teamId: string;
  cycleId: string;
  version: number;
  submittedById: string;
  submittedAt: Date;
}

/** The part of a cycle the submission rules need. */
export type SubmissionCycle = Pick<
  Cycle,
  | "id"
  | "status"
  | "createdByFacultyId"
  | "submissionStartAt"
  | "submissionDeadline"
>;

/** The part of a team the submission rules need. */
export interface SubmissionTeam {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: { userId: string; name: string }[];
}

/** The part of the team's idea the submission rules need. */
export interface SubmissionIdea {
  title: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  source: "PROPOSAL" | "CATALOG";
}

/** Before submissions open, while they are open, after the deadline (or once the cycle is closed). */
export type SubmissionWindow = "NOT_OPEN" | "OPEN" | "CLOSED";
