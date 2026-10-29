import type { Link } from "../../common/links/link-type";
import type { Cycle } from "../../course-cycles/domain/cycle.types";
import type { Milestone } from "../../course-cycles/domain/milestone";

/** What a team hands in for a milestone: links and notes, no files (ADR 015). */
export interface SubmissionContent {
  /** As the member typed them; checked against the milestone's link requirement. */
  links: readonly { type: string; url: string }[];
  notes: string | null;
}

export interface Person {
  id: string;
  name: string;
}

/** One version of a team's work for one milestone. Versions are never changed; the newest is the current one. */
export interface Submission {
  id: string;
  teamId: string;
  cycleId: string;
  milestoneId: string;
  /** 1, 2, 3… per team and milestone. */
  version: number;
  links: Link[];
  notes: string | null;
  submittedBy: Person;
  submittedAt: Date;
}

export interface NewSubmission {
  teamId: string;
  cycleId: string;
  milestoneId: string;
  version: number;
  links: Link[];
  notes: string | null;
  submittedById: string;
  submittedAt: Date;
}

/** The part of a cycle the submission rules need: its state and its milestones. */
export type SubmissionCycle = Pick<
  Cycle,
  "id" | "status" | "createdByFacultyId" | "milestones"
>;

export type SubmissionMilestone = Pick<
  Milestone,
  | "id"
  | "position"
  | "name"
  | "submissionOpensAt"
  | "submissionDueAt"
  | "linkRequirement"
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

/** Before the milestone opens, while it is open, after it is due (or once the cycle is closed). */
export type SubmissionWindow = "NOT_OPEN" | "OPEN" | "CLOSED";
