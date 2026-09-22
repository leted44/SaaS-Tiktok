-- Beat-synced editing.
--
-- The tempo of a project's background track, detected in the browser when the
-- track is chosen. Two numbers describe the entire beat grid, so the render
-- path derives it instead of re-analysing audio on every export.
--
-- beatSync defaults to true: it only has an effect once a tempo exists, and a
-- project that has one is a project whose cuts should land on it.
ALTER TABLE "Project" ADD COLUMN "musicBpm" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "musicBeatOffsetMs" INTEGER;
ALTER TABLE "Project" ADD COLUMN "beatSync" BOOLEAN NOT NULL DEFAULT true;
