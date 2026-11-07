-- Migration: 20261023010000_add_online_payment_surplus_resolutions
-- Online Payment Surplus Resolution Ledger & First-Class Structured Columns (Phase H1)
-- Strictly preserves existing financial tables, monotonic receipt sequences, and ledger history.

-- 1. Create Reconciliation Status Enum
DO $$ BEGIN
  CREATE TYPE "OnlineReconciliationStatus" AS ENUM (
    'NONE',
    'UNRESOLVED',
    'PARTIALLY_RESOLVED',
    'FULLY_RESOLVED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add Structured Header Columns to online_payment_orders
ALTER TABLE "online_payment_orders"
  ADD COLUMN IF NOT EXISTS "surplusAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "resolvedSurplusAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "reconciliationStatus" "OnlineReconciliationStatus" NOT NULL DEFAULT 'NONE';

-- 3. Add Monetary Check Constraints on online_payment_orders
ALTER TABLE "online_payment_orders"
  DROP CONSTRAINT IF EXISTS "chk_online_order_surplus_non_negative",
  ADD CONSTRAINT "chk_online_order_surplus_non_negative" CHECK ("surplusAmount" >= 0),
  DROP CONSTRAINT IF EXISTS "chk_online_order_resolved_surplus_non_negative",
  ADD CONSTRAINT "chk_online_order_resolved_surplus_non_negative" CHECK ("resolvedSurplusAmount" >= 0),
  DROP CONSTRAINT IF EXISTS "chk_online_order_resolved_le_surplus",
  ADD CONSTRAINT "chk_online_order_resolved_le_surplus" CHECK ("resolvedSurplusAmount" <= "surplusAmount");

-- 4. Create Child Ledger Table: online_payment_surplus_resolutions
CREATE TABLE IF NOT EXISTS "online_payment_surplus_resolutions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "resolvedAmount" DECIMAL(12, 2) NOT NULL,
  "action" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "externalReferenceNumber" TEXT,
  "idempotencyKey" TEXT,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "online_payment_surplus_resolutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_surplus_resolution_positive" CHECK ("resolvedAmount" > 0)
);

-- 5. Create Unique Constraints & Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_surplus_resolutions_schoolId_id_key"
  ON "online_payment_surplus_resolutions"("schoolId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_surplus_resolutions_schoolId_idempotencyKey_key"
  ON "online_payment_surplus_resolutions"("schoolId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "online_payment_surplus_resolutions_schoolId_orderId_idx"
  ON "online_payment_surplus_resolutions"("schoolId", "orderId");

CREATE INDEX IF NOT EXISTS "online_payment_surplus_resolutions_resolvedAt_idx"
  ON "online_payment_surplus_resolutions"("resolvedAt");

CREATE INDEX IF NOT EXISTS "online_payment_orders_reconciliation_queue_idx"
  ON "online_payment_orders" ("schoolId", "reconciliationStatus", "verifiedAt" DESC)
  WHERE "surplusAmount" > 0;

-- 6. Foreign Key Relationships with Strict Multi-Tenant Enforcement
ALTER TABLE "online_payment_surplus_resolutions"
  DROP CONSTRAINT IF EXISTS "online_payment_surplus_resolutions_schoolId_fkey",
  ADD CONSTRAINT "online_payment_surplus_resolutions_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "online_payment_surplus_resolutions"
  DROP CONSTRAINT IF EXISTS "online_payment_surplus_resolutions_schoolId_orderId_fkey",
  ADD CONSTRAINT "online_payment_surplus_resolutions_schoolId_orderId_fkey"
  FOREIGN KEY ("schoolId", "orderId") REFERENCES "online_payment_orders"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_payment_surplus_resolutions"
  DROP CONSTRAINT IF EXISTS "online_payment_surplus_resolutions_resolvedByUserId_fkey",
  ADD CONSTRAINT "online_payment_surplus_resolutions_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Deterministic Historical Data Backfill & Transaction Assertions
DO $$
DECLARE
  v_malformed_surplus_count INT := 0;
  v_excessive_surplus_count INT := 0;
  v_pre_surplus_orders_count INT := 0;
  v_pre_surplus_total DECIMAL(12, 2) := 0.00;
  v_pre_resolved_orders_count INT := 0;
  v_pre_resolved_total DECIMAL(12, 2) := 0.00;
  v_post_surplus_orders_count INT := 0;
  v_post_surplus_total DECIMAL(12, 2) := 0.00;
  v_post_resolved_orders_count INT := 0;
  v_post_resolved_total DECIMAL(12, 2) := 0.00;
  v_child_resolutions_count INT := 0;
  v_child_resolutions_total DECIMAL(12, 2) := 0.00;
  v_headroom_violation_count INT := 0;
BEGIN
  -- PRE-MIGRATION SAFETY CHECK 1: Detect malformed, non-decimal, or negative surplusAmount in JSON
  SELECT COUNT(*) INTO v_malformed_surplus_count
  FROM "online_payment_orders"
  WHERE metadata IS NOT NULL 
    AND metadata->>'surplusAmount' IS NOT NULL
    AND TRIM(metadata->>'surplusAmount') != ''
    AND NOT (metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$');

  IF v_malformed_surplus_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-PRE-01]: Found % orders with malformed surplusAmount metadata', v_malformed_surplus_count;
  END IF;

  -- PRE-MIGRATION SAFETY CHECK 2: Detect surplusAmount exceeding captured order amount
  SELECT COUNT(*) INTO v_excessive_surplus_count
  FROM "online_payment_orders"
  WHERE metadata IS NOT NULL 
    AND metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$'
    AND (metadata->>'surplusAmount')::numeric > "amount";

  IF v_excessive_surplus_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-PRE-02]: Found % orders where surplusAmount exceeds captured amount', v_excessive_surplus_count;
  END IF;

  -- PRE-MIGRATION BASELINE: Capture counts and totals before backfill
  SELECT 
    COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$' AND (metadata->>'surplusAmount')::numeric > 0),
    COALESCE(SUM(CASE WHEN metadata IS NOT NULL AND metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$' THEN (metadata->>'surplusAmount')::numeric ELSE 0.00 END), 0.00),
    COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$' AND (metadata->>'surplusAmount')::numeric > 0 AND metadata->>'reconciliationStatus' = 'RESOLVED'),
    COALESCE(SUM(CASE WHEN metadata IS NOT NULL AND metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$' AND metadata->>'reconciliationStatus' = 'RESOLVED' THEN (metadata->>'surplusAmount')::numeric ELSE 0.00 END), 0.00)
  INTO 
    v_pre_surplus_orders_count,
    v_pre_surplus_total,
    v_pre_resolved_orders_count,
    v_pre_resolved_total
  FROM "online_payment_orders";

  -- Step 7A: Populate surplusAmount from historical JSON metadata with safe regex cast
  UPDATE "online_payment_orders"
  SET "surplusAmount" = CASE 
    WHEN metadata IS NOT NULL AND metadata->>'surplusAmount' ~ '^[0-9]+(\.[0-9]{1,2})?$' 
    THEN LEAST("amount", (metadata->>'surplusAmount')::numeric)
    ELSE 0.00 
  END
  WHERE metadata IS NOT NULL AND metadata->>'surplusAmount' IS NOT NULL;

  -- Step 7B: Backfill resolved resolution records into child ledger with LEGACY_UNSPECIFIED_RESOLVED
  INSERT INTO "online_payment_surplus_resolutions" (
    "id",
    "schoolId",
    "orderId",
    "resolvedAmount",
    "action",
    "notes",
    "externalReferenceNumber",
    "idempotencyKey",
    "resolvedByUserId",
    "resolvedAt",
    "createdAt"
  )
  SELECT
    gen_random_uuid()::text AS "id",
    o."schoolId",
    o."id" AS "orderId",
    o."surplusAmount" AS "resolvedAmount",
    COALESCE(o.metadata->>'resolutionAction', 'LEGACY_UNSPECIFIED_RESOLVED') AS "action",
    CASE 
      WHEN o.metadata->>'resolutionAction' IS NULL 
      THEN COALESCE(o.metadata->>'resolutionNotes', 'Historical resolved surplus (action unspecified in Phase G metadata)')
      ELSE COALESCE(o.metadata->>'resolutionNotes', 'Backfilled historical resolution from Phase G/G1 metadata')
    END AS "notes",
    o.metadata->>'resolutionExternalRef' AS "externalReferenceNumber",
    'HISTORICAL-BACKFILL-' || o."id" AS "idempotencyKey",
    CASE 
      WHEN u."id" IS NOT NULL THEN o.metadata->>'resolvedByUserId'
      ELSE NULL
    END AS "resolvedByUserId",
    CASE 
      WHEN o.metadata->>'resolvedAt' ~ '^\d{4}-\d{2}-\d{2}' 
      THEN (o.metadata->>'resolvedAt')::timestamp(3)
      ELSE COALESCE(o."verifiedAt", o."updatedAt", o."createdAt")
    END AS "resolvedAt",
    CASE 
      WHEN o.metadata->>'resolvedAt' ~ '^\d{4}-\d{2}-\d{2}' 
      THEN (o.metadata->>'resolvedAt')::timestamp(3)
      ELSE COALESCE(o."verifiedAt", o."updatedAt", o."createdAt")
    END AS "createdAt"
  FROM "online_payment_orders" o
  LEFT JOIN "users" u ON u."id" = (o.metadata->>'resolvedByUserId')
  WHERE o."surplusAmount" > 0
    AND o.metadata->>'reconciliationStatus' = 'RESOLVED'
    AND NOT EXISTS (
      SELECT 1 FROM "online_payment_surplus_resolutions" r 
      WHERE r."orderId" = o."id"
    );

  -- Step 7C: Synchronize header fields for fully resolved historical orders
  UPDATE "online_payment_orders"
  SET 
    "resolvedSurplusAmount" = "surplusAmount",
    "reconciliationStatus" = 'FULLY_RESOLVED'::"OnlineReconciliationStatus"
  WHERE "surplusAmount" > 0
    AND metadata->>'reconciliationStatus' = 'RESOLVED';

  -- Step 7D: Synchronize header fields for unresolved historical orders
  UPDATE "online_payment_orders"
  SET 
    "resolvedSurplusAmount" = 0.00,
    "reconciliationStatus" = 'UNRESOLVED'::"OnlineReconciliationStatus"
  WHERE "surplusAmount" > 0
    AND (metadata->>'reconciliationStatus' IS NULL OR metadata->>'reconciliationStatus' != 'RESOLVED');

  -- Step 7E: Ensure default status for orders with zero surplus
  UPDATE "online_payment_orders"
  SET 
    "surplusAmount" = 0.00,
    "resolvedSurplusAmount" = 0.00,
    "reconciliationStatus" = 'NONE'::"OnlineReconciliationStatus"
  WHERE "surplusAmount" = 0.00 OR "surplusAmount" IS NULL;

  -- POST-MIGRATION ASSERTION 1: Verify surplus order count parity
  SELECT 
    COUNT(*) FILTER (WHERE "surplusAmount" > 0),
    COALESCE(SUM("surplusAmount"), 0.00),
    COUNT(*) FILTER (WHERE "reconciliationStatus" = 'FULLY_RESOLVED'),
    COALESCE(SUM("resolvedSurplusAmount"), 0.00)
  INTO 
    v_post_surplus_orders_count,
    v_post_surplus_total,
    v_post_resolved_orders_count,
    v_post_resolved_total
  FROM "online_payment_orders";

  SELECT 
    COUNT(*),
    COALESCE(SUM("resolvedAmount"), 0.00)
  INTO 
    v_child_resolutions_count,
    v_child_resolutions_total
  FROM "online_payment_surplus_resolutions";

  IF v_post_surplus_orders_count != v_pre_surplus_orders_count THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-01]: Surplus orders count mismatch (Pre: %, Post: %)', v_pre_surplus_orders_count, v_post_surplus_orders_count;
  END IF;

  -- POST-MIGRATION ASSERTION 2: Verify total surplus amount parity
  IF v_post_surplus_total != v_pre_surplus_total THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-02]: Total surplus sum mismatch (Pre: %, Post: %)', v_pre_surplus_total, v_post_surplus_total;
  END IF;

  -- POST-MIGRATION ASSERTION 3: Verify resolved order count parity
  IF v_post_resolved_orders_count != v_pre_resolved_orders_count THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-03]: Resolved orders count mismatch (Pre: %, Post: %)', v_pre_resolved_orders_count, v_post_resolved_orders_count;
  END IF;

  -- POST-MIGRATION ASSERTION 4: Verify resolved surplus sum parity
  IF v_post_resolved_total != v_pre_resolved_total THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-04]: Resolved surplus sum mismatch (Pre: %, Post: %)', v_pre_resolved_total, v_post_resolved_total;
  END IF;

  -- POST-MIGRATION ASSERTION 5: Verify child resolution row count equals resolved orders count
  IF v_child_resolutions_count != v_pre_resolved_orders_count THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-05]: Child resolution count mismatch (Expected: %, Found: %)', v_pre_resolved_orders_count, v_child_resolutions_count;
  END IF;

  -- POST-MIGRATION ASSERTION 6: Verify child resolution sum equals resolved surplus sum
  IF v_child_resolutions_total != v_pre_resolved_total THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-06]: Child resolution sum mismatch (Expected: %, Found: %)', v_pre_resolved_total, v_child_resolutions_total;
  END IF;

  -- POST-MIGRATION ASSERTION 7: Verify zero headroom violations
  SELECT COUNT(*) INTO v_headroom_violation_count
  FROM "online_payment_orders"
  WHERE "resolvedSurplusAmount" > "surplusAmount";

  IF v_headroom_violation_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED [H1A-POST-07]: Found % orders violating headroom constraint', v_headroom_violation_count;
  END IF;

END $$;
