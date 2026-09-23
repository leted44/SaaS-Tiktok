-- Where playback of the background track starts, in milliseconds from the
-- file's own beginning. Lets a track longer than the video skip its intro
-- instead of always opening on it; resets to 0 whenever the track changes.
ALTER TABLE "Project" ADD COLUMN     "musicStartMs" INTEGER NOT NULL DEFAULT 0;
