ALTER TABLE "projects" ADD COLUMN "scoreOutOf" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "projects" DROP CONSTRAINT "projects_score_range";
ALTER TABLE "projects" ADD CONSTRAINT "projects_score_total_range" CHECK ("scoreOutOf" BETWEEN 1 AND 10000);
ALTER TABLE "projects" ADD CONSTRAINT "projects_score_range" CHECK ("score" >= 0 AND "score" <= "scoreOutOf");
