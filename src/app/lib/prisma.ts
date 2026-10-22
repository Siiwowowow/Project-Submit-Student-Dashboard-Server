import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { envVars } from "../config/env.js";

const connectionString = envVars.DATABASE_URL;

// Generated model metadata is cached for this process. Regenerate the client and
// restart the server after schema changes; dev/build generate it before startup.

const schema = new URL(connectionString).searchParams.get("schema") || "public";
const adapter = new PrismaPg({ connectionString }, { schema });
const prisma = new PrismaClient({ adapter });

export { prisma };
