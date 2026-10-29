-- Phase 8: milestones replace the single submission window (ADR 016), and links replace the
-- fixed URL columns (ADR 018). Existing rows are kept: every cycle gets one milestone from its
-- old window, and every submission and idea keeps its URLs as links.

-- CreateEnum
CREATE TYPE "CycleIdeaSource" AS ENUM ('STUDENT_PROPOSALS', 'FACULTY_LIST', 'BOTH');

-- AlterEnum (the new values are not used in this migration, so PostgreSQL allows it in one transaction)
ALTER TYPE "AuditAction" ADD VALUE 'CYCLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CYCLE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CYCLE_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'CYCLE_CLOSED';

-- Cycle: the students' team deadline is renamed; the faculty now place students until the idea
-- deadline, so the completion deadline goes (A1). The old CHECKs name the removed columns.
ALTER TABLE "CourseProjectCycle" DROP CONSTRAINT "CourseProjectCycle_submission_window_check";
ALTER TABLE "CourseProjectCycle" DROP CONSTRAINT "CourseProjectCycle_team_deadlines_check";
ALTER TABLE "CourseProjectCycle" DROP CONSTRAINT "CourseProjectCycle_idea_deadline_check";
ALTER TABLE "CourseProjectCycle" RENAME COLUMN "teamFormationDeadline" TO "teamDeadline";
ALTER TABLE "CourseProjectCycle"
  ADD COLUMN "ideaLinkRequirement" JSONB NOT NULL DEFAULT '{"required": [], "optional": ["GITHUB", "DRIVE"]}',
  ADD COLUMN "ideaSource" "CycleIdeaSource" NOT NULL DEFAULT 'BOTH';
-- Strict (<) in MilestoneSchedule; <= here because older rows have equal deadlines.
ALTER TABLE "CourseProjectCycle" ADD CONSTRAINT "CourseProjectCycle_team_idea_deadline_check"
  CHECK ("teamDeadline" <= "ideaDeadline");

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "submissionOpensAt" TIMESTAMP(3) NOT NULL,
    "submissionDueAt" TIMESTAMP(3) NOT NULL,
    "evaluationAt" TIMESTAMP(3) NOT NULL,
    "linkRequirement" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id"),
    -- No upper bound: saving a reordered list moves positions out of the way first.
    CONSTRAINT "Milestone_position_check" CHECK ("position" >= 1),
    CONSTRAINT "Milestone_window_check"
      CHECK ("submissionOpensAt" < "submissionDueAt" AND "submissionDueAt" <= "evaluationAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_cycleId_position_key" ON "Milestone"("cycleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_id_cycleId_key" ON "Milestone"("id", "cycleId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CourseProjectCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every existing cycle's window becomes its only milestone, evaluated at its deadline.
INSERT INTO "Milestone" ("id", "cycleId", "position", "name", "submissionOpensAt", "submissionDueAt", "evaluationAt", "linkRequirement", "updatedAt")
SELECT gen_random_uuid()::text, "id", 1, 'Final submission', "submissionStartAt", "submissionDeadline", "submissionDeadline",
       '{"required": ["GITHUB"], "optional": ["DEMO", "REPORT"]}', CURRENT_TIMESTAMP
FROM "CourseProjectCycle";

-- AlterTable
ALTER TABLE "CourseProjectCycle" DROP COLUMN "submissionStartAt",
DROP COLUMN "submissionDeadline",
DROP COLUMN "teamCompletionDeadline";

-- Submissions: each belongs to its cycle's milestone, and keeps its URLs as links.
ALTER TABLE "Submission" ADD COLUMN "milestoneId" TEXT, ADD COLUMN "links" JSONB;
UPDATE "Submission" AS s SET "milestoneId" = m."id"
FROM "Milestone" AS m WHERE m."cycleId" = s."cycleId" AND m."position" = 1;
UPDATE "Submission" SET "links" =
  jsonb_build_array(jsonb_build_object('type', 'GITHUB', 'url', "repositoryUrl"))
  || CASE WHEN "demoUrl" IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object('type', 'DEMO', 'url', "demoUrl")) END
  || CASE WHEN "reportUrl" IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object('type', 'REPORT', 'url', "reportUrl")) END;
ALTER TABLE "Submission" ALTER COLUMN "milestoneId" SET NOT NULL, ALTER COLUMN "links" SET NOT NULL;
ALTER TABLE "Submission" DROP COLUMN "repositoryUrl",
DROP COLUMN "demoUrl",
DROP COLUMN "reportUrl";

-- DropIndex
DROP INDEX "Submission_cycleId_submittedAt_idx";

-- DropIndex
DROP INDEX "Submission_teamId_version_key";

-- CreateIndex
CREATE INDEX "Submission_cycleId_milestoneId_submittedAt_idx" ON "Submission"("cycleId", "milestoneId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_teamId_milestoneId_version_key" ON "Submission"("teamId", "milestoneId", "version");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_milestoneId_cycleId_fkey" FOREIGN KEY ("milestoneId", "cycleId") REFERENCES "Milestone"("id", "cycleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ideas: a proposal's link becomes a typed link; a pick copies none.
ALTER TABLE "ProjectIdea" ADD COLUMN "links" JSONB NOT NULL DEFAULT '[]';
UPDATE "ProjectIdea" SET "links" = jsonb_build_array(jsonb_build_object(
  'type', CASE WHEN "link" ~ '^https://github\.com/' THEN 'GITHUB'
               WHEN "link" ~ '^https://(drive|docs)\.google\.com/' THEN 'DRIVE'
               ELSE 'REPORT' END,
  'url', "link"))
WHERE "link" IS NOT NULL AND "source" = 'PROPOSAL';
ALTER TABLE "ProjectIdea" DROP COLUMN "link";
