import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errorHelpers/AppError.js";
import type { UpdateUserInput, UserListQuery } from "./user.validation.js";

const publicFields = { id: true, name: true, email: true, role: true, status: true, createdAt: true } as const;

async function protectLastAdmin(transaction: Prisma.TransactionClient, id: string) {
  const remaining = await transaction.user.count({ where: {
    id: { not: id }, role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE", isDeleted: false,
  } });
  if (!remaining) throw new AppError(400, "At least one active administrator must remain.");
}

const getUsers = async ({ page, limit, search }: UserListQuery) => {
  const where: Prisma.UserWhereInput = {
    isDeleted: false,
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: publicFields, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    prisma.user.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const updateUser = async (id: string, adminId: string, input: UpdateUserInput) => {
  const { password, ...details } = input;
  const passwordHash = password ? await hashPassword(password) : undefined;
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({ where: { id } });
    if (!current || current.isDeleted) throw new AppError(404, "User not found.");
    if (id === adminId && (input.role !== current.role || input.status !== "ACTIVE")) {
      throw new AppError(400, "You cannot change your own role or block your own account.");
    }
    if (["ADMIN", "SUPER_ADMIN"].includes(current.role) && (input.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(input.role))) {
      await protectLastAdmin(transaction, id);
    }
    const user = await transaction.user.update({ where: { id }, data: details, select: publicFields });
    // Keep the older admin profile table consistent when a profile exists.
    await transaction.admin.updateMany({ where: { userId: id }, data: { name: details.name, email: details.email } });
    if (passwordHash) {
      const account = await transaction.account.findFirst({ where: { userId: id, providerId: "credential" } });
      if (account) await transaction.account.update({ where: { id: account.id }, data: { password: passwordHash } });
      else await transaction.account.create({ data: { id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: passwordHash } });
      await transaction.session.deleteMany({ where: { userId: id } });
    }
    return user;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

const deleteUser = async (id: string, adminId: string) => {
  if (id === adminId) throw new AppError(400, "You cannot delete your own account.");
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({ where: { id } });
    if (!current || current.isDeleted) throw new AppError(404, "User not found.");
    if (["ADMIN", "SUPER_ADMIN"].includes(current.role)) await protectLastAdmin(transaction, id);
    await transaction.user.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), status: "BLOCKED" } });
    await transaction.admin.updateMany({ where: { userId: id }, data: { isDeleted: true, deletedAt: new Date() } });
    await transaction.session.deleteMany({ where: { userId: id } });
    return { id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

export const UserService = { getUsers, updateUser, deleteUser };
