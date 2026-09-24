-- Default caption position for the brand kit: where subtitles sit on screen
-- (top/center/bottom) for new projects and templates, independent of which
-- caption preset is chosen.
-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "captionPosition" TEXT NOT NULL DEFAULT 'center';
