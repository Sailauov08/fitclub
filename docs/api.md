# API

- **Base URL:** `/api`. Browsers call it through the web app's proxy; in development it is directly at `http://localhost:4000/api`.
- **Contract:** Swagger UI is at `/api/docs` and the OpenAPI JSON at `/api/docs-json` (enabled in development, or with `SWAGGER_ENABLED=true`).

## Conventions

- **Auth.** The session cookie `fc_session` is set by `POST /api/auth/login` and `/auth/register`. `GET /api/auth/me` returns the user, member/staff info and the effective permissions.
- **CSRF.** Unsafe methods need `X-CSRF-Token: <value of fc_csrf cookie>`; requests with a foreign `Origin` header are rejected.
- **Validation.** Bodies and queries are validated with the Zod schemas in `packages/shared/src/schemas` (the same schemas the forms use).
- **Errors.** Every error has the same shape:

  ```json
  {
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Request validation failed",
      "details": { "issues": [{ "path": "email", "message": "v.email" }] }
    }
  }
  ```

  Codes come from `packages/shared/src/error-codes.ts`; examples include `UNAUTHENTICATED`, `FORBIDDEN`, `CSRF_INVALID`, `NOT_ELIGIBLE`, `BOOKING_REJECTED`, `ALREADY_CHECKED_IN`, `QR_EXPIRED`, `MEMBERSHIP_TRANSITION_INVALID` and `RATE_LIMITED`. `details.reason` refines rejections (for example `NO_MEMBERSHIP`, `BOOKING_NOT_OPEN` or `VISIT_LIMIT_REACHED`). Validation messages are i18n keys, which the web app translates.

- **Pagination.** List endpoints take `?page=&pageSize=` and return `{ items, total, page, pageSize }`.
- **Dates.** Instants are ISO-8601 UTC. Calendar days (`from`, `to`, `date`) are `YYYY-MM-DD` in the club timezone, Asia/Almaty. Money is an integer number of tenge.
- **Localized text** is `{ kk, ru, en }`.

## Endpoint groups

| Prefix                                                                                                           | Audience                 | Examples                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth`                                                                                                          | everyone                 | login, logout, register, password reset, invitations, e-mail verification, `me`                                                                                                                    |
| `/plans`, `/classes/*`, `/trainers`, `/branches`, `/promotions`, `/content/*`, `/settings/public`, `POST /leads` | public                   | site content, schedule, lead capture                                                                                                                                                               |
| `/me/*`                                                                                                          | members                  | profile and locale, memberships (quote, purchase, renew, freeze), bookings and waitlist, check-in token, visits, payments and invoices, notifications, training                                    |
| `/payments/sandbox/*`, `/payments/webhooks/sandbox`                                                              | sandbox only             | simulated hosted checkout and signed webhook                                                                                                                                                       |
| `/admin/*`                                                                                                       | staff (permission-gated) | members, memberships, check-ins, sessions and schedules, bookings, payments and refunds, plans, promotions, leads, trainers, training, branches, content, media, staff, settings, audit, analytics |
| `/health`                                                                                                        | ops                      | database liveness                                                                                                                                                                                  |
