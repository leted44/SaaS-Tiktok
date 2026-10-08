-- The creator's trained clone (a LoRA on fal.ai), per space.
ALTER TABLE "Space" ADD COLUMN "clone" JSONB;
