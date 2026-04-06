# VIP Mobility Platform — Bug Report
> Generated: 2026-04-06 | Reviewed by: Code Reviewer Agent | Orchestrated by: CTO Agent

---

## 🔴 BLOCKERS (7 issues — Must Fix Before Production)

---

### BUG-001 — JWT secrets use `optional()` with publicly known defaults
- **File:** `backend/src/config/index.ts:49-50`
- **Severity:** 🔴 Blocker
- **Description:** `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` use `optional()` with hardcoded fallback values (`'dev-access-secret-change-in-production-32chars'`). If the `.env` file is missing or misconfigured, the server starts silently with a public secret visible in the GitHub repo — anyone can forge valid JWTs.
- **Impact:** Full authentication bypass — an attacker can sign their own tokens and impersonate any user including admins.
- **Fix:** Change both secrets to `required()` in `config/index.ts`. The server should crash on startup if they are missing, not silently fall back.

---

### BUG-002 — API route prefix mismatch (`/v1` vs `/api`)
- **File:** `backend/src/app.ts:38-64`
- **Severity:** 🔴 Blocker
- **Description:** The backend mounts all routes under `/api/...` (e.g. `/api/users`, `/api/bookings`), but the mobile app (`mobile/src/utils/constants.ts:1`) and admin panel (`admin/src/api/client.ts:4`) both call `/v1/...`. Every API call fails unless Nginx silently rewrites the prefix — which is undocumented.
- **Impact:** All mobile app and admin dashboard API calls potentially broken in production.
- **Fix:** Add `/v1` prefix to all routes in `app.ts` (e.g. `app.use('/v1/users', ...)`), or document and verify the Nginx rewrite rule. Also update the raw body path for Stripe webhook accordingly.

---

### BUG-003 — IDOR: `confirm-payment` has no ownership check
- **File:** `backend/src/services/booking/booking.service.ts:243` / `booking.controller.ts:76-89`
- **Severity:** 🔴 Blocker
- **Description:** `POST /bookings/confirm-payment` is authenticated but never verifies that the calling user owns the booking. Any authenticated user who knows another user's `bookingId` and `paymentIntentId` can confirm that booking.
- **Impact:** User A can confirm user B's booking, recording a payment against an unrelated Stripe intent and setting the booking to `confirmed`.
- **Fix:** Pass `req.user.sub` (userId) into `bookingService.confirm()` and add a check: `if (booking.customer_id !== userId) throw 403`.

---

### BUG-004 — Socket.IO events lack booking room membership check
- **File:** `backend/src/services/tracking/tracking.gateway.ts:177-205`
- **Severity:** 🔴 Blocker
- **Description:** Any authenticated socket can emit `ride:status`, `chat:message`, or `eta:update` for any `bookingId` without verifying the socket has joined that booking's room. A malicious user can send fake status updates or forged chat messages to any booking.
- **Impact:** Customers could receive false "Ride Arrived" events or spoofed chat messages for bookings they are unrelated to.
- **Fix:** Before forwarding events, check `socket.rooms.has(\`booking:${data.bookingId}\`)`. Reject the event if the socket has not joined that room.

---

### BUG-005 — Admin `GET /users` and `PATCH /users/:id/kyc` endpoints are missing
- **File:** `backend/src/services/user/user.routes.ts` / `admin/src/pages/UsersPage.tsx:11`
- **Severity:** 🔴 Blocker
- **Description:** The admin `UsersPage` calls `GET /users` to list all users and `PATCH /users/:id` to approve KYC. Neither endpoint exists in the backend — both will 404. KYC approval is a core business flow defined in the platform spec.
- **Impact:** The entire admin user management panel is non-functional. KYC cannot be approved, blocking owner and chauffeur onboarding.
- **Fix:** Add `GET /api/users` (admin-only, paginated) and `PATCH /api/users/:id/kyc` (admin-only) endpoints with `requireRole('admin')` middleware.

---

### BUG-006 — `extra_km` has no validation — financial data corruption risk
- **File:** `backend/src/services/booking/booking.controller.ts:105`
- **Severity:** 🔴 Blocker
- **Description:** `const extraKm = Number(req.body?.extra_km ?? 0)` — no Joi validation. `Number("abc")` returns `NaN`. If `NaN` or `Infinity` is passed, `mileageOverage` and `total_amount` are corrupted and written to the database.
- **Impact:** Financial data corruption, potential for artificially inflated or NaN charges stored in the payments table.
- **Fix:** Add Joi validation: `extra_km: Joi.number().integer().min(0).max(10000).default(0)` before calling `bookingService.complete()`.

---

### BUG-007 — Any authenticated user can self-register as a chauffeur
- **File:** `backend/src/services/chauffeur/chauffeur.routes.ts:13` / `chauffeur.service.ts:32`
- **Severity:** 🔴 Blocker
- **Description:** `POST /api/chauffeurs/register` only requires `authenticate` middleware — any logged-in user (customer, owner) can register as a chauffeur and have their role changed to `'chauffeur'` without any admin approval or verification step.
- **Impact:** Unvetted users can operate as chauffeurs, bypassing background check and KYC requirements defined in the platform spec.
- **Fix:** Add an admin approval flow — register creates a `pending` chauffeur entry; a separate `PATCH /api/chauffeurs/:id/approve` endpoint (admin-only) activates the chauffeur and updates the role.

---

## 🟡 SUGGESTIONS (6 issues — Should Fix)

---

### BUG-008 — Booking availability race condition (no DB-level lock)
- **File:** `backend/src/services/booking/booking.service.ts:49-81`
- **Severity:** 🟡 Suggestion
- **Description:** `checkAvailability()` runs before the transaction begins. Two concurrent requests can both pass the availability check before either inserts a booking, resulting in double-booking the same vehicle for the same time slot.
- **Fix:** Move `checkAvailability()` inside the `withTransaction()` callback and use `SELECT ... FOR UPDATE` on the vehicle row, or add a PostgreSQL exclusion constraint on `(vehicle_id, tstzrange(start_time, end_time))`.

---

### BUG-009 — Cancellation always issues full refund — ignores business rules
- **File:** `backend/src/services/booking/booking.service.ts:370-395`
- **Severity:** 🟡 Suggestion
- **Description:** `cancel()` always issues a 100% Stripe refund. The platform's business rules specify: 48h+ before trip = full refund, 24-48h = 50% refund, <24h = no refund.
- **Fix:** Calculate `hoursUntilStart = (booking.start_time - Date.now()) / 3600000` and pass appropriate `amount` to `stripe.refunds.create()` based on the policy.

---

### BUG-010 — N+1 queries in `findByCustomer`
- **File:** `backend/src/services/booking/booking.service.ts:238`
- **Severity:** 🟡 Suggestion
- **Description:** `Promise.all(result.rows.map(b => this.enrichBooking(b)))` fires 2 DB queries per booking (vehicle + customer lookup). A page of 20 bookings triggers 40+ queries.
- **Fix:** Replace with a single JOIN query that fetches vehicle and customer fields in one SQL statement.

---

### BUG-011 — CORS accepts only a single origin string
- **File:** `backend/src/config/index.ts:71`
- **Severity:** 🟡 Suggestion
- **Description:** `CORS_ORIGIN` is a single string. With both the admin panel and mobile app (and potentially staging environments) needing access, the single-origin restriction will block legitimate requests.
- **Fix:** Parse `CORS_ORIGIN` as a comma-separated list and pass an array to `cors({ origin: [...] })`.

---

### BUG-012 — Hardcoded production server IP and insecure WebSocket URL
- **File:** `mobile/src/utils/constants.ts:1-3` / `admin/src/api/client.ts:4`
- **Severity:** 🟡 Suggestion
- **Description:** `API_BASE_URL = 'http://109.120.133.113/v1'` and `SOCKET_URL = 'ws://109.120.133.113'` are hardcoded and committed to source control. The mobile app uses plain `ws://` even though the server has HTTPS/WSS enabled. The admin panel was recently fixed to `https://` but via direct edit rather than env var.
- **Fix:** Use `expo-constants` + `.env` for mobile, `import.meta.env.VITE_API_URL` for admin. Switch `SOCKET_URL` to `wss://109.120.133.113`.

---

### BUG-013 — Vehicle media URL accepts any string including dangerous schemes
- **File:** `backend/src/services/vehicle/vehicle.controller.ts:98-104`
- **Severity:** 🟡 Suggestion
- **Description:** The `url` field for vehicle media is only validated as a non-empty string. An owner could store `javascript:`, `file://`, or internal server addresses (SSRF vector).
- **Fix:** Validate with `Joi.string().uri({ scheme: ['https'] })` and optionally whitelist allowed CDN domains.

---

## 💭 NITS (5 issues — Nice to Have)

---

### BUG-014 — Dashboard chart renders random mock data on every load
- **File:** `admin/src/pages/DashboardPage.tsx:9-12`
- **Severity:** 💭 Nit
- **Description:** The bookings chart uses `Math.random()` to generate data on every render. Numbers change every time the page is visited.
- **Fix:** Replace with a real `GET /api/bookings/stats` API call or stable fixture data.

---

### BUG-015 — Refresh token DB expiry hardcoded to 7 days, ignores config
- **File:** `backend/src/utils/jwt.ts:54-58`
- **Severity:** 💭 Nit
- **Description:** `expiresAt.setDate(expiresAt.getDate() + 7)` hardcodes 7 days regardless of `config.jwt.refreshExpiresIn`. Changing the env var has no effect on DB-stored expiry.
- **Fix:** Parse `config.jwt.refreshExpiresIn` into milliseconds and use that value instead of the hardcoded `+ 7`.

---

### BUG-016 — Test card number visible to all users in PaymentScreen
- **File:** `mobile/src/screens/customer/PaymentScreen.tsx:158-160`
- **Severity:** 💭 Nit
- **Description:** `"Test card: 4242 4242 4242 4242 · Any future date · Any CVC"` is rendered unconditionally for all users in production builds.
- **Fix:** Gate behind `__DEV__` or remove entirely before launch.

---

### BUG-017 — Ratings unique constraint prevents multi-party ratings per booking
- **File:** `backend/src/db/migrations/001_initial.sql:122`
- **Severity:** 💭 Nit
- **Description:** `booking_id UUID REFERENCES bookings(id) UNIQUE NOT NULL` allows only one rating per booking. The platform needs both a customer→vehicle rating and a chauffeur→customer rating for the same booking.
- **Fix:** Change the unique constraint from `(booking_id)` to `(booking_id, rater_id)` or `(booking_id, type)`.

---

### BUG-018 — `getRefreshTokenExpiresAt()` ignores `config.jwt.refreshExpiresIn`
- **File:** `backend/src/utils/jwt.ts:54-58`
- **Severity:** 💭 Nit
- **Description:** Duplicate of BUG-015 root cause. The JWT utility and the DB expiry are out of sync — the token itself may expire at a different time than what is stored in `refresh_tokens`.
- **Fix:** Centralize expiry calculation into a single utility function used by both JWT signing and DB insertion.

---

## Summary

| Severity | Count |
|---|---|
| 🔴 Blockers | 7 |
| 🟡 Suggestions | 6 |
| 💭 Nits | 5 |
| **Total** | **18** |

## Priority Fix Order

1. BUG-001 — JWT secrets → `required()`
2. BUG-002 — Fix `/v1` vs `/api` route prefix
3. BUG-003 — Ownership check on `confirm-payment`
4. BUG-004 — Socket.IO room membership guards
5. BUG-005 — Add missing admin user/KYC endpoints
6. BUG-006 — Validate `extra_km`
7. BUG-007 — Chauffeur self-registration gate
8. BUG-008 — Availability check inside DB transaction
9. BUG-009 — Implement cancellation refund policy
10. BUG-010 — Fix N+1 queries in `findByCustomer`
11. BUG-012 — Move IPs to env vars, switch to `wss://`
12. BUG-016 — Remove test card from PaymentScreen
