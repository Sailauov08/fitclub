<div align="center">

<img src="docs/assets/banner.png" alt="FITCLUB — fitness club platform: public website, member portal and admin back office" width="100%" />

<h3>A production-grade fitness club platform for Kazakhstan</h3>

<p>
  Public website, member portal and admin back office: three surfaces on one API, one database and one permission model.<br/>
  Three languages (Қазақша · Русский · English), tenge pricing, Asia/Almaty time.
</p>

<p>
  <a href="https://fitclub-web-azure.vercel.app"><b>🌐 Live demo</b></a> ·
  <a href="#-screenshots"><b>📸 Screenshots</b></a> ·
  <a href="#-architecture"><b>🧭 Architecture</b></a> ·
  <a href="#-getting-started"><b>🚀 Getting started</b></a> ·
  <a href="docs/architecture.md"><b>📚 Docs</b></a>
</p>

<p>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
  <img alt="NestJS 11" src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" />
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Prisma 7" src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" />
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Playwright" src="https://img.shields.io/badge/E2E-Playwright-2EAD33?logo=playwright&logoColor=white" />
  <img alt="Deployed on Vercel" src="https://img.shields.io/badge/Deployed-Vercel-000000?logo=vercel&logoColor=white" />
</p>

<p>
  <img alt="126 automated tests" src="https://img.shields.io/badge/tests-126%20passing-2EAD33" />
  <img alt="3 languages" src="https://img.shields.io/badge/i18n-kk%20%C2%B7%20ru%20%C2%B7%20en-E8562A" />
  <img alt="23 public pages" src="https://img.shields.io/badge/public%20pages-23-E8562A" />
</p>

</div>

---

> [!NOTE]
> **This is a portfolio project for a fictional club.** All data is demo data. Payments go through a clearly labelled **sandbox**, so no money moves. Feel free to click around.

## 🔑 Try the live demo

<div align="center">

### 👉 [fitclub-web-azure.vercel.app](https://fitclub-web-azure.vercel.app) 👈

**Sign in:** [fitclub-web-azure.vercel.app/en/login](https://fitclub-web-azure.vercel.app/en/login) · **Password for every account:** `Fitclub-Demo-2026`

</div>

Each account opens a different panel. Staff land in the **admin back office**, and members land in the **member portal**.

| Role                           | E-mail                          | Password            | What to try                                                                     |
| ------------------------------ | ------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| 👑 **Owner**                   | `owner@fitclub.test`            | `Fitclub-Demo-2026` | Everything: staff and roles, club settings, audit log, analytics with revenue   |
| 🛡️ **Admin**                   | `admin@fitclub.test`            | `Fitclub-Demo-2026` | Full back office: members, payments and refunds, plans, promotions, website CMS |
| 📊 **Manager**                 | `manager@fitclub.test`          | `Fitclub-Demo-2026` | Schedule, members, leads, coaches, analytics (no staff or settings)             |
| 🧾 **Reception**               | `reception@fitclub.test`        | `Fitclub-Demo-2026` | Check-in by QR or search, selling memberships, booking members into classes     |
| 🧾 **Reception (Astana only)** | `reception.astana@fitclub.test` | `Fitclub-Demo-2026` | The same, but **branch-scoped**: sees only FITCLUB Yesil                        |
| 💼 **Sales**                   | `sales@fitclub.test`            | `Fitclub-Demo-2026` | Leads pipeline: activities, follow-ups, converting a lead into a member         |
| 🏋️ **Coach**                   | `trainer@fitclub.test`          | `Fitclub-Demo-2026` | Own sessions and attendance, assigned clients, training programmes              |
| 🙋 **Member**                  | `member@fitclub.test`           | `Fitclub-Demo-2026` | Member portal: active membership, QR pass, bookings, freeze, payments           |

**Quick tour:**

1. Sign in as `member@` → **Check-in QR** → copy the code.
2. Sign in as `reception@` → **Reception** → paste the code. You get an instant check-in, and a second try is refused.
3. Register your own account → **Memberships** → buy a plan with the **sandbox checkout** → book a class.
4. Switch the language (🌐 KK / RU / EN) in the header. Every page, date and price is localised.

> [!WARNING]
> These are **public demo accounts**: anyone can sign in and change the demo data. The club, people and payments are fictional. Please don't enter real personal data.

## ✨ Highlights

<table>
<tr>
<td width="33%" valign="top">

### 🌐 Public website

- 23 pages in **kk / ru / en**
- Live schedule, coaches, classes
- Memberships with plan comparison
- Blog, FAQ, gallery, locations
- Lead and trial forms feeding the CRM
- SEO: sitemap, metadata, hreflang
- Light and dark themes, responsive

</td>
<td width="33%" valign="top">

### 🙋 Member portal

- Buy, renew and **freeze** memberships
- Book classes, join **waitlists**
- Rotating **QR pass** for entry
- Training programmes and workout log
- Payments history and printable invoices
- Notifications in the member's language

</td>
<td width="33%" valign="top">

### 🛠️ Admin back office

- **Reception** check-in by QR or search
- Weekly calendar and recurring schedules
- Members CRM, leads pipeline
- Payments, refunds, reconciliation
- Plans, promotions, CMS for the site
- Analytics from real data, audit log
- 6 roles with a permission matrix

</td>
</tr>
</table>

### Engineering decisions worth a look

|                                 |                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🔒 **Concurrency-safe booking** | A seat is taken with a single conditional `UPDATE … WHERE bookedCount < capacity`, backed by a `CHECK` constraint. In the integration tests, 15 members racing for 5 seats never overbook. |
| 🔁 **Membership state machine** | `PENDING → ACTIVE ⇄ FROZEN → EXPIRED / CANCELLED`, validated in a shared package. A membership stores a snapshot of its plan, so editing a plan never rewrites what a member bought.       |
| 💳 **Idempotent payments**      | A provider abstraction with HMAC-signed webhooks, de-duplicated by event id. Activation happens only on a verified provider event.                                                         |
| 🎟️ **Non-forgeable QR**         | `FC1.<member>.<expiry>.<hmac>`, valid for 120 s and revocable per member. A partial unique index allows one accepted check-in per member, branch and day.                                  |
| 🛡️ **Security by default**      | Opaque HttpOnly sessions (only hashes stored), double-submit CSRF plus an origin check, Argon2id, lockout, rate limits, branch-scoped RBAC and an audit trail.                             |
| 🌍 **Real i18n**                | 1,690 keys in each of three languages, verified in CI. Kazakh dates and numbers are formatted deterministically because browsers ship incomplete `kk` locale data.                         |

## 📸 Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screenshots/home-kk.jpg" alt="Home page in Kazakh" /><p align="center"><sub><b>Home</b> · Kazakh</sub></p></td>
<td width="50%"><img src="docs/screenshots/memberships-dark.jpg" alt="Memberships in dark mode" /><p align="center"><sub><b>Memberships</b> · dark mode</sub></p></td>
</tr>
<tr>
<td><img src="docs/screenshots/schedule-ru.jpg" alt="Class schedule in Russian" /><p align="center"><sub><b>Class schedule</b> · Russian</sub></p></td>
<td><img src="docs/screenshots/trainer-en.jpg" alt="Coach profile" /><p align="center"><sub><b>Coach profile</b></sub></p></td>
</tr>
</table>

<details open>
<summary><b>Admin back office</b></summary>
<br/>
<table>
<tr>
<td width="50%"><img src="docs/screenshots/admin-overview.jpg" alt="Admin overview dashboard" /><p align="center"><sub><b>Overview</b>: live KPIs and revenue</sub></p></td>
<td width="50%"><img src="docs/screenshots/admin-analytics.jpg" alt="Analytics" /><p align="center"><sub><b>Analytics</b>: every formula documented</sub></p></td>
</tr>
<tr>
<td><img src="docs/screenshots/admin-schedule.jpg" alt="Weekly schedule" /><p align="center"><sub><b>Schedule</b>: capacity at a glance</sub></p></td>
<td><img src="docs/screenshots/admin-members.jpg" alt="Members CRM" /><p align="center"><sub><b>Members</b>: filters, export, statuses</sub></p></td>
</tr>
<tr>
<td><img src="docs/screenshots/admin-checkin.jpg" alt="Reception check-in" /><p align="center"><sub><b>Reception</b>: QR scanner and search</sub></p></td>
<td><img src="docs/screenshots/admin-leads.jpg" alt="Leads pipeline" /><p align="center"><sub><b>Leads</b>: sales pipeline</sub></p></td>
</tr>
</table>
</details>

<details open>
<summary><b>Member portal and mobile</b></summary>
<br/>
<table>
<tr>
<td width="50%"><img src="docs/screenshots/account-overview.jpg" alt="Member dashboard" /><p align="center"><sub><b>Member dashboard</b></sub></p></td>
<td width="50%"><img src="docs/screenshots/account-membership.jpg" alt="Membership management" /><p align="center"><sub><b>Membership</b>: freeze, renew, history</sub></p></td>
</tr>
</table>
<table>
<tr>
<td width="33%"><img src="docs/screenshots/mobile-home.jpg" alt="Mobile home" /></td>
<td width="33%"><img src="docs/screenshots/mobile-schedule.jpg" alt="Mobile schedule" /></td>
<td width="33%"><img src="docs/screenshots/mobile-account.jpg" alt="Mobile member dashboard" /></td>
</tr>
</table>
</details>

## 🧭 Architecture

```mermaid
flowchart LR
    subgraph Browser
        U[Visitor / Member / Staff]
    end

    subgraph Vercel["Vercel · fra1"]
        direction TB
        W["fitclub-web<br/>Next.js 16 App Router<br/>ISR public pages · portal · admin"]
        A["fitclub-api<br/>NestJS 11 · one serverless function<br/>REST + Swagger"]
        C(["Vercel Cron<br/>daily jobs"])
    end

    subgraph Neon["Neon · eu-central-1"]
        DB[("PostgreSQL<br/>~45 Prisma models<br/>CHECK + partial unique indexes")]
    end

    S["packages/shared<br/>domain rules · Zod schemas<br/>permissions · templates"]

    U -- "HTTPS (one origin)" --> W
    W -- "rewrite /api/* and /uploads/*<br/>first-party cookies" --> A
    W -. "server components:<br/>ISR reads" .-> A
    C -- "Bearer CRON_SECRET" --> A
    A -- "Prisma + pg (pooled)" --> DB
    S -. imported by .-> W
    S -. imported by .-> A
```

- **One origin for the browser.** Next.js proxies `/api` and `/uploads`, so the session cookie stays first-party and CORS never comes into play.
- **The API is the only authority.** The UI hides what you cannot do, but every rule is enforced server-side: permissions, branch scope, booking windows, capacity and membership state.
- **A shared domain package** holds the pure functions that both apps use. The API uses them to decide, the UI uses them to explain, so the two cannot disagree.

### Membership lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: purchase
    PENDING --> ACTIVE: provider confirms payment
    PENDING --> CANCELLED: payment fails / expires
    ACTIVE --> FROZEN: scheduled freeze starts
    FROZEN --> ACTIVE: freeze ends (end date extended)
    ACTIVE --> EXPIRED: end date reached / visits used up
    ACTIVE --> CANCELLED: staff cancels (refund optional)
    FROZEN --> CANCELLED
    EXPIRED --> [*]
    CANCELLED --> [*]
```

### Booking a class

```mermaid
sequenceDiagram
    autonumber
    actor M as Member
    participant W as Web (Next.js)
    participant A as API (NestJS)
    participant D as PostgreSQL

    M->>W: Click "Book"
    W->>A: POST /api/me/bookings (cookie + X-CSRF-Token)
    A->>A: Verify session, CSRF, origin
    A->>D: BEGIN · SELECT member … FOR UPDATE
    A->>A: Eligibility: active plan, branch, visits, window, overlaps
    A->>D: UPDATE ClassSession SET bookedCount+1 WHERE bookedCount < capacity
    alt seat taken
        A->>D: INSERT Booking · COMMIT
        A-->>W: 201 CONFIRMED
        W-->>M: "You're booked!"
    else class is full
        A->>D: ROLLBACK
        A-->>W: 409 · offer waitlist
    end
```

### Core data model (simplified)

```mermaid
erDiagram
    USER ||--o| MEMBER : "is a"
    USER ||--o| STAFF_MEMBER : "is a"
    BRANCH ||--o{ ROOM : has
    MEMBERSHIP_PLAN ||--o{ MEMBERSHIP : "snapshotted into"
    MEMBER ||--o{ MEMBERSHIP : holds
    MEMBERSHIP ||--o{ MEMBERSHIP_FREEZE : "paused by"
    MEMBERSHIP ||--o{ PAYMENT : "paid by"
    PAYMENT ||--o{ PAYMENT_EVENT : "idempotent events"
    CLASS_TYPE ||--o{ CLASS_SESSION : scheduled
    ROOM ||--o{ CLASS_SESSION : hosts
    TRAINER ||--o{ CLASS_SESSION : leads
    CLASS_SESSION ||--o{ BOOKING : "seats"
    CLASS_SESSION ||--o{ WAITLIST_ENTRY : queue
    MEMBER ||--o{ BOOKING : makes
    MEMBER ||--o{ CHECK_IN : "enters with"
    LEAD ||--o{ LEAD_ACTIVITY : "worked through"
```

## 🧰 Tech stack

| Layer       | Choice                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web**     | Next.js 16 (App Router, React 19), Tailwind CSS 4, Radix-based UI kit, Motion, Lucide, next-intl, React Hook Form + Zod, TanStack Query, Recharts |
| **API**     | NestJS 11, REST + OpenAPI (Swagger), Zod validation, Argon2id, pino logs, `@nestjs/schedule` / Vercel Cron                                        |
| **Data**    | PostgreSQL 15+ via Prisma 7 (`@prisma/adapter-pg`), Neon in production                                                                            |
| **Shared**  | `packages/shared`: membership state machine, booking policy, pricing, Almaty dates, Zod schemas, RBAC matrix, notification templates              |
| **Quality** | TypeScript strict, ESLint, Prettier, i18n key checker, Vitest, Jest + Supertest, Playwright, GitHub Actions                                       |
| **Hosting** | Vercel (two projects, `fra1`) + Neon (`aws-eu-central-1`)                                                                                         |

## 🧪 Testing

| Suite           | Tool                                |  Tests | What it proves                                                                                                                         |
| --------------- | ----------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------- |
| Domain          | Vitest                              | **44** | Membership transitions, freeze maths, booking windows, late-cancel rules, pricing and promos, Almaty dates                             |
| API integration | Jest + Supertest on real PostgreSQL | **63** | Auth, CSRF, lockout, RBAC and BOLA, overbooking races, waitlists, purchases, webhooks, refunds, QR forgery, analytics, serverless mode |
| End-to-end      | Playwright                          | **19** | Register → buy → book → cancel; admin, reception and sales flows; permissions; language switching; every public page                   |

```bash
npm test            # domain + API tests (needs the local PostgreSQL helper)
npm run test:e2e    # isolated fitclub_e2e database, builds and runs the full stack on :3100/:4100
```

## 🚀 Getting started

**Requirements:** Node.js 22+ (24 recommended) and PostgreSQL 15+ binaries. No Docker needed: the helper creates a private cluster on port 54329 and never touches an existing server.

```bash
npm install
npm run db:local:init                              # private cluster with fitclub + fitclub_test databases
cp apps/api/.env.example apps/api/.env             # then set QR_SIGNING_SECRET and SANDBOX_WEBHOOK_SECRET
cp apps/web/.env.example apps/web/.env.local
npm run db:deploy                                  # apply migrations
npm run db:seed                                    # demo club: 3 branches, staff, 61 members, classes, payments, leads
npm run dev                                        # web :3000 · API :4000 · Swagger :4000/api/docs
```

After a reboot, run `npm run db:local:start` before `npm run dev`. Locally, the seeded staff accounts (`owner@`, `admin@`, `manager@`, `reception@`, `sales@` and `trainer@fitclub.test`) and members share the `SEED_DEMO_PASSWORD` from `apps/api/.env`.

<details>
<summary><b>All scripts</b></summary>

| Command                                                       | What it does                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                                                 | Shared watcher, API (watch) and web dev server                          |
| `npm run build` / `npm start`                                 | Production build of shared → API → web, and running it                  |
| `npm run typecheck` · `npm run lint` · `npm run format:check` | Strict TypeScript, ESLint, Prettier                                     |
| `node scripts/check-i18n.mjs`                                 | kk/ru/en key parity plus every key used in code exists                  |
| `npm test` · `npm run test:e2e`                               | Unit and integration tests, and the Playwright suite                    |
| `npm run db:migrate`                                          | New migration during development                                        |
| `npm run db:seed:reset`                                       | Re-seed, but only if the database holds nothing except demo users       |
| `npm run provision:owner -- --email you@club.kz`              | First owner for an empty production database (one-time activation link) |
| `npm run screenshots`                                         | Regenerate the README screenshots and banner from the local stack       |

</details>

## ☁️ Deployment

The live demo runs on **Vercel + Neon free tiers**:

- `apps/web` and `apps/api` are two Vercel projects in `fra1`. The NestJS app becomes one serverless function.
- Uploads are stored in PostgreSQL (`STORAGE_DRIVER=database`), because serverless functions have no writable disk.
- Background jobs run from a daily **Vercel Cron**, authenticated with `CRON_SECRET`.
- `DEMO_MODE=true` keeps the labelled sandbox checkout available in production. Without it, production refuses to start with the sandbox enabled.

Step-by-step setup, environment variables and the go-live checklist for a real club are in [docs/deployment.md](docs/deployment.md).

## 📁 Project structure

```
fitclub/
├─ apps/
│  ├─ web/                 Next.js — app/[locale]/(site) · /account · /admin
│  │  └─ messages/         kk.json · ru.json · en.json (1,690 keys each)
│  └─ api/                 NestJS — modules per domain (auth, memberships, classes, payments, checkin, leads, content, analytics, jobs…)
│     └─ prisma/           schema, migrations with CHECK constraints and partial indexes, seed
├─ packages/shared/        domain rules, Zod schemas, permissions, notification templates
├─ tests/e2e/              Playwright specs
├─ scripts/                local PostgreSQL helper, e2e runner, i18n checker, screenshot tools
└─ docs/                   architecture · security · deployment · API · screenshots
```

## 📚 Documentation

- [Architecture](docs/architecture.md): data model, key flows and the decisions behind them
- [Security](docs/security.md): auth, RBAC, CSRF, QR signing, payments, privacy, the dependency audit
- [Deployment](docs/deployment.md): Vercel + Neon demo hosting and a production checklist
- [API](docs/api.md): conventions, error format, endpoint groups (Swagger in development)

## 🗺️ Limitations and roadmap

- [ ] **Real payment provider** (Kaspi Pay / Halyk ePay / CloudPayments) behind the existing `PaymentProviderAdapter` interface. Today only the sandbox is connected.
- [ ] **E-mail delivery.** Without SMTP, messages are kept in an outbox as `SKIPPED`; in-app notifications work.
- [ ] **Object storage** (S3/R2 + CDN) for uploads; today they are stored on disk or in PostgreSQL.
- [ ] **More frequent background jobs.** On the Vercel Hobby plan, cron runs daily, so class reminders are effectively off.

## 👤 Author

**Bekarys Sailauov** · [@Sailauov08](https://github.com/Sailauov08)

<sub>Demo photos are Unsplash stock images and are labelled "Demo photo" on the site. The club, people and data are fictional.</sub>
