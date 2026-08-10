-- CreateEnum
CREATE TYPE "VoiceProvider" AS ENUM ('SARVAM', 'GEMINI');

-- CreateTable
CREATE TABLE "voice_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sttProvider" "VoiceProvider" NOT NULL DEFAULT 'SARVAM',
    "ttsProvider" "VoiceProvider" NOT NULL DEFAULT 'SARVAM',
    "geminiVoice" TEXT NOT NULL DEFAULT 'Kore',
    "sarvamVoice" TEXT NOT NULL DEFAULT 'shreya',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "voice_settings_pkey" PRIMARY KEY ("id")
);
