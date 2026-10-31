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
  IdeaSummary,
  IdeaTeam,
  IdeaVersionContent,
  SavedIdeaStatus,
} from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";
import { IdeaRules } from "../domain/idea-rules";
import { IdeaCatalogRepository } from "./ports/idea-catalog.repository";
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

/** A team the caller may see, its cycle and its idea. */
export interface TeamIdea extends CycleIdea {
  cycle: IdeaCycle;
}

/**
 * Team ideas: the leader proposes and revises, or picks from the faculty's
 * catalog; the owning faculty review proposals; members and admins read.
 * Each change runs in one transaction under the team's and the idea's row
 * locks, and is audited with it.
 */
@Injectable()
export class IdeaService {
  constructor(
    private readonly ideas: IdeaRepository,
    private readonly catalog: IdeaCatalogRepository,
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

  /** The team and its cycle, for anyone who can see the team, without reading its idea (used by submissions). */
  getVisibleTeam(
    actor: TeamActor,
    teamId: string,
  ): Promise<{ team: IdeaTeam; cycle: IdeaCycle }> {
    return this.teams.getVisible(actor, teamId);
  }

  /** The team, its cycle and a summary of its idea, for anyone who can see the team (used by submissions). */
  async getTeamIdeaSummary(
    actor: TeamActor,
    teamId: string,
  ): Promise<{ team: IdeaTeam; cycle: IdeaCycle; idea: IdeaSummary | null }> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    return { team, cycle, idea: await this.ideas.findSummaryByTeam(team.id) };
  }

  /** The team, its cycle and its idea, for anyone who can see the team. */
  async getTeamIdea(actor: TeamActor, teamId: string): Promise<TeamIdea> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    return { team, cycle, idea: await this.ideas.findByTeam(team.id) };
  }

  /** Creates, edits or resubmits the team's own proposal, whichever the rules allow now. */
  async submit(
    actor: TeamActor,
    teamId: string,
    content: IdeaContent,
  ): Promise<Idea> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    this.rules.assertLeader(actor, team);
    this.rules.assertProposalsAllowed(cycle);
    const clean = this.rules.clean(content, cycle);
    return this.transactions.run(async (tx) => {
      const current = await this.lock(team.id, tx);
      const now = this.clock.now();
      const action = this.rules.submissionAction(current, cycle, now);
      const saved = await this.save(
        { team, cycle, current, actor, now },
        clean,
        "SUBMITTED",
        tx,
      );
      await this.record(
        action === "EDIT" ? "IDEA_UPDATED" : "IDEA_SUBMITTED",
        actor,
        saved,
        cycle,
        tx,
      );
      return saved;
    });
  }

  /**
   * Makes a catalog idea the team's idea, approved at once (ADR 014). Allowed
   * whenever a proposal could be saved: as the first idea before the idea
   * deadline, instead of a waiting proposal until then, or after a rejection.
   */
  async pick(
    actor: TeamActor,
    teamId: string,
    catalogIdeaId: string,
  ): Promise<Idea> {
    const { team, cycle } = await this.teams.getVisible(actor, teamId);
    this.rules.assertLeader(actor, team);
    this.rules.assertCatalogAllowed(cycle);
    return this.transactions.run(async (tx) => {
      const current = await this.lock(team.id, tx);
      const now = this.clock.now();
      this.rules.submissionAction(current, cycle, now);
      const catalogIdea = await this.catalog.lock(catalogIdeaId, cycle.id, tx);
      if (!catalogIdea) {
        throw new IdeaDomainError(
          "CATALOG_IDEA_NOT_FOUND",
          "This idea is not in the cycle's list",
        );
      }
      const saved = await this.save(
        { team, cycle, current, actor, now },
        this.rules.pickContent(catalogIdea),
        "APPROVED",
        tx,
      );
      await this.record("IDEA_PICKED", actor, saved, cycle, tx);
      return saved;
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

  /**
   * The ideas of the caller's own teams, in one query (the student dashboard).
   * Callers pass ids from the caller's memberships, never ids from a request.
   */
  listForOwnTeams(teamIds: readonly string[]): Promise<Idea[]> {
    return teamIds.length === 0
      ? Promise.resolve([])
      : this.ideas.listByTeams(teamIds);
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

  /** The first version, or the next one of the current idea. */
  private save(
    at: {
      team: IdeaTeam;
      cycle: IdeaCycle;
      current: Idea | null;
      actor: TeamActor;
      now: Date;
    },
    content: IdeaVersionContent,
    status: SavedIdeaStatus,
    tx: Transaction,
  ): Promise<Idea> {
    const submitted = {
      ...content,
      status,
      submittedById: at.actor.id,
      submittedAt: at.now,
    };
    return at.current
      ? this.ideas.revise(
          at.current.id,
          { ...submitted, version: at.current.version + 1 },
          tx,
        )
      : this.ideas.create(
          { ...submitted, teamId: at.team.id, cycleId: at.cycle.id },
          tx,
        );
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
      | "IDEA_SUBMITTED"
      | "IDEA_UPDATED"
      | "IDEA_APPROVED"
      | "IDEA_REJECTED"
      | "IDEA_PICKED",
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
        ...(idea.catalogIdeaId ? { catalogIdeaId: idea.catalogIdeaId } : {}),
      },
    });
  }
}
