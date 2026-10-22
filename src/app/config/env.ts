import "dotenv/config";
import { z } from "zod";

// Fail early with a clear message when required server settings are missing.
const settings = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().regex(/^[1-9]\d*(s|m|h|d)$/).default("1h"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(10).optional(),
}).parse(process.env);

export const envVars = {
  ...settings,
  PORT: String(settings.PORT),

  // Retained for older, unmounted modules. These services are not required by the dashboard.
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: process.env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN || "1d",
  BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: process.env.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE || "1h",
  EMAIL_SENDER: {
    SMTP_USER: process.env.EMAIL_SENDER_SMTP_USER || "",
    SMTP_PASS: process.env.EMAIL_SENDER_SMTP_PASS || "",
    SMTP_HOST: process.env.EMAIL_SENDER_SMTP_HOST || "",
    SMTP_PORT: process.env.EMAIL_SENDER_SMTP_PORT || "587",
    SMTP_FROM: process.env.EMAIL_SENDER_SMTP_FROM || "",
  },
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || "",
  CLOUDINARY: {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  },
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || "",
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || "",
};
