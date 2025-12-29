-- CreateEnum
CREATE TYPE "MoodType" AS ENUM ('VERY_HAPPY', 'HAPPY', 'NEUTRAL', 'SAD', 'VERY_SAD', 'ANXIOUS', 'STRESSED', 'CALM', 'ENERGETIC', 'TIRED', 'ANGRY', 'CONTENT');

-- CreateEnum
CREATE TYPE "MenstrualFlowType" AS ENUM ('SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY');

-- CreateEnum
CREATE TYPE "CyclePhase" AS ENUM ('MENSTRUATION', 'FOLLICULAR', 'OVULATION', 'LUTEAL');

-- CreateEnum
CREATE TYPE "SymptomSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateTable
CREATE TABLE "MoodEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moods" "MoodType"[],
    "intensity" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT,
    "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenstrualCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "cycleLength" INTEGER,
    "periodLength" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenstrualCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenstrualDailyLog" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayOfCycle" INTEGER NOT NULL,
    "flowType" "MenstrualFlowType",
    "phase" "CyclePhase",
    "temperature" DOUBLE PRECISION,
    "cervicalMucus" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenstrualDailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenstrualSymptom" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "symptom" TEXT NOT NULL,
    "severity" "SymptomSeverity" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenstrualSymptom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoodEntry_userId_date_idx" ON "MoodEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "MoodEntry_userId_idx" ON "MoodEntry"("userId");

-- CreateIndex
CREATE INDEX "MenstrualCycle_userId_startDate_idx" ON "MenstrualCycle"("userId", "startDate");

-- CreateIndex
CREATE INDEX "MenstrualCycle_userId_isActive_idx" ON "MenstrualCycle"("userId", "isActive");

-- CreateIndex
CREATE INDEX "MenstrualDailyLog_cycleId_date_idx" ON "MenstrualDailyLog"("cycleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MenstrualDailyLog_cycleId_date_key" ON "MenstrualDailyLog"("cycleId", "date");

-- CreateIndex
CREATE INDEX "MenstrualSymptom_cycleId_date_idx" ON "MenstrualSymptom"("cycleId", "date");

-- CreateIndex
CREATE INDEX "MenstrualSymptom_cycleId_idx" ON "MenstrualSymptom"("cycleId");

-- AddForeignKey
ALTER TABLE "MoodEntry" ADD CONSTRAINT "MoodEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenstrualCycle" ADD CONSTRAINT "MenstrualCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenstrualDailyLog" ADD CONSTRAINT "MenstrualDailyLog_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MenstrualCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenstrualSymptom" ADD CONSTRAINT "MenstrualSymptom_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MenstrualCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
