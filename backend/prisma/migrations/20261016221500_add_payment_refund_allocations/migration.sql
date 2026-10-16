-- AlterTable
ALTER TABLE "payment_refunds" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processedByUserId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "payment_refund_allocations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentRefundId" TEXT NOT NULL,
    "originalAllocationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refund_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_refund_allocations_schoolId_idx" ON "payment_refund_allocations"("schoolId");

-- CreateIndex
CREATE INDEX "payment_refund_allocations_paymentRefundId_idx" ON "payment_refund_allocations"("paymentRefundId");

-- CreateIndex
CREATE INDEX "payment_refund_allocations_originalAllocationId_idx" ON "payment_refund_allocations"("originalAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refund_allocations_schoolId_id_key" ON "payment_refund_allocations"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refund_allocations" ADD CONSTRAINT "payment_refund_allocations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refund_allocations" ADD CONSTRAINT "payment_refund_allocations_schoolId_paymentRefundId_fkey" FOREIGN KEY ("schoolId", "paymentRefundId") REFERENCES "payment_refunds"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refund_allocations" ADD CONSTRAINT "payment_refund_allocations_schoolId_originalAllocationId_fkey" FOREIGN KEY ("schoolId", "originalAllocationId") REFERENCES "payment_allocations"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
