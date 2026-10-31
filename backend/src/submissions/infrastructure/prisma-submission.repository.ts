import { Injectable } from "@nestjs/common";
import { Link } from "../../common/links/link-type";
import { Transaction } from "../../common/transaction";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  HistoryPage,
  SubmissionRepository,
} from "../application/ports/submission.repository";
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

type LatestRow = Omit<SubmissionRow, "submittedBy" | "submittedById"> & {
  submitterId: string;
  submitterName: string;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

@Injectable()
export class PrismaSubmissionRepository extends SubmissionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByTeam(
    teamId: string,
    milestoneId: string,
    page: HistoryPage,
  ): Promise<Submission[]> {
    const rows = await this.prisma.submission.findMany({
      where: {
        teamId,
        milestoneId,
        ...(page.beforeVersion ? { version: { lt: page.beforeVersion } } : {}),
      },
      include: withSubmitter,
      orderBy: { version: "desc" },
      take: page.limit,
    });
    return rows.map(toDomain);
  }

  async listSubmittedMilestones(
    teamIds: readonly string[],
  ): Promise<{ teamId: string; milestoneId: string }[]> {
    return this.prisma.submission.findMany({
      where: { teamId: { in: [...teamIds] } },
      select: { teamId: true, milestoneId: true },
      distinct: ["teamId", "milestoneId"],
    });
  }

  // One row per team, the submitter's name joined in: a single statement however many
  // versions the teams have (the faculty lists used to read every version, H4).
  async listLatestByMilestone(milestoneId: string): Promise<Submission[]> {
    const rows = await this.prisma.$queryRaw<LatestRow[]>`
      SELECT DISTINCT ON (s."teamId")
        s."id", s."teamId", s."cycleId", s."milestoneId", s."version", s."links",
        s."notes", s."submittedAt", u."id" AS "submitterId", u."name" AS "submitterName"
      FROM "Submission" s
      JOIN "User" u ON u."id" = s."submittedById"
      WHERE s."milestoneId" = ${milestoneId}
      ORDER BY s."teamId", s."version" DESC`;
    return rows.map((row) =>
      toDomain({
        ...row,
        submittedById: row.submitterId,
        submittedBy: { id: row.submitterId, name: row.submitterName },
      }),
    );
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
    const { submittedBy, ...data } = submission;
    try {
      // One INSERT … RETURNING: the submitter comes from the team, not another read (H4).
      const row = await this.prisma.client(tx).submission.create({
        data: {
          ...data,
          submittedById: submittedBy.id,
          links: submission.links.map(({ type, url }) => ({ type, url })),
        },
      });
      return toDomain({ ...row, submittedBy });
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
