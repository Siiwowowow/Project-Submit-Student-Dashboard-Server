import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const seedSuperAdmin = async () => {
  const email = z.string().trim().toLowerCase().email().parse(
    process.env.ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL,
  );
  const password = z.string().min(8).max(128).parse(
    process.env.ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD,
  );
  const existing = await prisma.user.findUnique({ where: { email } });

  // Never promote an existing student or reset a password silently.
  if (existing) {
    if (existing.role !== Role.ADMIN && existing.role !== Role.SUPER_ADMIN) {
      throw new Error("Admin email belongs to another account. Choose a different ADMIN_EMAIL.");
    }
    console.log("Admin already exists. No changes made.");
    return;
  }

  const userId = randomUUID();
  const hashedPassword = await hashPassword(password);
  await prisma.user.create({
    data: {
      id: userId, name: "Review Admin", email, role: Role.ADMIN, status: "ACTIVE",
      emailVerified: true,
      accounts: { create: {
        id: randomUUID(), accountId: userId, providerId: "credential", password: hashedPassword,
      } },
      admin: { create: { name: "Review Admin", email } },
    },
  });
  console.log("Review admin created successfully.");
};
