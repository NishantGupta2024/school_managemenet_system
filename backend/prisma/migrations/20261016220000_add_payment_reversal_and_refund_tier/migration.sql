-- CreateEnum
CREATE TYPE "ReversalType" AS ENUM ('VOID', 'BOUNCE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "payment_allocations" ADD COLUMN     "paymentReversalId" TEXT;

-- AlterTable
ALTER TABLE "payment_refunds" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "status" "RefundStatus" NOT NULL DEFAULT 'SUCCEEDED';

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "reversalNumber" TEXT NOT NULL,
    "reversalType" "ReversalType" NOT NULL DEFAULT 'VOID',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedByUserId" TEXT,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reversals_schoolId_idx" ON "payment_reversals"("schoolId");

-- CreateIndex
CREATE INDEX "payment_reversals_paymentId_idx" ON "payment_reversals"("paymentId");

-- CreateIndex
CREATE INDEX "payment_reversals_reversalType_idx" ON "payment_reversals"("reversalType");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_schoolId_id_key" ON "payment_reversals"("schoolId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_schoolId_reversalNumber_key" ON "payment_reversals"("schoolId", "reversalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_schoolId_idempotencyKey_key" ON "payment_reversals"("schoolId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentReversalId_idx" ON "payment_allocations"("paymentReversalId");

-- CreateIndex
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_schoolId_idempotencyKey_key" ON "payment_refunds"("schoolId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_schoolId_paymentReversalId_fkey" FOREIGN KEY ("schoolId", "paymentReversalId") REFERENCES "payment_reversals"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_schoolId_paymentId_fkey" FOREIGN KEY ("schoolId", "paymentId") REFERENCES "payments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
