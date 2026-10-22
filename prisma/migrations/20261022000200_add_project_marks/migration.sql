ALTER TABLE "projects" ADD COLUMN "score" INTEGER;
ALTER TABLE "projects" ADD CONSTRAINT "projects_score_range" CHECK ("score" BETWEEN 0 AND 100);
