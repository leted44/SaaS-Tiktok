-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "socialCopy" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "musicUrl" TEXT,
ADD COLUMN     "musicName" TEXT;
