import { z } from "zod";

export const userListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(""),
}).strict();

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["STUDENT", "USER", "MENTOR", "ADMIN", "SUPER_ADMIN"]),
  status: z.enum(["ACTIVE", "BLOCKED"]),
  password: z.string().min(8).max(128).optional(),
}).strict();

export type UserListQuery = z.infer<typeof userListSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
