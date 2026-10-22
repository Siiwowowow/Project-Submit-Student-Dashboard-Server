import { Router } from "express";
import { AuthRouters } from "../module/auth/auth.route.js";
import { ProjectRoutes } from "../module/project/project.route.js";

const router = Router();
router.use("/auth", AuthRouters);
router.use("/projects", ProjectRoutes);

export const IndexRoutes = router;
