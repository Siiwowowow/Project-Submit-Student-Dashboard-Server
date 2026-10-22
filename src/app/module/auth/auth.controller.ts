import { catchAsync } from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AuthService } from "./auth.service.js";

const registerUser = catchAsync(async (req, res) => {
  const result = await AuthService.registerUser(req.body);
  sendResponse(res, { httpCode: 201, success: true, message: "Student account created successfully.", data: result });
});

const loginUser = catchAsync(async (req, res) => {
  const result = await AuthService.loginUser(req.body);
  sendResponse(res, { httpCode: 200, success: true, message: "Login successful.", data: result });
});

const getMe = catchAsync(async (req, res) => {
  const user = await AuthService.getMe(req.user.userId);
  sendResponse(res, { httpCode: 200, success: true, message: "Profile retrieved successfully.", data: user });
});

export const AuthController = { registerUser, loginUser, getMe };
