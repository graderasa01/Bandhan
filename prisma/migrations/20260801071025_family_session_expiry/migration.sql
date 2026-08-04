/*
  Warnings:

  - Added the required column `expiresAt` to the `family_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "family_sessions" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL;
