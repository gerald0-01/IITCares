/*
  Warnings:

  - Added the required column `sex` to the `CounselorProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CounselorProfile" ADD COLUMN     "name" TEXT,
ADD COLUMN     "sex" "Sex" NOT NULL;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "name" TEXT;
