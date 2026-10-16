-- CreateTable
CREATE TABLE "reversal_sequence_counters" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'REV',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reversal_sequence_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reversal_sequence_counters_schoolId_idx" ON "reversal_sequence_counters"("schoolId");

-- CreateIndex
CREATE INDEX "reversal_sequence_counters_academicYearId_idx" ON "reversal_sequence_counters"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "reversal_sequence_counters_schoolId_academicYearId_key" ON "reversal_sequence_counters"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "reversal_sequence_counters_schoolId_id_key" ON "reversal_sequence_counters"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "reversal_sequence_counters" ADD CONSTRAINT "reversal_sequence_counters_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reversal_sequence_counters" ADD CONSTRAINT "reversal_sequence_counters_schoolId_academicYearId_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
