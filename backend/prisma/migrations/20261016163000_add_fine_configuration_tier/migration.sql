-- CreateEnum
CREATE TYPE "FineType" AS ENUM ('FIXED', 'PER_DAY', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "FineDayCountPolicy" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS');

-- CreateEnum
CREATE TYPE "FineRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "fine_rules" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fineType" "FineType" NOT NULL DEFAULT 'FIXED',
    "fineValue" DECIMAL(12,2) NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 5,
    "maxFineCap" DECIMAL(12,2),
    "dayCountPolicy" "FineDayCountPolicy" NOT NULL DEFAULT 'CALENDAR_DAYS',
    "applicableFeeHeadId" TEXT,
    "applicableCategory" "FeeHeadCategory",
    "effectiveStartDate" TIMESTAMP(3),
    "effectiveEndDate" TIMESTAMP(3),
    "status" "FineRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fine_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fine_rules_schoolId_idx" ON "fine_rules"("schoolId");

-- CreateIndex
CREATE INDEX "fine_rules_academicYearId_idx" ON "fine_rules"("academicYearId");

-- CreateIndex
CREATE INDEX "fine_rules_status_idx" ON "fine_rules"("status");

-- CreateIndex
CREATE INDEX "fine_rules_applicableFeeHeadId_idx" ON "fine_rules"("applicableFeeHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "fine_rules_schoolId_academicYearId_name_key" ON "fine_rules"("schoolId", "academicYearId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fine_rules_schoolId_id_key" ON "fine_rules"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "fine_rules" ADD CONSTRAINT "fine_rules_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_rules" ADD CONSTRAINT "fine_rules_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_rules" ADD CONSTRAINT "fine_rules_schoolId_applicableFeeHeadId_fkey" FOREIGN KEY ("schoolId", "applicableFeeHeadId") REFERENCES "fee_heads"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_rules" ADD CONSTRAINT "fine_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_rules" ADD CONSTRAINT "fine_rules_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
