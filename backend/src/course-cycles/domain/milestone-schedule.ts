import { CycleDomainError, CycleErrorCode } from "./cycle.errors";
import {
  hasOpened,
  MAX_MILESTONES,
  Milestone,
  MilestoneInput,
  milestoneLabel,
} from "./milestone";

/** What a schedule needs: the two student deadlines and the milestones in order. */
export interface ScheduleInput {
  teamDeadline: Date;
  ideaDeadline: Date;
  milestones: readonly Pick<
    MilestoneInput,
    | "name"
    | "description"
    | "submissionOpensAt"
    | "submissionDueAt"
    | "evaluationAt"
  >[];
}

export interface ScheduleProblem {
  code: CycleErrorCode;
  message: string;
}

const NAME_LIMIT = 80;
const DESCRIPTION_LIMIT = 2000;

/**
 * The order of a cycle, free of I/O:
 *
 *   teamDeadline <= ideaDeadline <= M1.opens < M1.due <= M1.evaluation
 *                                  M1.due <= M2.opens < M2.due <= …
 *
 * Teams settle, then ideas, then each milestone in turn. The faculty's
 * placement window is teamDeadline…ideaDeadline; equal deadlines leave none (S5).
 * The database checks each milestone's own order too; the order between
 * milestones and the cycle's deadlines is checked only here.
 */
export class MilestoneSchedule {
  /** Every problem at once, for publish checks and the wizard. `forPublish` also requires a first milestone. */
  problems(
    schedule: ScheduleInput,
    options: { forPublish?: boolean } = {},
  ): ScheduleProblem[] {
    const problems: ScheduleProblem[] = [];
    const add = (code: CycleErrorCode, message: string) =>
      problems.push({ code, message });
    // S5 (Phase 9): equal deadlines are allowed; they leave the faculty no time to place students.
    if (schedule.teamDeadline > schedule.ideaDeadline) {
      add(
        "INVALID_IDEA_DEADLINE",
        "The idea deadline cannot come before the team deadline (equal dates leave no time to place students without a team)",
      );
    }
    const { milestones } = schedule;
    if (milestones.length === 0 && options.forPublish) {
      add("NO_MILESTONES", "Add at least one milestone before publishing");
    }
    if (milestones.length > MAX_MILESTONES) {
      add(
        "INVALID_MILESTONE_COUNT",
        `A project has at most ${MAX_MILESTONES} milestones`,
      );
    }
    const names = new Set<string>();
    milestones.forEach((milestone, index) => {
      const label = milestoneLabel(index + 1, milestone.name);
      const name = milestone.name.trim();
      if (name === "" || name.length > NAME_LIMIT) {
        add(
          "INVALID_MILESTONE",
          `Give M${index + 1} a name of 1 to ${NAME_LIMIT} characters`,
        );
      } else if (names.has(name.toLowerCase())) {
        add(
          "DUPLICATE_MILESTONE_NAME",
          `Two milestones are called "${name}"; give each its own name`,
        );
      }
      names.add(name.toLowerCase());
      if ((milestone.description?.length ?? 0) > DESCRIPTION_LIMIT) {
        add(
          "INVALID_MILESTONE",
          `${label}: keep the description under ${DESCRIPTION_LIMIT} characters`,
        );
      }
      if (!(milestone.submissionOpensAt < milestone.submissionDueAt)) {
        add(
          "INVALID_MILESTONE_SCHEDULE",
          `${label}: submissions must open before they are due`,
        );
      }
      if (!(milestone.submissionDueAt <= milestone.evaluationAt)) {
        add(
          "INVALID_MILESTONE_SCHEDULE",
          `${label}: the evaluation cannot be before submissions are due`,
        );
      }
      const previous = milestones[index - 1];
      if (index === 0 && milestone.submissionOpensAt < schedule.ideaDeadline) {
        add(
          "INVALID_MILESTONE_SCHEDULE",
          `${label}: submissions cannot open before the idea deadline`,
        );
      }
      if (previous && milestone.submissionOpensAt < previous.submissionDueAt) {
        add(
          "INVALID_MILESTONE_SCHEDULE",
          `${label}: submissions cannot open before M${index} is due`,
        );
      }
    });
    return problems;
  }

  /** Every rule a saved cycle keeps, first problem as the error. */
  assertValid(schedule: ScheduleInput): void {
    const [first] = this.problems(schedule);
    if (first) throw new CycleDomainError(first.code, first.message);
  }

  /**
   * After publishing (A3): the list keeps its milestones in their order, and
   * only one that has not opened yet may change, only its dates and
   * description, and only to the future. The whole schedule is checked
   * afterwards by `assertValid`.
   */
  assertPublishedChange(
    current: readonly Milestone[],
    next: readonly MilestoneInput[],
    now: Date,
  ): void {
    if (
      next.length !== current.length ||
      next.some((input, index) => input.id !== current[index].id)
    ) {
      throw new CycleDomainError(
        "MILESTONES_LOCKED",
        "Milestones cannot be added, removed or reordered once the project is published",
      );
    }
    current.forEach((milestone, index) => {
      const input = next[index];
      const label = milestoneLabel(milestone.position, milestone.name);
      if (
        input.name.trim() !== milestone.name ||
        !input.linkRequirement.equals(milestone.linkRequirement)
      ) {
        throw new CycleDomainError(
          "MILESTONE_LOCKED",
          `${label}: its name and links are fixed once the project is published`,
        );
      }
      const datesChanged =
        input.submissionOpensAt.getTime() !==
          milestone.submissionOpensAt.getTime() ||
        input.submissionDueAt.getTime() !==
          milestone.submissionDueAt.getTime() ||
        input.evaluationAt.getTime() !== milestone.evaluationAt.getTime();
      const descriptionChanged =
        (input.description?.trim() || null) !== milestone.description;
      if (!datesChanged && !descriptionChanged) return;
      if (hasOpened(milestone, now)) {
        throw new CycleDomainError(
          "MILESTONE_LOCKED",
          `${label} has opened, so it can no longer change`,
        );
      }
      if (datesChanged && input.submissionOpensAt <= now) {
        throw new CycleDomainError(
          "INVALID_MILESTONE_SCHEDULE",
          `${label}: the new dates must be in the future`,
        );
      }
    });
  }
}
