# Tomorrow's Checklist — VIP Mobility iOS Submission

Date prepared: 2026-04-20
Status: **ready to build — need your Apple account info**

---

## Current State (all set up tonight)

- ✅ Node 25.9.0 installed via Homebrew
- ✅ EAS CLI 18.5.0 installed globally
- ✅ Logged in to Expo as **aleksandrsv17** (aleksandrsv@me.com)
- ✅ Project linked (Expo projectId: `7d58a451-f960-468b-bfc3-3ba707257042`)
- ✅ `package.json` at stable Expo SDK 50 / RN 0.73.2
- ✅ `node_modules` freshly installed (1372 packages)
- ✅ `app.json` configured:
  - bundle ID: `com.vipmobility.app`
  - iOS permissions declared (Location, Camera, Photos)
  - Google Maps API key present
  - Stripe merchant ID: `merchant.com.vipmobility.app`
- ✅ `eas.json` has build profiles (development, preview, production)

## What I need from you tomorrow

### 1. Apple Developer account (required)

You need a paid Apple Developer Program membership (~$99/yr).
- **Apple ID email** (the one used for developer.apple.com)
- **Apple Team ID** — find at https://developer.apple.com/account → Membership Details → "Team ID" (10-char string like `A1BCD2EF3G`)
- **App-specific password** — generate at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords (one-time, used by EAS once)

### 2. App Store Connect app record (required)

Create the app listing at https://appstoreconnect.apple.com → My Apps → +:
- Platform: iOS
- Name: **VIP Mobility**
- Primary language: English
- Bundle ID: **com.vipmobility.app** (must match app.json exactly)
- SKU: `vip-mobility-ios-001` (any unique string)
- User access: Full access

Once created, copy the **App Store Connect App ID** (a number like `1234567890` in the URL bar when editing the app).

### 3. Production API domain (strongly recommended)

**Problem**: `eas.json` currently points `production` build at `https://api.vipmobility.com/v1` (domain doesn't exist) or `109.120.133.113` (self-signed cert).

Apple's App Transport Security rejects self-signed certs for production. Options:
- **A (recommended)**: register a domain, point it at `109.120.133.113`, run certbot for Let's Encrypt cert
- **B (fast hack)**: upload the app pointing to the IP; likely rejected at review

### 4. App Store assets

For App Store Connect:
- App icon 1024×1024 (your `assets/icon.png` — verify it's 1024×1024 with no alpha/transparency)
- Screenshots:
  - iPhone 6.7" (1290×2796 or 1320×2868) — at least 3
  - iPhone 6.5" (1284×2778) — at least 3
  - Optional: iPhone 5.5" (1242×2208)
- App description (up to 4000 chars)
- Keywords (100 chars)
- Support URL, Marketing URL, Privacy Policy URL
- Age rating questionnaire answers
- Export compliance (uses encryption? — React Native does via HTTPS; usually answer "yes, only standard")

---

## Build commands (run in order tomorrow)

Once you give me the Apple details above, I'll:

### Step 1: Update `eas.json` submit block

Replace placeholders with your actual values:
```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your@email.com",
      "ascAppId": "1234567890",
      "appleTeamId": "A1BCD2EF3G"
    }
  }
}
```

### Step 2: Configure credentials (first time)

```bash
cd /Users/alex/project_11/project_1/mobile
eas credentials
```
Choose: iOS → production → Create new distribution certificate (EAS handles keychain + provisioning profile automatically using your Apple ID).

### Step 3: Trigger the production build

```bash
eas build --platform ios --profile production
```
- Runs on Expo's cloud infrastructure (~15 min)
- Outputs a signed `.ipa` file
- You'll get a link to the build in dashboard

### Step 4: Submit to App Store Connect

```bash
eas submit --platform ios --profile production --latest
```
- Uploads the `.ipa` to App Store Connect
- Processing takes 10-30 min
- Build appears in TestFlight → can distribute to testers
- For App Store release: manually submit for review in App Store Connect UI

### Step 5: TestFlight → Review

1. App Store Connect → TestFlight: invite testers (email addresses)
2. Once approved for beta, add "External Testing" group (requires brief beta review, ~24h)
3. Once you're happy, App Store Connect → App Store tab → "Submit for Review"
4. Apple review: typically 24-72h
5. If approved: release or phased release

---

## Blockers / risks to know

| Risk | Impact | Mitigation |
|---|---|---|
| Self-signed TLS on API backend | App Store rejection | Get domain + Let's Encrypt cert before prod submission |
| Missing Privacy Policy URL | App Store rejection | Host a simple privacy policy page (markdown rendered, e.g. GitHub Pages) |
| Location permission justification | Possible rejection | Review Info.plist usage strings in app.json (already reasonable) |
| Background location | Requires review justification | May need to remove ACCESS_BACKGROUND_LOCATION if not strictly needed |
| First build on EAS | 15-30 min | Just wait — don't retry during queueing |

---

## Contacts / handoff

- Expo project: https://expo.dev/accounts/aleksandrsv17/projects/vip-mobility
- Build history: https://expo.dev/accounts/aleksandrsv17/projects/vip-mobility/builds
- App Store Connect: https://appstoreconnect.apple.com

Tomorrow just paste:
```
Apple ID: your@email.com
Team ID: A1BCD2EF3G
App Store Connect App ID: 1234567890
(Optional) Domain for API: api.yourdomain.com
```
and I'll do the rest.
