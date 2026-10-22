import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { envVars } from "../../config/env.js";
import AppError from "../../errorHelpers/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { ILoginUserPayload, IRegisterUserPayload } from "./auth.interface.js";

// Explicitly select public fields so password hashes never reach the client.
export const publicUserFields = {
  id: true, name: true, email: true, role: true, createdAt: true,
} as const;

const createAccessToken = (user: { id: string; role: Role }) => {
  return jwt.sign({ role: user.role }, envVars.ACCESS_TOKEN_SECRET, {
    subject: user.id,
    algorithm: "HS256",
    issuer: "project-review-api",
    audience: "project-review-client",
    expiresIn: envVars.ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
  });
};

const registerUser = async (payload: IRegisterUserPayload) => {
  const existingUser = await prisma.user.findUnique({ where: { email: payload.email } });
  if (existingUser) throw new AppError(409, "An account with this email already exists.");

  // Preserve the existing User/Account structure and password format.
  const password = await hashPassword(payload.password);
  const userId = randomUUID();
  const user = await prisma.user.create({
    data: {
      id: userId, name: payload.name, email: payload.email,
      role: Role.STUDENT, status: "ACTIVE",
      accounts: {
        create: { id: randomUUID(), accountId: userId, providerId: "credential", password },
      },
    },
    select: publicUserFields,
  });
  return { user, accessToken: createAccessToken(user) };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
    include: { accounts: { where: { providerId: "credential" }, take: 1 } },
  });
  const password = user?.accounts[0]?.password;
  const passwordMatches = password
    ? await verifyPassword({ hash: password, password: payload.password })
    : false;

  if (!user || !passwordMatches) throw new AppError(401, "Invalid email or password.");
  if (user.isDeleted || user.status !== "ACTIVE") throw new AppError(403, "This account is not active.");

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
    accessToken: createAccessToken(user),
  };
};

const getMe = (userId: string) => prisma.user.findUnique({
  where: { id: userId }, select: publicUserFields,
});

export const AuthService = { registerUser, loginUser, getMe };
