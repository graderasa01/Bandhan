-- DropIndex
DROP INDEX "polls_theme_publishedOn_sortOrder_idx";

-- AlterTable
ALTER TABLE "polls" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "polls_theme_retiredAt_publishedOn_sortOrder_idx" ON "polls"("theme", "retiredAt", "publishedOn", "sortOrder");
