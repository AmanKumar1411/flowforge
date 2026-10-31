import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { AppConfig } from "../../config/app-config";
import { EvaluationDomainError } from "../domain/evaluation.errors";
import {
  EvaluationActor,
  GradingCycle,
  GradingMilestone,
} from "../domain/evaluation";
import { EvaluationPolicy } from "../domain/evaluation-policy";
import { EvaluationRules } from "../domain/evaluation-rules";
import { SaveEvaluationCommand } from "./evaluation-commands";
import {
  GradingView,
  MemberEvaluationView,
  TeamEvaluationView,
  toGradingEvaluation,
  toTeamView,
} from "./evaluation-views";
import {
  EvaluationRepository,
  ReleasedEvaluation,
} from "./ports/evaluation.repository";
import { GradingSources } from "./ports/grading-sources";

type Actor = EvaluationActor & { batchYear: number | null; email: string };

/**
 * Private evaluations per milestone (ADR 020): the owning faculty set the
 * scale, mark and give feedback from the due date, and release a milestone's
 * results to every team at once. Each save is a new version, refused when it
 * is based on an older one (optimistic concurrency). Every change is audited
 * in its own transaction. Students read only their own team's released
 * results; anything else is not found. Without marks (EVALUATION_MARKS_ENABLED
 * off, H3) grading is feedback only: marks are refused and no view carries them.
 */
@Injectable()
export class EvaluationService {
  private readonly marksEnabled: boolean;

  constructor(
    private readonly evaluations: EvaluationRepository,
    private readonly sources: GradingSources,
    private readonly rules: EvaluationRules,
    private readonly policy: EvaluationPolicy,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    config: AppConfig,
  ) {
    this.marksEnabled = config.values.evaluationMarksEnabled;
  }

  /** The scale, the release and every team's evaluation and latest work: the owner and admins. */
  async gradingView(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
  ): Promise<GradingView> {
    const { cycle, milestone } = await this.locate(actor, cycleId, milestoneId);
    this.policy.assertCanReadGrading(actor, cycle);
    const [grading, evaluations, teams, work] = await Promise.all([
      this.evaluations.findGrading(milestone.id),
      this.evaluations.listByMilestone(milestone.id),
      this.sources.teamsOf(actor, cycle.id),
      this.sources.latestWork(actor, cycle.id, milestone.id),
    ]);
    return {
      milestone,
      marksEnabled: this.marksEnabled,
      ...(this.marksEnabled ? { maxMarks: grading?.maxMarks ?? null } : {}),
      releasedAt: grading?.releasedAt ?? null,
      open: this.rules.isGradingOpen(cycle, milestone, this.clock.now()),
      rows: teams.map((team) => {
        const evaluation = evaluations.find((e) => e.teamId === team.id);
        return {
          team,
          evaluation: evaluation
            ? toGradingEvaluation(evaluation, this.marksEnabled)
            : null,
          latestWork: work.find((w) => w.teamId === team.id) ?? null,
        };
      }),
    };
  }

  /** What the milestone is marked out of; never below a mark already given. */
  async setMaxMarks(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
    maxMarks: number,
  ): Promise<GradingView> {
    const { cycle, milestone } = await this.locate(actor, cycleId, milestoneId);
    this.policy.assertCanGrade(actor, cycle);
    await this.transactions.run(async (tx) => {
      await this.evaluations.lockGrading(milestone.id, tx);
      const highest = await this.evaluations.highestMark(milestone.id, tx);
      this.rules.checkMaxMarks(cycle, maxMarks, highest, this.marksEnabled);
      await this.evaluations.setMaxMarks(milestone.id, maxMarks, tx);
      await this.record(
        "GRADING_SCALE_SET",
        actor,
        "Milestone",
        milestone.id,
        tx,
        {
          cycleId: cycle.id,
          maxMarks,
        },
      );
    });
    return this.gradingView(actor, cycleId, milestoneId);
  }

  /** Marks and/or feedback for one team; any team of the cycle, with or without a submission. */
  async saveEvaluation(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
    teamId: string,
    command: SaveEvaluationCommand,
  ): Promise<TeamEvaluationView> {
    const { cycle, milestone } = await this.locate(actor, cycleId, milestoneId);
    this.policy.assertCanGrade(actor, cycle);
    const team = await this.sources.team(actor, teamId);
    this.policy.assertCanReadTeam(actor, cycle, team);
    this.rules.assertGradingOpen(cycle, milestone, this.clock.now());
    return this.transactions.run(async (tx) => {
      const grading = await this.evaluations.shareGrading(milestone.id, tx);
      const input = this.rules.clean(
        { marks: command.marks ?? null, feedback: command.feedback ?? null },
        grading,
        this.marksEnabled,
      );
      const current = await this.evaluations.findByTeam(
        milestone.id,
        team.id,
        tx,
      );
      const version = this.rules.nextVersion(current, command.expectedVersion);
      const saved = await this.evaluations.save(
        {
          ...input,
          milestoneId: milestone.id,
          teamId: team.id,
          cycleId: cycle.id,
          version,
          evaluatedById: actor.id,
          at: this.clock.now(),
        },
        tx,
      );
      await this.record("EVALUATION_SAVED", actor, "Evaluation", saved.id, tx, {
        cycleId: cycle.id,
        milestoneId: milestone.id,
        teamId: team.id,
        version: saved.version,
        released: grading.releasedAt !== null,
      });
      return toTeamView(
        saved,
        grading,
        this.rules.isUpdatedAfterRelease(saved, grading),
        this.marksEnabled,
      );
    });
  }

  /** Releases the milestone's results to every team at once, for good. */
  async release(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
  ): Promise<GradingView> {
    const { cycle, milestone } = await this.locate(actor, cycleId, milestoneId);
    this.policy.assertCanGrade(actor, cycle);
    this.rules.assertGradingOpen(cycle, milestone, this.clock.now());
    await this.transactions.run(async (tx) => {
      const grading = await this.evaluations.lockGrading(milestone.id, tx);
      const graded = (await this.evaluations.listByMilestone(milestone.id, tx))
        .length;
      this.rules.assertCanRelease(grading, graded);
      const released = await this.evaluations.release(
        milestone.id,
        actor.id,
        this.clock.now(),
        tx,
      );
      // The grading row is locked, so this only guards against a release outside that lock.
      if (!released) {
        throw new EvaluationDomainError(
          "ALREADY_RELEASED",
          "These results are already released",
        );
      }
      await this.record(
        "EVALUATION_RELEASED",
        actor,
        "Milestone",
        milestone.id,
        tx,
        {
          cycleId: cycle.id,
          graded,
        },
      );
    });
    return this.gradingView(actor, cycleId, milestoneId);
  }

  /**
   * A team's evaluation for a milestone, as a list of 0 or 1. Members see it
   * once released (their own team only, checked in SQL too); the owner and
   * admins see it at any time.
   */
  async teamEvaluations(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
    teamId: string,
  ): Promise<TeamEvaluationView[]> {
    const { cycle, milestone } = await this.locate(actor, cycleId, milestoneId);
    const team = await this.sources.team(actor, teamId);
    this.policy.assertCanReadTeam(actor, cycle, team);
    if (this.policy.releasedOnly(actor)) {
      const released = await this.evaluations.listReleasedForMember(actor.id, [
        team.id,
      ]);
      return released
        .filter((evaluation) => evaluation.milestoneId === milestone.id)
        .map((evaluation) => this.releasedView(evaluation));
    }
    const [grading, evaluation] = await Promise.all([
      this.evaluations.findGrading(milestone.id),
      this.evaluations.findByTeam(milestone.id, team.id),
    ]);
    return evaluation
      ? [
          toTeamView(
            evaluation,
            grading,
            this.rules.isUpdatedAfterRelease(evaluation, grading),
            this.marksEnabled,
          ),
        ]
      : [];
  }

  /** For the student dashboard: released results of the student's own teams (one query). */
  async releasedForMember(
    userId: string,
    teamIds: readonly string[],
  ): Promise<MemberEvaluationView[]> {
    if (teamIds.length === 0) return [];
    const released = await this.evaluations.listReleasedForMember(
      userId,
      teamIds,
    );
    return released.map((evaluation) => ({
      ...this.releasedView(evaluation),
      teamId: evaluation.teamId,
    }));
  }

  private releasedView(evaluation: ReleasedEvaluation): TeamEvaluationView {
    return toTeamView(
      evaluation,
      evaluation,
      this.rules.isUpdatedAfterRelease(evaluation, evaluation),
      this.marksEnabled,
    );
  }

  private async locate(
    actor: Actor,
    cycleId: string,
    milestoneId: string,
  ): Promise<{ cycle: GradingCycle; milestone: GradingMilestone }> {
    const cycle = await this.sources.visibleCycle(actor, cycleId);
    return { cycle, milestone: this.rules.milestoneOf(cycle, milestoneId) };
  }

  private record(
    action: "EVALUATION_SAVED" | "EVALUATION_RELEASED" | "GRADING_SCALE_SET",
    actor: Actor,
    entityType: "Evaluation" | "Milestone",
    entityId: string,
    tx: Transaction,
    metadata: Record<string, string | number | boolean>,
  ): Promise<void> {
    return this.audit.record(tx, {
      action,
      actorId: actor.id,
      entityType,
      entityId,
      metadata,
    });
  }
}
