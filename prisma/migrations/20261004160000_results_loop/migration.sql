-- The results loop: what each post did (read from the creator's statistics screenshots) and the lessons learnt from them per space.
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "resultsReminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PostResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "spaceId" TEXT,
    "format" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "newFollowers" INTEGER,
    "profileVisits" INTEGER,
    "avgWatchSec" DOUBLE PRECISION,
    "avgWatchPct" DOUBLE PRECISION,
    "skipRatePct" DOUBLE PRECISION,
    "completionPct" DOUBLE PRECISION,
    "dropOffSec" DOUBLE PRECISION,
    "durationSec" DOUBLE PRECISION,
    "slidesSeen" DOUBLE PRECISION,
    "slidesTotal" INTEGER,
    "diagnosis" TEXT,
    "source" TEXT NOT NULL DEFAULT 'screenshot',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountLesson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT,
    "format" TEXT,
    "text" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'moyenne',
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostResult_userId_spaceId_idx" ON "PostResult"("userId", "spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PostResult_projectId_platform_key" ON "PostResult"("projectId", "platform");

-- CreateIndex
CREATE INDEX "AccountLesson_userId_spaceId_idx" ON "AccountLesson"("userId", "spaceId");

-- AddForeignKey
ALTER TABLE "PostResult" ADD CONSTRAINT "PostResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostResult" ADD CONSTRAINT "PostResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostResult" ADD CONSTRAINT "PostResult_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLesson" ADD CONSTRAINT "AccountLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLesson" ADD CONSTRAINT "AccountLesson_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

