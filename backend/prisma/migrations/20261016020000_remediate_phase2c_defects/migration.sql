-- AlterTable
ALTER TABLE "students" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "parent_student_relations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'GUARDIAN',
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_student_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_one_time_fee_billings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "billedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_one_time_fee_billings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_student_relations_schoolId_idx" ON "parent_student_relations"("schoolId");

-- CreateIndex
CREATE INDEX "parent_student_relations_parentId_idx" ON "parent_student_relations"("parentId");

-- CreateIndex
CREATE INDEX "parent_student_relations_studentId_idx" ON "parent_student_relations"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_relations_schoolId_parentId_studentId_key" ON "parent_student_relations"("schoolId", "parentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_relations_schoolId_id_key" ON "parent_student_relations"("schoolId", "id");

-- CreateIndex
CREATE INDEX "student_one_time_fee_billings_schoolId_idx" ON "student_one_time_fee_billings"("schoolId");

-- CreateIndex
CREATE INDEX "student_one_time_fee_billings_studentId_idx" ON "student_one_time_fee_billings"("studentId");

-- CreateIndex
CREATE INDEX "student_one_time_fee_billings_feeHeadId_idx" ON "student_one_time_fee_billings"("feeHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "student_one_time_fee_billings_schoolId_studentId_feeHeadId_key" ON "student_one_time_fee_billings"("schoolId", "studentId", "feeHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "student_one_time_fee_billings_schoolId_id_key" ON "student_one_time_fee_billings"("schoolId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_relations" ADD CONSTRAINT "parent_student_relations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_relations" ADD CONSTRAINT "parent_student_relations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_relations" ADD CONSTRAINT "parent_student_relations_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_one_time_fee_billings" ADD CONSTRAINT "student_one_time_fee_billings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_one_time_fee_billings" ADD CONSTRAINT "student_one_time_fee_billings_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_one_time_fee_billings" ADD CONSTRAINT "student_one_time_fee_billings_schoolId_feeHeadId_fkey" FOREIGN KEY ("schoolId", "feeHeadId") REFERENCES "fee_heads"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_one_time_fee_billings" ADD CONSTRAINT "student_one_time_fee_billings_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
