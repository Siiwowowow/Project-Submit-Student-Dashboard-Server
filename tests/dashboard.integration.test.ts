import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import pg from "pg";
import jwt from "jsonwebtoken";

// Each run owns a random schema and drops only that schema after testing.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL to run PostgreSQL integration tests.");
const schema = "integration_test_" + randomUUID().replaceAll("-", "");
const testUrl = new URL(databaseUrl);
// Migrations rely on session search_path; bypass transaction poolers.
if (testUrl.hostname.endsWith(".neon.tech")) testUrl.hostname = testUrl.hostname.replace("-pooler.", ".");
testUrl.searchParams.set("schema", schema);
process.env.DATABASE_URL = testUrl.toString();
process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = "integration-test-secret-at-least-32-characters";
process.env.ACCESS_TOKEN_EXPIRES_IN = "1h";
process.env.ADMIN_EMAIL = "admin@integration.example";
process.env.ADMIN_PASSWORD = "AdminPassword123!";
delete process.env.TRUST_PROXY_HOPS;

test("dashboard API with real PostgreSQL", { timeout: 120000 }, async (t) => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let server: import("node:http").Server | undefined;
  let prisma: typeof import("../src/app/lib/prisma.js").prisma | undefined;

  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      // Each run owns a separate random schema; it does not share migration state.
      env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, stdio: "pipe", timeout: 60000,
    });
    const database = await import("../src/app/lib/prisma.js");
    prisma = database.prisma;
    const { default: app } = await import("../src/app.js");
    const { seedSuperAdmin, seedMentor } = await import("../src/app/config/seed.js");
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as import("node:net").AddressInfo;
    const baseUrl = "http://127.0.0.1:" + address.port + "/api/v1";

    const request = async (path: string, method = "GET", body?: unknown, token?: string) => {
      const response = await fetch(baseUrl + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    };

    const signup = (email: string) => request("/auth/register", "POST", {
      name: "Test Student", email, password: "Password123!",
    });
    const studentA = await signup("student-a@integration.example");
    const studentB = await signup("student-b@integration.example");
    const mentor = await signup("mentor@integration.example");
    assert.equal(studentA.status, 201);
    assert.equal(studentB.status, 201);
    assert.equal(mentor.status, 201);
    const tokenA = studentA.body.data.accessToken;
    const tokenB = studentB.body.data.accessToken;
    const mentorToken = mentor.body.data.accessToken;
    const studentAId = studentA.body.data.user.id;
    await prisma.user.update({ where: { id: mentor.body.data.user.id }, data: { role: "MENTOR" } });

    await t.test("malformed URLs and repository subpages return 400 without creating records", async () => {
      const regressionStudent = await signup("url-regression@integration.example");
      assert.equal(regressionStudent.status, 201);
      for (const changes of [
        { repoUrl: "not-a-url" },
        { liveLink: "https://" },
        { repoUrl: "https://github.com/student" },
        { repoUrl: "https://github.com/student/dashboard/tree/main" },
      ]) {
        const result = await request("/projects", "POST", {
          name: "URL regression", repoUrl: "https://github.com/student/dashboard",
          liveLink: "https://example.com", description: "A dashboard for student project submissions.",
          ...changes,
        }, regressionStudent.body.data.accessToken);
        assert.equal(result.status, 400);
        assert.ok(result.body.errorSources.some((issue: { path: string }) => Object.hasOwn(changes, issue.path)));
      }
      assert.equal(await prisma!.project.count(), 0);
    });

    await t.test("seed is repeatable; admin and student login return no password hashes", async () => {
      await seedSuperAdmin();
      await seedSuperAdmin();
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL } });
      assert.equal(admin.role, "ADMIN");
      assert.equal(await prisma.account.count({ where: { userId: admin.id } }), 1);
      const result = await request("/auth/login", "POST", {
        email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
      });
      assert.equal(result.status, 200);
      assert.equal((await request("/projects/stats", "GET", undefined, result.body.data.accessToken)).status, 200);
      const login = await request("/auth/login", "POST", {
        email: "STUDENT-A@INTEGRATION.EXAMPLE", password: "Password123!",
      });
      assert.equal(login.status, 200);
      assert.equal(JSON.stringify(login.body).includes("password"), false);
      assert.equal((await request("/auth/login", "POST", {
        email: "student-a@integration.example", password: "WrongPassword",
      })).status, 401);
      assert.equal((await signup("STUDENT-A@INTEGRATION.EXAMPLE")).status, 409);
      assert.equal((await request("/auth/register", "POST", {
        name: "Admin?", email: "forged@integration.example", password: "Password123!", role: "ADMIN",
      })).status, 400);
    });

    await t.test("JWT and role checks protect review routes", async () => {
      assert.equal((await request("/projects")).status, 401);
      assert.equal((await request("/projects", "GET", undefined, "broken-token")).status, 401);
      const expiredToken = jwt.sign({}, process.env.ACCESS_TOKEN_SECRET!, {
        subject: studentAId, issuer: "project-review-api", audience: "project-review-client", expiresIn: -1,
      });
      assert.equal((await request("/auth/me", "GET", undefined, expiredToken)).status, 401);
      assert.equal((await request("/projects", "GET", undefined, tokenA)).status, 403);
      assert.equal((await request("/projects/stats", "GET", undefined, tokenA)).status, 403);
      assert.equal((await request("/auth/me", "GET", undefined, tokenA)).body.data.id, studentAId);
    });

    const projectBody = (slug: string) => ({
      name: "Dashboard " + slug, repoUrl: "https://github.com/student/" + slug,
      liveLink: "https://dashboard.example.com",
      description: "A complete submission and review dashboard for student projects.",
    });
    let firstId: string;
    let secondId: string;
    let thirdId: string;

    await t.test("validation, canonical duplicates, concurrent duplicates and ownership", async () => {
      assert.equal((await request("/projects", "POST", {
        ...projectBody("unsafe"), liveLink: "javascript:alert(1)",
      }, tokenA)).status, 400);
      const first = await request("/projects", "POST", projectBody("first"), tokenA);
      assert.equal(first.status, 201);
      firstId = first.body.data.id;
      assert.equal(first.body.data.status, "PENDING");
      assert.equal(first.body.data.studentId, studentAId);
      assert.equal((await request("/projects", "POST", {
        ...projectBody("first"), repoUrl: "http://www.GitHub.com/STUDENT/%66IRST.git/?tab=readme",
      }, tokenA)).status, 409);
      const concurrent = await Promise.all([
        request("/projects", "POST", projectBody("second"), tokenB),
        request("/projects", "POST", projectBody("second"), tokenB),
      ]);
      assert.deepEqual(concurrent.map(result => result.status).sort(), [201, 409]);
      secondId = concurrent.find(result => result.status === 201)!.body.data.id;
      const third = await request("/projects", "POST", projectBody("third"), tokenA);
      assert.equal(third.status, 201);
      thirdId = third.body.data.id;
      assert.equal((await request("/projects", "POST", projectBody("fourth"), tokenA)).status, 201);
      assert.equal((await request("/projects/" + firstId, "GET", undefined, tokenB)).status, 404);
      const mine = await request("/projects/mine", "GET", undefined, tokenB);
      assert.equal(mine.body.data.pagination.total, 1);
      assert.equal(mine.body.data.projects[0].id, secondId);
    });

    await t.test("reviews are final, concurrent decisions are atomic, filters and stats run on server", async () => {
      const path = "/projects/" + firstId + "/review";
      assert.equal((await request(path, "PATCH", { status: "APPROVED" }, tokenA)).status, 403);
      assert.equal((await request(path, "PATCH", { status: "PENDING" }, mentorToken)).status, 400);
      const approved = await request(path, "PATCH", { status: "APPROVED", reviewComment: "Well done." }, mentorToken);
      assert.equal(approved.status, 200);
      assert.ok(approved.body.data.reviewedAt);
      assert.equal((await request(path, "PATCH", { status: "REJECTED" }, mentorToken)).status, 409);
      assert.equal((await request("/projects/" + secondId + "/review", "PATCH",
        { status: "REJECTED", reviewComment: "Please improve the documentation." }, mentorToken)).status, 200);
      const decisions = await Promise.all([
        request("/projects/" + thirdId + "/review", "PATCH", { status: "APPROVED" }, mentorToken),
        request("/projects/" + thirdId + "/review", "PATCH", { status: "REJECTED" }, mentorToken),
      ]);
      assert.deepEqual(decisions.map(result => result.status).sort(), [200, 409]);
      const stats = await request("/projects/stats", "GET", undefined, mentorToken);
      assert.equal(stats.body.data.totalProjects, 4);
      assert.equal(stats.body.data.totalPending, 1);
      assert.equal(stats.body.data.totalApproved + stats.body.data.totalRejected, 3);
      for (const status of ["APPROVED", "REJECTED", "PENDING"]) {
        const result = await request("/projects?status=" + status + "&limit=1&page=1", "GET", undefined, mentorToken);
        assert.equal(result.status, 200);
        assert.equal(result.body.data.projects.length, 1);
        assert.ok(result.body.data.projects.every((project: { status: string }) => project.status === status));
      }
      const page1 = await request("/projects?limit=2&page=1", "GET", undefined, mentorToken);
      const page2 = await request("/projects?limit=2&page=2", "GET", undefined, mentorToken);
      assert.equal(page1.body.data.pagination.totalPages, 2);
      assert.equal(new Set([...page1.body.data.projects, ...page2.body.data.projects].map(project => project.id)).size, 4);
      assert.equal((await request("/projects?limit=101", "GET", undefined, mentorToken)).status, 400);
      assert.equal((await request("/projects/not-a-uuid", "GET", undefined, mentorToken)).status, 400);
      assert.equal((await request("/projects/" + randomUUID(), "GET", undefined, mentorToken)).status, 404);
    });

    await t.test("marks enforce permissions and student averages exclude unmarked work", async () => {
      const path = "/projects/" + firstId + "/marks";
      assert.equal((await request(path, "PATCH", { score: 100 }, tokenA)).status, 403);
      assert.equal((await request(path, "PATCH", { score: 101 }, mentorToken)).status, 400);
      assert.equal((await request(path, "PATCH", { score: 80 }, mentorToken)).status, 200);
      assert.equal((await request("/projects/" + secondId + "/marks", "PATCH", { score: 0 }, mentorToken)).status, 200);
      const pending = await request("/projects?status=PENDING", "GET", undefined, mentorToken);
      assert.equal((await request("/projects/" + pending.body.data.projects[0].id + "/marks", "PATCH", { score: 50 }, mentorToken)).status, 409);
      const stats = await request("/projects/stats", "GET", undefined, mentorToken);
      assert.equal(stats.body.data.averageScore, 40);
      assert.equal(stats.body.data.markedProjects, 2);
      assert.equal(stats.body.data.totalScore, 80);
      const ownA = await request("/projects/mine/stats", "GET", undefined, tokenA);
      const ownB = await request("/projects/mine/stats", "GET", undefined, tokenB);
      assert.equal(ownA.body.data.averageScore, 80);
      assert.equal(ownA.body.data.markedProjects, 1);
      assert.equal(ownB.body.data.averageScore, 0);
      assert.equal(ownB.body.data.markedProjects, 1);
      await prisma!.user.update({ where: { id: studentAId }, data: { role: "MENTOR" } });
      assert.equal((await request(path, "PATCH", { score: 100 }, tokenA)).status, 403);
      await prisma!.user.update({ where: { id: studentAId }, data: { role: "STUDENT" } });
      assert.equal((await request("/projects/" + firstId, "GET", undefined, tokenA)).body.data.score, 80);
    });

    await t.test("reviewers edit styled feedback while preserving decisions, marks and student access", async () => {
      const path = "/projects/" + firstId + "/feedback";
      const payload = { reviewComment: "Fix the README.", reviewCommentFormat: [{ text: "Fix the README.", bold: false, underline: true, color: "red" }] };
      assert.equal((await request(path, "PATCH", payload, tokenA)).status, 403);
      assert.equal((await request(path, "PATCH", { ...payload, reviewComment: "Mismatch" }, mentorToken)).status, 400);
      const pending = await request("/projects?status=PENDING", "GET", undefined, mentorToken);
      assert.equal((await request("/projects/" + pending.body.data.projects[0].id + "/feedback", "PATCH", payload, mentorToken)).status, 409);
      const result = await request(path, "PATCH", payload, mentorToken);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.score, 80);
      assert.equal(result.body.data.status, "APPROVED");
      assert.deepEqual(result.body.data.reviewCommentFormat, payload.reviewCommentFormat);
      const studentView = await request("/projects/" + firstId, "GET", undefined, tokenA);
      assert.equal(studentView.body.data.reviewComment, payload.reviewComment);
      assert.deepEqual(studentView.body.data.reviewCommentFormat, payload.reviewCommentFormat);
      const plain = await request(path, "PATCH", { reviewComment: "Plain text feedback is supported." }, mentorToken);
      assert.equal(plain.status, 200);
      assert.equal(plain.body.data.reviewCommentFormat, null);
    });

    await t.test("custom totals persist and mixed totals produce a normalized average", async () => {
      for (const [id, score, scoreOutOf] of [[firstId,45,60],[secondId,40,50],[thirdId,25,30]] as const) {
        const result = await request("/projects/" + id + "/marks", "PATCH", { score, scoreOutOf }, mentorToken);
        assert.equal(result.status, 200);
        assert.equal(result.body.data.score, score);
        assert.equal(result.body.data.scoreOutOf, scoreOutOf);
      }
      const rejected = await request("/projects/" + firstId + "/marks", "PATCH", { score: 61, scoreOutOf: 60 }, mentorToken);
      assert.equal(rejected.status, 400);
      const stats = await request("/projects/stats", "GET", undefined, mentorToken);
      assert.equal(stats.body.data.markedProjects, 3);
      assert.ok(Math.abs(stats.body.data.averageScore - (75 + 80 + 2500/30)/3) < 0.000001);
      const own = await request("/projects/mine/stats", "GET", undefined, tokenA);
      assert.ok(Math.abs(own.body.data.averageScore - (75 + 2500/30)/2) < 0.000001);
      const studentView = await request("/projects/" + firstId, "GET", undefined, tokenA);
      assert.equal(studentView.body.data.score, 45);
      assert.equal(studentView.body.data.scoreOutOf, 60);
    });

    await t.test("mentor seed is repeatable, logs in as mentor and cannot promote a student", async () => {
      process.env.MENTOR_EMAIL = "seeded-mentor@integration.example";
      process.env.MENTOR_PASSWORD = "MentorTestPassword123!";
      await seedMentor();
      process.env.MENTOR_PASSWORD = "DifferentSeedPassword123!";
      await seedMentor();
      const login = await request("/auth/login", "POST", { email: process.env.MENTOR_EMAIL, password: "MentorTestPassword123!" });
      assert.equal(login.status, 200);
      assert.equal(login.body.data.user.role, "MENTOR");
      assert.equal((await request("/projects/stats", "GET", undefined, login.body.data.accessToken)).status, 200);
      assert.equal(await prisma!.user.count({ where: { email: process.env.MENTOR_EMAIL } }), 1);
      process.env.MENTOR_EMAIL = "student-a@integration.example";
      await assert.rejects(seedMentor(), /belongs to another account/);
      assert.equal((await prisma!.user.findUniqueOrThrow({ where: { id: studentAId } })).role, "STUDENT");
    });

    await t.test("admin can edit, reopen and delete projects; mentor and student cannot", async () => {
      const login = await request("/auth/login", "POST", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
      assert.equal(login.status, 200);
      const token = login.body.data.accessToken;
      const input = { ...projectBody("admin-edited"), status: "REJECTED", score: 20, scoreOutOf: 30, reviewComment: "Admin corrected this review." };
      const path = "/projects/" + firstId;
      assert.equal((await request(path, "PATCH", input, mentorToken)).status, 403);
      assert.equal((await request(path, "PATCH", input, tokenA)).status, 403);
      assert.equal((await request(path, "DELETE", undefined, mentorToken)).status, 403);
      assert.equal((await request(path, "PATCH", { ...input, studentId: studentAId }, token)).status, 400);
      const edited = await request(path, "PATCH", input, token);
      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.score, 20);
      assert.equal(edited.body.data.scoreOutOf, 30);
      assert.equal(edited.body.data.reviewComment, input.reviewComment);
      const reopened = await request(path, "PATCH", { ...input, status: "PENDING" }, token);
      assert.equal(reopened.status, 200);
      for (const key of ["score", "reviewComment", "reviewCommentFormat", "reviewedAt", "reviewedBy"]) assert.equal(reopened.body.data[key], null);
      const before = await request("/projects/stats", "GET", undefined, token);
      assert.equal((await request(path, "DELETE", undefined, token)).status, 200);
      assert.equal((await request(path, "GET", undefined, token)).status, 404);
      const after = await request("/projects/stats", "GET", undefined, token);
      assert.equal(after.body.data.totalProjects, before.body.data.totalProjects - 1);
    });

    await t.test("admin manages users; reviewer access is restricted and self-lockout is blocked", async () => {
      const login = await request("/auth/login", "POST", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
      assert.equal(login.status, 200);
      const token = login.body.data.accessToken;
      const adminId = login.body.data.user.id;
      assert.equal((await request("/users", "GET", undefined, mentorToken)).status, 403);
      assert.equal((await request("/users", "GET", undefined, tokenA)).status, 403);
      const candidate = await signup("managed@integration.example");
      assert.equal(candidate.status, 201);
      const id = candidate.body.data.user.id;
      const input = { name: "Managed Mentor", email: "managed@integration.example", role: "MENTOR", status: "ACTIVE", password: "NewManagedPassword123!" };
      assert.equal((await request("/users/" + id, "PATCH", input, mentorToken)).status, 403);
      const edited = await request("/users/" + id, "PATCH", input, token);
      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.role, "MENTOR");
      assert.equal(Object.hasOwn(edited.body.data, "password"), false);
      const users = await request("/users?search=managed&limit=1", "GET", undefined, token);
      assert.equal(users.body.data.pagination.total, 1);
      assert.equal(users.body.data.users.length, 1);
      assert.equal(Object.hasOwn(users.body.data.users[0], "accounts"), false);
      const changedLogin = await request("/auth/login", "POST", { email: input.email, password: input.password });
      assert.equal(changedLogin.status, 200);
      assert.equal((await request("/users/" + id, "PATCH", { ...input, status: "BLOCKED" }, token)).status, 200);
      assert.equal((await request("/auth/me", "GET", undefined, changedLogin.body.data.accessToken)).status, 401);
      assert.equal((await request("/users/" + adminId, "DELETE", undefined, token)).status, 400);
      assert.equal((await request("/users/" + adminId, "PATCH", { ...input, email: process.env.ADMIN_EMAIL, role: "STUDENT" }, token)).status, 400);
      assert.equal((await request("/users/" + id, "DELETE", undefined, token)).status, 200);
      const deleted = await prisma!.user.findUniqueOrThrow({ where: { id } });
      assert.equal(deleted.isDeleted, true);
      assert.equal((await request("/auth/me", "GET", undefined, changedLogin.body.data.accessToken)).status, 401);
    });

    await t.test("rate limits and current account status are enforced", async () => {
      const limited = await request("/projects", "POST", projectBody("limited"), tokenA);
      assert.equal(limited.status, 429);
      assert.ok(limited.headers.get("retry-after"));
      await prisma!.user.update({ where: { id: studentAId }, data: { status: "BLOCKED" } });
      assert.equal((await request("/auth/me", "GET", undefined, tokenA)).status, 401);
      let last;
      for (let index = 0; index < 21; index++) last = await request("/auth/login", "POST", {});
      assert.equal(last!.status, 429);
    });

    await t.test("invalid JSON is handled and unknown routes return 404", async () => {
      const invalid = await fetch(baseUrl + "/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken",
      });
      assert.equal(invalid.status, 400);
      assert.equal((await request("/unknown")).status, 404);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (prisma) await prisma.$disconnect();
    // Schema is internally generated and validated; application/public data is never deleted.
    assert.match(schema, /^integration_test_[a-f0-9]{32}$/);
    await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await client.end();
  }
});
