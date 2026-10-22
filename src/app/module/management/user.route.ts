import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { catchAsync } from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { projectIdSchema } from "../project/project.validation.js";
import { userListSchema, updateUserSchema } from "./user.validation.js";
import { UserService } from "./user.service.js";

const router = Router();
router.use(checkAuth(Role.ADMIN, Role.SUPER_ADMIN));

router.get("/", catchAsync(async (req, res) => {
  const data = await UserService.getUsers(userListSchema.parse(req.query));
  sendResponse(res, { httpCode: 200, success: true, message: "Users retrieved.", data });
}));

router.patch("/:id", validateRequest(updateUserSchema), catchAsync(async (req, res) => {
  const data = await UserService.updateUser(projectIdSchema.parse(req.params.id), req.user.userId, req.body);
  sendResponse(res, { httpCode: 200, success: true, message: "User updated.", data });
}));

router.delete("/:id", catchAsync(async (req, res) => {
  const data = await UserService.deleteUser(projectIdSchema.parse(req.params.id), req.user.userId);
  sendResponse(res, { httpCode: 200, success: true, message: "User deleted. Submission history has been kept.", data });
}));

export const UserRoutes = router;
