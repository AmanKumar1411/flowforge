import { Injectable } from "@nestjs/common";
import { Transaction } from "../../common/transaction";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  EvaluationRepository,
  EvaluationSave,
  ReleasedEvaluation,
} from "../application/ports/evaluation.repository";
import { EvaluationDomainError } from "../domain/evaluation.errors";
import { Evaluation, MilestoneGrading } from "../domain/evaluation";

type EvaluationRow = Prisma.EvaluationGetPayload<object>;
type GradingRow = Prisma.MilestoneGradingGetPayload<object>;

const toEvaluation = (row: EvaluationRow): Evaluation => ({
  id: row.id,
  milestoneId: row.milestoneId,
  teamId: row.teamId,
  cycleId: row.cycleId,
  marks: row.marks === null ? null : Number(row.marks),
  feedback: row.feedback,
  version: row.version,
  evaluatedById: row.evaluatedById,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toGrading = (row: GradingRow): MilestoneGrading => ({
  milestoneId: row.milestoneId,
  maxMarks: row.maxMarks,
  releasedAt: row.releasedAt,
  releasedById: row.releasedById,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

const changed = () =>
  new EvaluationDomainError(
    "EVALUATION_CHANGED",
    "This evaluation was saved by someone else since you opened it; reload and try again",
  );

@Injectable()
export class PrismaEvaluationRepository extends EvaluationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findGrading(
    milestoneId: string,
    tx?: Transaction,
  ): Promise<MilestoneGrading | null> {
    const row = await this.prisma
      .client(tx)
      .milestoneGrading.findUnique({ where: { milestoneId } });
    return row ? toGrading(row) : null;
  }

  async lockGrading(
    milestoneId: string,
    tx: Transaction,
  ): Promise<MilestoneGrading> {
    return this.lock(milestoneId, "UPDATE", tx);
  }

  async shareGrading(
    milestoneId: string,
    tx: Transaction,
  ): Promise<MilestoneGrading> {
    return this.lock(milestoneId, "SHARE", tx);
  }

  async setMaxMarks(
    milestoneId: string,
    maxMarks: number,
    tx: Transaction,
  ): Promise<MilestoneGrading> {
    const row = await this.prisma.client(tx).milestoneGrading.update({
      where: { milestoneId },
      data: { maxMarks },
    });
    return toGrading(row);
  }

  async release(
    milestoneId: string,
    releasedById: string,
    at: Date,
    tx: Transaction,
  ): Promise<MilestoneGrading | null> {
    const { count } = await this.prisma.client(tx).milestoneGrading.updateMany({
      where: { milestoneId, releasedAt: null },
      data: { releasedAt: at, releasedById },
    });
    return count === 0 ? null : this.findGrading(milestoneId, tx);
  }

  async listByMilestone(
    milestoneId: string,
    tx?: Transaction,
  ): Promise<Evaluation[]> {
    const rows = await this.prisma.client(tx).evaluation.findMany({
      where: { milestoneId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEvaluation);
  }

  async findByTeam(
    milestoneId: string,
    teamId: string,
    tx?: Transaction,
  ): Promise<Evaluation | null> {
    const row = await this.prisma.client(tx).evaluation.findUnique({
      where: { milestoneId_teamId: { milestoneId, teamId } },
    });
    return row ? toEvaluation(row) : null;
  }

  async highestMark(
    milestoneId: string,
    tx: Transaction,
  ): Promise<number | null> {
    const { _max } = await this.prisma.client(tx).evaluation.aggregate({
      where: { milestoneId },
      _max: { marks: true },
    });
    return _max.marks === null ? null : Number(_max.marks);
  }

  async save(save: EvaluationSave, tx: Transaction): Promise<Evaluation> {
    const client = this.prisma.client(tx);
    const { version, at, ...fields } = save;
    let row: EvaluationRow;
    if (version === 1) {
      try {
        row = await client.evaluation.create({
          data: { ...fields, version, createdAt: at, updatedAt: at },
        });
      } catch (error) {
        // Two first saves at once: the unique key lets one win.
        if (isUniqueViolation(error)) throw changed();
        throw error;
      }
    } else {
      const { count } = await client.evaluation.updateMany({
        where: {
          milestoneId: save.milestoneId,
          teamId: save.teamId,
          version: version - 1,
        },
        data: {
          marks: save.marks,
          feedback: save.feedback,
          version,
          evaluatedById: save.evaluatedById,
          updatedAt: at,
        },
      });
      if (count === 0) throw changed();
      row = await client.evaluation.findUniqueOrThrow({
        where: {
          milestoneId_teamId: {
            milestoneId: save.milestoneId,
            teamId: save.teamId,
          },
        },
      });
    }
    await client.evaluationRevision.create({
      data: {
        evaluationId: row.id,
        version,
        marks: save.marks,
        feedback: save.feedback,
        evaluatedById: save.evaluatedById,
        createdAt: at,
      },
    });
    return toEvaluation(row);
  }

  async listReleasedForMember(
    userId: string,
    teamIds: readonly string[],
  ): Promise<ReleasedEvaluation[]> {
    // Privacy in SQL (ADR 020): released milestones only, and only teams the user is a member of.
    const rows = await this.prisma.evaluation.findMany({
      where: {
        teamId: { in: [...teamIds] },
        team: { members: { some: { userId } } },
        milestone: { grading: { releasedAt: { not: null } } },
      },
      include: { milestone: { select: { grading: true } } },
    });
    return rows.map(({ milestone, ...row }) => ({
      ...toEvaluation(row),
      maxMarks: milestone.grading?.maxMarks ?? null,
      releasedAt: milestone.grading!.releasedAt!,
    }));
  }

  private async lock(
    milestoneId: string,
    mode: "UPDATE" | "SHARE",
    tx: Transaction,
  ): Promise<MilestoneGrading> {
    const client = this.prisma.client(tx);
    await client.milestoneGrading.createMany({
      data: [{ milestoneId }],
      skipDuplicates: true,
    });
    if (mode === "UPDATE") {
      await client.$queryRaw`SELECT "milestoneId" FROM "MilestoneGrading" WHERE "milestoneId" = ${milestoneId} FOR UPDATE`;
    } else {
      await client.$queryRaw`SELECT "milestoneId" FROM "MilestoneGrading" WHERE "milestoneId" = ${milestoneId} FOR SHARE`;
    }
    return toGrading(
      await client.milestoneGrading.findUniqueOrThrow({
        where: { milestoneId },
      }),
    );
  }
}
