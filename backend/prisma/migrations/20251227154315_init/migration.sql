/*
  Warnings:

  - Added the required column `sex` to the `StudentProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "sex" "Sex" NOT NULL;
