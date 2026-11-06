-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "moderationReason" TEXT,
ADD COLUMN     "sessionsValidAfter" TIMESTAMP(3),
ADD COLUMN     "suspendedUntil" TIMESTAMP(3);
