import type { Cycle } from "../../course-cycles/domain/cycle.types";

/** SUBMITTED waits for the faculty; REJECTED goes back to the team; APPROVED is final. */
export type IdeaStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export type IdeaDecision = "APPROVED" | "REJECTED";

export interface IdeaContent {
  title: string;
  /** The problem the team wants to solve. */
  problem: string;
  /** How they plan to solve it. */
  solution: string;
  /** A repository, document or demo; optional. */
  link: string | null;
}

export interface Person {
  id: string;
  name: string;
}

/** One faculty decision on one version of an idea. */
export interface IdeaReview {
  version: number;
  decision: IdeaDecision;
  feedback: string | null;
  reviewer: Person;
  reviewedAt: Date;
}

/** A team's current idea. Reviews are newest first. */
export interface Idea extends IdeaContent {
  id: string;
  teamId: string;
  cycleId: string;
  status: IdeaStatus;
  /** Goes up with every change of content, so a review always names exactly what it decided. */
  version: number;
  submittedBy: Person;
  /** When the current version was submitted. */
  submittedAt: Date;
  reviews: IdeaReview[];
}

export interface NewIdea extends IdeaContent {
  teamId: string;
  cycleId: string;
  submittedById: string;
  submittedAt: Date;
}

/** A new version of the content; a resubmission also sends the idea back to SUBMITTED. */
export interface IdeaRevision extends IdeaContent {
  version: number;
  status: "SUBMITTED";
  submittedById: string;
  submittedAt: Date;
}

export interface NewIdeaReview {
  version: number;
  decision: IdeaDecision;
  feedback: string | null;
  reviewerId: string;
}

/** The part of a cycle the idea rules need. */
export type IdeaCycle = Pick<
  Cycle,
  "id" | "status" | "createdByFacultyId" | "ideaDeadline" | "submissionStartAt"
>;

/** The part of a team the idea rules need. */
export interface IdeaTeam {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: { userId: string; name: string }[];
}

/** What the leader may do with the idea right now. */
export type SubmissionAction = "CREATE" | "EDIT" | "RESUBMIT";
