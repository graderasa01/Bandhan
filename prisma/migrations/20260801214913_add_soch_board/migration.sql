-- AlterEnum
ALTER TYPE "ShareLinkKind" ADD VALUE 'SOCH_BOARD';

-- AlterTable
ALTER TABLE "poll_votes" ADD COLUMN     "voiceNoteMediaId" TEXT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "sochBoardVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_voiceNoteMediaId_key" ON "poll_votes"("voiceNoteMediaId");

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_voiceNoteMediaId_fkey" FOREIGN KEY ("voiceNoteMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

