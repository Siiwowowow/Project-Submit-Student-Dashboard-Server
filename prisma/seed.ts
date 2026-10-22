import { seedWorkspaceAccounts } from "../src/app/config/seed.js";
import { prisma } from "../src/app/lib/prisma.js";

try {
  await seedWorkspaceAccounts();
} catch (error) {
  console.error("Workspace account seed failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
