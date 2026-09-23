-- Video templates for the autopilot: the voice, captions, music, visuals,
-- background, format and quality a scheduled video is made with, saved once
-- and reused. Scheduled videos point at one and keep a copy of what they used.
-- Plus a heartbeat row so the app can tell whether the worker is running.
-- AlterTable
ALTER TABLE "AutopilotItem" ADD COLUMN     "applied" JSONB,
ADD COLUMN     "retryAt" TIMESTAMP(3),
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "VideoTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "tone" TEXT NOT NULL DEFAULT 'energetic',
    "targetDurationSec" INTEGER NOT NULL DEFAULT 45,
    "voiceId" TEXT NOT NULL,
    "voiceStability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "voiceSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'VERTICAL',
    "resolution" TEXT NOT NULL DEFAULT '1080p',
    "captionStyle" JSONB NOT NULL,
    "backgroundStyle" JSONB NOT NULL,
    "stockVisuals" BOOLEAN NOT NULL DEFAULT true,
    "musicTrackId" TEXT,
    "musicUrl" TEXT,
    "musicName" TEXT,
    "musicVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
    "musicStartMs" INTEGER NOT NULL DEFAULT 0,
    "musicBpm" DOUBLE PRECISION,
    "musicBeatOffsetMs" INTEGER,
    "beatSync" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "tickAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoTemplate_userId_idx" ON "VideoTemplate"("userId");

-- AddForeignKey
ALTER TABLE "AutopilotItem" ADD CONSTRAINT "AutopilotItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VideoTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTemplate" ADD CONSTRAINT "VideoTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTemplate" ADD CONSTRAINT "VideoTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

