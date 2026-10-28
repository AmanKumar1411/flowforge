import type { Cycle } from "../../course-cycles/domain/cycle.types";

/** SUBMITTED waits for the faculty; REJECTED goes back to the team; APPROVED is final. */
export type IdeaStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export type IdeaDecision = "APPROVED" | "REJECTED";

/** PROPOSAL: the team's own idea, reviewed by the faculty. CATALOG: picked from the faculty's list (ADR 014). */
export type IdeaSource = "PROPOSAL" | "CATALOG";

/** What the leader writes for a proposal. */
export interface IdeaContent {
  title: string;
  /** The problem the team wants to solve. */
  problem: string;
  /** How they plan to solve it. */
  solution: string;
  /** A repository, document or demo; optional. */
  link: string | null;
}

/**
 * What one version of a team's idea holds: a proposal, or a copy of a catalog
 * idea (its description as the problem, no solution).
 */
export interface IdeaVersionContent {
  title: string;
  problem: string;
  solution: string | null;
  link: string | null;
  source: IdeaSource;
  catalogIdeaId: string | null;
}

/** What the faculty write for an idea they offer. */
export interface CatalogIdeaContent {
  title: string;
  description: string;
  link: string | null;
}

/** An idea the cycle's faculty offer; any number of teams can pick it. */
export interface CatalogIdea extends CatalogIdeaContent {
  id: string;
  cycleId: string;
  createdAt: Date;
  /** How many teams picked it. */
  pickCount: number;
}

export interface NewCatalogIdea extends CatalogIdeaContent {
  cycleId: string;
  createdById: string;
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
export interface Idea extends IdeaVersionContent {
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

/** A proposal waits for review (SUBMITTED); a pick is approved at once. */
export type SavedIdeaStatus = "SUBMITTED" | "APPROVED";

export interface NewIdea extends IdeaVersionContent {
  teamId: string;
  cycleId: string;
  status: SavedIdeaStatus;
  submittedById: string;
  submittedAt: Date;
}

/** A new version of the content; a resubmission also sends the idea back to SUBMITTED. */
export interface IdeaRevision extends IdeaVersionContent {
  version: number;
  status: SavedIdeaStatus;
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
  | "id"
  | "status"
  | "createdByFacultyId"
  | "ideaDeadline"
  | "submissionStartAt"
  | "submissionDeadline"
>;

/** The part of a team the idea rules need. */
export interface IdeaTeam {
  id: string;
  cycleId: string;
  name: string;
  leaderId: string;
  members: { userId: string; name: string }[];
}

/** What saving a proposal or a pick does to the team's idea right now. */
export type SubmissionAction = "CREATE" | "EDIT" | "RESUBMIT";
