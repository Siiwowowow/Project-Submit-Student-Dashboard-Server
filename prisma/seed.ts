import { seedSuperAdmin } from "../src/app/config/seed.js";
import { prisma } from "../src/app/lib/prisma.js";

try {
  await seedSuperAdmin();
} catch (error) {
  console.error("Admin seed failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
