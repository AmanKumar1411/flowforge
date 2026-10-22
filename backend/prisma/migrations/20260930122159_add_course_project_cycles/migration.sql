-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateTable
CREATE TABLE "CourseProjectCycle" (
    "id" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "batchYear" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "academicYear" TEXT NOT NULL,
    "submissionStartAt" TIMESTAMP(3) NOT NULL,
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByFacultyId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseProjectCycle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CourseProjectCycle"
ADD CONSTRAINT "CourseProjectCycle_submission_window_check"
CHECK ("submissionStartAt" < "submissionDeadline");

-- CreateIndex
CREATE INDEX "CourseProjectCycle_createdByFacultyId_createdAt_idx" ON "CourseProjectCycle"("createdByFacultyId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseProjectCycle_batchYear_status_publishedAt_idx" ON "CourseProjectCycle"("batchYear", "status", "publishedAt");

-- AddForeignKey
ALTER TABLE "CourseProjectCycle" ADD CONSTRAINT "CourseProjectCycle_createdByFacultyId_fkey" FOREIGN KEY ("createdByFacultyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
