-- AlterTable
ALTER TABLE "partner_commission_config" ADD COLUMN     "serviceBandOverrides" JSONB,
ADD COLUMN     "verificationFeeOverrides" JSONB;

-- AlterTable
ALTER TABLE "partner_services" ADD COLUMN     "adminPriceAt" TIMESTAMP(3),
ADD COLUMN     "adminPriceBy" TEXT,
ADD COLUMN     "adminPriceNote" TEXT,
ADD COLUMN     "adminPricePaise" INTEGER;
