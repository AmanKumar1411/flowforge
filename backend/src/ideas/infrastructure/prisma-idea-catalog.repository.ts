import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { IdeaCatalogRepository } from "../application/ports/idea-catalog.repository";
import {
  CatalogIdea,
  CatalogIdeaContent,
  NewCatalogIdea,
} from "../domain/idea";
import { IdeaDomainError } from "../domain/idea.errors";

const withPickCount = {
  _count: { select: { picks: true } },
} satisfies Prisma.CatalogIdeaInclude;

type CatalogRow = Prisma.CatalogIdeaGetPayload<{
  include: typeof withPickCount;
}>;

const toDomain = (row: CatalogRow): CatalogIdea => ({
  id: row.id,
  cycleId: row.cycleId,
  title: row.title,
  description: row.description,
  link: row.link,
  createdAt: row.createdAt,
  pickCount: row._count.picks,
});

const isForeignKeyViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2003";

@Injectable()
export class PrismaIdeaCatalogRepository extends IdeaCatalogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(cycleId: string): Promise<CatalogIdea[]> {
    const rows = await this.prisma.catalogIdea.findMany({
      where: { cycleId },
      include: withPickCount,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async lock(
    id: string,
    cycleId: string,
    tx: Transaction,
  ): Promise<CatalogIdea | null> {
    const client = this.prisma.client(tx);
    // FOR SHARE: a removal waits for this transaction, and then sees the pick.
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "CatalogIdea" WHERE "id" = ${id} AND "cycleId" = ${cycleId} FOR SHARE`;
    if (rows.length === 0) return null;
    const row = await client.catalogIdea.findUniqueOrThrow({
      where: { id },
      include: withPickCount,
    });
    return toDomain(row);
  }

  async create(idea: NewCatalogIdea, tx: Transaction): Promise<CatalogIdea> {
    const row = await this.prisma.client(tx).catalogIdea.create({
      data: idea,
      include: withPickCount,
    });
    return toDomain(row);
  }

  async update(
    id: string,
    content: CatalogIdeaContent,
    tx: Transaction,
  ): Promise<CatalogIdea> {
    const row = await this.prisma.client(tx).catalogIdea.update({
      where: { id },
      data: content,
      include: withPickCount,
    });
    return toDomain(row);
  }

  async remove(id: string, tx: Transaction): Promise<void> {
    try {
      await this.prisma.client(tx).catalogIdea.delete({ where: { id } });
    } catch (error) {
      // A team's idea still points at it (ProjectIdea_catalogIdeaId_cycleId_fkey).
      if (isForeignKeyViolation(error)) {
        throw new IdeaDomainError(
          "CATALOG_IDEA_PICKED",
          "A team has just picked this idea, so it cannot be removed",
        );
      }
      throw error;
    }
  }
}
