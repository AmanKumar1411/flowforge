import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { TransactionRunner } from "../../common/transaction";
import { TeamActor } from "../../teams/domain/team-access.policy";
import { Submission, SubmissionContent } from "../domain/submission";
import { SubmissionRules } from "../domain/submission-rules";
import { SubmissionTeams, TeamWithIdea } from "./ports/submission-teams";
import { SubmissionRepository } from "./ports/submission.repository";

/** One team of a cycle with its idea and its submitted work. */
export interface CycleSubmission extends TeamWithIdea {
  /** The newest version, or null before the first. */
  latest: Submission | null;
  versionCount: number;
}

/**
 * Versioned team work: any member adds a version while submissions are open;
 * members, the owning faculty and admins read every version. Each version is
 * numbered under the team's row lock and audited in the same transaction.
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

  /** Every version of the team's work, newest first, for anyone who can see the team. */
  async list(actor: TeamActor, teamId: string): Promise<Submission[]> {
    const { team } = await this.teams.getVisible(actor, teamId);
    return this.submissions.listByTeam(team.id);
  }

  async submit(
    actor: TeamActor,
    teamId: string,
    content: SubmissionContent,
  ): Promise<Submission> {
    const { team, cycle, idea } = await this.teams.getVisible(actor, teamId);
    const now = this.clock.now();
    this.rules.assertCanSubmit(actor, team, cycle, idea, now);
    const clean = this.rules.clean(content);
    return this.transactions.run(async (tx) => {
      const latest = await this.submissions.lockLatestVersion(team.id, tx);
      const created = await this.submissions.create(
        {
          ...clean,
          teamId: team.id,
          cycleId: cycle.id,
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
          version: created.version,
        },
      });
      return created;
    });
  }

  /** Every team of the cycle with its idea and latest version, for the owning faculty and admins. */
  async listForCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<CycleSubmission[]> {
    const rows = await this.teams.listForCycle(actor, cycleId);
    const byTeam = new Map<string, Submission[]>();
    for (const submission of await this.submissions.listByCycle(cycleId)) {
      byTeam.set(submission.teamId, [
        ...(byTeam.get(submission.teamId) ?? []),
        submission,
      ]);
    }
    return rows.map((row) => {
      const versions = byTeam.get(row.team.id) ?? [];
      return {
        ...row,
        latest: versions[0] ?? null,
        versionCount: versions.length,
      };
    });
  }
}
