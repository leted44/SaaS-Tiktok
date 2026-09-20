-- AlterEnum
ALTER TYPE "CreditTxType" ADD VALUE 'VOICE_CLONE';

-- CreateTable
CREATE TABLE "CustomVoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerVoiceId" TEXT NOT NULL,
    "sampleUrl" TEXT NOT NULL,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomVoice_userId_key" ON "CustomVoice"("userId");

-- AddForeignKey
ALTER TABLE "CustomVoice" ADD CONSTRAINT "CustomVoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
