-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "COGSSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'SHOPIFY_COST', 'API');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('PERCENTAGE_ONLY', 'FIXED_ONLY', 'PERCENTAGE_PLUS_FIXED');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('FIXED', 'VARIABLE', 'ONE_TIME', 'SALARY');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BankCategoryType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PatternType" AS ENUM ('CONTAINS', 'STARTS_WITH', 'EXACT', 'REGEX');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('FACEBOOK', 'GOOGLE', 'TIKTOK', 'SNAPCHAT', 'PINTEREST');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "password_hash" TEXT,
    "name" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_settings" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "default_currency" TEXT NOT NULL DEFAULT 'SEK',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Stockholm',
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "fiscal_year_start" INTEGER NOT NULL DEFAULT 1,
    "date_format" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "number_format" TEXT NOT NULL DEFAULT 'sv-SE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopify_domain" TEXT NOT NULL,
    "shopify_access_token_encrypted" TEXT,
    "shopify_scopes" TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Stockholm',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "SyncStatus",
    "sync_error" TEXT,
    "webhook_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "shopify_product_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "vendor" TEXT,
    "product_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "shopify_variant_id" BIGINT NOT NULL,
    "title" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "compare_at_price" DECIMAL(14,2),
    "inventory_quantity" INTEGER NOT NULL DEFAULT 0,
    "inventory_item_id" BIGINT,
    "weight" DECIMAL(10,2),
    "weight_unit" TEXT,
    "image_url" TEXT,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_cogs" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "cost_price" DECIMAL(14,2) NOT NULL,
    "zone_id" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "source" "COGSSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_cogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cogs_zones" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cogs_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "shopify_order_id" BIGINT NOT NULL,
    "order_number" TEXT NOT NULL,
    "order_name" TEXT,
    "financial_status" TEXT,
    "fulfillment_status" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "presentment_currency" TEXT,
    "subtotal_price" DECIMAL(14,2) NOT NULL,
    "total_discounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_shipping_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(14,2) NOT NULL,
    "total_cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_shipping_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_payment_fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_refund_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit_margin" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "customer_email" TEXT,
    "customer_first_name" TEXT,
    "customer_last_name" TEXT,
    "shipping_country" TEXT,
    "shipping_city" TEXT,
    "shopify_created_at" TIMESTAMP(3) NOT NULL,
    "shopify_updated_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "tags" TEXT[],
    "note" TEXT,
    "source_url" TEXT,
    "landing_site" TEXT,
    "referring_site" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "shopify_line_item_id" BIGINT NOT NULL,
    "shopify_product_id" BIGINT,
    "shopify_variant_id" BIGINT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "total_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cogs_source" "COGSSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_transactions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "shopify_transaction_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "payment_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_fee_calculated" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "shopify_refund_id" BIGINT NOT NULL,
    "note" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_fee_configs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "fee_type" "FeeType" NOT NULL,
    "percentage_fee" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "fixed_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_categories" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_costs" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "store_id" TEXT,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cost_type" "CostType" NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "percentage_rate" DECIMAL(5,4),
    "recurrence_type" "RecurrenceType",
    "recurrence_start" TIMESTAMP(3),
    "recurrence_end" TIMESTAMP(3),
    "occurrence_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_cost_entries" (
    "id" TEXT NOT NULL,
    "cost_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank_name" TEXT,
    "account_number" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "import_id" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "raw_text" TEXT,
    "merchant_id" TEXT,
    "category_id" TEXT,
    "normalized_merchant" TEXT,
    "is_income" BOOLEAN NOT NULL DEFAULT false,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_subscription" BOOLEAN NOT NULL DEFAULT false,
    "has_vat" BOOLEAN NOT NULL DEFAULT false,
    "vat_amount" DECIMAL(14,2),
    "net_amount" DECIMAL(14,2),
    "user_label" TEXT,
    "user_notes" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction_categories" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "type" "BankCategoryType" NOT NULL DEFAULT 'EXPENSE',
    "has_vat" BOOLEAN NOT NULL DEFAULT false,
    "vat_rate" DECIMAL(5,2),
    "is_vat_deductible" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_merchants" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "normalized_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "default_category_id" TEXT,
    "is_subscription" BOOLEAN NOT NULL DEFAULT false,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_merchant_rules" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "pattern_type" "PatternType" NOT NULL DEFAULT 'CONTAINS',
    "merchant_id" TEXT,
    "category_id" TEXT,
    "merchant_name" TEXT,
    "is_subscription" BOOLEAN NOT NULL DEFAULT false,
    "has_vat" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_imports" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "date_range_start" TIMESTAMP(3),
    "date_range_end" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_accounts" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "account_name" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "SyncStatus",
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_spends" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roas" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cpm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "campaign_id" TEXT,
    "campaign_name" TEXT,
    "adset_id" TEXT,
    "adset_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_spends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "total_products" INTEGER NOT NULL DEFAULT 0,
    "total_variants" INTEGER NOT NULL DEFAULT 0,
    "total_units" INTEGER NOT NULL DEFAULT 0,
    "total_retail_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cogs_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "low_stock_count" INTEGER NOT NULL DEFAULT 0,
    "out_of_stock_count" INTEGER NOT NULL DEFAULT 0,
    "inventory_data" JSONB,
    "by_product_type" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_key" ON "team_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_team_id_email_key" ON "team_invitations"("team_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "team_settings_team_id_key" ON "team_settings"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_shopify_domain_key" ON "stores"("shopify_domain");

-- CreateIndex
CREATE INDEX "stores_team_id_idx" ON "stores"("team_id");

-- CreateIndex
CREATE INDEX "products_store_id_idx" ON "products"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_shopify_product_id_key" ON "products"("store_id", "shopify_product_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_shopify_variant_id_key" ON "product_variants"("product_id", "shopify_variant_id");

-- CreateIndex
CREATE INDEX "variant_cogs_variant_id_idx" ON "variant_cogs"("variant_id");

-- CreateIndex
CREATE INDEX "variant_cogs_variant_id_effective_from_idx" ON "variant_cogs"("variant_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "cogs_zones_team_id_name_key" ON "cogs_zones"("team_id", "name");

-- CreateIndex
CREATE INDEX "orders_store_id_idx" ON "orders"("store_id");

-- CreateIndex
CREATE INDEX "orders_shopify_created_at_idx" ON "orders"("shopify_created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_shopify_created_at_idx" ON "orders"("store_id", "shopify_created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_processed_at_idx" ON "orders"("store_id", "processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_shopify_order_id_key" ON "orders"("store_id", "shopify_order_id");

-- CreateIndex
CREATE INDEX "order_line_items_order_id_idx" ON "order_line_items"("order_id");

-- CreateIndex
CREATE INDEX "order_line_items_variant_id_idx" ON "order_line_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_items_order_id_shopify_line_item_id_key" ON "order_line_items"("order_id", "shopify_line_item_id");

-- CreateIndex
CREATE INDEX "order_transactions_order_id_idx" ON "order_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_transactions_order_id_shopify_transaction_id_key" ON "order_transactions"("order_id", "shopify_transaction_id");

-- CreateIndex
CREATE INDEX "order_refunds_order_id_idx" ON "order_refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_refunds_order_id_shopify_refund_id_key" ON "order_refunds"("order_id", "shopify_refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_fee_configs_store_id_gateway_key" ON "payment_fee_configs"("store_id", "gateway");

-- CreateIndex
CREATE UNIQUE INDEX "cost_categories_team_id_slug_key" ON "cost_categories"("team_id", "slug");

-- CreateIndex
CREATE INDEX "custom_costs_team_id_idx" ON "custom_costs"("team_id");

-- CreateIndex
CREATE INDEX "custom_costs_store_id_idx" ON "custom_costs"("store_id");

-- CreateIndex
CREATE INDEX "custom_cost_entries_cost_id_idx" ON "custom_cost_entries"("cost_id");

-- CreateIndex
CREATE INDEX "custom_cost_entries_date_idx" ON "custom_cost_entries"("date");

-- CreateIndex
CREATE INDEX "bank_accounts_team_id_idx" ON "bank_accounts"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_team_id_name_key" ON "bank_accounts"("team_id", "name");

-- CreateIndex
CREATE INDEX "bank_transactions_account_id_idx" ON "bank_transactions"("account_id");

-- CreateIndex
CREATE INDEX "bank_transactions_transaction_date_idx" ON "bank_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "bank_transactions_category_id_idx" ON "bank_transactions"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_account_id_transaction_date_amount_descri_key" ON "bank_transactions"("account_id", "transaction_date", "amount", "description");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_categories_team_id_slug_key" ON "bank_transaction_categories"("team_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "bank_merchants_team_id_normalized_name_key" ON "bank_merchants"("team_id", "normalized_name");

-- CreateIndex
CREATE INDEX "bank_merchant_rules_team_id_priority_idx" ON "bank_merchant_rules"("team_id", "priority");

-- CreateIndex
CREATE INDEX "bank_imports_account_id_idx" ON "bank_imports"("account_id");

-- CreateIndex
CREATE INDEX "ad_accounts_team_id_idx" ON "ad_accounts"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_accounts_team_id_platform_platform_account_id_key" ON "ad_accounts"("team_id", "platform", "platform_account_id");

-- CreateIndex
CREATE INDEX "ad_spends_ad_account_id_idx" ON "ad_spends"("ad_account_id");

-- CreateIndex
CREATE INDEX "ad_spends_date_idx" ON "ad_spends"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_spends_ad_account_id_date_campaign_id_adset_id_key" ON "ad_spends"("ad_account_id", "date", "campaign_id", "adset_id");

-- CreateIndex
CREATE INDEX "inventory_snapshots_store_id_idx" ON "inventory_snapshots"("store_id");

-- CreateIndex
CREATE INDEX "inventory_snapshots_snapshot_date_idx" ON "inventory_snapshots"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_snapshots_store_id_snapshot_date_key" ON "inventory_snapshots"("store_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "audit_logs_team_id_created_at_idx" ON "audit_logs"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_settings" ADD CONSTRAINT "team_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_cogs" ADD CONSTRAINT "variant_cogs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_cogs" ADD CONSTRAINT "variant_cogs_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "cogs_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_zones" ADD CONSTRAINT "cogs_zones_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_transactions" ADD CONSTRAINT "order_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_fee_configs" ADD CONSTRAINT "payment_fee_configs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_categories" ADD CONSTRAINT "cost_categories_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_costs" ADD CONSTRAINT "custom_costs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_costs" ADD CONSTRAINT "custom_costs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cost_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_cost_entries" ADD CONSTRAINT "custom_cost_entries_cost_id_fkey" FOREIGN KEY ("cost_id") REFERENCES "custom_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "bank_merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "bank_transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_merchants" ADD CONSTRAINT "bank_merchants_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "bank_transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_merchant_rules" ADD CONSTRAINT "bank_merchant_rules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "bank_merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_merchant_rules" ADD CONSTRAINT "bank_merchant_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "bank_transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_spends" ADD CONSTRAINT "ad_spends_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
