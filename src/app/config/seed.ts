import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

async function seedAccount(emailValue: string | undefined, passwordValue: string | undefined, role: "ADMIN" | "MENTOR", name: string) {
  const email = z.string().trim().toLowerCase().email().parse(emailValue);
  const password = z.string().min(8).max(128).parse(passwordValue);
  const existing = await prisma.user.findUnique({ where: { email } });
  // A seed must not promote another account or reset an existing password.
  if (existing) {
    if (existing.role !== role && !(role === "ADMIN" && existing.role === Role.SUPER_ADMIN)) {
      throw new Error(`${role} seed email belongs to another account. Choose a different seed email.`);
    }
    console.log(`${role} already exists. No changes made.`);
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: {
    id: userId, name, email, role, status: "ACTIVE", emailVerified: true,
    accounts: { create: { id: randomUUID(), accountId: userId, providerId: "credential", password: passwordHash } },
    ...(role === "ADMIN" ? { admin: { create: { name, email } } } : {}),
  } });
  console.log(`${role} account created successfully.`);
}

export const seedSuperAdmin = () => seedAccount(
  process.env.ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL,
  process.env.ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD,
  "ADMIN", "Review Admin",
);

export const seedMentor = () => seedAccount(
  process.env.MENTOR_EMAIL, process.env.MENTOR_PASSWORD,
  "MENTOR", process.env.MENTOR_NAME || "Review Mentor",
);

export const seedWorkspaceAccounts = async () => {
  if (process.env.ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD) await seedSuperAdmin();
  if (process.env.MENTOR_EMAIL || process.env.MENTOR_PASSWORD) await seedMentor();
};
