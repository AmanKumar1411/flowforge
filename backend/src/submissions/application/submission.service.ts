import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { TransactionRunner } from "../../common/transaction";
import { TeamActor } from "../../teams/domain/team-access.policy";
import { Submission, SubmissionContent } from "../domain/submission";
import { SubmissionRules } from "../domain/submission-rules";
import { SubmissionTeams, TeamWithIdea } from "./ports/submission-teams";
import { SubmissionRepository } from "./ports/submission.repository";

/** One team of a cycle with its idea and its work for one milestone. */
export interface CycleSubmission extends TeamWithIdea {
  /** Newest first. */
  versions: Submission[];
  /** The newest version, or null before the first. */
  latest: Submission | null;
  versionCount: number;
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
  ) {}

  /** Every version of the team's work for the milestone, newest first, for anyone who can see the team. */
  async list(
    actor: TeamActor,
    teamId: string,
    milestoneId: string,
  ): Promise<Submission[]> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    const milestone = this.rules.milestoneOf(cycle, milestoneId);
    return this.submissions.listByTeam(team.id, milestone.id);
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
    return this.transactions.run(async (tx) => {
      const latest = await this.submissions.lockLatestVersion(
        team.id,
        milestone.id,
        tx,
      );
      const created = await this.submissions.create(
        {
          ...clean,
          teamId: team.id,
          cycleId: cycle.id,
          milestoneId: milestone.id,
          version: latest + 1,
          submittedById: actor.id,
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

  /** Every team of the cycle with its idea and its versions for the milestone, for the owning faculty and admins. */
  async listForCycle(
    actor: TeamActor,
    cycleId: string,
    milestoneId: string,
  ): Promise<CycleSubmission[]> {
    const { cycle, rows } = await this.teams.listForCycle(actor, cycleId);
    const milestone = this.rules.milestoneOf(cycle, milestoneId);
    const byTeam = new Map<string, Submission[]>();
    for (const submission of await this.submissions.listByMilestone(
      milestone.id,
    )) {
      byTeam.set(submission.teamId, [
        ...(byTeam.get(submission.teamId) ?? []),
        submission,
      ]);
    }
    return rows.map((row) => {
      const versions = byTeam.get(row.team.id) ?? [];
      return {
        ...row,
        versions,
        latest: versions[0] ?? null,
        versionCount: versions.length,
      };
    });
  }
}
