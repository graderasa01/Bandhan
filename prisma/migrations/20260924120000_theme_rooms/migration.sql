-- Theme rooms (2026-09-24): the four looks the header's theme button cycles
-- through — Satin, Day, Night, Classic — made admin-editable from
-- /admin/theme: which ones are on, which one a first visit gets, and a photo
-- that replaces the drawn background of Satin, Day or Night.
--
-- Nothing is seeded. A room with no row is on its built-in defaults (on,
-- drawn background, no photo) and Satin is the default when no row says
-- otherwise, so empty tables are the product exactly as it shipped.

-- CreateTable
CREATE TABLE "theme_rooms" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "photoId" TEXT,
    "dim" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "focusX" INTEGER NOT NULL DEFAULT 50,
    "focusY" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "theme_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_room_photos" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "backdropUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "lumaMean" DOUBLE PRECISION NOT NULL,
    "lumaBright" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "theme_room_photos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "theme_rooms" ADD CONSTRAINT "theme_rooms_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "theme_room_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
