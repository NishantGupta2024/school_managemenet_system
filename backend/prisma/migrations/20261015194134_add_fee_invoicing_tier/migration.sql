-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UPCOMING', 'DUE', 'OVERDUE', 'VOID');

-- AlterTable
ALTER TABLE "student_fee_allocations" ADD COLUMN     "startBillingMonth" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "admissionDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "billingMonth" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UPCOMING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "feeHeadNameSnapshot" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "billingFrequencySnapshot" "FeeFrequency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_generation_runs" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeId" TEXT,
    "executedByUserId" TEXT,
    "totalStudents" INTEGER NOT NULL,
    "totalInvoicesCreated" INTEGER NOT NULL,
    "totalInvoicesSkipped" INTEGER NOT NULL,
    "totalGrossAmount" DECIMAL(12,2) NOT NULL,
    "totalDiscountAmount" DECIMAL(12,2) NOT NULL,
    "totalNetAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_invoices_schoolId_idx" ON "fee_invoices"("schoolId");

-- CreateIndex
CREATE INDEX "fee_invoices_studentId_idx" ON "fee_invoices"("studentId");

-- CreateIndex
CREATE INDEX "fee_invoices_academicYearId_idx" ON "fee_invoices"("academicYearId");

-- CreateIndex
CREATE INDEX "fee_invoices_billingMonth_idx" ON "fee_invoices"("billingMonth");

-- CreateIndex
CREATE INDEX "fee_invoices_status_idx" ON "fee_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_schoolId_studentId_academicYearId_billingMonth_key" ON "fee_invoices"("schoolId", "studentId", "academicYearId", "billingMonth");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_schoolId_id_key" ON "fee_invoices"("schoolId", "id");

-- CreateIndex
CREATE INDEX "invoice_items_schoolId_idx" ON "invoice_items"("schoolId");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_items_feeHeadId_idx" ON "invoice_items"("feeHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_schoolId_id_key" ON "invoice_items"("schoolId", "id");

-- CreateIndex
CREATE INDEX "fee_generation_runs_schoolId_idx" ON "fee_generation_runs"("schoolId");

-- CreateIndex
CREATE INDEX "fee_generation_runs_academicYearId_idx" ON "fee_generation_runs"("academicYearId");

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_schoolId_invoiceId_fkey" FOREIGN KEY ("schoolId", "invoiceId") REFERENCES "fee_invoices"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_schoolId_feeHeadId_fkey" FOREIGN KEY ("schoolId", "feeHeadId") REFERENCES "fee_heads"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_generation_runs" ADD CONSTRAINT "fee_generation_runs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_generation_runs" ADD CONSTRAINT "fee_generation_runs_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_generation_runs" ADD CONSTRAINT "fee_generation_runs_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
