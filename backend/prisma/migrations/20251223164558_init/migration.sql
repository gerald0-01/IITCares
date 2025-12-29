/*
  Warnings:

  - You are about to drop the column `role` on the `user` table. All the data in the column will be lost.
  - You are about to drop the `Info` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Profile` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `email` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Info" DROP CONSTRAINT "Info_userId_fkey";

-- DropForeignKey
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_userId_fkey";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "role",
ALTER COLUMN "email" SET NOT NULL;

-- DropTable
DROP TABLE "Info";

-- DropTable
DROP TABLE "Profile";

-- DropEnum
DROP TYPE "Collage";

-- DropEnum
DROP TYPE "Role";

-- DropEnum
DROP TYPE "Sex";
