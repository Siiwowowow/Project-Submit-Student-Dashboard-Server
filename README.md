# Project Submission & Review API

Express.js, TypeScript, PostgreSQL, Prisma and JWT-based role access for the Associate Web Instructor hiring task.

## Run locally

Requires Node.js 22+ (developed and tested on Node.js 24), pnpm and PostgreSQL.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env` when setting up a new checkout. Keep your existing `.env` if it already contains your database connection.
3. Set `DATABASE_URL`, a random `ACCESS_TOKEN_SECRET` of at least 32 characters, and the admin email/password.
4. Run `pnpm generate`.
5. Run `pnpm migrate:deploy` to apply committed migrations.
6. Run `pnpm dev`. Startup checks the configured admin and creates it if it does not exist.
7. You can also run `pnpm seed` separately whenever needed.

The default API URL is `http://localhost:5000/api/v1`.

For a production build, run `pnpm build` followed by `pnpm start`.

Startup logs the database connection, admin seed status and server address. The admin seed uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` (or the existing `SUPER_ADMIN_*` settings). Existing admin accounts are not changed. Without admin credentials, startup prints a seed-skipped message. Invalid configured credentials stop startup with an error.

With `NODE_ENV=development`, each request logs its method, path, status and duration. Validation/auth errors also show readable details. Passwords, tokens, request bodies and query values are not included in these request logs.

`pnpm seed` remains available as an explicit Prisma seed command. Migrations do not run the seed automatically. See the [Prisma seeding documentation](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding).

## Folder structure and request flow

```text
prisma/schema/                 Database models and enums
prisma/migrations/             Versioned database changes
prisma/seed.ts                  Explicit admin seed entry point
src/app/config/                Environment settings and admin creation
src/app/lib/prisma.ts           PostgreSQL connection
src/app/middleware/             JWT checks, validation, rate limits, error handling
src/app/module/auth/            Student registration, login and current profile
src/app/module/project/         Submission, lists, statistics and review
src/app/routes/index.ts         API route registration
src/app/shared/                 Shared response and async error helpers
src/app.ts                      Express application
src/server.ts                   Server startup and graceful shutdown
tests/                          Validation and real-database integration tests
```

Request flow: **route → authentication → validation → controller → service → Prisma → PostgreSQL**.

সহজভাবে: route ঠিক করে কোন URL-এ কোন কাজ হবে। Middleware permission ও input check করে। Controller request/response সামলায়। Service-এর মধ্যে মূল কাজ ও database query থাকে। Validation file-এ কোন field কেমন হতে হবে তা লেখা আছে।

The existing route/controller/service naming convention is retained. Older category, profile-upload, OTP and Google-auth modules remain in the repository for reference, but are not registered in this dashboard API. The dashboard does not need email, Google or Cloudinary credentials. Only Better Auth's password hashing utilities are reused to preserve the existing Account password format.

## Roles and decisions

| Role | Access |
| --- | --- |
| STUDENT | Submit projects, list own projects, read own project details |
| MENTOR | List all projects, view statistics, approve/reject pending projects |
| ADMIN / SUPER_ADMIN | Same review access as a mentor |
| USER | Legacy student role; retains student access |

- Public registration always creates a STUDENT. Extra fields such as `role` or `status` are rejected.
- The seed creates an ADMIN. Existing admin accounts are left untouched; it does not reset passwords or promote students. Existing `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` settings are also supported.
- To create a separate mentor during development, register a student and change that account's role to MENTOR using `pnpm studio`. There is no public role-assignment endpoint.
- A student can submit multiple different projects. A repository can be submitted only once across all students.
- Projects start as PENDING. A mentor/admin can change PENDING to APPROVED or REJECTED once. A final decision cannot be overwritten. A reviewer cannot review their own project.
- Live link is required. Review comment is optional.
- Statistics include all projects, independent of the current list filter.

## Authentication

Register or log in, then copy `data.accessToken` from the response:

```http
Authorization: Bearer <accessToken>
```

The API uses Bearer JWTs. Tokens expire after `ACCESS_TOKEN_EXPIRES_IN` (default: 1 hour). The frontend can remove its token to log out; refresh-token and server-side logout endpoints are outside this task's scope. Roles and active account status are checked against the database on every protected request.

## Endpoints

All paths below start with `/api/v1`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | /auth/register | Public | Student signup |
| POST | /auth/login | Public | Student/mentor/admin login |
| GET | /auth/me | Authenticated | Current user profile |
| POST | /projects | Student | Submit project |
| GET | /projects/mine | Student | Paginated own projects |
| GET | /projects | Mentor/admin | Paginated review table |
| GET | /projects/stats | Mentor/admin | Total, pending, approved and rejected counts |
| GET | /projects/:id | Owner or mentor/admin | Project details |
| PATCH | /projects/:id/review | Mentor/admin | Approve or reject |

### Register / login

```json
{
  "name": "Student Name",
  "email": "student@example.com",
  "password": "StrongPassword123!"
}
```

Login uses only `email` and `password`. Names are trimmed; emails are trimmed and lowercased. Signup passwords must contain 8–128 characters and are hashed before storage.

### Submit a project

```json
{
  "name": "Project Review Dashboard",
  "repoUrl": "https://github.com/student/project-dashboard",
  "backendRepoUrl": "https://github.com/student/project-dashboard-server",
  "liveLink": "https://project-dashboard.example.com",
  "description": "A dashboard where students submit projects and mentors review their work."
}
```

Validation: name 3–150 characters, description 20–5000 characters, valid HTTP/HTTPS links up to 2048 characters, no embedded URL credentials, no unknown body fields.

Repository links must be GitHub, GitLab or Bitbucket root URLs. GitLab nested groups are supported. Profile, branch, file and issue pages are rejected; custom ports and other hosts are not supported. This checks the URL structure, not whether a repository exists or is accessible.

Query parameters, fragments, trailing slashes and a final `.git` suffix are removed. Encoded letters, `www`, path case and HTTP/HTTPS variants normalize to one HTTPS repository URL. The normalized repository has a database unique constraint, including for simultaneous requests. Malformed links return a field-specific `400` validation error.

### Pagination and server-side filters

```http
GET /api/v1/projects?page=1&limit=10&status=APPROVED
GET /api/v1/projects?page=1&limit=10&status=REJECTED
GET /api/v1/projects/mine?page=1&limit=5&status=PENDING
```

Default page: 1; default limit: 10; maximum limit: 100. Omit `status` to list all statuses. Filters run in PostgreSQL before pagination. Lists are ordered by newest creation time, then ID.

```json
{
  "success": true,
  "message": "Projects retrieved successfully.",
  "data": {
    "projects": [],
    "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
  }
}
```

### Review

```json
{
  "status": "APPROVED",
  "reviewComment": "The project meets the requirements."
}
```

Use `REJECTED` for rejection. Reviewer ID and review time come from the server. Conditional database updates prevent simultaneous reviews from overwriting each other.

### Statistics

```json
{
  "success": true,
  "message": "Project statistics retrieved successfully.",
  "data": {
    "totalProjects": 12,
    "totalPending": 5,
    "totalApproved": 4,
    "totalRejected": 3
  }
}
```

### Errors and spam prevention

| Status | Meaning |
| --- | --- |
| 400 | Invalid body, JSON, query, status or project ID |
| 401 | Missing/invalid/expired token or inactive account |
| 403 | Role does not allow the action |
| 404 | Project/route missing, or project belongs to another student |
| 409 | Duplicate email/repository, or project already reviewed |
| 413 | JSON body exceeds 32 KB |
| 429 | Rate limit exceeded |

Login and signup share 20 attempts per IP per 15 minutes. Submission allows 5 attempts per authenticated student per 15 minutes, including invalid or duplicate attempts. Rate-limited responses include a Retry-After header. The basic limiter uses process memory; multiple server instances would need a shared store. Set `TRUST_PROXY_HOPS` only when the deployment uses a known proxy configuration.

## Verification

```sh
pnpm build
pnpm lint
pnpm test
```

For real-database integration tests, set `TEST_DATABASE_URL`, then run:

```sh
pnpm test:integration
```

Each integration run creates a uniquely named PostgreSQL schema, applies the complete migration history, tests actual HTTP requests, and drops only its own schema afterward. It requires permission to create/drop schemas. Application data in the public schema is not modified.

Tests cover JWT authentication, signup role protection, admin seeding, ownership, validation, canonical and concurrent duplicates, pagination, filters, aggregated counts, final review decisions, simultaneous reviews, blocked users and rate limits.

Use [requests.http](./requests.http) for manual requests in a REST client.

Repository fields: `repoUrl` is the frontend repository. `backendRepoUrl` is the backend repository (optional for older API clients and null for existing submissions). Both use the same repository URL validation. `liveLink` is always required for the deployed project. Apply the new migration with `npm run migrate:deploy` before deploying the updated server.

### Project marks

Reviewers (MENTOR, ADMIN, SUPER_ADMIN) can include obtained `score` and total `scoreOutOf` in `PATCH /projects/:id/review`. Older reviews without a score remain valid and display as unmarked. `PATCH /projects/:id/marks` accepts `{ "score": 45, "scoreOutOf": 60 }` for an already reviewed project; pending projects return 409. Students cannot mark projects and reviewers cannot mark their own work. A later marks update replaces both the score and total.

Project responses include nullable `score` and configurable `scoreOutOf`. `GET /projects/stats` returns workspace totals and normalized percentage `averageScore` (null when no marks exist), `markedProjects`, and `totalScore`. `GET /projects/mine/stats` returns the same fields scoped to the authenticated student. The average includes all scored projects (including zero), excludes unmarked projects, and is independent of table pagination and status filters.

### Formatted mentor feedback

Review requests may include `reviewCommentFormat`, an array of up to 200 runs: `{ "text": "Fix the README", "bold": true, "underline": false, "color": "red" }`. Colors are `default`, `blue`, `green`, `red`, `purple`, and `amber`. Run text must concatenate exactly to the trimmed `reviewComment` (maximum 1,000 characters). Plain text remains supported and is shown in bold by default. No HTML is accepted as formatting or rendered as markup.

`PATCH /projects/:id/feedback` accepts required `reviewComment` and optional `reviewCommentFormat`. Reviewers can edit feedback for reviewed projects, except their own work; pending projects return 409 and students receive 403. This preserves the decision and marks, and records the editing reviewer and time. Feedback attribution is displayed as Mentor. Admin and Super Admin dashboard summaries and tables hide marks and averages. Reviewers of all three roles can assign or update marks inside project review dialogs. Student and mentor interfaces retain marking displays.

Development and production builds generate Prisma Client before starting/compiling. After changing the Prisma schema in an already running dev session, run `npm run generate` and restart the backend so its cached model metadata matches the schema.

### Configurable project mark totals

Reviewers set `scoreOutOf` (integer 1 to 10,000) and `score` (integer 0 to `scoreOutOf`) per project. Both review and marks-update requests accept `scoreOutOf`; omission defaults to 100 for older clients. Existing marks retain a total of 100. Student submissions cannot set marks or totals. Project responses include `scoreOutOf`, displayed alongside the obtained score, e.g. 45 / 60.

`averageScore` is the arithmetic mean of each marked project's percentage: AVG(score / scoreOutOf * 100). All marked projects contribute equally; zero marks count and unmarked projects are excluded. For example, 45/60, 40/50, and 25/30 average to 79.44%. The dashboard shows the average as a percentage so projects with different totals remain comparable.

## Vercel deployment

The project uses Vercel's Express framework preset with `src/app.ts` as the default-export entry point. Do not add legacy `builds`/`routes` configuration: it overrides framework build settings.

`vercel.json` pins dependency installation and builds to pnpm 12.14.0, matching `package.json` and the multi-document lockfile. Older pnpm versions can read only the package-manager section and report an empty install, leading to `Cannot find module express` at runtime. Keep the pinned version aligned when upgrading pnpm. `pnpm-workspace.yaml` explicitly allows the required Prisma, bcrypt and esbuild installation scripts so clean CI installs complete under pnpm's strict build policy.

Set the production environment variables listed in `.env.example` in Vercel. Source uploads exclude local dependencies, compiled output, tests and `.env` files through `.vercelignore`. Deploy with `vercel --prod`; after fixing dependency installation, use `vercel --prod --force` once to avoid the previous broken build cache. Check `/` for HTTP 200 and `/api/v1/auth/me` without a token for HTTP 401.

## Mentor and administrator controls

Set `MENTOR_EMAIL`, `MENTOR_PASSWORD` and optional `MENTOR_NAME` in `.env`, then run `pnpm seed`. Admin seeding continues to use `ADMIN_EMAIL`/`ADMIN_PASSWORD` (with the existing SUPER_ADMIN aliases supported). Seeds are repeatable and never promote an existing student or silently reset a password. The local server seeds configured accounts at startup; run the seed command explicitly against the deployment environment for Vercel.

Mentors use the existing paginated project endpoints, server-side status filters and aggregated counts. Only ADMIN/SUPER_ADMIN may `PATCH /projects/:id` or `DELETE /projects/:id`. Admin edits can change the project details, decision, marks and feedback. Reopening a project as PENDING clears the old marks, reviewer and feedback. Deleting a project permanently removes that submission.

Admin-only `GET /users` returns paginated public account details (page, limit, optional search), excluding deleted accounts. `PATCH /users/:id` edits name, email, role, ACTIVE/BLOCKED status and an optional new password. `DELETE /users/:id` disables the account and deletes its sessions while retaining submission history. Admins cannot block, demote or delete their own account. Students and mentors cannot access user management. Password hashes and credentials are never returned.
