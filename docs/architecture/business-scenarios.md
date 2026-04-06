# VIP Mobility Platform — Business Scenarios

**Version**: 1.0.0  
**Date**: 2026-04-06  
**Author**: CTO / Software Architect Agent

---

## Overview

This document defines the complete business scenarios (use cases) for the VIP Mobility Platform, covering all user types and core flows from the user's perspective through to the technical implementation.

---

## User Roles

| Role | Description | Permissions |
|---|---|---|
| **Customer** | Books rides and rentals | Browse vehicles, create bookings, track trips, rate drivers |
| **Car Owner** | Lists vehicles for income | Manage fleet, view earnings, approve/reject bookings |
| **Chauffeur** | Executes bookings as driver | Accept rides, update location, receive ratings |
| **Admin** | Platform operations | Approve KYC, manage disputes, view all data |

---

## UC-01: Instant Ride Request (Uber-style)

**Actor**: Customer  
**Trigger**: Customer opens app and requests immediate pickup  
**Preconditions**: Customer is KYC-verified, payment method on file

### Happy Path

```
1. Customer opens Home screen → current location detected via GPS
2. Customer taps "Book a Ride" → selects "Instant Ride" mode
3. System displays available chauffeur-mode vehicles within 10km
4. Customer selects vehicle (sees: car photo, model, driver rating, ETA, price)
5. Customer confirms pickup address and enters destination
6. PricingEngine calculates fare:
   - Base rate: vehicle hourly_rate × estimated hours
   - Platform commission: 20%
   - Insurance: $25
   - Surge multiplier applied if demand high (shown to customer)
7. Customer confirms → Stripe PaymentIntent created (amount + 20% deposit)
8. Customer completes payment → webhook confirms → booking status: confirmed
9. Nearest available chauffeur auto-assigned
10. Chauffeur notified (push notification) → accepts
11. Customer sees chauffeur location on map (real-time via Socket.io)
12. Chauffeur arrives → booking status: active
13. Trip in progress → GPS tracking active
14. Trip ends → chauffeur marks complete → final amount settled
15. Customer rates chauffeur (1-5 stars + comment)
16. Owner receives settlement (base - commission) within 24h
```

### Alternative: No Vehicles Available
```
Step 3: No vehicles within range
→ Show "No vehicles available nearby"
→ Suggest: Scheduled booking (choose future time) or expand search radius
```

### Technical Events
```
booking.created → ChauffeurService.autoAssign()
chauffeur.assigned → NotificationService.pushToDriver()
booking.active → TrackingGateway.openRoom(bookingId)
booking.completed → PaymentService.captureDeposit() + settle()
booking.completed → RatingService.requestRating()
```

---

## UC-02: Self-Drive Rental

**Actor**: Customer  
**Trigger**: Customer wants to rent a luxury car and drive themselves  
**Preconditions**: Customer is KYC-verified (driver's license uploaded + approved)

### Happy Path

```
1. Customer navigates to "Rent a Car" tab
2. Filters: city, dates, self-drive mode, category (sedan/SUV/etc.), price range
3. Vehicle list shown → Customer selects Rolls-Royce Ghost (daily: $500)
4. VehicleDetailScreen shows: specs, photos, terms, mileage limit (300km/day)
5. Customer selects: 3 days, self-drive
6. PricingEngine calculates:
   - Base: $500 × 3 = $1,500
   - Insurance: $25 × 3 = $75
   - Platform commission: 20% = $315
   - Security deposit: $500 (auth-only, not captured)
   - Total charged: $1,575 + $500 deposit hold
7. Customer pays → booking confirmed
8. Owner notified → coordinates key handoff (in-app messaging)
9. Rental period starts → mileage tracked (manual entry or OBD integration future)
10. Customer returns vehicle
11. Owner confirms return + enters final mileage
12. If mileage exceeded: $2/km × overage charged to deposit
13. Deposit released (or partially captured for overage)
14. Both parties rate each other
```

### Alternative: KYC Not Approved
```
Step 1: Customer without approved KYC tries self-drive
→ Show KYC Required screen
→ Prompt to upload: government ID (front/back) + driver's license
→ KYC review: 24-48 hours (manual review or KYC provider API)
→ Notification when approved
```

### Technical Events
```
booking.created → PaymentService.authorizeDeposit() [not captured]
booking.completed → BookingService.calculateMileageOverage()
booking.completed → PaymentService.releaseOrCaptureDeposit()
```

---

## UC-03: Scheduled Chauffeur Booking

**Actor**: Customer  
**Trigger**: Customer needs a luxury car with driver for a future event  
**Preconditions**: Customer registered and verified

### Happy Path

```
1. Customer selects "Scheduled Booking"
2. Selects date: 3 days in advance, time: 09:00
3. Duration: 8 hours
4. Mode: Chauffeur
5. Occasion: Business Trip / Airport Transfer / Wedding
6. Chooses vehicle: Mercedes S-Class (chauffeur rate: $120/hr)
7. PricingEngine:
   - Base: $120 × 8 = $960
   - Chauffeur fee: included in base rate
   - Insurance: $25
   - Commission: 20% = $197
   - Total: $985
8. Customer books → payment confirmed
9. Owner and chauffeur notified (push + email)
10. 24h before: reminder notification to customer
11. 1h before: chauffeur confirms, ETA provided
12. Trip executes → GPS tracking throughout
13. Trip ends → rating + receipt emailed
```

### Cancellation Policy
```
Cancel > 48h before: Full refund
Cancel 24-48h before: 50% refund
Cancel < 24h before: No refund (chauffeur already allocated)
```

---

## UC-04: Vehicle Owner Onboarding

**Actor**: Car Owner  
**Trigger**: Luxury car owner wants to monetize idle vehicle

### Happy Path

```
1. Owner downloads app → selects "List My Car"
2. Registration: name, email, phone, password
3. Role selection: "Car Owner"
4. Owner KYC:
   - Upload government ID
   - Upload vehicle registration documents
   - Upload insurance certificate
   - Bank account for payouts (Stripe Connect)
5. Vehicle listing (AddVehicleScreen - 4 steps):
   Step 1 - Vehicle Info: make, model, year, color, license plate, category
   Step 2 - Photos: minimum 5 photos (exterior 360° + interior)
   Step 3 - Pricing:
     - Daily rate: $XXX
     - Hourly rate: $XXX (optional)
     - Chauffeur available: Yes/No
     - Chauffeur daily rate: $XXX
     - Security deposit: $XXX
     - Max daily km: XXX
   Step 4 - Availability:
     - Always available
     - Custom calendar (block specific dates)
     - Minimum rental duration
6. Submit → Admin review (photos, documentation)
7. Vehicle approved → status: active → visible in marketplace
8. Owner dashboard shows: upcoming bookings, earnings, fleet status
9. Weekly settlements: Stripe direct deposit to bank account
```

### Owner Dashboard KPIs
```
- Total earnings (MTD / YTD)
- Fleet utilization rate (booked days / available days)
- Average rating across vehicles
- Pending bookings requiring confirmation
- Active trips in progress
```

---

## UC-05: Dynamic Pricing (Surge)

**Actor**: System (PricingEngine)  
**Trigger**: High demand in specific city/time window

### Flow

```
1. BookingService calls PricingEngine.calculate()
2. PricingEngine fetches from Redis: active vehicles in city vs active bookings
3. Demand ratio = active bookings / available vehicles
4. If ratio > 1.5: apply surge_multiplier = 1.2
5. If ratio > 2.0: apply surge_multiplier = 1.5
6. Surge displayed to customer with explanation badge "High Demand"
7. Customer sees: "Prices are 20% higher due to high demand"
8. Customer accepts or waits for surge to drop
```

### Pricing Formula
```
base_amount = vehicle_rate × duration
surge_multiplier = f(demand_ratio)  // 1.0, 1.2, or 1.5
chauffeur_fee = chauffeur_rate × duration (if chauffeur mode)
insurance = $25 × days
platform_commission = (base_amount × surge + chauffeur_fee + insurance) × 0.20
deposit = vehicle.deposit_amount (auth-only)

total_charged = base_amount × surge + chauffeur_fee + insurance + platform_commission
```

---

## UC-06: Dispute Resolution

**Actor**: Customer or Owner → Admin  
**Trigger**: Disagreement about charges, vehicle condition, or service quality

### Flow

```
1. Customer/Owner opens "Help" → "Report Issue" → selects booking
2. Issue type: Overcharged / Vehicle not as described / Late arrival / Damage
3. User describes issue + uploads photos (optional)
4. Admin receives dispute notification in admin dashboard
5. Admin reviews: booking data, payment history, photos, chat logs
6. Admin decides:
   a. Refund customer (partial or full)
   b. Release deposit to owner (for damage)
   c. No action (dispute unfounded)
7. Both parties notified of outcome
8. If repeated issues: vehicle delisted / user suspended
```

---

## Revenue Model

| Source | Rate | Example |
|---|---|---|
| Platform commission | 20% of base fare | $100 ride → $20 to platform |
| Insurance fee | $25/day | 3-day rental → $75 |
| Mileage overage | $2/km | 50km over → $100 |
| Future: Premium listing | $X/month | Owner pays for top placement |
| Future: Membership | $X/month | Customer gets discounts |

**Owner earnings** = base_rate − platform_commission  
**Platform revenue** = commission + insurance + overage fees
