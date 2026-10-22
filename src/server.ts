import { Server } from "node:http";
import app from "./app.js";
import { envVars } from "./app/config/env.js";
import { prisma } from "./app/lib/prisma.js";
import { seedSuperAdmin } from "./app/config/seed.js";

let server: Server | undefined;
let shuttingDown = false;

const shutdown = (exitCode: number) => {
  if (shuttingDown) return;
  shuttingDown = true;

  // Give active requests time to finish, but do not hang forever.
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  const disconnect = async () => {
    await prisma.$disconnect();
    clearTimeout(timeout);
    process.exit(exitCode);
  };
  if (server) server.close(() => { void disconnect(); });
  else void disconnect();
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  shutdown(1);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown(1);
});

try {
  await prisma.$connect();
  console.log("[Database] PostgreSQL connected successfully.");

  // Create the configured admin once; later restarts keep the existing account.
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.SUPER_ADMIN_PASSWORD;
  if (adminEmail || adminPassword) {
    console.log("[Admin] Checking the seeded admin account...");
    await seedSuperAdmin();
  } else {
    console.log("[Admin] Seed skipped. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create an admin.");
  }

  server = app.listen(Number(envVars.PORT));
  // Log success only after the server actually binds to the port.
  server.once("listening", () => {
    console.log("Server is running on http://localhost:" + envVars.PORT);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${envVars.PORT} is already in use. Stop the other backend process, then run pnpm dev again.`);
    } else {
      console.error("Server error:", error);
    }
    shutdown(1);
  });
} catch (error) {
  console.error("Failed to start server:", error);
  shutdown(1);
}
