-- Photo carousels: the project's script rewritten to be read slide by slide.
-- One per project; the slide text is stored as JSON and edited on its own.
CREATE TABLE "Carousel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scriptId" TEXT,
    "template" TEXT NOT NULL DEFAULT 'minimal',
    "format" TEXT NOT NULL DEFAULT 'portrait',
    "handle" TEXT,
    "slides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carousel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Carousel_projectId_key" ON "Carousel"("projectId");
CREATE INDEX "Carousel_userId_idx" ON "Carousel"("userId");

ALTER TABLE "Carousel" ADD CONSTRAINT "Carousel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Carousel" ADD CONSTRAINT "Carousel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
