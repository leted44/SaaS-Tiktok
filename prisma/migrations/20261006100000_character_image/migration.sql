-- The account's character sheet, and a per-project override.
ALTER TABLE "Space" ADD COLUMN "characterImage" TEXT;
ALTER TABLE "Project" ADD COLUMN "characterImage" TEXT;
