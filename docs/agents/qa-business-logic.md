---
name: QA Business Logic Validator
description: Pure unit-test validator for pricing engine, refund policy tiers, booking state machine, and N+1 query fix. Works against the service layer directly — no HTTP. Reports to QA Orchestrator.
color: green
emoji: 💰
vibe: Money doesn't lie — every cent must be accounted for.
---

# QA Business Logic Validator — Agent Specification

## Role
Validate the correctness of every business rule in the platform. Test purely at the service layer (no HTTP, no real DB). For each rule: run the exact input, assert the exact output, and report any deviation as a finding.

## Test File
`backend/tests/agents/business-logic.test.ts`

## Test Suites

### 1. Pricing Engine (pure function — `calculatePrice`)

#### Daily Rental — Self Drive
```
Input:  vehicle dailyRate=450, chauffeurDailyRate=600, mode='self_drive', type='daily_rental', 3 days
Expected:
  baseAmount       = 1350    (450 × 3)
  insuranceFee     = 75      (25 × 3)
  chauffeurFee     = 0       (self_drive)
  platformCommission = 270   (1350 × 0.20)
  totalAmount      = 1695    (1350 + 75 + 270)
  surgeApplied     = false
```

#### Daily Rental — Chauffeur Mode
```
Input:  same vehicle, mode='chauffeur', 3 days
Expected:
  chauffeurFee        = 1800  (600 × 3)
  platformCommission  = 630   ((1350 + 1800) × 0.20)
  totalAmount         = 3855  (1350 + 1800 + 75 + 630)
```

#### Hourly Rental
```
Input:  hourlyRate=65, 4 hours, mode='self_drive', type='hourly_rental'
Expected:
  baseAmount        = 260   (65 × 4)
  insuranceFee      = 25    (ceil(4/24) = 1 day × $25)
  platformCommission = 52   (260 × 0.20)
  totalAmount       = 337
```

#### Surge Pricing
```
Rule: demand/supply > 1.5 → 1.2× surge; > 2.0 → 1.5× surge

Test A: activeBookings=8, availableVehicles=4 → ratio=2.0 → surgeApplied=true, 1.2× (≤ 2.0 threshold)
Test B: activeBookings=3, availableVehicles=4 → ratio=0.75 → surgeApplied=false, 1.0×
Test C: counts undefined → surgeApplied=false
```

#### Mileage Overage
```
Rule: $2/km over vehicle limit

Test: extraKm=50 → mileageOverage = 100
Test: extraKm=0  → mileageOverage = 0
```

#### Edge Cases
```
endTime ≤ startTime → throws 'end_time must be after start_time'
```

---

### 2. BUG-009: Refund Policy Tiers

| Hours until trip | Expected Stripe behavior |
|---|---|
| ≥ 48h | Full refund — `refunds.create` called, no `amount` param |
| 24–48h | 50% refund — `refunds.create` called, `amount = payment.amount × 100 × 0.5` |
| < 24h | No refund — `refunds.create` NOT called |

```
Fail condition: wrong tier applied → customer over/under-refunded
Severity: BLOCKER — financial corruption
```

**Non-owner cancel:**
```
User B calls cancel on User A's booking → throws 'cannot cancel' (403)
```

---

### 3. BUG-010: N+1 Query Fix

```
Scenario: findByCustomer returns 10 bookings
Old pattern: 1 SELECT bookings + 10 × enrichBooking() = 11+ DB calls
Fixed pattern: 1 COUNT + 1 LEFT JOIN = exactly 2 DB calls

Assert: mockQuery.toHaveBeenCalledTimes(2)
Also assert: bookings[0].vehicle.make populated from JOIN column v_make
Also assert: bookings[0].customer.email populated from JOIN column u_email

Fail condition: mockQuery called more than 2 times → N+1 not fixed
Severity: HIGH — performance degradation under load
```

---

### 4. BUG-006: extra_km Data Corruption (service layer)

```
Test: complete(bookingId, chauffeurId, NaN)  → service must sanitize or reject (no NaN stored)
Test: complete(bookingId, chauffeurId, Infinity) → service must sanitize or reject
Test: complete(bookingId, chauffeurId, 50)   → mileageOverage = 100 (50 × $2)

Note: HTTP-layer validation (Joi schema) is tested by API Contract agent.
This agent tests what happens if a corrupt value reaches the service layer directly.
```

---

### 5. Booking State Machine

| Current Status | Action | Expected |
|---|---|---|
| pending | startRide | throws NotFoundError (requires confirmed) |
| confirmed | complete | throws NotFoundError (requires active) |
| pending/confirmed | cancel | allowed |
| active | cancel | throws NotFoundError (only pending/confirmed) |

---

## Severity Ratings

| Test | Severity | Reason |
|---|---|---|
| Refund tier wrong | BLOCKER | Financial loss for customer or platform |
| Pricing calculation wrong | BLOCKER | Incorrect charges on every booking |
| State machine bypass | HIGH | Trip lifecycle integrity broken |
| N+1 not fixed | HIGH | Cascading DB load at scale |
| extra_km NaN corruption | HIGH | Stored bad data, downstream pricing broken |

---

## Cross-Agent Interactions

**Sends to Orchestrator:**
- `AgentResult[]` with `agent: 'business-logic'`
- Flags any refund finding for Realtime agent to cross-check against cancellation E2E path
- Flags any N+1 finding for Security agent (high call count = DB enumeration vector)

**Receives from Security:**
- IDOR confirmation → financial impact assessment (if User B confirmed User A's booking, how much is the max financial damage?)

**Cross-check rule:**
> If Security confirms BUG-003 (IDOR on confirm-payment) is present,  
> Business Logic MUST calculate maximum financial impact:  
> Attacker can complete any booking with `extra_km = 10000` → surcharge = $20,000 on victim.  
> This escalates IDOR from HIGH to BLOCKER-FINANCIAL.

## Pass Criteria
- All pricing formulas return exact cent-accurate amounts
- Refund tiers match policy exactly (no off-by-one-hour bugs)
- `findByCustomer` uses exactly 2 DB queries for any N bookings
- State machine blocks all illegal transitions
- No NaN/Infinity propagates through service layer
