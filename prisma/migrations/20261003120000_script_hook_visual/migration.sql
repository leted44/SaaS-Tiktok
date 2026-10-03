-- The AI image brief of the hook: the video's first image gets its own instead of borrowing scene 1's.
ALTER TABLE "Script" ADD COLUMN "hookVisual" TEXT;
