import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, "Password must contain at least 8 characters.").max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
}).strict(); // Reject role/status fields: public signup can only create students.

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
