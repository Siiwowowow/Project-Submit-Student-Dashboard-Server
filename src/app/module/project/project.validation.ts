import { z } from "zod";
import { ProjectStatus } from "@prisma/client";

const webUrl = z.string().trim().max(2048).url().refine((value) => {
  // Zod can run this refinement even when its URL check has already failed.
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use a valid HTTP or HTTPS URL without embedded credentials.");

// Store one consistent repository URL so small URL variations cannot create duplicates.
export const normalizeRepoUrl = (value: string) => {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^www\./, "");
  const supportedHosts = ["github.com", "gitlab.com", "bitbucket.org"];
  if (!supportedHosts.includes(hostname) || url.port) {
    throw new Error("Use a GitHub, GitLab or Bitbucket repository root URL without a custom port.");
  }

  // Decode escaped letters before comparing URLs, e.g. dashboard and %64ashboard.
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).replace(/\/+$/, "").replace(/\.git$/i, "");
  } catch {
    throw new Error("Repository URL contains invalid character encoding.");
  }
  const segments = path.slice(1).split("/");
  const validSegments = segments.every((segment) =>
    /^[a-zA-Z0-9_.-]+$/.test(segment) && ![".", "..", "-"].includes(segment));
  // GitLab supports nested groups. GitHub and Bitbucket use owner/repository.
  const validDepth = hostname === "gitlab.com" ? segments.length >= 2 : segments.length === 2;
  if (!validSegments || !validDepth) {
    throw new Error("Use the repository root URL, not a profile, branch, file or issue URL.");
  }

  url.hostname = hostname;
  url.protocol = "https:";
  url.hash = "";
  url.search = "";
  url.pathname = path.toLowerCase();
  return url.toString();
};

// A transform runs only after webUrl succeeds, so malformed URLs cannot throw here.
const repositoryUrl = webUrl.transform((value, context) => {
  try {
    return normalizeRepoUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid repository URL.",
    });
    return z.NEVER;
  }
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(3).max(150),
  repoUrl: repositoryUrl,
  backendRepoUrl: repositoryUrl.optional(),
  liveLink: webUrl,
  description: z.string().trim().min(20).max(5000),
}).strict();

export const projectListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(ProjectStatus).optional(),
}).strict();

export const projectIdSchema = z.string().uuid("Please provide a valid project ID.");

const feedbackRunSchema = z.object({
  text: z.string().min(1).max(1000),
  bold: z.boolean(),
  underline: z.boolean(),
  color: z.enum(["default", "blue", "green", "red", "purple", "amber"]),
}).strict();
const feedbackFormat = z.array(feedbackRunSchema).min(1).max(200).optional();
const matchesFeedback = (data: { reviewComment?: string; reviewCommentFormat?: z.infer<typeof feedbackRunSchema>[] }) =>
  !data.reviewCommentFormat || data.reviewCommentFormat.map(run => run.text).join("") === data.reviewComment;
const formatError = { message: "Formatted feedback must match the comment text.", path: ["reviewCommentFormat"] };

export const reviewProjectSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  score: z.number().int().min(0).max(10000).optional(),
  scoreOutOf: z.number().int().min(1).max(10000).default(100),
  reviewComment: z.string().trim().min(1).max(1000).optional(),
  reviewCommentFormat: feedbackFormat,
}).strict().refine(matchesFeedback, formatError).refine(data => data.score === undefined || data.score <= data.scoreOutOf, { message: "Marks cannot exceed the total marks.", path: ["score"] });

export const updateFeedbackSchema = z.object({
  reviewComment: z.string().trim().min(1).max(1000),
  reviewCommentFormat: feedbackFormat,
}).strict().refine(matchesFeedback, formatError);

export const projectMarksSchema = z.object({
  score: z.number().int().min(0).max(10000),
  scoreOutOf: z.number().int().min(1).max(10000).default(100),
}).strict().refine(data => data.score <= data.scoreOutOf, { message: "Marks cannot exceed the total marks.", path: ["score"] });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ProjectListQuery = z.infer<typeof projectListSchema>;
export type ReviewProjectInput = z.infer<typeof reviewProjectSchema>;

export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;

export type ProjectMarksInput = z.infer<typeof projectMarksSchema>;

// Admin edits submit the complete form; students cannot call this endpoint.
export const updateProjectSchema = createProjectSchema.extend({
  status: z.enum(ProjectStatus),
  score: z.number().int().min(0).max(10000).nullable().default(null),
  scoreOutOf: z.number().int().min(1).max(10000).default(100),
  reviewComment: z.string().trim().max(1000).nullable().optional(),
  reviewCommentFormat: feedbackFormat,
}).strict().refine(data => data.score === null || data.score <= data.scoreOutOf, {
  message: "Marks cannot exceed the total marks.", path: ["score"],
}).refine(data => !data.reviewCommentFormat || data.reviewCommentFormat.map(run => run.text).join("") === data.reviewComment, formatError);
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
