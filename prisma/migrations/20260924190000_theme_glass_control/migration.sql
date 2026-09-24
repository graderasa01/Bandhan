-- Glass control (2026-09-24): /admin/theme gets full manual control of the
-- clear glass a photo room wears, separately for mobile and desktop, plus a
-- desktop (landscape) photo of its own and a library of named glass presets.
--
-- Nothing changes on deploy. `glass` is null on every existing room, and null
-- means AUTO — the glass exactly as it shipped. A room with no desktop photo
-- shows its phone photo on desktop with the phone photo's dim and crop, which
-- is what it did before, so the desktop columns need no backfill. The preset
-- table starts empty: the four built-in presets live in code and get a row
-- only once an admin changes one.

-- AlterTable
ALTER TABLE "theme_rooms" ADD COLUMN     "desktopDim" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "desktopFocusX" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "desktopFocusY" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "desktopPhotoId" TEXT,
ADD COLUMN     "glass" JSONB;

-- CreateTable
CREATE TABLE "theme_glass_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "theme_glass_presets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "theme_rooms" ADD CONSTRAINT "theme_rooms_desktopPhotoId_fkey" FOREIGN KEY ("desktopPhotoId") REFERENCES "theme_room_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
