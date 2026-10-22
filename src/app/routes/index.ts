import { Router } from "express";
import { AuthRouters } from "../module/auth/auth.route.js";
import { ProjectRoutes } from "../module/project/project.route.js";
import { UserRoutes } from "../module/management/user.route.js";

const router = Router();
router.use("/auth", AuthRouters);
router.use("/projects", ProjectRoutes);
router.use("/users", UserRoutes);

export const IndexRoutes = router;
