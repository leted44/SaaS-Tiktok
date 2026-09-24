-- Autopilot can invent each video's topic from a space's theme.

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "brief" TEXT;

-- AlterTable
ALTER TABLE "AutopilotItem" ADD COLUMN     "spaceId" TEXT,
ADD COLUMN     "topicBrief" TEXT;

-- CreateIndex
CREATE INDEX "AutopilotItem_spaceId_idx" ON "AutopilotItem"("spaceId");

-- AddForeignKey
ALTER TABLE "AutopilotItem" ADD CONSTRAINT "AutopilotItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;
