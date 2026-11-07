-- Migration: 20261028010000_add_school_receipt_number_configs
-- School-Wise Custom Receipt Numbering Configuration Tier

-- 1. Create Enum for Academic Year Format in Receipt Numbering
DO $$ BEGIN
  CREATE TYPE "AcademicYearFormat" AS ENUM (
    'SHORT_6DIGIT',      -- e.g. 202627 (Standard default)
    'FULL_8DIGIT',       -- e.g. 20262027
    'START_YEAR_4DIGIT', -- e.g. 2026
    'NONE'               -- No academic year token in receipt number
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create School Receipt Number Configurations Master Table
CREATE TABLE IF NOT EXISTS "school_receipt_number_configs" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "prefix" VARCHAR(10) NOT NULL DEFAULT 'RCT',
  "yearFormat" "AcademicYearFormat" NOT NULL DEFAULT 'SHORT_6DIGIT',
  "paddingDigits" INTEGER NOT NULL DEFAULT 5,
  "separator" VARCHAR(2) NOT NULL DEFAULT '-',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "school_receipt_number_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_receipt_number_configs_schoolId_key" UNIQUE ("schoolId"),
  CONSTRAINT "school_receipt_number_configs_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "fk_receipt_config_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "chk_receipt_config_padding" CHECK ("paddingDigits" >= 4 AND "paddingDigits" <= 8),
  CONSTRAINT "chk_receipt_config_prefix_format" CHECK ("prefix" ~ '^[A-Z0-9]{2,10}$'),
  CONSTRAINT "chk_receipt_config_separator" CHECK ("separator" IN ('-', '/', ''))
);

-- 3. Indexes for Multi-Tenant Scoping and Performance
CREATE INDEX IF NOT EXISTS "school_receipt_number_configs_schoolId_idx" ON "school_receipt_number_configs"("schoolId");
