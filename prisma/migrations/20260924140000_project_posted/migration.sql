-- A video marked by hand as posted, and where: most videos are shared from
-- the phone rather than through a connected account.
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "postedPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[];
