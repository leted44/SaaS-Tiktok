-- A multi-part series. Each episode is its own project: the editor state a
-- video needs (visual layers, captions, music) lives on Project, and episodes
-- do not share it — they have different scenes of different lengths.
ALTER TABLE "Project" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "Project" ADD COLUMN "episodeNumber" INTEGER;
ALTER TABLE "Project" ADD COLUMN "episodeTotal" INTEGER;
CREATE INDEX "Project_seriesId_episodeNumber_idx" ON "Project"("seriesId", "episodeNumber");
