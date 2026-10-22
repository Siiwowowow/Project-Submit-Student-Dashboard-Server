import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import jwt, { JwtPayload } from "jsonwebtoken";
import { envVars } from "../config/env.js";
import AppError from "../errorHelpers/AppError.js";
import { prisma } from "../lib/prisma.js";

export const checkAuth = (...allowedRoles: Role[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new AppError(401, "Please log in and provide a Bearer token.");
      }

      let payload: JwtPayload;
      try {
        const decoded = jwt.verify(authorization.slice(7), envVars.ACCESS_TOKEN_SECRET, {
          algorithms: ["HS256"],
          issuer: "project-review-api",
          audience: "project-review-client",
        });
        if (typeof decoded === "string" || typeof decoded.sub !== "string") {
          throw new Error("Invalid token payload");
        }
        payload = decoded;
      } catch {
        throw new AppError(401, "Your token is invalid or expired. Please log in again.");
      }

      // Check the database so blocked accounts and role changes apply immediately.
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.isDeleted || user.status !== "ACTIVE") {
        throw new AppError(401, "This account is not active.");
      }
      if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        throw new AppError(403, "You do not have permission to perform this action.");
      }

      req.user = {
        userId: user.id, role: user.role, email: user.email,
        isDeleted: user.isDeleted, status: user.status,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
};
