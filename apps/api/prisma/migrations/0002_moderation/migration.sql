-- AlterTable
ALTER TABLE "WaitTimeReport" ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'none';

-- CreateIndex
CREATE INDEX "WaitTimeReport_moderationStatus_idx" ON "WaitTimeReport"("moderationStatus");
