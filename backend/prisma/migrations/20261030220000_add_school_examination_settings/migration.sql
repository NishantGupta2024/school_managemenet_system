BEGIN;

-- CreateTable
CREATE TABLE "school_examination_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "showStudentNamesOnLeaderboards" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_examination_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_examination_settings_schoolId_key" ON "school_examination_settings"("schoolId");

-- AddForeignKey
ALTER TABLE "school_examination_settings" ADD CONSTRAINT "school_examination_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
