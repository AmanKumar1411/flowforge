-- Phase 4: teams inside course/project cycles.

-- AlterEnum (PostgreSQL 12+ allows several ADD VALUE statements in one migration)
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_DISBANDED';

-- Team rules on each cycle. Existing cycles close team formation when submissions open,
-- the same default the API applies when a faculty member leaves the deadline out.
ALTER TABLE "CourseProjectCycle" ADD COLUMN "maxTeamSize" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "minTeamSize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "teamFormationDeadline" TIMESTAMP(3);
UPDATE "CourseProjectCycle" SET "teamFormationDeadline" = "submissionStartAt";
ALTER TABLE "CourseProjectCycle" ALTER COLUMN "teamFormationDeadline" SET NOT NULL;
ALTER TABLE "CourseProjectCycle" ADD CONSTRAINT "CourseProjectCycle_team_size_check"
  CHECK ("minTeamSize" >= 1 AND "minTeamSize" <= "maxTeamSize" AND "maxTeamSize" <= 10);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateIndex
CREATE INDEX "Team_cycleId_createdAt_idx" ON "Team"("cycleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_id_cycleId_key" ON "Team"("id", "cycleId");

-- CreateIndex: a student leads at most one team per cycle
CREATE UNIQUE INDEX "Team_cycleId_leaderId_key" ON "Team"("cycleId", "leaderId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex: a student belongs to at most one team per cycle, even under concurrent requests
CREATE UNIQUE INDEX "TeamMember_cycleId_userId_key" ON "TeamMember"("cycleId", "userId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CourseProjectCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: the member row's cycle must be its team's cycle
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_cycleId_fkey" FOREIGN KEY ("teamId", "cycleId") REFERENCES "Team"("id", "cycleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
