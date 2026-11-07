-- Migration: 20261022020000_add_school_payment_gateway_configs
-- School-Wise Razorpay Gateway & Online Payment Orders Tier (Phase C)
-- Strictly preserves existing financial tables, monotonic receipt sequences, and ledger history.

-- 1. Extend PaymentMethod Enum with ONLINE_RAZORPAY
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ONLINE_RAZORPAY';

-- 2. Create Gateway Provider & Environment Enums
DO $$ BEGIN
  CREATE TYPE "GatewayProvider" AS ENUM ('RAZORPAY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GatewayEnvironment" AS ENUM ('TEST', 'LIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GatewayStatus" AS ENUM ('DISABLED', 'PENDING_VERIFICATION', 'ACTIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OnlinePaymentStatus" AS ENUM ('CREATED', 'ATTEMPTED', 'SUCCESS', 'FAILED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create Table: school_payment_gateway_configs
CREATE TABLE IF NOT EXISTS "school_payment_gateway_configs" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "provider" "GatewayProvider" NOT NULL DEFAULT 'RAZORPAY',
  "merchantName" TEXT,
  "keyId" TEXT NOT NULL,
  "encryptedKeySecret" TEXT NOT NULL,
  "keySecretIv" TEXT NOT NULL,
  "keySecretAuthTag" TEXT NOT NULL,
  "encryptedWebhookSecret" TEXT,
  "webhookSecretIv" TEXT,
  "webhookSecretAuthTag" TEXT,
  "environment" "GatewayEnvironment" NOT NULL DEFAULT 'TEST',
  "status" "GatewayStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "lastVerifiedAt" TIMESTAMP(3),
  "lastVerificationError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "school_payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- Unique & Index Constraints on school_payment_gateway_configs
CREATE UNIQUE INDEX IF NOT EXISTS "school_payment_gateway_configs_schoolId_key" ON "school_payment_gateway_configs"("schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "school_payment_gateway_configs_schoolId_id_key" ON "school_payment_gateway_configs"("schoolId", "id");
CREATE INDEX IF NOT EXISTS "school_payment_gateway_configs_schoolId_idx" ON "school_payment_gateway_configs"("schoolId");
CREATE INDEX IF NOT EXISTS "school_payment_gateway_configs_status_idx" ON "school_payment_gateway_configs"("status");

-- Foreign Key to schools
ALTER TABLE "school_payment_gateway_configs" 
  DROP CONSTRAINT IF EXISTS "school_payment_gateway_configs_schoolId_fkey",
  ADD CONSTRAINT "school_payment_gateway_configs_schoolId_fkey" 
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Create Table: online_payment_orders
CREATE TABLE IF NOT EXISTS "online_payment_orders" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "providerOrderId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'CREATED',
  "providerSignature" TEXT,
  "failureReason" TEXT,
  "paymentId" TEXT,
  "metadata" JSONB,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "online_payment_orders_pkey" PRIMARY KEY ("id")
);

-- Unique Constraints for Provider Idempotency & Replay Prevention
CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_orders_paymentId_key" ON "online_payment_orders"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_orders_schoolId_providerOrderId_key" ON "online_payment_orders"("schoolId", "providerOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_orders_schoolId_idempotencyKey_key" ON "online_payment_orders"("schoolId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_orders_schoolId_providerPaymentId_key" ON "online_payment_orders"("schoolId", "providerPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "online_payment_orders_schoolId_id_key" ON "online_payment_orders"("schoolId", "id");

-- Performance Indexes
CREATE INDEX IF NOT EXISTS "online_payment_orders_schoolId_idx" ON "online_payment_orders"("schoolId");
CREATE INDEX IF NOT EXISTS "online_payment_orders_studentId_idx" ON "online_payment_orders"("studentId");
CREATE INDEX IF NOT EXISTS "online_payment_orders_invoiceId_idx" ON "online_payment_orders"("invoiceId");
CREATE INDEX IF NOT EXISTS "online_payment_orders_status_idx" ON "online_payment_orders"("status");
CREATE INDEX IF NOT EXISTS "online_payment_orders_providerPaymentId_idx" ON "online_payment_orders"("providerPaymentId");

-- Foreign Keys ensuring strict tenant and entity alignment
ALTER TABLE "online_payment_orders" 
  DROP CONSTRAINT IF EXISTS "online_payment_orders_schoolId_fkey",
  ADD CONSTRAINT "online_payment_orders_schoolId_fkey" 
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "online_payment_orders" 
  DROP CONSTRAINT IF EXISTS "online_payment_orders_schoolId_studentId_fkey",
  ADD CONSTRAINT "online_payment_orders_schoolId_studentId_fkey" 
  FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "online_payment_orders" 
  DROP CONSTRAINT IF EXISTS "online_payment_orders_schoolId_invoiceId_fkey",
  ADD CONSTRAINT "online_payment_orders_schoolId_invoiceId_fkey" 
  FOREIGN KEY ("schoolId", "invoiceId") REFERENCES "fee_invoices"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "online_payment_orders" 
  DROP CONSTRAINT IF EXISTS "online_payment_orders_paymentId_fkey",
  ADD CONSTRAINT "online_payment_orders_paymentId_fkey" 
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Database Monetary CHECK Constraint on online_payment_orders
ALTER TABLE "online_payment_orders" 
  DROP CONSTRAINT IF EXISTS "chk_online_payment_orders_amount_positive",
  ADD CONSTRAINT "chk_online_payment_orders_amount_positive" 
  CHECK ("amount" > 0);
