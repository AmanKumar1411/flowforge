-- Phase 6: project ideas with their own deadline, and students pre-registered from a faculty import.
-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IdeaDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_CLAIMED';
ALTER TYPE "AuditAction" ADD VALUE 'IDEA_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'IDEA_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'IDEA_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'IDEA_REJECTED';

-- AlterTable: existing cycles get the idea deadline of a cycle without its own one, the completion deadline.
ALTER TABLE "CourseProjectCycle" ADD COLUMN "ideaDeadline" TIMESTAMP(3);
UPDATE "CourseProjectCycle" SET "ideaDeadline" = "teamCompletionDeadline";
ALTER TABLE "CourseProjectCycle" ALTER COLUMN "ideaDeadline" SET NOT NULL;

-- Teams and ideas settle by the time submissions open: formation <= completion (earlier CHECK)
-- <= idea deadline <= submissionStartAt. A cycle whose completion deadline is after
-- submissionStartAt fails here; fix its dates first.
ALTER TABLE "CourseProjectCycle" ADD CONSTRAINT "CourseProjectCycle_idea_deadline_check"
  CHECK ("teamCompletionDeadline" <= "ideaDeadline" AND "ideaDeadline" <= "submissionStartAt");

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "googleSub" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProjectIdea" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "link" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectIdea_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectIdea_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "IdeaReview" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "decision" "IdeaDecision" NOT NULL,
    "feedback" TEXT,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdeaReview_version_check" CHECK ("version" >= 1),
    -- A rejection always tells the team why.
    CONSTRAINT "IdeaReview_feedback_check" CHECK ("decision" = 'APPROVED' OR length(trim("feedback")) > 0)
);

-- CreateIndex
CREATE INDEX "ProjectIdea_cycleId_status_idx" ON "ProjectIdea"("cycleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectIdea_teamId_cycleId_key" ON "ProjectIdea"("teamId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaReview_ideaId_version_key" ON "IdeaReview"("ideaId", "version");

-- AddForeignKey
ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_teamId_cycleId_fkey" FOREIGN KEY ("teamId", "cycleId") REFERENCES "Team"("id", "cycleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaReview" ADD CONSTRAINT "IdeaReview_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ProjectIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaReview" ADD CONSTRAINT "IdeaReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
