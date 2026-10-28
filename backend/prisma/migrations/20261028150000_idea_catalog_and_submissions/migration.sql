-- Phase 7: the faculty's idea catalog (teams pick from it or propose their own idea) and versioned submissions.

-- CreateEnum
CREATE TYPE "IdeaSource" AS ENUM ('PROPOSAL', 'CATALOG');

-- AlterEnum (PostgreSQL 12+ allows several ADD VALUE statements in one migration)
ALTER TYPE "AuditAction" ADD VALUE 'CATALOG_IDEA_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'CATALOG_IDEA_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATALOG_IDEA_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'IDEA_PICKED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBMISSION_CREATED';

-- AlterTable: every existing idea is a proposal, so it keeps its solution.
ALTER TABLE "ProjectIdea" ADD COLUMN     "catalogIdeaId" TEXT,
ADD COLUMN     "source" "IdeaSource" NOT NULL DEFAULT 'PROPOSAL',
ALTER COLUMN "solution" DROP NOT NULL;

-- A pick names its catalog idea and is approved at once; a proposal has a solution and no catalog idea.
ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_source_check"
  CHECK (("source" = 'CATALOG') = ("catalogIdeaId" IS NOT NULL)
    AND ("source" = 'PROPOSAL' OR "status" = 'APPROVED')
    AND ("source" = 'CATALOG' OR "solution" IS NOT NULL));

-- CreateTable
CREATE TABLE "CatalogIdea" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "link" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "demoUrl" TEXT,
    "reportUrl" TEXT,
    "notes" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Submission_version_check" CHECK ("version" >= 1)
);

-- CreateIndex
CREATE INDEX "CatalogIdea_cycleId_createdAt_idx" ON "CatalogIdea"("cycleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogIdea_id_cycleId_key" ON "CatalogIdea"("id", "cycleId");

-- CreateIndex
CREATE INDEX "Submission_cycleId_submittedAt_idx" ON "Submission"("cycleId", "submittedAt");

-- CreateIndex: one row per version of a team's work, even when two members save at once
CREATE UNIQUE INDEX "Submission_teamId_version_key" ON "Submission"("teamId", "version");

-- CreateIndex
CREATE INDEX "ProjectIdea_catalogIdeaId_idx" ON "ProjectIdea"("catalogIdeaId");

-- AddForeignKey
ALTER TABLE "CatalogIdea" ADD CONSTRAINT "CatalogIdea_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CourseProjectCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogIdea" ADD CONSTRAINT "CatalogIdea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: a team picks only from its own cycle's catalog, and a picked catalog idea cannot be deleted
ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_catalogIdeaId_cycleId_fkey" FOREIGN KEY ("catalogIdeaId", "cycleId") REFERENCES "CatalogIdea"("id", "cycleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: the submission's cycle must be its team's cycle
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_teamId_cycleId_fkey" FOREIGN KEY ("teamId", "cycleId") REFERENCES "Team"("id", "cycleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
