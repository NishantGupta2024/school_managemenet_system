-- CreateEnum
CREATE TYPE "BookCopyCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "BookCopyStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'RESERVED', 'MAINTENANCE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'RETURNED', 'OVERDUE', 'LOST');

-- CreateEnum
CREATE TYPE "BorrowerType" AS ENUM ('STUDENT', 'TEACHER', 'STAFF');

-- CreateEnum
CREATE TYPE "LibraryFineStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "LibraryFineReason" AS ENUM ('OVERDUE', 'DAMAGED_ITEM', 'LOST_ITEM');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'LIBRARIAN';

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isbn" TEXT,
    "publisher" TEXT,
    "category" TEXT NOT NULL,
    "edition" TEXT,
    "publicationYear" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'English',
    "description" TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 0,
    "availableCopies" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copies" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "barcode" TEXT,
    "rackLocation" TEXT,
    "shelfLocation" TEXT,
    "condition" "BookCopyCondition" NOT NULL DEFAULT 'GOOD',
    "status" "BookCopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquiredDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "purchasePrice" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_loans" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "borrowerType" "BorrowerType" NOT NULL DEFAULT 'STUDENT',
    "studentId" TEXT,
    "teacherId" TEXT,
    "issuedByUserId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "returnedByUserId" TEXT,
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fines" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerType" "BorrowerType" NOT NULL DEFAULT 'STUDENT',
    "studentId" TEXT,
    "teacherId" TEXT,
    "reason" "LibraryFineReason" NOT NULL DEFAULT 'OVERDUE',
    "overdueDays" INTEGER NOT NULL DEFAULT 0,
    "fineAmount" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "waivedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "LibraryFineStatus" NOT NULL DEFAULT 'PENDING',
    "waiveReason" TEXT,
    "waivedByUserId" TEXT,
    "collectedByUserId" TEXT,
    "paymentReference" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_fines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "maxBooksStudent" INTEGER NOT NULL DEFAULT 3,
    "maxBooksTeacher" INTEGER NOT NULL DEFAULT 10,
    "loanDurationDaysStudent" INTEGER NOT NULL DEFAULT 14,
    "loanDurationDaysTeacher" INTEGER NOT NULL DEFAULT 30,
    "maxRenewals" INTEGER NOT NULL DEFAULT 2,
    "finePerDay" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 2,
    "allowRenewWithOverdue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "books_schoolId_title_idx" ON "books"("schoolId", "title");

-- CreateIndex
CREATE INDEX "books_schoolId_author_idx" ON "books"("schoolId", "author");

-- CreateIndex
CREATE INDEX "books_schoolId_isbn_idx" ON "books"("schoolId", "isbn");

-- CreateIndex
CREATE INDEX "books_schoolId_category_idx" ON "books"("schoolId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "books_schoolId_id_key" ON "books"("schoolId", "id");

-- CreateIndex
CREATE INDEX "book_copies_schoolId_bookId_idx" ON "book_copies"("schoolId", "bookId");

-- CreateIndex
CREATE INDEX "book_copies_schoolId_status_idx" ON "book_copies"("schoolId", "status");

-- CreateIndex
CREATE INDEX "book_copies_schoolId_barcode_idx" ON "book_copies"("schoolId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_schoolId_accessionNumber_key" ON "book_copies"("schoolId", "accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_schoolId_id_key" ON "book_copies"("schoolId", "id");

-- CreateIndex
CREATE INDEX "book_loans_schoolId_copyId_idx" ON "book_loans"("schoolId", "copyId");

-- CreateIndex
CREATE INDEX "book_loans_schoolId_studentId_status_idx" ON "book_loans"("schoolId", "studentId", "status");

-- CreateIndex
CREATE INDEX "book_loans_schoolId_teacherId_status_idx" ON "book_loans"("schoolId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "book_loans_schoolId_dueDate_status_idx" ON "book_loans"("schoolId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "book_loans_schoolId_id_key" ON "book_loans"("schoolId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_loanId_key" ON "library_fines"("loanId");

-- CreateIndex
CREATE INDEX "library_fines_schoolId_status_idx" ON "library_fines"("schoolId", "status");

-- CreateIndex
CREATE INDEX "library_fines_schoolId_studentId_idx" ON "library_fines"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "library_fines_schoolId_teacherId_idx" ON "library_fines"("schoolId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_schoolId_id_key" ON "library_fines"("schoolId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_schoolId_loanId_key" ON "library_fines"("schoolId", "loanId");

-- CreateIndex
CREATE UNIQUE INDEX "library_settings_schoolId_key" ON "library_settings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "library_settings_schoolId_id_key" ON "library_settings"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_schoolId_bookId_fkey" FOREIGN KEY ("schoolId", "bookId") REFERENCES "books"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_schoolId_copyId_fkey" FOREIGN KEY ("schoolId", "copyId") REFERENCES "book_copies"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_schoolId_teacherId_fkey" FOREIGN KEY ("schoolId", "teacherId") REFERENCES "teachers"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_schoolId_loanId_fkey" FOREIGN KEY ("schoolId", "loanId") REFERENCES "book_loans"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_schoolId_teacherId_fkey" FOREIGN KEY ("schoolId", "teacherId") REFERENCES "teachers"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_waivedByUserId_fkey" FOREIGN KEY ("waivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_settings" ADD CONSTRAINT "library_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
