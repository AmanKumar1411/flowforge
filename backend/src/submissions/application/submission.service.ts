import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import {
  ONE_MINUTE_MS,
  RateLimitedError,
  RateLimiter,
} from "../../common/rate-limit";
import { AppConfig } from "../../config/app-config";
import { TransactionRunner } from "../../common/transaction";
import { TeamActor } from "../../teams/domain/team-access.policy";
import { Submission, SubmissionContent } from "../domain/submission";
import { SubmissionRules } from "../domain/submission-rules";
import { SubmissionTeams, TeamWithIdea } from "./ports/submission-teams";
import {
  HistoryPage,
  SubmissionRepository,
} from "./ports/submission.repository";

/** One team of a cycle with its idea and its latest work for one milestone; history is read per team. */
export interface CycleSubmission extends TeamWithIdea {
  /** The newest version, or null before the first. */
  latest: Submission | null;
  /** Versions are numbered 1, 2, 3… without gaps, so this is the latest version number. */
  versionCount: number;
}

/** A team's newest version for a milestone, for grading. */
export interface LatestSubmission {
  teamId: string;
  version: number;
  submittedAt: Date;
}

/**
 * Versioned team work per milestone: any member adds a version while that
 * milestone is open; members, the owning faculty and admins read every
 * version. Each version is numbered under the team's row lock and audited in
 * the same transaction.
 */
@Injectable()
export class SubmissionService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly teams: SubmissionTeams,
    private readonly rules: SubmissionRules,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
    private readonly config: AppConfig,
  ) {}

  /** The team's versions for the milestone, newest first and one page at a time, for anyone who can see the team. */
  async list(
    actor: TeamActor,
    teamId: string,
    milestoneId: string,
    page: HistoryPage,
  ): Promise<Submission[]> {
    const { team, cycle } = await this.teams.getVisibleTeam(actor, teamId);
    const milestone = this.rules.milestoneOf(cycle, milestoneId);
    return this.submissions.listByTeam(team.id, milestone.id, page);
  }

  async submit(
    actor: TeamActor,
    teamId: string,
    milestoneId: string,
    content: SubmissionContent,
  ): Promise<Submission> {
    const { team, cycle, idea } = await this.teams.getVisible(actor, teamId);
    const milestone = this.rules.milestoneOf(cycle, milestoneId);
    const now = this.clock.now();
    this.rules.assertCanSubmit(actor, team, cycle, milestone, idea, now);
    const clean = this.rules.clean(content, milestone);
    // Per member and milestone (H10): before the transaction, so a refused one costs no lock.
    const limit = await this.limiter.consume(
      `submit:${actor.id}:${milestone.id}`,
      this.config.values.rateLimits.submissionsPerMinute,
      ONE_MINUTE_MS,
    );
    if (!limit.allowed) {
      throw new RateLimitedError(
        "You submitted many versions in a minute; wait a moment and try again",
      );
    }
    // A member (checked above): the team already knows their name.
    const submitter = team.members.find((member) => member.userId === actor.id);
    return this.transactions.run(async (tx) => {
      const latest = await this.submissions.lockLatestVersion(
        team.id,
        milestone.id,
        tx,
      );
      this.rules.assertBelowVersionLimit(
        latest,
        this.config.values.submissionVersionLimit,
      );
      const created = await this.submissions.create(
        {
          ...clean,
          teamId: team.id,
          cycleId: cycle.id,
          milestoneId: milestone.id,
          version: latest + 1,
          submittedBy: { id: actor.id, name: submitter?.name ?? "" },
          submittedAt: now,
        },
        tx,
      );
      await this.audit.record(tx, {
        action: "SUBMISSION_CREATED",
        actorId: actor.id,
        entityType: "Submission",
        entityId: created.id,
        metadata: {
          cycleId: cycle.id,
          teamId: team.id,
          milestoneId: milestone.id,
          version: created.version,
        },
      });
      return created;
    });
  }

  /** The milestones each of the caller's own teams has handed work in for (the student dashboard). */
  submittedMilestones(
    teamIds: readonly string[],
  ): Promise<{ teamId: string; milestoneId: string }[]> {
    return teamIds.length === 0
      ? Promise.resolve([])
      : this.submissions.listSubmittedMilestones(teamIds);
  }

  /** Every team of the cycle with its idea and its latest version for the milestone, for the owning faculty and admins. */
  async listForCycle(
    actor: TeamActor,
    cycleId: string,
    milestoneId: string,
  ): Promise<CycleSubmission[]> {
    const { cycle, rows } = await this.teams.listForCycle(actor, cycleId);
    const milestone = this.rules.milestoneOf(cycle, milestoneId);
    const latest = new Map(
      (await this.submissions.listLatestByMilestone(milestone.id)).map(
        (submission) => [submission.teamId, submission],
      ),
    );
    return rows.map((row) => {
      const newest = latest.get(row.team.id) ?? null;
      return { ...row, latest: newest, versionCount: newest?.version ?? 0 };
    });
  }

  /** Each team's newest version for the milestone, without teams or ideas: the grading table's column. */
  async latestForCycle(
    actor: TeamActor,
    cycleId: string,
    milestoneId: string,
  ): Promise<LatestSubmission[]> {
    const cycle = await this.teams.getVisibleCycle(actor, cycleId);
    const milestone = this.rules.milestoneOf(cycle, milestoneId);
    return (await this.submissions.listLatestByMilestone(milestone.id)).map(
      ({ teamId, version, submittedAt }) => ({ teamId, version, submittedAt }),
    );
  }
}
