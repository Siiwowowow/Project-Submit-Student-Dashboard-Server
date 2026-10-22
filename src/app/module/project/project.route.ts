import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../middleware/checkAuth.js";
import { submissionRateLimit } from "../../middleware/rateLimit.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ProjectController } from "./project.controller.js";
import { createProjectSchema, reviewProjectSchema, projectMarksSchema, updateFeedbackSchema } from "./project.validation.js";

const router = Router();
const reviewers = [Role.MENTOR, Role.ADMIN, Role.SUPER_ADMIN];
// USER is supported for student accounts created by the existing backend.
const students = [Role.STUDENT, Role.USER];

router.post("/", checkAuth(...students), submissionRateLimit,
  validateRequest(createProjectSchema), ProjectController.createProject);
router.get("/", checkAuth(...reviewers), ProjectController.getProjects);
// Keep static paths before /:id so Express does not treat "stats" or "mine" as an ID.
router.get("/mine/stats", checkAuth(...students), ProjectController.getStatistics);
router.get("/mine", checkAuth(...students), ProjectController.getMyProjects);
router.get("/stats", checkAuth(...reviewers), ProjectController.getStatistics);
router.get("/:id", checkAuth(...students, ...reviewers), ProjectController.getProject);
router.patch("/:id/review", checkAuth(...reviewers),
  validateRequest(reviewProjectSchema), ProjectController.reviewProject);

router.patch("/:id/marks", checkAuth(...reviewers),
  validateRequest(projectMarksSchema), ProjectController.markProject);

router.patch("/:id/feedback", checkAuth(...reviewers),
  validateRequest(updateFeedbackSchema), ProjectController.updateFeedback);

export const ProjectRoutes = router;
