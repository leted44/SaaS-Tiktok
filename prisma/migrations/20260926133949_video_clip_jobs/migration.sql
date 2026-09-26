-- CreateTable
CREATE TABLE "VideoClipJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'standard',
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "falRequestId" TEXT,
    "resultUrl" TEXT,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoClipJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoClipJob_status_createdAt_idx" ON "VideoClipJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VideoClipJob_projectId_idx" ON "VideoClipJob"("projectId");

-- AddForeignKey
ALTER TABLE "VideoClipJob" ADD CONSTRAINT "VideoClipJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoClipJob" ADD CONSTRAINT "VideoClipJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
