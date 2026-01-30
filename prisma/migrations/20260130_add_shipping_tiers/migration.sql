-- Add Shipping Cost Tier table for bundled shipping calculations
CREATE TABLE "shipping_cost_tiers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_items" INTEGER NOT NULL DEFAULT 1,
    "max_items" INTEGER,
    "cost" DECIMAL(14,2) NOT NULL,
    "cost_per_additional_item" DECIMAL(14,2) DEFAULT 0,
    "max_weight_grams" INTEGER,
    "shipping_zone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_cost_tiers_pkey" PRIMARY KEY ("id")
);

-- Add index for fast lookup
CREATE INDEX "shipping_cost_tiers_store_id_idx" ON "shipping_cost_tiers"("store_id");
CREATE INDEX "shipping_cost_tiers_store_id_min_items_idx" ON "shipping_cost_tiers"("store_id", "min_items");

-- Add foreign key
ALTER TABLE "shipping_cost_tiers" ADD CONSTRAINT "shipping_cost_tiers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
