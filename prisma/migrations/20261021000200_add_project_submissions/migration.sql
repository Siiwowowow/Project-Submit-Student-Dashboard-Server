-- Separate migration: PostgreSQL must commit new enum values before using them.
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'STUDENT';

CREATE TYPE "ProjectStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "liveLink" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PENDING',
    "reviewComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "studentId" TEXT NOT NULL,
    "reviewedById" TEXT,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_review_state_check" CHECK (
      ("status" = 'PENDING' AND "reviewedAt" IS NULL AND "reviewedById" IS NULL)
      OR ("status" <> 'PENDING' AND "reviewedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "projects_repoUrl_key" ON "projects"("repoUrl");
CREATE INDEX "projects_status_createdAt_idx" ON "projects"("status", "createdAt");
CREATE INDEX "projects_studentId_createdAt_idx" ON "projects"("studentId", "createdAt");
ALTER TABLE "projects" ADD CONSTRAINT "projects_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
