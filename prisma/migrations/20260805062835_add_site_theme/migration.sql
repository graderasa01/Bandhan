-- CreateEnum
CREATE TYPE "ThemePack" AS ENUM ('KUNDAN', 'RAAT', 'KAAGAZ', 'CUSTOM');

-- CreateTable
CREATE TABLE "site_theme" (
    "id" TEXT NOT NULL,
    "pack" "ThemePack" NOT NULL DEFAULT 'KUNDAN',
    "customPrimary" TEXT,
    "customPrimaryText" TEXT,
    "customAccent" TEXT,
    "customAccentText" TEXT,
    "customSignal" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "site_theme_pkey" PRIMARY KEY ("id")
);
