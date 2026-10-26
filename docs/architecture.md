# Architecture

## Overview

```
Browser ──► Next.js (apps/web) ──rewrite /api, /uploads──► NestJS API (apps/api) ──► PostgreSQL
              │  server components read the API directly        │
              │  (ISR for public content, no-store for sessions) ├─ @nestjs/schedule jobs (pg advisory locks)
              └─ client components call /api via the proxy       └─ local media storage (/uploads)
                                     packages/shared — domain rules, Zod schemas, permissions, templates
```

- **One origin for the browser.** Next.js rewrites `/api/*` and `/uploads/*` to the API, so the session cookie is first-party with `SameSite=Lax` and CORS never comes into play.
- **The API is the only authority.** The web app hides UI the user cannot use, but every rule is enforced in the API: permissions, branch scope, booking windows, capacity and membership state. The `proxy.ts` redirect for signed-out visitors is only a UX shortcut.
- **Shared domain package.** The pure functions in `packages/shared/src/domain` cover the membership state machine, freeze arithmetic, the booking policy, pricing and promos, payment transitions and Almaty calendar math. The API uses them to decide and the web app uses them to explain, so the two cannot disagree. They are unit-tested in isolation.

## Data model (Prisma, ~45 models)

- **Identity.** `User` has a `Profile`, plus a `Member` or a `StaffMember` row. Sessions are `AuthSession`, storing only the token hash. Reset and invite tokens are `AuthToken`, hashed and single-use.
- **Club.** A `Branch` has `Room`s and opening hours. Staff can be scoped to one branch.
- **Memberships.** A `MembershipPlan` is the catalog entry. A `Membership` stores a **snapshot** of the plan's price, duration, visit limit, branches and freeze rules at the time of sale, so editing a plan never rewrites history. `MembershipFreeze` and `MembershipEvent` form an append-only timeline. The membership has an optimistic `version` column.
- **Classes.**
  - Catalog: `ClassCategory` and `ClassType`.
  - Scheduling: recurring `ClassSchedule` rules generate dated `ClassSession`s four weeks ahead.
  - Participation: `Booking` and `WaitlistEntry`.
- **Check-in.** `CheckIn` records accepted and rejected attempts. A partial unique index allows only one _accepted_ check-in per member, branch and club day.
- **Payments.**
  - `Payment` carries a state machine, an `isTest` flag and a reconciliation status.
  - `PaymentEvent` is unique on `(provider, eventId)`, which makes webhooks idempotent.
  - `Refund`; invoices are numbered `FC-YYYY-000123` from a per-year counter.
- **CRM.** `Lead` and `LeadActivity`, covering notes, calls and tasks with due dates.
- **Content.**
  - `ContentBlock`: page sections as versioned JSON, validated against Zod schemas per block.
  - Collections: blog posts, FAQ, gallery, testimonials, facilities and announcements.
  - Localized text is stored as `{ kk, ru, en }` JSON.
- **Training.** `Exercise`, `TrainingProgram`, `ProgramDay` and `ProgramExercise`, assigned to members with `TrainingLog` entries.
- **Ops.** `Notification` is stored language-neutral (template key plus params) and rendered in the reader's language. `EmailOutbox`, `AuditLog`, `ClubSettings` (a single validated JSON row), `PromoCode`/`PromoRedemption`.

Database-level guarantees sit on top of the schema in the init migration:

- `CHECK (bookedCount >= 0 AND bookedCount <= capacity)` on sessions;
- money checks: non-negative amounts, and `amount = subtotal - discount` on payments;
- valid date ranges on sessions, memberships and freezes;
- unique `(sessionId, memberId)` on bookings and waitlist entries;
- partial unique indexes: one accepted check-in per member, branch and day, and one open (pending, active or frozen) membership per plan;
- a case-insensitive name search index.

## Key flows

### Booking under concurrency

`BookingsService.book` runs in a transaction:

1. lock the member row (`FOR UPDATE`) so one member's parallel requests serialize;
2. check eligibility: an active membership that includes classes and covers the branch, visits left, the booking window, the per-member upcoming limit, and no time overlap;
3. take a seat with `UPDATE "ClassSession" SET "bookedCount" = "bookedCount" + 1 WHERE id = $1 AND "bookedCount" < capacity AND status = 'SCHEDULED'`;
4. if no row was updated, the class is full. Seats are therefore never oversold even across API instances, and the CHECK constraint backs this up.

Cancelling releases the seat and promotes the first waitlisted member who is still eligible. Promotion is skipped inside the cutoff window. A late cancellation (inside `freeCancellationHours`) is recorded as `LATE_CANCELLED`.

### Membership lifecycle

`PENDING → ACTIVE → (FROZEN ↔ ACTIVE) → EXPIRED | CANCELLED`

- Transitions are validated in `shared/domain/membership.ts` and applied with optimistic concurrency.
- **Freezes** are scheduled: a job activates them and extends `endsAt` by the frozen days. Unfreezing early returns the unused days.
- **Renewal** queues a new membership that starts when the current one ends.
- **Activation** happens only when the payment provider confirms payment (a webhook or an offline payment recorded by staff), never on redirect alone.

### Payments

`PaymentProvider` is an interface with `createCheckout`, `parseWebhook` and `refund`. The only implementation is `SandboxPaymentProvider`:

1. it creates a hosted-checkout reference;
2. the `/checkout/sandbox` page lets the user simulate success, decline or cancel;
3. the simulation sends an **HMAC-signed webhook** to the API, which verifies it, de-duplicates by event id, moves the payment through its state machine and activates the membership in the same transaction.

Offline payments (cash, card terminal, bank transfer) are recorded by staff with a reference, and every money action is audited. Refunds are capped at the captured amount and can optionally cancel the membership.

### Check-in QR

`FC1.<memberId>.<expiresAt>.<hmac>`: the code is signed with `QR_SIGNING_SECRET`, valid for 120 s, and refreshed by the portal every minute. Staff can bump `Member.qrVersion` to revoke every outstanding code. Reception can also search by name, e-mail, phone or member number, and a manual override requires the `checkin.override` permission and a reason (audited).

### Notifications and e-mail

Domain events create `Notification` rows (template key plus params). They are rendered per reader locale at read time, so a member who switches language sees past notifications in the new language. E-mails go through `EmailOutbox` with retries. Without SMTP they are stored as `SKIPPED` rather than silently dropped.

### Background jobs

Seven `@Cron` jobs: membership maintenance (activate scheduled freezes and renewals, expire), expiry reminders, session generation, session completion, class reminders, e-mail retry and nightly cleanup. Each job takes a PostgreSQL advisory lock, so running several API instances is safe. Set `JOBS_ENABLED=false` on all but one instance if you prefer.

### Analytics

Every metric is computed from database rows at request time. Nothing is pre-aggregated or hardcoded, and test payments are excluded unless the user explicitly includes them. `METRIC_DEFINITIONS` in the analytics module documents each formula and is shown in the admin UI.

## Web app structure

- `app/[locale]/(site)`: public pages are server components that read via `publicApi` (ISR, 60 s, `content` tag). When the CMS publishes, `/cms-revalidate` is called for on-demand revalidation. Pages render on first request, not at build time, so builds never depend on a running API.
- `app/[locale]/account` and `app/[locale]/admin` are forced dynamic. The layout loads `/auth/me` with the visitor's cookie and redirects if needed; the pages are client components using TanStack Query.
- **i18n.** next-intl with `localePrefix: 'always'`. Messages live in `apps/web/messages`, and `scripts/check-i18n.mjs` enforces key parity. Validation errors are message keys translated on the client. Dates and numbers go through `lib/intl.ts`, which renders Kazakh deterministically because browsers often ship incomplete `kk` ICU data.
- **Design.** Ink/bone/ember tokens in `globals.css`, Unbounded and Inter fonts (Cyrillic-ext), light and dark themes. Motion respects `prefers-reduced-motion`.

## Decisions

| Decision                                  | Why                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Opaque session cookie (not JWT)           | Instant revocation (logout everywhere, suspension, role change); only hashes in the DB                                 |
| NestJS + Next.js rather than Next-only    | Clear API boundary for future mobile apps and integrations; Swagger contract; background jobs live in one process type |
| Plan snapshots on memberships             | Price and rule changes never alter what a member bought                                                                |
| Seat counter + conditional UPDATE         | Single-statement atomicity without serializable isolation or advisory locks on the hot path                            |
| Language-neutral notifications            | One stored event, rendered in any of the three languages                                                               |
| Local PostgreSQL helper instead of Docker | Works on Windows without virtualization; isolated port and data dir                                                    |
