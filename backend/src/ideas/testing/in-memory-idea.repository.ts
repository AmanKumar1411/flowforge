import { IdeaRepository } from "../application/ports/idea.repository";
import {
  Idea,
  IdeaRevision,
  NewIdea,
  NewIdeaReview,
  Person,
} from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";

/** Ideas in a map, with people looked up by id; `teamExists` decides which teams are still there. */
export class InMemoryIdeaRepository extends IdeaRepository {
  private readonly ideas = new Map<string, Idea>();
  private sequence = 0;

  constructor(
    private readonly people: (id: string) => Person,
    private readonly teamExists: (teamId: string) => boolean,
  ) {
    super();
  }

  findByTeam(teamId: string): Promise<Idea | null> {
    return Promise.resolve(this.copy(this.ideas.get(teamId)));
  }

  lockTeamIdea(
    teamId: string,
  ): Promise<{ teamExists: boolean; idea: Idea | null }> {
    return Promise.resolve(
      this.teamExists(teamId)
        ? { teamExists: true, idea: this.copy(this.ideas.get(teamId)) }
        : { teamExists: false, idea: null },
    );
  }

  create(idea: NewIdea): Promise<Idea> {
    if (this.ideas.has(idea.teamId)) {
      throw new IdeaDomainError("IDEA_CHANGED", "Already submitted");
    }
    this.sequence += 1;
    const { submittedById, ...content } = idea;
    const created: Idea = {
      ...content,
      id: `idea-${this.sequence}`,
      status: "SUBMITTED",
      version: 1,
      submittedBy: this.people(submittedById),
      reviews: [],
    };
    this.ideas.set(idea.teamId, created);
    return Promise.resolve(this.copy(created)!);
  }

  revise(id: string, revision: IdeaRevision): Promise<Idea> {
    const idea = this.byId(id);
    const { submittedById, ...rest } = revision;
    Object.assign(idea, rest, { submittedBy: this.people(submittedById) });
    return Promise.resolve(this.copy(idea)!);
  }

  review(id: string, review: NewIdeaReview): Promise<Idea> {
    const idea = this.byId(id);
    idea.reviews.unshift({
      version: review.version,
      decision: review.decision,
      feedback: review.feedback,
      reviewer: this.people(review.reviewerId),
      reviewedAt: new Date(),
    });
    idea.status = review.decision;
    return Promise.resolve(this.copy(idea)!);
  }

  listByCycle(cycleId: string): Promise<Idea[]> {
    return Promise.resolve(
      [...this.ideas.values()]
        .filter((idea) => idea.cycleId === cycleId)
        .map((idea) => this.copy(idea)!),
    );
  }

  private byId(id: string): Idea {
    const idea = [...this.ideas.values()].find((entry) => entry.id === id);
    if (!idea) throw new Error(`no idea ${id}`);
    return idea;
  }

  private copy(idea: Idea | undefined): Idea | null {
    return idea ? structuredClone(idea) : null;
  }
}
