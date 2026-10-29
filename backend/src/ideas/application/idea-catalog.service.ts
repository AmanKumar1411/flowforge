import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { Transaction, TransactionRunner } from "../../common/transaction";
import { TeamActor } from "../../teams/domain/team-access.policy";
import { CatalogIdea, CatalogIdeaContent, IdeaCycle } from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";
import { IdeaRules } from "../domain/idea-rules";
import { IdeaCatalogRepository } from "./ports/idea-catalog.repository";
import { IdeaTeams } from "./ports/idea-teams";

/**
 * The faculty's list of ideas for a cycle (ADR 014). Anyone who can see the
 * cycle reads it; the owning faculty add, edit and remove ideas until the
 * cycle closes. Teams keep a copy of what they picked, and a picked idea
 * cannot be removed.
 */
@Injectable()
export class IdeaCatalogService {
  constructor(
    private readonly catalog: IdeaCatalogRepository,
    private readonly teams: IdeaTeams,
    private readonly rules: IdeaRules,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(actor: TeamActor, cycleId: string): Promise<CatalogIdea[]> {
    const cycle = await this.teams.getVisibleCycle(actor, cycleId);
    return this.catalog.list(cycle.id);
  }

  async add(
    actor: TeamActor,
    cycleId: string,
    content: CatalogIdeaContent,
  ): Promise<CatalogIdea> {
    const cycle = await this.editableCycle(actor, cycleId);
    this.rules.assertCatalogAllowed(cycle);
    const clean = this.rules.cleanCatalog(content);
    return this.transactions.run(async (tx) => {
      const created = await this.catalog.create(
        { ...clean, cycleId: cycle.id, createdById: actor.id },
        tx,
      );
      await this.record("CATALOG_IDEA_ADDED", actor, created, tx);
      return created;
    });
  }

  /** Changes what later picks copy; teams that already picked keep their copy. */
  async update(
    actor: TeamActor,
    cycleId: string,
    id: string,
    content: CatalogIdeaContent,
  ): Promise<CatalogIdea> {
    const cycle = await this.editableCycle(actor, cycleId);
    const clean = this.rules.cleanCatalog(content);
    return this.transactions.run(async (tx) => {
      await this.find(id, cycle, tx);
      const updated = await this.catalog.update(id, clean, tx);
      await this.record("CATALOG_IDEA_UPDATED", actor, updated, tx);
      return updated;
    });
  }

  async remove(actor: TeamActor, cycleId: string, id: string): Promise<void> {
    const cycle = await this.editableCycle(actor, cycleId);
    await this.transactions.run(async (tx) => {
      const current = await this.find(id, cycle, tx);
      this.rules.assertCanRemove(current);
      await this.catalog.remove(id, tx);
      await this.record("CATALOG_IDEA_REMOVED", actor, current, tx);
    });
  }

  private async editableCycle(
    actor: TeamActor,
    cycleId: string,
  ): Promise<IdeaCycle> {
    const cycle = await this.teams.getVisibleCycle(actor, cycleId);
    this.rules.assertCatalogEditor(actor, cycle);
    return cycle;
  }

  private async find(
    id: string,
    cycle: IdeaCycle,
    tx: Transaction,
  ): Promise<CatalogIdea> {
    const idea = await this.catalog.lock(id, cycle.id, tx);
    if (!idea) {
      throw new IdeaDomainError(
        "CATALOG_IDEA_NOT_FOUND",
        "This idea is not in the cycle's list",
      );
    }
    return idea;
  }

  private record(
    action:
      "CATALOG_IDEA_ADDED" | "CATALOG_IDEA_UPDATED" | "CATALOG_IDEA_REMOVED",
    actor: TeamActor,
    idea: CatalogIdea,
    tx: Transaction,
  ): Promise<void> {
    return this.audit.record(tx, {
      action,
      actorId: actor.id,
      entityType: "CatalogIdea",
      entityId: idea.id,
      metadata: { cycleId: idea.cycleId, title: idea.title },
    });
  }
}
