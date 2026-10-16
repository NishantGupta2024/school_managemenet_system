-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'POS_CARD', 'DEMAND_DRAFT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'VOIDED', 'BOUNCED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('PRINCIPAL', 'FINE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessedFineStatus" AS ENUM ('OUTSTANDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "InvoiceStatus" ADD VALUE 'PAID';

-- CreateTable
CREATE TABLE "receipt_sequence_counters" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'RCT',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_sequence_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "referenceNumber" TEXT,
    "chequeNumber" TEXT,
    "chequeDate" TIMESTAMP(3),
    "bankName" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "collectedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceItemId" TEXT,
    "assessedFineId" TEXT,
    "reversalOfAllocationId" TEXT,
    "allocationType" "AllocationType" NOT NULL DEFAULT 'PRINCIPAL',
    "allocatedAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessed_fines" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fineRuleId" TEXT,
    "assessedAmount" DECIMAL(12,2) NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "overdueDays" INTEGER NOT NULL,
    "status" "AssessedFineStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "calculationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessed_fines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fine_waivers" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "assessedFineId" TEXT,
    "waivedAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fine_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receiptSequence" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
    "receiptSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "refundAmount" DECIMAL(12,2) NOT NULL,
    "refundDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "authorizedByUserId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_sequence_counters_schoolId_idx" ON "receipt_sequence_counters"("schoolId");

-- CreateIndex
CREATE INDEX "receipt_sequence_counters_academicYearId_idx" ON "receipt_sequence_counters"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequence_counters_schoolId_academicYearId_key" ON "receipt_sequence_counters"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequence_counters_schoolId_id_key" ON "receipt_sequence_counters"("schoolId", "id");

-- CreateIndex
CREATE INDEX "payments_schoolId_idx" ON "payments"("schoolId");

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE INDEX "payments_academicYearId_idx" ON "payments"("academicYearId");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_schoolId_paymentNumber_key" ON "payments"("schoolId", "paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payments_schoolId_idempotencyKey_key" ON "payments"("schoolId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payments_schoolId_id_key" ON "payments"("schoolId", "id");

-- CreateIndex
CREATE INDEX "payment_allocations_schoolId_idx" ON "payment_allocations"("schoolId");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceItemId_idx" ON "payment_allocations"("invoiceItemId");

-- CreateIndex
CREATE INDEX "payment_allocations_assessedFineId_idx" ON "payment_allocations"("assessedFineId");

-- CreateIndex
CREATE INDEX "payment_allocations_reversalOfAllocationId_idx" ON "payment_allocations"("reversalOfAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_schoolId_id_key" ON "payment_allocations"("schoolId", "id");

-- CreateIndex
CREATE INDEX "assessed_fines_schoolId_idx" ON "assessed_fines"("schoolId");

-- CreateIndex
CREATE INDEX "assessed_fines_invoiceId_idx" ON "assessed_fines"("invoiceId");

-- CreateIndex
CREATE INDEX "assessed_fines_status_idx" ON "assessed_fines"("status");

-- CreateIndex
CREATE INDEX "assessed_fines_fineRuleId_idx" ON "assessed_fines"("fineRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "assessed_fines_schoolId_id_key" ON "assessed_fines"("schoolId", "id");

-- CreateIndex
CREATE INDEX "fine_waivers_schoolId_idx" ON "fine_waivers"("schoolId");

-- CreateIndex
CREATE INDEX "fine_waivers_invoiceId_idx" ON "fine_waivers"("invoiceId");

-- CreateIndex
CREATE INDEX "fine_waivers_assessedFineId_idx" ON "fine_waivers"("assessedFineId");

-- CreateIndex
CREATE UNIQUE INDEX "fine_waivers_schoolId_id_key" ON "fine_waivers"("schoolId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_paymentId_key" ON "receipts"("paymentId");

-- CreateIndex
CREATE INDEX "receipts_schoolId_idx" ON "receipts"("schoolId");

-- CreateIndex
CREATE INDEX "receipts_academicYearId_idx" ON "receipts"("academicYearId");

-- CreateIndex
CREATE INDEX "receipts_issuedDate_idx" ON "receipts"("issuedDate");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_schoolId_paymentId_key" ON "receipts"("schoolId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_schoolId_receiptNumber_key" ON "receipts"("schoolId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_schoolId_academicYearId_receiptSequence_key" ON "receipts"("schoolId", "academicYearId", "receiptSequence");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_schoolId_id_key" ON "receipts"("schoolId", "id");

-- CreateIndex
CREATE INDEX "payment_refunds_schoolId_idx" ON "payment_refunds"("schoolId");

-- CreateIndex
CREATE INDEX "payment_refunds_paymentId_idx" ON "payment_refunds"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_schoolId_id_key" ON "payment_refunds"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "receipt_sequence_counters" ADD CONSTRAINT "receipt_sequence_counters_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequence_counters" ADD CONSTRAINT "receipt_sequence_counters_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_paymentId_fkey" FOREIGN KEY ("schoolId", "paymentId") REFERENCES "payments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_invoiceId_fkey" FOREIGN KEY ("schoolId", "invoiceId") REFERENCES "fee_invoices"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_invoiceItemId_fkey" FOREIGN KEY ("schoolId", "invoiceItemId") REFERENCES "invoice_items"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_assessedFineId_fkey" FOREIGN KEY ("schoolId", "assessedFineId") REFERENCES "assessed_fines"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_reversalOfAllocationId_fkey" FOREIGN KEY ("schoolId", "reversalOfAllocationId") REFERENCES "payment_allocations"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessed_fines" ADD CONSTRAINT "assessed_fines_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessed_fines" ADD CONSTRAINT "assessed_fines_schoolId_invoiceId_fkey" FOREIGN KEY ("schoolId", "invoiceId") REFERENCES "fee_invoices"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessed_fines" ADD CONSTRAINT "assessed_fines_schoolId_fineRuleId_fkey" FOREIGN KEY ("schoolId", "fineRuleId") REFERENCES "fine_rules"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waivers" ADD CONSTRAINT "fine_waivers_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waivers" ADD CONSTRAINT "fine_waivers_schoolId_invoiceId_fkey" FOREIGN KEY ("schoolId", "invoiceId") REFERENCES "fee_invoices"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waivers" ADD CONSTRAINT "fine_waivers_schoolId_assessedFineId_fkey" FOREIGN KEY ("schoolId", "assessedFineId") REFERENCES "assessed_fines"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waivers" ADD CONSTRAINT "fine_waivers_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_schoolId_paymentId_fkey" FOREIGN KEY ("schoolId", "paymentId") REFERENCES "payments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_schoolId_paymentId_fkey" FOREIGN KEY ("schoolId", "paymentId") REFERENCES "payments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
