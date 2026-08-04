-- CreateTable
CREATE TABLE "verification_settings" (
    "id" TEXT NOT NULL,
    "photoVerificationRequired" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "verification_settings_pkey" PRIMARY KEY ("id")
);
