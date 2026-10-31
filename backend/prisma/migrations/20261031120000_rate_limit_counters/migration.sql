-- Phase 10: rate-limit counters shared by every API process (ADR 023). UNLOGGED: the counters
-- are rebuilt within a minute after a crash, and skipping the write-ahead log keeps each hit cheap.

-- CreateTable
CREATE UNLOGGED TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "windowStart" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" BIGINT NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");
