ALTER TABLE "Space" ADD COLUMN "characterImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN "characterImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
-- A sheet saved before there could be several is the one image of its list.
UPDATE "Space" SET "characterImages" = ARRAY["characterImage"] WHERE "characterImage" IS NOT NULL;
UPDATE "Project" SET "characterImages" = ARRAY["characterImage"] WHERE "characterImage" IS NOT NULL;
