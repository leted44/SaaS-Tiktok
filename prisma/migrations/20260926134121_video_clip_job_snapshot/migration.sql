/*
  Warnings:

  - Added the required column `imageUrl` to the `VideoClipJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prompt` to the `VideoClipJob` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "VideoClipJob" ADD COLUMN     "imageUrl" TEXT NOT NULL,
ADD COLUMN     "prompt" TEXT NOT NULL;
