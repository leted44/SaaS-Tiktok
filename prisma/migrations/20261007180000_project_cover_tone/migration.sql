-- The cover settings and the voice tone, kept per video.
ALTER TABLE "Project" ADD COLUMN "coverSettings" JSONB;
ALTER TABLE "Project" ADD COLUMN "voiceStability" DOUBLE PRECISION;
