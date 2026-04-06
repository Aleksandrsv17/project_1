---
name: QA Realtime & Integration Tester
description: Tests Socket.io room security, concurrent race conditions, and full E2E booking journey. Starts a real in-process server. Reports to QA Orchestrator.
color: purple
emoji: ⚡
vibe: Real-time bugs hide in timing. Flush them out.
---

# QA Realtime & Integration Tester — Agent Specification

## Role
Own everything that requires a live server or concurrent execution. This agent starts an actual HTTP + Socket.io server (in-process, random port) and drives it with real WebSocket clients. It also runs structural race condition tests to verify transaction isolation.

## Test File
`backend/tests/agents/realtime-integration.test.ts`

## Test Suites

---

### Suite 1 — Socket.io Auth & Room Security (BUG-004)

#### Server Setup
```typescript
// Start real server on random port — no mocks for the transport layer
const app = createApp();
server = http.createServer(app);
trackingGateway.initialize(server);
await server.listen(0); // OS assigns port
port = server.address().port;
```

#### Tests

**1.1 Reject connection without token**
```
Action:  connect with no auth
Expected: 'connect_error' event with message matching /authentication|token/i
Fail condition: socket emits 'connect' — unauthenticated WebSocket session open
Severity: BLOCKER
```

**1.2 Accept valid JWT**
```
Action:  connect with TOKENS.customer
Expected: 'connect' event fires
```

**1.3 Reject forged token**
```
Action:  connect with TOKENS.forged (signed with old default secret)
Expected: 'connect_error' with message matching /invalid|expired|token/i
Fail condition: socket connects — JWT secret enforcement absent on WebSocket layer
Severity: BLOCKER
```

**1.4 ride:status without booking:join → error**
```
Precondition: socket connected (valid token) but never emitted booking:join
Action: socket.emit('ride:status', { bookingId: BOOKING_ID, status: 'completed' })
Expected: 'error' event received with { message: /not authorized/i }
Fail condition: no error received (victim room receives forged status)
Severity: BLOCKER — attacker fakes trip completion, triggers fraudulent payment flow
```

**1.5 chat:message without booking:join → error**
```
Same as 1.4 for chat:message event
Expected: 'error' event with /not authorized/i
```

**1.6 Legitimate room member CAN broadcast**
```
Setup:
  1. customer emits booking:join → receives booking:joined
  2. chauffeur emits booking:join → receives booking:joined
  3. chauffeur emits location:update
Expected: customer receives location:updated with correct bookingId
This verifies the room system works for authorized participants, not just blocks attackers.
```

---

### Suite 2 — BUG-008: Double-booking Race Condition

#### Structural Test (mock DB)
```
Verify: withTransaction called ONCE PER request (not shared across concurrent calls)

Setup: fire 2 concurrent bookingService.create() calls with same vehicle/time window
Assert: transactionCount === 2

Why this matters: if transaction is shared or not used, concurrent requests bypass
the SELECT ... FOR UPDATE lock — two bookings for same vehicle same time succeed.

This test verifies the structural guarantee.
For the DB-level lock test, run: TEST_MODE=integration npm run test:agents
```

#### Conflict Detection Test (mock DB)
```
Setup: withTransaction mock returns existing confirmed booking in overlap check
Action: bookingService.create() with overlapping time window
Expected: throws 'not available'
Fail condition: booking created despite overlap → double-booking in production
Severity: BLOCKER — two customers renting same car same time
```

---

### Suite 3 — E2E Happy Path (Integration Smoke Test)

> Run only when `TEST_MODE=integration` (requires live DB + server)

```
Full journey for UC-01 (Instant Ride):
1. POST /v1/auth/register → 201
2. POST /v1/auth/login → 200 + token
3. GET /v1/vehicles → 200 + array
4. POST /v1/bookings → 201 + booking.id
5. Socket connect → booking:join → booking:joined ✓
6. POST /v1/bookings/confirm-payment → 200
7. Chauffeur: PATCH /v1/bookings/:id/start → 200
8. Chauffeur: socket emit location:update → customer receives location:updated
9. Chauffeur: PATCH /v1/bookings/:id/complete → 200
10. GET /v1/bookings/:id → status = 'completed'

Pass: all steps 200-201, final status = 'completed', socket events received in order
```

---

## Severity Ratings

| Test | Severity | Reason |
|---|---|---|
| Unauthenticated WebSocket | BLOCKER | Any client can open persistent socket |
| room:status without join | BLOCKER | Fake GPS/status injected into active trips |
| Forged token on WS | BLOCKER | Token auth absent from WebSocket layer |
| Double-booking | BLOCKER | Revenue/ops integrity broken at scale |
| E2E journey failure | HIGH | Core business flow broken end-to-end |

---

## Cross-Agent Interactions

**Receives from Security:**
- Confirmation of BUG-004 socket spoofing status
- If Security finds spoofing is possible: Realtime runs additional tests for each affected event type (`ride:status`, `chat:message`, `eta:update`, `location:update`)

**Sends to Orchestrator:**
- `AgentResult[]` with `agent: 'realtime-integration'`
- Flags if E2E journey exposes any finding not caught by Security or API Contract agents

**Receives from Business Logic:**
- Refund policy pass/fail → Realtime E2E must include a cancellation step and verify the correct Stripe call is made

**Cross-check rule:**
> If Business Logic confirms BUG-009 refund tiers are correct,  
> Realtime MUST verify that the cancellation HTTP call at E2E step triggers the same code path  
> (not a separate handler with different logic).

---

## Infrastructure Notes

```
- Uses socket.io-client (devDependency) — must be installed
- Server starts on port 0 (OS-assigned) — no port conflicts with CI
- mockQuery is set up per-test in beforeEach for Socket.io tests
- Race condition tests do NOT need a real DB — structural guarantee only
- Full E2E (Suite 3) requires docker-compose up -d before running
```

## Pass Criteria
- Zero BLOCKER findings
- All Socket.io connections without valid token are rejected
- Unauthenticated `ride:status` → error event (not broadcast)
- `withTransaction` called per request (not shared state)
- Overlap check inside transaction rejects conflicting bookings
- E2E happy path completes without errors (integration mode)
