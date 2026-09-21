-- Visuals a project has chosen but does not currently show on any scene.
-- Without it, taking a clip off a scene is the same as losing it: stock picks
-- live only as a URL inside a layer, and nothing else in the app remembers them.
ALTER TABLE "Project" ADD COLUMN "visualPool" JSONB;
