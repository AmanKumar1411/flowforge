-- Phase 3: Google Sign-In, server-side roles, refresh-token sessions and an append-only audit log.
-- Password authentication is removed. "googleSub" is NOT NULL without a default, so this
-- migration expects an empty "User" table (there is no production data).

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "FacultyAllowlistSource" AS ENUM ('MANUAL', 'APPROVED_REQUEST', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "FacultyAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_DENIED', 'USER_CREATED', 'ROLE_ASSIGNED', 'FACULTY_REQUEST_CREATED', 'FACULTY_REQUEST_APPROVED', 'FACULTY_REQUEST_REJECTED', 'FACULTY_ALLOWLIST_ADDED', 'FACULTY_ALLOWLIST_REMOVED', 'ELEVATION_DENIED', 'USER_BATCH_CORRECTED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'LOGOUT', 'LOGOUT_ALL', 'REFRESH_TOKEN_REUSE_DETECTED');

-- AlterEnum

ALTER TYPE "UserRole" ADD VALUE 'ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'PENDING_STAFF';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordHash",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleSub" TEXT NOT NULL,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FacultyAllowlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" "FacultyAllowlistSource" NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacultyAllowlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyAccessRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "FacultyAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacultyAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "familyExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacultyAllowlistEntry_email_key" ON "FacultyAllowlistEntry"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyAccessRequest_userId_key" ON "FacultyAccessRequest"("userId");

-- CreateIndex
CREATE INDEX "FacultyAccessRequest_status_idx" ON "FacultyAccessRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- AddForeignKey
ALTER TABLE "FacultyAllowlistEntry" ADD CONSTRAINT "FacultyAllowlistEntry_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyAccessRequest" ADD CONSTRAINT "FacultyAccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyAccessRequest" ADD CONSTRAINT "FacultyAccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Audit rows are evidence: reject UPDATE and DELETE so the table stays append-only.
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();
