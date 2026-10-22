import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { authRateLimit } from "../../middleware/rateLimit.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AuthController } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validation.js";

const router = Router();
router.post("/register", authRateLimit, validateRequest(registerSchema), AuthController.registerUser);
router.post("/login", authRateLimit, validateRequest(loginSchema), AuthController.loginUser);
router.get("/me", checkAuth(), AuthController.getMe);

export const AuthRouters = router;
