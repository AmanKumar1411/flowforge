import { Injectable } from "@nestjs/common";
import { Link } from "../../common/links/link-type";
import { Transaction } from "../../common/transaction";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SubmissionRepository } from "../application/ports/submission.repository";
import { NewSubmission, Submission } from "../domain/submission";
import { SubmissionDomainError } from "../domain/submission.errors";

const withSubmitter = {
  submittedBy: { select: { id: true, name: true } },
} satisfies Prisma.SubmissionInclude;

type SubmissionRow = Prisma.SubmissionGetPayload<{
  include: typeof withSubmitter;
}>;

const toDomain = (row: SubmissionRow): Submission => ({
  id: row.id,
  teamId: row.teamId,
  cycleId: row.cycleId,
  milestoneId: row.milestoneId,
  version: row.version,
  // Written only by create below, from links checked against the milestone.
  links: row.links as unknown as Link[],
  notes: row.notes,
  submittedBy: row.submittedBy,
  submittedAt: row.submittedAt,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

@Injectable()
export class PrismaSubmissionRepository extends SubmissionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByTeam(teamId: string, milestoneId: string): Promise<Submission[]> {
    const rows = await this.prisma.submission.findMany({
      where: { teamId, milestoneId },
      include: withSubmitter,
      orderBy: { version: "desc" },
    });
    return rows.map(toDomain);
  }

  async listByMilestone(milestoneId: string): Promise<Submission[]> {
    const rows = await this.prisma.submission.findMany({
      where: { milestoneId },
      include: withSubmitter,
      orderBy: [{ teamId: "asc" }, { version: "desc" }],
    });
    return rows.map(toDomain);
  }

  async lockLatestVersion(
    teamId: string,
    milestoneId: string,
    tx: Transaction,
  ): Promise<number> {
    const client = this.prisma.client(tx);
    // FOR UPDATE: two members saving at once take turns, so each gets the next number.
    await client.$queryRaw`SELECT "id" FROM "Team" WHERE "id" = ${teamId} FOR UPDATE`;
    const latest = await client.submission.aggregate({
      where: { teamId, milestoneId },
      _max: { version: true },
    });
    return latest._max.version ?? 0;
  }

  async create(
    submission: NewSubmission,
    tx: Transaction,
  ): Promise<Submission> {
    try {
      const row = await this.prisma.client(tx).submission.create({
        data: {
          ...submission,
          links: submission.links.map(({ type, url }) => ({ type, url })),
        },
        include: withSubmitter,
      });
      return toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SubmissionDomainError(
          "SUBMISSION_CHANGED",
          "Someone in your team submitted at the same moment; reload and try again",
        );
      }
      throw error;
    }
  }
}
