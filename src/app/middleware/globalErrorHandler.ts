import { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import AppError from "../errorHelpers/AppError.js";
import { envVars } from "../config/env.js";

export const globalErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  let statusCode = 500;
  let message = "Something went wrong. Please try again later.";
  let errorSources: { path: string; message: string }[] = [];

  if (error instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed.";
    errorSources = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  } else if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // A database constraint also catches simultaneous duplicate requests.
    if (error.code === "P2002") {
      statusCode = 409;
      message = "This email or repository has already been registered.";
    } else if (error.code === "P2025") {
      statusCode = 404;
      message = "The requested record was not found.";
    }
  } else if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") {
      statusCode = 400;
      message = "Request body must contain valid JSON.";
    } else if (error.type === "entity.too.large") {
      statusCode = 413;
      message = "Request body is too large.";
    }
  }

  if (envVars.NODE_ENV === "development") {
    console.error(`[Error ${statusCode}] ${message}`);
    if (errorSources.length) console.error("Validation details:", errorSources);
  }
  if (statusCode === 500) console.error(error);
  res.status(statusCode).json({
    success: false, message, errorSources,
    ...(envVars.NODE_ENV === "development" && error instanceof Error ? { stack: error.stack } : {}),
  });
};
