-- New videos default to 20 seconds instead of 45: real exports showed viewers leaving after 5 to 10 seconds of 30 to 45 second videos.
-- Only the column defaults change; existing projects, schedules and templates keep the length they were saved with.
ALTER TABLE "Project" ALTER COLUMN "targetDurationSec" SET DEFAULT 20;
ALTER TABLE "AutopilotItem" ALTER COLUMN "targetDurationSec" SET DEFAULT 20;
ALTER TABLE "VideoTemplate" ALTER COLUMN "targetDurationSec" SET DEFAULT 20;
