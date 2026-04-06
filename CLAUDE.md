# VIP Mobility Platform — CLAUDE.md

> Project intelligence file. Updated every 3 requests per CTO rule.  
> Last updated: 2026-04-06 | Session: Server deployment

---

## Project Overview

**Name**: VIP Mobility Platform  
**Type**: Luxury mobility marketplace — ride-hailing + car rental + chauffeur services  
**Pitch**: "A luxury mobility marketplace where people can rent or ride in high-end cars — with or without a chauffeur — anytime, anywhere."  
**Stage**: MVP (single-city launch target)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo SDK 50), TypeScript |
| Backend | Node.js + Express, TypeScript |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Payments | Stripe (PaymentIntents, deposits, webhooks) |
| Real-time | Socket.io + Redis pub/sub |
| Maps | Google Maps API (Expo integration) |
| Auth | JWT (access 15min + refresh 7d) |
| State (mobile) | Zustand + React Query |
| Testing | Jest + Supertest |
| Infrastructure | Docker Compose (local), K8s-ready |

---

## Project Structure

```
project_1/
├── backend/                    # Node.js API server
│   ├── src/
│   │   ├── app.ts             # Express app
│   │   ├── index.ts           # Entry point
│   │   ├── config/            # Typed env config
│   │   ├── db/                # PostgreSQL pool + migrations
│   │   ├── middleware/        # Auth, error handler, rate limiter
│   │   ├── services/
│   │   │   ├── user/          # Auth, KYC, profiles
│   │   │   ├── vehicle/       # Listings, media, availability
│   │   │   ├── booking/       # Booking lifecycle
│   │   │   ├── payment/       # Stripe integration
│   │   │   ├── chauffeur/     # Driver management
│   │   │   └── tracking/      # Socket.io real-time GPS
│   │   └── utils/             # Pricing engine, JWT, validators
│   └── tests/                 # Jest tests (955 lines, 4 files)
├── mobile/                     # React Native Expo app
│   └── src/
│       ├── api/               # Axios wrappers per domain
│       ├── store/             # Zustand auth + booking stores
│       ├── navigation/        # Stack + tab navigators
│       ├── screens/           # Auth, Customer, Owner screens (41 files)
│       ├── components/        # Shared UI components
│       ├── hooks/             # Custom data hooks
│       └── utils/             # Formatters, constants
├── docs/
│   ├── agents/                # Agent definitions (CTO, Backend, Mobile, etc.)
│   ├── discription/           # Original project brief + architecture concept
│   └── architecture/          # Generated architecture docs
│       ├── system-design.md   # C4 diagrams, ADRs, data flows
│       └── business-scenarios.md # All use cases with technical flows
├── docker-compose.yml         # PostgreSQL + Redis + Backend
└── CLAUDE.md                  # This file
```

---

## Agent Team

| Agent | Role | File |
|---|---|---|
| CTO / Orchestrator | Pipeline manager, all decisions | `agents-orchestrator.md` |
| Software Architect | System design, DDD, ADRs | `engineering-software-architect.md` |
| Backend Architect | Node.js services, DB schema | `engineering-backend-architect.md` |
| Mobile App Builder | React Native iOS + Android | `engineering-mobile-app-builder.md` |
| Frontend Developer | Admin dashboard (future) | `engineering-frontend-developer.md` |
| Code Reviewer | Quality gates, security review | `engineering-code-reviewer.md` |
| Technical Writer | Docs, CLAUDE.md | `engineering-technical-writer.md` |

**Pending agents to create** (needed for next phases):
- `engineering-devops.md` — CI/CD, K8s, monitoring
- `engineering-qa.md` — E2E testing, integration test runner

---

## Domain Services

| Service | Responsibility | Tables owned |
|---|---|---|
| UserService | Auth, KYC, roles | users, refresh_tokens |
| VehicleService | Listings, media, availability | vehicles, vehicle_media |
| BookingService | Booking lifecycle | bookings |
| PaymentService | Stripe, settlements, refunds | payments |
| ChauffeurService | Driver management, assignment | chauffeurs |
| TrackingGateway | Real-time GPS (Socket.io) | — (Redis) |
| PricingEngine | Dynamic pricing, surge, commission | — (utility) |

---

## Key Business Rules

1. **Platform commission**: 20% on all bookings
2. **Surge pricing**: 1.2x when demand/supply > 1.5, 1.5x when > 2.0
3. **Insurance**: $25/day flat
4. **Mileage overage**: $2/km over vehicle limit
5. **Security deposit**: Auth-only (not captured until damage confirmed)
6. **KYC required** for self-drive mode
7. **Max retry**: 3 attempts per booking QA loop before escalation
8. **Cancellation**: 48h+ = full refund, 24-48h = 50%, <24h = no refund

---

## User Flows (summary)

- **UC-01**: Instant Ride → Customer → vehicle → chauffeur → GPS tracking → payment
- **UC-02**: Self-Drive Rental → KYC required → deposit hold → mileage tracking → release
- **UC-03**: Scheduled Booking → advance booking → reminder → trip → rating
- **UC-04**: Owner Onboarding → KYC → list vehicle → earn → weekly settlement
- **UC-05**: Dynamic Pricing → demand detection → surge applied → customer notified

---

## Environment Setup

```bash
# 1. Clone and enter project
cd /Users/alex/project_11/project_1

# 2. Start infrastructure
docker compose up -d    # PostgreSQL + Redis + Backend

# 3. Backend development
cd backend
cp .env.example .env    # Fill STRIPE_SECRET_KEY etc.
npm install
npm run migrate         # Apply DB schema
npm run dev             # Hot reload on :3000

# 4. Mobile development
cd mobile
npm install
npx expo start          # Expo dev server

# 5. Tests
cd backend && npm test
```

---

## API Base URL

- Local: `http://localhost:3000/v1`
- Health: `GET /health`

### Key Endpoints

```
POST /auth/register
POST /auth/login
POST /auth/refresh
GET  /vehicles?city=&category=&mode=
POST /vehicles
POST /bookings
GET  /bookings/:id
PATCH /bookings/:id/status
POST /payments/webhook   (Stripe)
WSS  /                   (Socket.io tracking)
```

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Architecture style | Modular monolith | Small team, clear migration path to microservices |
| Mobile framework | React Native + Expo | Cross-platform, fast iteration |
| Database | PostgreSQL | ACID transactions for payments/bookings |
| Real-time | Socket.io + Redis | Room management, horizontal scaling |
| Payments | Stripe | PCI compliance, deposits, webhooks |
| Auth | JWT | Stateless, mobile-compatible |

---

## Current Status (2026-04-06)

### Completed
- [x] Project analysis & CTO planning
- [x] Agent team assembly
- [x] System architecture design (C4 diagrams, ADRs, data flows)
- [x] Business scenarios (UC-01 through UC-06)
- [x] Backend: 37 TypeScript files — all services, middleware, DB schema, pricing engine
- [x] Mobile: 41 TypeScript files — all screens, navigation, stores, API layer
- [x] Tests: 4 test files, 955 lines (pricing, user, vehicle, booking)
- [x] Docker Compose: PostgreSQL + Redis + Backend + health checks
- [x] Server deployed: 109.120.133.113 — PostgreSQL 16 + Redis + Nginx + PM2
- [x] HTTPS enabled (self-signed cert, port 443)
- [x] Admin dashboard: React + Vite + Tailwind (admin/ — 16 files)
- [x] CI/CD: GitHub Actions (.github/workflows/deploy.yml + test.yml)
- [x] Mobile EAS: eas.json configured for dev/preview/production builds
- [x] Auto-deploy script: deploy.sh (--full / --restart / --logs / --status)

### In Progress / Pending
- [ ] Node.js not installed on this machine — install to run tests + start server
- [ ] Stripe real keys — run `bash /tmp/stripe_setup.sh sk_live_XXX whsec_XXX` on server
- [ ] Mobile app Stripe publishable key — update STRIPE_PUBLISHABLE_KEY in mobile/src/utils/constants.ts
- [ ] E2E tests with Detox (QA agent)
- [ ] Stripe Connect for owner payouts
- [ ] Google Maps API key integration
- [ ] KYC provider integration (Onfido/Persona)
- [ ] Push notifications (Firebase + APNs)
- [ ] Production K8s deployment manifests
- [ ] Get a real domain → replace self-signed cert with Let's Encrypt
- [ ] GitHub Secrets: set SERVER_HOST / SERVER_USER / SERVER_PASSWORD for CI/CD

---

## Production Server

| Parameter | Value |
|---|---|
| **IP** | 109.120.133.113 |
| **OS** | Ubuntu 24.04.1 LTS |
| **API URL** | http://109.120.133.113/v1/ |
| **Health** | http://109.120.133.113/health |
| **WebSocket** | ws://109.120.133.113/socket.io/ |
| **Process Manager** | PM2 (app name: `vip-mobility`) |
| **App path** | /var/www/vip-mobility/backend/ |
| **Logs** | /var/log/vip-mobility/ |
| **DB** | PostgreSQL 16 — db: `vip_mobility`, user: `vip_user` |
| **Cache** | Redis 7 on localhost:6379 |
| **Web server** | Nginx (reverse proxy → :3000) |

### Server Commands
```bash
./deploy.sh             # Full deploy (upload + build + restart)
./deploy.sh --restart   # Restart PM2 only
./deploy.sh --logs      # Stream live logs
./deploy.sh --status    # Show all service status

# Direct SSH
ssh root@109.120.133.113
pm2 status              # Process status
pm2 logs vip-mobility   # Live logs
systemctl status nginx postgresql redis-server
```

### Installed Stack on Server
- Node.js v18.19.1
- PostgreSQL 16.13
- Redis 7
- Nginx (reverse proxy)
- PM2 6.0.14 (process manager, auto-restart on boot)
- TypeScript 6.0.2

---

## CLAUDE.md Update Log

| Date | Session | Changes |
|---|---|---|
| 2026-04-06 | Initial build | Full project scaffolded: backend (37 files), mobile (41 files), architecture docs, business scenarios, Docker Compose |
| 2026-04-06 | Server deployment | PostgreSQL + Redis + Nginx + Node.js installed on 109.120.133.113, backend deployed via PM2, auto-deploy script created |
| 2026-04-06 | DB credentials shared | DB accessible via SSH tunnel: postgresql://vip_user:VipSecure2026@localhost:5432/vip_mobility |
| 2026-04-06 | Phase 2 complete | HTTPS/SSL, admin dashboard (16 files), CI/CD GitHub Actions, Expo EAS config, Stripe setup script, mobile API URL pointed to server |
