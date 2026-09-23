-- Autopilot: videos written, voiced, dressed, rendered and delivered on a
-- schedule by the worker tick, plus the browsers that asked to be notified.
-- CreateEnum
CREATE TYPE "AutopilotStatus" AS ENUM ('SCHEDULED', 'SCRIPTING', 'VOICING', 'VISUALS', 'RENDERING', 'READY', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AutopilotItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'energetic',
    "targetDurationSec" INTEGER NOT NULL DEFAULT 45,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "status" "AutopilotStatus" NOT NULL DEFAULT 'SCHEDULED',
    "projectId" TEXT,
    "renderJobId" TEXT,
    "videoUrl" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failedStep" "AutopilotStatus",
    "lockedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutopilotItem_projectId_key" ON "AutopilotItem"("projectId");

-- CreateIndex
CREATE INDEX "AutopilotItem_status_deliverAt_idx" ON "AutopilotItem"("status", "deliverAt");

-- CreateIndex
CREATE INDEX "AutopilotItem_userId_deliverAt_idx" ON "AutopilotItem"("userId", "deliverAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "AutopilotItem" ADD CONSTRAINT "AutopilotItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotItem" ADD CONSTRAINT "AutopilotItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotItem" ADD CONSTRAINT "AutopilotItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

