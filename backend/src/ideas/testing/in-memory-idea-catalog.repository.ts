import { IdeaCatalogRepository } from "../application/ports/idea-catalog.repository";
import {
  CatalogIdea,
  CatalogIdeaContent,
  NewCatalogIdea,
} from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";

/** Catalog ideas in a map; `pickCount` asks the idea repository who picked each one. */
export class InMemoryIdeaCatalogRepository extends IdeaCatalogRepository {
  private readonly ideas = new Map<string, Omit<CatalogIdea, "pickCount">>();
  private sequence = 0;

  constructor(private readonly pickCount: (id: string) => number) {
    super();
  }

  list(cycleId: string): Promise<CatalogIdea[]> {
    return Promise.resolve(
      [...this.ideas.values()]
        .filter((idea) => idea.cycleId === cycleId)
        .map((idea) => this.withCount(idea)),
    );
  }

  lock(id: string, cycleId: string): Promise<CatalogIdea | null> {
    const idea = this.ideas.get(id);
    return Promise.resolve(
      idea && idea.cycleId === cycleId ? this.withCount(idea) : null,
    );
  }

  create(idea: NewCatalogIdea): Promise<CatalogIdea> {
    this.sequence += 1;
    const created = {
      id: `catalog-${this.sequence}`,
      cycleId: idea.cycleId,
      title: idea.title,
      description: idea.description,
      link: idea.link,
      createdAt: new Date(),
    };
    this.ideas.set(created.id, created);
    return Promise.resolve(this.withCount(created));
  }

  update(id: string, content: CatalogIdeaContent): Promise<CatalogIdea> {
    const idea = this.ideas.get(id);
    if (!idea) throw new Error(`no catalog idea ${id}`);
    Object.assign(idea, content);
    return Promise.resolve(this.withCount(idea));
  }

  remove(id: string): Promise<void> {
    if (this.pickCount(id) > 0) {
      throw new IdeaDomainError("CATALOG_IDEA_PICKED", "Picked");
    }
    this.ideas.delete(id);
    return Promise.resolve();
  }

  private withCount(idea: Omit<CatalogIdea, "pickCount">): CatalogIdea {
    return { ...structuredClone(idea), pickCount: this.pickCount(idea.id) };
  }
}
