import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSchema } from "../src/app/module/auth/auth.validation.js";
import {
  createProjectSchema, normalizeRepoUrl, projectListSchema, reviewProjectSchema, projectMarksSchema, updateFeedbackSchema,
} from "../src/app/module/project/project.validation.js";

const validProject = {
  name: "Project Dashboard",
  repoUrl: "https://github.com/student/dashboard",
  liveLink: "https://dashboard.example.com",
  description: "A dashboard for submitting and reviewing student projects.",
};

test("signup normalizes email and rejects privilege escalation", () => {
  assert.equal(registerSchema.parse({
    name: " Student ", email: "STUDENT@EXAMPLE.COM ", password: "Password123!",
  }).email, "student@example.com");
  assert.equal(registerSchema.safeParse({
    name: "Student", email: "student@example.com", password: "Password123!", role: "ADMIN",
  }).success, false);
});

test("repository variants have one canonical URL", () => {
  for (const value of [
    "http://GitHub.com/Student/Dashboard.git/",
    "https://github.com/student/dashboard?tab=readme#description",
    "https://github.com/student/dashboard/",
    "https://www.github.com/student/%64ashboard",
  ]) assert.equal(normalizeRepoUrl(value), validProject.repoUrl);
});

test("malformed URLs return field errors instead of throwing exceptions", () => {
  for (const field of ["repoUrl", "backendRepoUrl", "liveLink"]) {
    for (const value of ["not-a-url", "https://", "", "https://[invalid]"]) {
      const result = createProjectSchema.safeParse({ ...validProject, [field]: value });
      assert.equal(result.success, false);
      if (!result.success) assert.ok(result.error.issues.some(issue => issue.path[0] === field));
    }
  }
});

test("repository validation rejects profiles, subpages and ambiguous encoded paths", () => {
  for (const repoUrl of [
    "https://github.com/student",
    "https://github.com/student/dashboard/tree/main",
    "https://github.com/student/dashboard/issues",
    "https://github.com/student/dashboard/blob/main/README.md",
    "https://gitlab.com/group/dashboard/-/tree/main",
    "https://bitbucket.org/student/dashboard/src/main",
    "https://github.com/student/dash%2Fboard",
    "https://github.com/student/%2e%2e",
    "https://github.com/student/%ZZ",
    "https://github.com:444/student/dashboard",
    "https://github.com.evil.example/student/dashboard",
    "https://example.com/student/dashboard",
  ]) assert.equal(createProjectSchema.safeParse({ ...validProject, repoUrl }).success, false, repoUrl);
});

test("repository roots support GitLab nested groups and Bitbucket", () => {
  for (const [repoUrl, expected] of [
    ["http://www.gitlab.com/Team/Subgroup/Dashboard.git/", "https://gitlab.com/team/subgroup/dashboard"],
    ["http://bitbucket.org/Student/Dashboard.git", "https://bitbucket.org/student/dashboard"],
  ]) assert.equal(createProjectSchema.parse({ ...validProject, repoUrl }).repoUrl, expected);
});

test("project validation rejects unsafe URLs, blank content and injected ownership", () => {
  for (const changes of [
    { liveLink: "javascript:alert(1)" },
    { repoUrl: "https://name:password@github.com/student/repo" },
    { repoUrl: "https://github.com" },
    { name: "  " },
    { description: "Too short" },
    { studentId: "someone-else" },
    { status: "APPROVED" },
  ]) assert.equal(createProjectSchema.safeParse({ ...validProject, ...changes }).success, false);
});

test("pagination is bounded and filters accept only supported statuses", () => {
  assert.deepEqual(projectListSchema.parse({}), { page: 1, limit: 10 });
  assert.deepEqual(projectListSchema.parse({ page: "2", limit: "5", status: "APPROVED" }),
    { page: 2, limit: 5, status: "APPROVED" });
  for (const query of [
    { page: "0" }, { limit: "101" }, { page: "1.5" }, { status: "INVALID" },
    { status: ["APPROVED", "REJECTED"] }, { sort: "student.password" },
  ]) assert.equal(projectListSchema.safeParse(query).success, false);
});

test("review accepts final decisions and rejects reset or forged reviewer", () => {
  assert.equal(reviewProjectSchema.safeParse({ status: "APPROVED" }).success, true);
  assert.equal(reviewProjectSchema.safeParse({ status: "PENDING" }).success, false);
  assert.equal(reviewProjectSchema.safeParse({ status: "REJECTED", reviewedById: "other" }).success, false);
});

test("backend repositories are normalized and legacy submissions remain valid", () => {
  assert.equal(createProjectSchema.parse({ ...validProject, backendRepoUrl: "http://GitHub.com/Student/Backend.git/" }).backendRepoUrl,
    "https://github.com/student/backend");
  assert.equal(createProjectSchema.safeParse(validProject).success, true);
  for (const backendRepoUrl of ["javascript:alert(1)", "https://github.com/student/backend/tree/main", "https://user:secret@github.com/student/backend"]) {
    assert.equal(createProjectSchema.safeParse({ ...validProject, backendRepoUrl }).success, false);
  }
});

test("marks allow zero and full marks but reject invalid scores and injected fields", () => {
  for (const score of [0, 85, 100]) {
    assert.equal(projectMarksSchema.safeParse({ score }).success, true);
    assert.equal(reviewProjectSchema.safeParse({ status: "APPROVED", score }).success, true);
  }
  for (const score of [-1, 101, 50.5, "85", null, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(projectMarksSchema.safeParse({ score }).success, false);
    assert.equal(reviewProjectSchema.safeParse({ status: "REJECTED", score }).success, false);
  }
  assert.equal(projectMarksSchema.safeParse({}).success, false);
  assert.equal(projectMarksSchema.safeParse({ score: 85, studentId: "other" }).success, false);
  assert.equal(createProjectSchema.safeParse({ name: "Marked", repoUrl: "https://github.com/student/marked", liveLink: "https://example.com", description: "A student must not assign their own marks.", score: 100 }).success, false);
});

test("formatted feedback is bounded, matches text, and accepts only supported styles", () => {
  const run = { text: "Fix the README.", bold: true, underline: true, color: "red" };
  const feedback = { reviewComment: run.text, reviewCommentFormat: [run] };
  assert.equal(updateFeedbackSchema.safeParse(feedback).success, true);
  assert.equal(reviewProjectSchema.safeParse({ status: "APPROVED", ...feedback }).success, true);
  for (const changes of [
    { reviewComment: "Different text" },
    { reviewComment: " " },
    { reviewCommentFormat: [{ ...run, color: "javascript:alert(1)" }] },
    { reviewCommentFormat: [{ ...run, html: "<script>alert(1)</script>" }] },
    { reviewCommentFormat: [{ ...run, bold: "yes" }] },
    { reviewCommentFormat: [] },
    { status: "APPROVED" },
    { score: 100 },
  ]) assert.equal(updateFeedbackSchema.safeParse({ ...feedback, ...changes }).success, false);
  assert.equal(updateFeedbackSchema.safeParse({ reviewComment: "Legacy plain text is still supported." }).success, true);
});

test("project totals support 60, 50, 30 and bound obtained marks", () => {
  for (const [score, scoreOutOf] of [[45,60],[40,50],[25,30],[0,30],[30,30],[150,200]]) {
    assert.equal(projectMarksSchema.safeParse({ score, scoreOutOf }).success, true);
    assert.equal(reviewProjectSchema.safeParse({ status: "APPROVED", score, scoreOutOf }).success, true);
  }
  for (const changes of [{ score: 61, scoreOutOf: 60 }, { score: 10, scoreOutOf: 0 }, { score: 10, scoreOutOf: -1 }, { score: 10, scoreOutOf: 30.5 }, { score: 10, scoreOutOf: 10001 }, { score: 10, scoreOutOf: "60" }]) {
    assert.equal(projectMarksSchema.safeParse(changes).success, false);
    assert.equal(reviewProjectSchema.safeParse({ status: "APPROVED", ...changes }).success, false);
  }
  assert.equal(projectMarksSchema.parse({ score: 85 }).scoreOutOf, 100);
  assert.equal(createProjectSchema.safeParse({ ...validProject, scoreOutOf: 60 }).success, false);
});
