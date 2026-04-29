# NOVA DRIVE — iOS Submission Checklist

Last updated: 2026-04-29
Status: **rebrand complete; App Store Connect record created; ready to build**

---

## Current State

- ✅ Node 25.9.0 installed via Homebrew
- ✅ EAS CLI 18.5.0 installed globally
- ✅ Logged in to Expo as **aleksandrsv17** (aleksandrsv@me.com)
- ✅ Project linked (Expo projectId: `7d58a451-f960-468b-bfc3-3ba707257042`)
- ✅ `package.json` at stable Expo SDK 50 / RN 0.73.2; name: `nova-mobile`
- ✅ `app.json` rebranded to NOVA DRIVE:
  - name: `NOVA DRIVE`
  - slug: `nova-drive`
  - bundle ID: `com.aleksandrsvch.nova`
  - iOS permissions reference NOVA DRIVE
  - Stripe merchant: `merchant.com.aleksandrsvch.nova`
- ✅ `eas.json` submit block fully populated:
  - appleId: `aleksandrsvch@icloud.com`
  - appleTeamId: `TMU9V5MBJ9`
  - ascAppId: `6764670213`
- ✅ All in-app text rebranded to NOVA DRIVE (Login, Register, KYC, Profile, Support, navigation loader)
- ✅ App Store Connect record created — https://appstoreconnect.apple.com/apps/6764670213

## What's still needed

### 1. Apple Pay merchant ID (only if shipping Apple Pay)

App config references `merchant.com.aleksandrsvch.nova`. Register at developer.apple.com → Certificates, IDs & Profiles → Identifiers → Merchant IDs → +. Then add it in Stripe Dashboard → Settings → Apple Pay.
Skip this if Apple Pay isn't part of the launch.

### 2. App-specific password (one-time, for EAS submit)

Generate at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. EAS prompts for this once and caches it.

### 3. Production API domain (strongly recommended)

`eas.json` `production` env points at `https://api.novadrive.app` — placeholder. Apple ATS rejects self-signed certs.
- **A (recommended)**: register a domain, point at `109.120.133.113`, run certbot for Let's Encrypt cert.
- **B (fast hack)**: leave the IP, expect App Review rejection.

### 4. App Store assets

- App icon **1024×1024** (NOVA DRIVE branding — current `assets/icon.png` is a placeholder, must be replaced)
- Screenshots (rebuilt under NOVA DRIVE branding):
  - iPhone 6.7" (1290×2796) — at least 3
  - iPhone 6.5" (1284×2778) — at least 3
- App description (up to 4000 chars)
- Keywords (100 chars total)
- Support URL, Marketing URL, Privacy Policy URL
- Age rating questionnaire answers
- Export compliance ("yes, only standard encryption" for plain HTTPS)

---

## Build commands (run after item 1 above is done)

```bash
cd /Users/alex/project_11/project_1/mobile
```

### First time: configure credentials

```bash
eas credentials
```
Choose: iOS → production → Create new distribution certificate. EAS uses the Apple ID + Team ID from `eas.json` and provisions the cert + provisioning profile automatically.

### Build the production .ipa

```bash
eas build --platform ios --profile production
```
- Runs on Expo's cloud (~15 min)
- Outputs a signed `.ipa`

### Submit to App Store Connect

```bash
eas submit --platform ios --profile production --latest
```
- Uploads the `.ipa`
- Processing takes 10-30 min
- Build appears in TestFlight → distribute to testers
- For App Store release: manually submit for review in App Store Connect UI

### TestFlight → Review

1. App Store Connect → TestFlight → invite testers
2. External Testing group requires brief beta review (~24h)
3. App Store tab → Submit for Review (24-72h Apple review typical)

---

## Blockers / risks to know

| Risk | Impact | Mitigation |
|---|---|---|
| Self-signed TLS on API backend | App Store rejection | Domain + Let's Encrypt cert before prod submission |
| Placeholder `assets/icon.png` (70-byte file) | Build/submit fail | Replace with real 1024×1024 NOVA icon (no alpha) |
| Missing Privacy Policy URL | Rejection | Host a simple privacy page (GitHub Pages markdown OK) |
| Background location permission | Possible rejection | Drop `ACCESS_BACKGROUND_LOCATION` if not strictly needed |
| First EAS build queues 15-30 min | Long wait | Just wait — don't retry during queueing |

---

## Quick references

- App Store Connect (this app): https://appstoreconnect.apple.com/apps/6764670213
- Expo project: https://expo.dev/accounts/aleksandrsv17/projects/nova-drive (slug changed; first build will register new slug on server using same projectId UUID)
- Apple Developer Identifiers: https://developer.apple.com/account/resources/identifiers/list
- Bundle ID registered: `com.aleksandrsvch.nova` (Push Notifications capability enabled)

Build commands ready to run from `/Users/alex/project_11/project_1/mobile/`:
```bash
eas credentials                                    # first-time cert + provisioning profile setup
eas build --platform ios --profile production      # ~15 min cloud build → signed .ipa
eas submit --platform ios --profile production --latest   # uploads to App Store Connect
```
