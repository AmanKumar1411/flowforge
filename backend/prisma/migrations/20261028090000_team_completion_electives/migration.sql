-- Phase 5: electives, the faculty team-completion window, team origin and "looking for a team".

-- CreateEnum
CREATE TYPE "CourseKind" AS ENUM ('CORE', 'ELECTIVE');

-- CreateEnum
CREATE TYPE "TeamOrigin" AS ENUM ('STUDENT', 'FACULTY', 'AUTO_GROUP');

-- AlterEnum (PostgreSQL 12+ allows several ADD VALUE statements in one migration)
ALTER TYPE "AuditAction" ADD VALUE 'ENROLLMENT_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'ENROLLMENT_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'AUTO_GROUP_APPLIED';

-- Existing cycles are core courses with no faculty completion window: completion = formation,
-- the same default the API applies when the completion deadline is left out.
ALTER TABLE "CourseProjectCycle" ADD COLUMN "kind" "CourseKind" NOT NULL DEFAULT 'CORE',
ADD COLUMN "teamCompletionDeadline" TIMESTAMP(3);
UPDATE "CourseProjectCycle" SET "teamCompletionDeadline" = "teamFormationDeadline";
ALTER TABLE "CourseProjectCycle" ALTER COLUMN "teamCompletionDeadline" SET NOT NULL;
ALTER TABLE "CourseProjectCycle" ADD CONSTRAINT "CourseProjectCycle_team_deadlines_check"
  CHECK ("teamFormationDeadline" <= "teamCompletionDeadline");

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "origin" "TeamOrigin" NOT NULL DEFAULT 'STUDENT';

-- Every existing member was added by their team's leader (Phase 4 had no other way in).
ALTER TABLE "TeamMember" ADD COLUMN "addedById" TEXT;
UPDATE "TeamMember" AS m SET "addedById" = t."leaderId" FROM "Team" AS t WHERE t."id" = m."teamId";
ALTER TABLE "TeamMember" ALTER COLUMN "addedById" SET NOT NULL;

-- CreateTable
CREATE TABLE "CycleEnrollment" (
    "cycleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CycleEnrollment_pkey" PRIMARY KEY ("cycleId","email")
);

-- CreateTable
CREATE TABLE "TeamSeeker" (
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamSeeker_pkey" PRIMARY KEY ("cycleId","userId")
);

-- CreateIndex: a student's electives, looked up by their email
CREATE INDEX "CycleEnrollment_email_idx" ON "CycleEnrollment"("email");

-- AddForeignKey
ALTER TABLE "CycleEnrollment" ADD CONSTRAINT "CycleEnrollment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CourseProjectCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleEnrollment" ADD CONSTRAINT "CycleEnrollment_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeeker" ADD CONSTRAINT "TeamSeeker_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CourseProjectCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeeker" ADD CONSTRAINT "TeamSeeker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
