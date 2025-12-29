/*
  Warnings:

  - Changed the type of `code` on the `Department` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DepartmentCode" AS ENUM ('COE', 'CCS', 'CSM', 'CED', 'CASS', 'CEBA', 'CHS');

-- AlterTable
ALTER TABLE "CounselorProfile" ADD COLUMN     "bio" TEXT;

-- AlterTable
ALTER TABLE "Department" DROP COLUMN "code",
ADD COLUMN     "code" "DepartmentCode" NOT NULL;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "bio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");
