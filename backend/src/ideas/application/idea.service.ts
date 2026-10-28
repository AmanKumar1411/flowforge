import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Clock } from "../../common/clock";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { TeamActor } from "../../teams/domain/team-access.policy";
import {
  Idea,
  IdeaContent,
  IdeaCycle,
  IdeaDecision,
  IdeaTeam,
} from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";
import { IdeaRules } from "../domain/idea-rules";
import { IdeaTeams } from "./ports/idea-teams";
import { IdeaRepository } from "./ports/idea.repository";

export interface IdeaDecisionInput {
  /** The version the faculty member read; a newer one is refused (IDEA_CHANGED). */
  version: number;
  decision: IdeaDecision;
  feedback?: string | null;
}

/** One team of a cycle and its idea, if it has one. */
export interface CycleIdea {
  team: IdeaTeam;
  idea: Idea | null;
}

/**
 * Team ideas: the leader submits and revises, the owning faculty review,
 * members and admins read. Each change runs in one transaction under the
 * team's and the idea's row locks, and is audited with it.
 */
@Injectable()
export class IdeaService {
  constructor(
    private readonly ideas: IdeaRepository,
    private readonly teams: IdeaTeams,
    private readonly rules: IdeaRules,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** The team's idea (null before the first submission), for anyone who can see the team. */
  async get(actor: TeamActor, teamId: string): Promise<Idea | null> {
    await this.teams.getVisible(actor, teamId);
    return this.ideas.findByTeam(teamId);
  }

  /** Creates, edits or resubmits the idea, whichever the rules allow now. */
  async submit(
    actor: TeamActor,
    teamId: string,
    content: IdeaContent,
  ): Promise<Idea> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    this.rules.assertLeader(actor, team);
    const clean = this.rules.clean(content);
    return this.transactions.run(async (tx) => {
      const current = await this.lock(team.id, tx);
      const now = this.clock.now();
      const action = this.rules.submissionAction(current, cycle, now);
      if (action === "CREATE" || !current) {
        const created = await this.ideas.create(
          {
            ...clean,
            teamId: team.id,
            cycleId: cycle.id,
            submittedById: actor.id,
            submittedAt: now,
          },
          tx,
        );
        await this.record("IDEA_SUBMITTED", actor, created, cycle, tx);
        return created;
      }
      const revised = await this.ideas.revise(
        current.id,
        {
          ...clean,
          version: current.version + 1,
          status: "SUBMITTED",
          submittedById: actor.id,
          submittedAt: now,
        },
        tx,
      );
      await this.record(
        action === "RESUBMIT" ? "IDEA_SUBMITTED" : "IDEA_UPDATED",
        actor,
        revised,
        cycle,
        tx,
      );
      return revised;
    });
  }

  async review(
    actor: TeamActor,
    teamId: string,
    input: IdeaDecisionInput,
  ): Promise<Idea> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    this.rules.assertReviewer(actor, cycle);
    const feedback = this.rules.feedbackFor(input.decision, input.feedback);
    return this.transactions.run(async (tx) => {
      const current = await this.lock(team.id, tx);
      if (!current) {
        throw new IdeaDomainError(
          "IDEA_NOT_FOUND",
          "This team has not submitted an idea",
        );
      }
      this.rules.assertCanReview(current, cycle, input.version);
      const reviewed = await this.ideas.review(
        current.id,
        {
          version: current.version,
          decision: input.decision,
          feedback,
          reviewerId: actor.id,
        },
        tx,
      );
      await this.record(
        input.decision === "APPROVED" ? "IDEA_APPROVED" : "IDEA_REJECTED",
        actor,
        reviewed,
        cycle,
        tx,
      );
      return reviewed;
    });
  }

  /** Every team of the cycle with its idea, for the owning faculty and admins. */
  async listForCycle(actor: TeamActor, cycleId: string): Promise<CycleIdea[]> {
    const { cycle, teams } = await this.teams.listForCycle(actor, cycleId);
    const byTeam = new Map(
      (await this.ideas.listByCycle(cycle.id)).map((idea) => [
        idea.teamId,
        idea,
      ]),
    );
    return teams.map((team) => ({ team, idea: byTeam.get(team.id) ?? null }));
  }

  private async lock(teamId: string, tx: Transaction): Promise<Idea | null> {
    const { teamExists, idea } = await this.ideas.lockTeamIdea(teamId, tx);
    if (!teamExists) {
      throw new IdeaDomainError("TEAM_NOT_FOUND", "Team not found");
    }
    return idea;
  }

  private record(
    action:
      "IDEA_SUBMITTED" | "IDEA_UPDATED" | "IDEA_APPROVED" | "IDEA_REJECTED",
    actor: TeamActor,
    idea: Idea,
    cycle: IdeaCycle,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action,
      actorId: actor.id,
      entityType: "ProjectIdea",
      entityId: idea.id,
      metadata: {
        cycleId: cycle.id,
        teamId: idea.teamId,
        version: idea.version,
      },
    });
  }
}
