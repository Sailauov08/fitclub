# Security

## Authentication

- **Passwords** are hashed with Argon2id (19 MiB, t=2). The policy is at least 10 characters with letters and a digit, checked the same way on client and server.
- **Sessions:**
  - each session uses a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`fc_session`);
  - the cookie is `Secure` whenever `COOKIE_SECURE=true`, which is required in production;
  - only the SHA-256 hash is stored;
  - sessions expire after `sessionTtlDays` (club setting); last use is tracked for the device list.
- **Session revocation.** Changing a password signs out the user's other sessions. Suspending an account or changing a staff role revokes all of that user's sessions. Members can see their active devices and sign out of each one.
- **Lockout.** After `maxFailedLogins` failures, the account is locked for `lockoutMinutes`. Login replies are identical whether or not the e-mail exists.
- **Rate limiting** (Nest throttler) applies globally, with tighter limits on auth endpoints.
- **Tokens.** Reset tokens last 1 h and invite tokens 72 h. They are hashed, single-use, and invalidated by a newer token.
- **First owner.** `provision:owner` creates the account without a password and prints a one-time activation link. Nothing is seeded in production.

## CSRF and origin checks

Unsafe requests (POST, PUT, PATCH, DELETE) must:

1. carry `X-CSRF-Token`, which must equal the readable `fc_csrf` cookie (double submit) _and_ match the hash bound to the session;
2. not come from a foreign origin: if an `Origin` header is present, it must equal `WEB_ORIGIN`.

The signed sandbox webhook is the only exemption; it is authenticated by its HMAC signature instead.

## Authorization

- The permission matrix lives in `packages/shared/src/permissions.ts`; roles are Owner, Admin, Manager, Receptionist, Trainer and Sales.
- A global `AuthGuard` denies by default. Endpoints opt in with `@Public()`, `@MemberOnly()` or `@RequirePermissions([...])`.
- **Branch scope.** Staff with a branch only see and act on that branch's members, sessions, payments and check-ins, and the services enforce this in their queries (BOLA-tested).
- **Trainers** see only their assigned members and their own sessions and programs.
- **Role changes.** Nobody can change their own role or assign a role at or above their own rank (`canChangeStaffRole`), and the last owner cannot be removed.
- **Member endpoints** always use the session's member id, never an id from the request.

## Data integrity and audit

- Money, membership, access and role actions are written to `AuditLog`, which records the actor, entity, before/after metadata and IP. The log is append-only and has no update or delete endpoints.
- Concurrency-sensitive invariants are enforced in the database: seat CHECK constraints, partial unique indexes and idempotent payment events.

## Check-in QR

QR codes are HMAC-SHA256 signed and valid for 120 s. They carry no personal data beyond an opaque id. Staff can revoke all of a member's codes, a second entry the same day at the same branch is rejected by a partial unique index, and forged or expired codes are logged as rejected attempts.

## Payments

- **Card data.** No card data ever touches FITCLUB; the design assumes a hosted payment page.
- **Activation.** Memberships activate only from a verified provider event: an HMAC webhook with constant-time comparison and de-duplication by event id.
- **Sandbox in production.** The sandbox provider is refused at startup in production unless `DEMO_MODE=true` (the portfolio demo). Test payments are always flagged and excluded from revenue by default.

## Uploads

Uploads are limited to 5 MB. The type is detected from magic bytes (JPEG, PNG and WebP only), and the client MIME type is ignored. Files get random names and are served with `nosniff`; SVG and other types are refused.

## Web hardening

- **CSP:** `default-src 'self'`, images from self and Unsplash only, `frame-ancestors 'none'`, `form-action 'self'`.
- **Other headers:** `X-Frame-Options: DENY`, `Referrer-Policy`, a restrictive `Permissions-Policy` (camera only for the reception scanner) and Helmet on the API.
- **CMS content.** CMS Markdown is rendered without raw HTML.
- **Secrets** only live in `.env` files, which are gitignored. Both apps validate their environment at startup with Zod and refuse insecure production settings: the sandbox enabled without `DEMO_MODE`, `COOKIE_SECURE=false`, or `EMAIL_DEV_LOG=true`.

## Privacy

- Collect only what the club needs. Health information is never requested, and staff notes warn against recording it.
- Marketing e-mail is opt-in, per category, and can be withdrawn in the profile. Consent is recorded on lead forms.
- Members can export nothing they did not provide. CSV exports are permission-gated (`members.export`) and audited.

## Known gaps before going live

- Implement a real payment provider and review its webhook security model.
- Configure SMTP with SPF, DKIM and DMARC for the sending domain.
- Put the API behind HTTPS and set `TRUST_PROXY` to the exact number of proxies.
- Add an S3-compatible storage driver for uploads served from a CDN.
- Run a dependency audit and a penetration test. Add bot protection to public forms if spam appears.

## Dependency audit (2026-10-26)

`npm audit --omit=dev` reports two advisories that do not affect this code. Re-check them when upgrading.

- **multer < 2.5.0 (high).** The DoS needs an asynchronous `fileFilter`. FITCLUB's upload interceptors use only `limits`, and file types are checked after upload from magic bytes. The fix ships only once `@nestjs/platform-express` depends on multer ≥ 2.5.0.
- **js-yaml 5.0–5.4 via @nestjs/swagger (moderate).** The CPU issue is in YAML _parsing_; Swagger only emits YAML.

Nodemailer was upgraded to 10.2.1 to fix its address-parser and TLS advisories.
