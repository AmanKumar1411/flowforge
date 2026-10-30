-- Phase 9: private evaluations (ADR 020): a milestone's grading settings, one evaluation per
-- team and milestone, and every saved version of it.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'EVALUATION_SAVED';
ALTER TYPE "AuditAction" ADD VALUE 'EVALUATION_RELEASED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADING_SCALE_SET';
-- CreateTable
CREATE TABLE "MilestoneGrading" (
    "milestoneId" TEXT NOT NULL,
    "maxMarks" INTEGER,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MilestoneGrading_pkey" PRIMARY KEY ("milestoneId")
);
-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "marks" DECIMAL(6,2),
    "feedback" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "evaluatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "EvaluationRevision" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "marks" DECIMAL(6,2),
    "feedback" TEXT,
    "evaluatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationRevision_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Evaluation_teamId_idx" ON "Evaluation"("teamId");
-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_milestoneId_teamId_key" ON "Evaluation"("milestoneId", "teamId");
-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRevision_evaluationId_version_key" ON "EvaluationRevision"("evaluationId", "version");
-- AddForeignKey
ALTER TABLE "MilestoneGrading" ADD CONSTRAINT "MilestoneGrading_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MilestoneGrading" ADD CONSTRAINT "MilestoneGrading_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_milestoneId_cycleId_fkey" FOREIGN KEY ("milestoneId", "cycleId") REFERENCES "Milestone"("id", "cycleId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_teamId_cycleId_fkey" FOREIGN KEY ("teamId", "cycleId") REFERENCES "Team"("id", "cycleId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EvaluationRevision" ADD CONSTRAINT "EvaluationRevision_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EvaluationRevision" ADD CONSTRAINT "EvaluationRevision_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The scale is a whole number from 1 to 1000 (EvaluationRules.checkMaxMarks).
ALTER TABLE "MilestoneGrading" ADD CONSTRAINT "MilestoneGrading_max_marks_check"
  CHECK ("maxMarks" IS NULL OR ("maxMarks" >= 1 AND "maxMarks" <= 1000));

-- An evaluation gives marks, feedback or both; marks are never negative.
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_content_check"
  CHECK (("marks" IS NULL OR "marks" >= 0) AND ("marks" IS NOT NULL OR "feedback" IS NOT NULL) AND "version" >= 1);
ALTER TABLE "EvaluationRevision" ADD CONSTRAINT "EvaluationRevision_content_check"
  CHECK (("marks" IS NULL OR "marks" >= 0) AND ("marks" IS NOT NULL OR "feedback" IS NOT NULL) AND "version" >= 1);

-- Revisions are the history of an evaluation: they are never changed or removed.
CREATE FUNCTION "evaluation_revision_reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EvaluationRevision is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EvaluationRevision_append_only"
BEFORE UPDATE OR DELETE ON "EvaluationRevision"
FOR EACH ROW EXECUTE FUNCTION "evaluation_revision_reject_change"();
