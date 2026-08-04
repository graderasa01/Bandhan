-- CreateEnum
CREATE TYPE "PollTheme" AS ENUM ('PARIVAAR', 'PAISA', 'CAREER', 'RITUALS', 'RED_FLAGS', 'SAPNE', 'HALKA');

-- AlterTable
ALTER TABLE "polls" ADD COLUMN     "theme" "PollTheme" NOT NULL DEFAULT 'HALKA';

-- CreateIndex
CREATE INDEX "polls_theme_publishedOn_sortOrder_idx" ON "polls"("theme", "publishedOn", "sortOrder");
