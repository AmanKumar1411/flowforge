import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { IdeaRepository } from "../application/ports/idea.repository";
import { Idea, IdeaRevision, NewIdea, NewIdeaReview } from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";

// The submitter and the reviewers' names come in the same query.
const withPeople = {
  submittedBy: { select: { id: true, name: true } },
  reviews: {
    include: { reviewer: { select: { id: true, name: true } } },
    orderBy: { version: "desc" },
  },
} satisfies Prisma.ProjectIdeaInclude;

type IdeaRow = Prisma.ProjectIdeaGetPayload<{ include: typeof withPeople }>;

const toDomain = (row: IdeaRow): Idea => ({
  id: row.id,
  teamId: row.teamId,
  cycleId: row.cycleId,
  title: row.title,
  problem: row.problem,
  solution: row.solution,
  link: row.link,
  source: row.source,
  catalogIdeaId: row.catalogIdeaId,
  status: row.status,
  version: row.version,
  submittedBy: row.submittedBy,
  submittedAt: row.submittedAt,
  reviews: row.reviews.map((review) => ({
    version: review.version,
    decision: review.decision,
    feedback: review.feedback,
    reviewer: review.reviewer,
    reviewedAt: review.createdAt,
  })),
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

@Injectable()
export class PrismaIdeaRepository extends IdeaRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByTeam(teamId: string, tx?: Transaction): Promise<Idea | null> {
    const row = await this.prisma.client(tx).projectIdea.findFirst({
      where: { teamId },
      include: withPeople,
    });
    return row ? toDomain(row) : null;
  }

  async lockTeamIdea(
    teamId: string,
    tx: Transaction,
  ): Promise<{ teamExists: boolean; idea: Idea | null }> {
    const client = this.prisma.client(tx);
    // FOR SHARE: a disband (DELETE) waits for this transaction; other idea writers queue on the idea row.
    const teams = await client.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Team" WHERE "id" = ${teamId} FOR SHARE`;
    if (teams.length === 0) return { teamExists: false, idea: null };
    await client.$queryRaw`
      SELECT "id" FROM "ProjectIdea" WHERE "teamId" = ${teamId} FOR UPDATE`;
    return { teamExists: true, idea: await this.findByTeam(teamId, tx) };
  }

  async create(idea: NewIdea, tx: Transaction): Promise<Idea> {
    try {
      const row = await this.prisma.client(tx).projectIdea.create({
        data: idea,
        include: withPeople,
      });
      return toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdeaDomainError(
          "IDEA_CHANGED",
          "This team's idea was just submitted; reload to see it",
        );
      }
      throw error;
    }
  }

  async revise(
    id: string,
    revision: IdeaRevision,
    tx: Transaction,
  ): Promise<Idea> {
    const row = await this.prisma.client(tx).projectIdea.update({
      where: { id },
      data: revision,
      include: withPeople,
    });
    return toDomain(row);
  }

  async review(
    id: string,
    review: NewIdeaReview,
    tx: Transaction,
  ): Promise<Idea> {
    const client = this.prisma.client(tx);
    await client.ideaReview.create({ data: { ideaId: id, ...review } });
    const row = await client.projectIdea.update({
      where: { id },
      data: { status: review.decision },
      include: withPeople,
    });
    return toDomain(row);
  }

  async listByCycle(cycleId: string): Promise<Idea[]> {
    const rows = await this.prisma.projectIdea.findMany({
      where: { cycleId },
      include: withPeople,
    });
    return rows.map(toDomain);
  }
}
