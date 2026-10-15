-- CreateEnum
CREATE TYPE "FeeHeadCategory" AS ENUM ('ACADEMIC', 'FACILITY', 'INSTITUTIONAL', 'ACTIVITY', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "FeeHeadStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('MONTHLY', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "FeeStructureStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConcessionType" AS ENUM ('NONE', 'PERCENTAGE', 'FLAT_DISCOUNT');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" "FeeHeadCategory" NOT NULL DEFAULT 'ACADEMIC',
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "status" "FeeHeadStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FeeStructureStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_items" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_allocations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "concessionType" "ConcessionType" NOT NULL DEFAULT 'NONE',
    "concessionValue" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "concessionReason" TEXT,
    "authorizedByUserId" TEXT,
    "optedFeeHeadIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_fee_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_heads_schoolId_idx" ON "fee_heads"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_schoolId_code_key" ON "fee_heads"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_schoolId_id_key" ON "fee_heads"("schoolId", "id");

-- CreateIndex
CREATE INDEX "fee_structures_schoolId_idx" ON "fee_structures"("schoolId");

-- CreateIndex
CREATE INDEX "fee_structures_gradeId_idx" ON "fee_structures"("gradeId");

-- CreateIndex
CREATE INDEX "fee_structures_academicYearId_idx" ON "fee_structures"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_schoolId_academicYearId_gradeId_name_key" ON "fee_structures"("schoolId", "academicYearId", "gradeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_schoolId_id_key" ON "fee_structures"("schoolId", "id");

-- CreateIndex
CREATE INDEX "fee_structure_items_schoolId_idx" ON "fee_structure_items"("schoolId");

-- CreateIndex
CREATE INDEX "fee_structure_items_feeStructureId_idx" ON "fee_structure_items"("feeStructureId");

-- CreateIndex
CREATE INDEX "fee_structure_items_feeHeadId_idx" ON "fee_structure_items"("feeHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_items_schoolId_feeStructureId_feeHeadId_key" ON "fee_structure_items"("schoolId", "feeStructureId", "feeHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_items_schoolId_id_key" ON "fee_structure_items"("schoolId", "id");

-- CreateIndex
CREATE INDEX "student_fee_allocations_schoolId_idx" ON "student_fee_allocations"("schoolId");

-- CreateIndex
CREATE INDEX "student_fee_allocations_studentId_idx" ON "student_fee_allocations"("studentId");

-- CreateIndex
CREATE INDEX "student_fee_allocations_feeStructureId_idx" ON "student_fee_allocations"("feeStructureId");

-- CreateIndex
CREATE INDEX "student_fee_allocations_academicYearId_idx" ON "student_fee_allocations"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_allocations_schoolId_studentId_academicYearId_key" ON "student_fee_allocations"("schoolId", "studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_allocations_schoolId_id_key" ON "student_fee_allocations"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_schoolId_gradeId_fkey" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grade_classes"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_schoolId_feeStructureId_fkey" FOREIGN KEY ("schoolId", "feeStructureId") REFERENCES "fee_structures"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_schoolId_feeHeadId_fkey" FOREIGN KEY ("schoolId", "feeHeadId") REFERENCES "fee_heads"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_allocations" ADD CONSTRAINT "student_fee_allocations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_allocations" ADD CONSTRAINT "student_fee_allocations_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_allocations" ADD CONSTRAINT "student_fee_allocations_schoolId_feeStructureId_fkey" FOREIGN KEY ("schoolId", "feeStructureId") REFERENCES "fee_structures"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_allocations" ADD CONSTRAINT "student_fee_allocations_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_allocations" ADD CONSTRAINT "student_fee_allocations_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
