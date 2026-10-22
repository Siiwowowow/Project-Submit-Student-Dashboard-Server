import { rateLimit } from "express-rate-limit";

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts. Try again after 15 minutes." },
});

// Applied after authentication: a student cannot reset the limit by changing IP.
export const submissionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user.userId,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Submission limit reached. Try again after 15 minutes." },
});
