# FITCLUB

A fitness club platform with three surfaces that share one API, one database and one permission model:

- **Public website.** 23 pages in Kazakh, Russian and English, including memberships, the class schedule, coaches, the blog, FAQ and branch locations.
- **Member portal.** Members manage their membership (purchase, renewal, freeze), book classes and join waitlists, use a rotating check-in QR code, follow training programs and view payments and invoices.
- **Administration.** Staff use the reception check-in, schedule, members CRM, leads pipeline, payments and refunds, plans, promotions, CMS, analytics, staff and roles, settings and the audit log.

> This is a portfolio/demo project for a fictional club. Payments run through a **sandbox adapter**: no real payment provider is connected and no money ever moves. Seeded payments are flagged as test data and labelled as such in the UI.

## Stack

| Layer    | Choice                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo | npm workspaces: `packages/shared`, `apps/api`, `apps/web`                                                                                                            |
| Web      | Next.js 16 (App Router, React 19), TypeScript strict, Tailwind CSS 4, Radix-based UI kit, Motion, Lucide, next-intl, React Hook Form + Zod, TanStack Query, Recharts |
| API      | NestJS 11, REST + OpenAPI (Swagger), Zod validation, Argon2id, `@nestjs/schedule` jobs                                                                               |
| Data     | PostgreSQL 15+ via Prisma 7 (`@prisma/adapter-pg`)                                                                                                                   |
| Shared   | Domain rules (membership state machine, booking policy, pricing, dates), Zod schemas, permission matrix, notification templates                                      |
| Tests    | Vitest (shared domain), Jest + Supertest (API unit and integration against a real PostgreSQL), Playwright (end-to-end)                                               |
| Tooling  | ESLint, Prettier, i18n key checker, GitHub Actions                                                                                                                   |

## Quick start (Windows, macOS, Linux — no Docker required)

Prerequisites: **Node.js 22+** (24 recommended) and **PostgreSQL 15+ binaries** installed locally. The helper only needs `initdb`/`pg_ctl`; it never touches an existing server.

```bash
npm install
npm run db:local:init        # creates a private cluster on 127.0.0.1:54329 with fitclub + fitclub_test databases
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env`: set `QR_SIGNING_SECRET` and `SANDBOX_WEBHOOK_SECRET` to random values (the file shows a one-line generator), and optionally `SEED_DEMO_PASSWORD`. Then:

```bash
npm run db:deploy            # apply migrations
npm run db:seed              # demo club: 3 branches, staff, 61 members, ±6 weeks of classes, payments, leads, CMS
npm run dev                  # shared (watch) + API on :4000 + web on :3000
```

Open http://localhost:3000. API docs (Swagger) are at http://localhost:4000/api/docs.

After a reboot, run `npm run db:local:start` before `npm run dev`. To use a hosted PostgreSQL instead (Neon, Supabase, RDS), skip the `db:local:*` steps and put its connection string in `DATABASE_URL`.

### Demo accounts

All demo accounts share the password set in `SEED_DEMO_PASSWORD` (if empty, the seed generates one and prints it once).

| Role      | E-mail                                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| Owner     | `owner@fitclub.test`                                                               |
| Admin     | `admin@fitclub.test`                                                               |
| Manager   | `manager@fitclub.test`                                                             |
| Reception | `reception@fitclub.test` (Dostyk), `reception.astana@fitclub.test` (branch-scoped) |
| Sales     | `sales@fitclub.test`, `sales2@fitclub.test`                                        |
| Trainer   | `trainer@fitclub.test` … `trainer8@fitclub.test`                                   |
| Member    | `member@fitclub.test`, `member01` … `member60@fitclub.test`                        |

`npm run db:seed:reset` re-seeds from scratch, but **only** if the database holds nothing except demo users. It refuses otherwise and always refuses when `NODE_ENV=production`.

## Scripts

| Command                                                                          | What it does                                                                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                                    | Shared package watcher, API (watch mode) and web dev server                                          |
| `npm run build`                                                                  | Builds shared → API → web                                                                            |
| `npm start`                                                                      | Runs the built API and web app                                                                       |
| `npm run typecheck` / `npm run lint`                                             | Strict TypeScript and ESLint across all workspaces                                                   |
| `node scripts/check-i18n.mjs`                                                    | Verifies kk/ru/en key parity and that every key used in code exists                                  |
| `npm test`                                                                       | Shared domain tests (Vitest) and API unit and integration tests (Jest) against `TEST_DATABASE_URL`   |
| `npm run test:e2e`                                                               | Playwright end-to-end suite on an isolated `fitclub_e2e` database (see below)                        |
| `npm run db:migrate`                                                             | Create a new migration during development (`prisma migrate dev`)                                     |
| `npm run provision:owner -- --email you@club.kz --first Aigerim --last Saparova` | Creates the first owner account in a fresh production database and prints a one-time activation link |

## Testing

- **Unit (shared, Vitest).** Covers the membership state machine, freeze arithmetic, booking windows and late-cancel rules, pricing and promo math, payment transitions, and Almaty date math.
- **API (Jest + Supertest, real PostgreSQL).** Covers:
  - auth: sessions, CSRF, origin check, lockout, reset tokens;
  - RBAC and branch scoping, including BOLA checks;
  - concurrent booking: 15 members racing for 5 seats never overbook; no double booking; waitlist promotion;
  - membership purchase, renewal, freeze and unfreeze;
  - idempotent signed webhooks;
  - refunds capped at the captured amount;
  - QR forgery and replay;
  - analytics computed from real rows.
- **End-to-end (Playwright).** Covers:
  - registration, login, logout and protected-route redirects;
  - the sandbox membership purchase;
  - booking and cancelling a class;
  - the member dashboard and QR pass;
  - admin creates a session and reassigns its coach;
  - reception check-in, including the duplicate refusal;
  - sales lead pipeline;
  - permission restrictions;
  - language switching;
  - a smoke test of every public page.

`npm run test:e2e` (implemented in `scripts/e2e.mjs`) drops and recreates the schema of a database whose name must end in `_e2e`, then migrates, seeds and builds the web app into `.next-e2e`. Finally it starts the API on :4100 and the web app on :3100 and runs Playwright. Locally it uses your installed Chrome (`PW_CHANNEL=chrome`); in CI it uses Playwright's Chromium (`npm run test:e2e:install`). Use `node scripts/e2e.mjs --skip-build` to reuse the last build.

## Project layout

```
apps/api        NestJS API — modules per domain (auth, memberships, classes, payments, checkin, leads, content, analytics, jobs…)
  prisma/       schema, migrations (with CHECK constraints + partial unique indexes), seed
apps/web        Next.js app — app/[locale]/(site) public pages, /account member portal, /admin back office
  messages/     kk.json, ru.json, en.json
packages/shared domain rules, Zod schemas, permissions, notification templates (used by both apps)
scripts/        local PostgreSQL helper, e2e runner, i18n checker
tests/e2e       Playwright specs
docs/           architecture, security, deployment, API notes
```

## Documentation

- [docs/architecture.md](docs/architecture.md): system design, data model, key flows and the decisions behind them.
- [docs/security.md](docs/security.md): authentication, authorization, CSRF, QR signing, payments, privacy, and the threat model.
- [docs/deployment.md](docs/deployment.md): production configuration, a deployment checklist and the hosting options.
- [docs/api.md](docs/api.md): API conventions, error format, and how to reach Swagger.

## Known limitations

- **No real payment provider.** The sandbox adapter simulates a hosted payment page and signed webhooks. A real Kazakhstan acquirer (for example Kaspi Pay, Halyk ePay or CloudPayments) has to be implemented behind the `PaymentProvider` interface before going live. Production refuses to start with the sandbox enabled unless `DEMO_MODE=true` (the public demo, where every payment is labelled as a test).
- **E-mail is not configured.** Without `SMTP_*`, messages are stored in the outbox with status `SKIPPED` (visible under Admin → Settings → Notifications). In-app notifications work regardless.
- **Media storage: disk or database only.** Uploads go either to `UPLOAD_DIR` (`STORAGE_DRIVER=local`) or into PostgreSQL (`STORAGE_DRIVER=database`, used on Vercel). There is no S3/CDN driver yet.
- **Demo content.** The photos are Unsplash stock images, flagged as "Demo photo" in the UI. All club data is fictional.
- **Hosting.** The demo targets Vercel + Neon free tiers (see [docs/deployment.md](docs/deployment.md#demo-hosting-vercel--neon)). On the Hobby plan, background jobs run once a day.
