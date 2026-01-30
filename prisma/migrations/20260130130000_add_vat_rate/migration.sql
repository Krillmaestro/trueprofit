-- AlterTable: Add VAT rate column to product_variants
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25;
