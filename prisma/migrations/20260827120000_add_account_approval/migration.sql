CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" UUID;

-- Existing accounts predate the approval workflow and must keep their access.
UPDATE "User"
SET "accountStatus" = 'APPROVED', "reviewedAt" = CURRENT_TIMESTAMP;

CREATE INDEX "User_accountStatus_createdAt_idx"
ON "User"("accountStatus", "createdAt");
