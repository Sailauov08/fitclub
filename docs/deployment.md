# Deployment

This guide covers two setups: the public **demo** on Vercel + Neon (free tiers), and what a real club would need.

## Demo hosting: Vercel + Neon

Two Vercel projects deploy from this monorepo. Both run in `fra1` (Frankfurt), the closest Vercel region to Kazakhstan, next to a Neon database in `aws-eu-central-1`.

| Vercel project | Root Directory | How it runs                                                                                                                                                                  |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fitclub-api`  | `apps/api`     | NestJS zero-config: `src/main.ts` becomes one Vercel Function. `vercel.json` runs `vercel-build` (builds `packages/shared`, `prisma generate`) and registers the daily cron. |
| `fitclub-web`  | `apps/web`     | Next.js. `vercel.json` builds `packages/shared` first. `/api/*` and `/uploads/*` are rewritten to the API project, so cookies stay first-party.                              |

What changes compared with a long-running server:

- **Uploads** use `STORAGE_DRIVER=database`. Images (≤ 5 MB) are stored in the `StoredFile` table and served from `/uploads/…` with immutable caching, because Vercel Functions have no writable disk.
- **Background jobs.** `JOBS_ENABLED=false`, so the API runs no in-process scheduler. Vercel Cron calls `GET /api/cron/daily` (bearer `CRON_SECRET`) once a day at 20:00 UTC (01:00 Almaty). The Hobby plan allows only daily crons, so expiries, freeze activation and session generation happen once a day. Class reminders are effectively disabled.
- **Payments.** `DEMO_MODE=true` keeps the labelled sandbox checkout available in production. No real payment provider is connected and no money moves.
- **E-mail.** No SMTP: e-mails are stored as `SKIPPED`, while in-app notifications work.
- **Database connections.** `DATABASE_URL` is Neon's **pooled** URL, used by the app. `DIRECT_URL` is the direct URL, used by `prisma migrate deploy`.

### Environment variables

`fitclub-api`:

| Variable                                                     | Value                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                               | Neon pooled connection string (added by the Neon integration)                                 |
| `WEB_ORIGIN`, `PUBLIC_WEB_URL`                               | `https://<web project>.vercel.app`                                                            |
| `COOKIE_SECURE`                                              | `true`                                                                                        |
| `TRUST_PROXY`                                                | `1`                                                                                           |
| `CLIENT_IP_HEADER`                                           | `x-vercel-forwarded-for` (verify after the first deploy that sessions record real client IPs) |
| `QR_SIGNING_SECRET`, `SANDBOX_WEBHOOK_SECRET`, `CRON_SECRET` | Random values, 32+ bytes                                                                      |
| `PAYMENTS_SANDBOX_ENABLED`, `DEMO_MODE`                      | `true`                                                                                        |
| `STORAGE_DRIVER`                                             | `database`                                                                                    |
| `JOBS_ENABLED`, `EMAIL_DEV_LOG`, `SWAGGER_ENABLED`           | `false`                                                                                       |

`fitclub-web`:

| Variable               | Value                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `API_ORIGIN`           | `https://<api project>.vercel.app` (read at build time — redeploy the web after changing it) |
| `NEXT_PUBLIC_SITE_URL` | `https://<web project>.vercel.app`                                                           |

### First deployment

1. `npx vercel login`, then create and link the two projects with their Root Directories.
2. Add Neon to `fitclub-api` through the Vercel Marketplace (Storage → Neon), choosing region `aws-eu-central-1`. Vercel then stores the connection strings in the project.
3. Pull the database URLs locally with `npx vercel env pull` in `apps/api`. Run `npx prisma migrate deploy`, then the demo seed. The seed refuses `NODE_ENV=production`, so run it from your machine with `NODE_ENV=development`.
4. Deploy the API. Set the web's `API_ORIGIN` to the API URL and deploy the web. Then set `WEB_ORIGIN` and `PUBLIC_WEB_URL` on the API and redeploy it.

Cold starts: the first request after the function or database has been idle can take 1–3 s, because Nest boots and Neon wakes from autosuspend. Pages that come from the ISR cache are not affected.

## Production for a real club

### Topology

| Component        | Requirement                                                     | Options                                                                          |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| PostgreSQL 15+   | Managed, daily backups, point-in-time recovery                  | Neon, Supabase, AWS RDS, Yandex Managed PostgreSQL, PS Cloud (KZ data residency) |
| API (`apps/api`) | Long-running Node 22+ process (cron jobs), HTTPS behind a proxy | Render, Railway, Fly.io, a VPS with systemd/pm2, or containers                   |
| Web (`apps/web`) | Node 22+ (`next start`) or Vercel                               | Vercel, or the same host as the API                                              |
| Media            | Persistent disk now; S3-compatible storage once implemented     | Volume, or S3/R2 with a CDN                                                      |
| E-mail           | SMTP relay                                                      | Postmark, SES, Mailgun, Unisender                                                |

Data-residency note: Kazakhstan's personal data law (No. 94-V) requires KZ citizens' personal data to be stored on servers in Kazakhstan. For a real club, choose a KZ-hosted database and application servers, and get legal confirmation.

### Environment

#### API (`apps/api/.env`)

| Variable                                                             | Production value                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                                           | `production`                                                                      |
| `DATABASE_URL`                                                       | Pooled connection string (`?sslmode=require`)                                     |
| `WEB_ORIGIN`, `PUBLIC_WEB_URL`                                       | `https://your-domain`                                                             |
| `COOKIE_SECURE`                                                      | `true` (enforced)                                                                 |
| `TRUST_PROXY`                                                        | Number of proxies in front of the API                                             |
| `QR_SIGNING_SECRET`                                                  | 32+ random bytes. Rotating it invalidates outstanding QR codes, which is harmless |
| `PAYMENTS_SANDBOX_ENABLED`                                           | `false` (enforced unless `DEMO_MODE=true`) — a real provider must be implemented  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Your relay                                                                        |
| `EMAIL_DEV_LOG`                                                      | `false` (enforced)                                                                |
| `JOBS_ENABLED`                                                       | `true` on at least one instance                                                   |
| `SWAGGER_ENABLED`                                                    | `false` unless the docs should be public                                          |
| `STORAGE_DRIVER`, `UPLOAD_DIR`                                       | `local` plus a path on a persistent volume                                        |

#### Web (`apps/web` environment)

| Variable               | Value                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `API_ORIGIN`           | Internal URL of the API, used for rewrites and server-side reads. Read at **build time** for rewrites, so rebuild when it changes |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` (canonical URLs, sitemap)                                                                                   |

### Release steps

```bash
npm ci
npm run build                                  # shared → api (prisma generate + nest build) → web
npm run db:deploy                              # prisma migrate deploy — run once per release, before starting the new API
npm run provision:owner -- --email owner@club.kz --first Name --last Surname   # first release only
npm start                                      # or run apps/api `node dist/main.js` and apps/web `next start` separately
```

- Never run `db:seed` or `db:seed:reset` against production. Both refuse when `NODE_ENV=production`.
- Health check: `GET /api/health` returns the database status.
- After deploying, sign in as the owner. Complete the settings: club details, booking and membership policy. Create branches and rooms, plans, class types and schedules, then invite staff.

### Go-live checklist

- [ ] Real payment provider implemented and tested in the provider's test mode; sandbox disabled
- [ ] SMTP configured; SPF, DKIM and DMARC records published; test e-mails received
- [ ] HTTPS on the web domain; `COOKIE_SECURE=true`; `TRUST_PROXY` correct
- [ ] Database backups and a restore drill
- [ ] Persistent storage for uploads (or the S3 driver)
- [ ] Legal texts (privacy policy, terms) reviewed by a lawyer and replaced in the CMS
- [ ] Demo content removed: the seed is not run in production, so there is nothing to remove
- [ ] Monitoring and alerting on `/api/health` and error logs
- [ ] `npm audit` reviewed

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests:

1. installs dependencies, typechecks, lints and runs the i18n check;
2. runs the unit and integration tests against a PostgreSQL service container;
3. builds all workspaces;
4. runs the Playwright E2E suite.

CI only checks; it does not deploy anything.
