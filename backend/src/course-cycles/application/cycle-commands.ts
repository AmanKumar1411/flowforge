import type { LinkRequirementShape } from "../../common/links/link-requirement";
import type { CourseKind, CycleIdeaSource } from "../domain/cycle.types";

/**
 * What the use cases take, independent of HTTP: plain data with dates as
 * ISO strings, checked and parsed by the service. The presentation layer's
 * DTOs implement these, so a controller passes a validated body straight on.
 */

/** A milestone in a request; `id` keeps an existing one, and an existing one keeps any optional field left out. */
export interface MilestoneCommand {
  id?: string;
  name: string;
  description?: string | null;
  submissionOpensAt: string;
  submissionDueAt: string;
  evaluationAt: string;
  linkRequirement?: LinkRequirementShape;
}

export interface CreateCycleCommand {
  courseName: string;
  title: string;
  description?: string;
  batchYear: number;
  semester: number;
  academicYear: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  teamDeadline: string;
  ideaDeadline: string;
  ideaSource?: CycleIdeaSource;
  ideaLinkRequirement?: LinkRequirementShape;
  kind?: CourseKind;
  milestones?: MilestoneCommand[];
}

/** Only the fields named change; `milestones`, when given, is the full list in order. */
export interface UpdateCycleCommand {
  courseName?: string;
  title?: string;
  description?: string | null;
  batchYear?: number;
  semester?: number;
  academicYear?: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  teamDeadline?: string;
  ideaDeadline?: string;
  ideaSource?: CycleIdeaSource;
  ideaLinkRequirement?: LinkRequirementShape;
  kind?: CourseKind;
  milestones?: MilestoneCommand[];
}
