# SkyBook Push Notifications (New Website Bookings) — Design Spec

**Date:** 2026-06-11
**Status:** Approved design, pending implementation plan
**Approach:** A — OneSignal (chosen over direct Firebase Cloud Messaging and Postgres-trigger variants)

## Goal

Buzz every staff phone running the SkyBook Android app the moment a guest books
through the True Travel or Iventure website — **even when the app is closed** —
so bookings are caught promptly. Tapping the notification opens the app to the
booking.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Delivery | **OneSignal** (wraps FCM; handles device tokens + delivery) |
| Reliability | Real push that works with the app **fully closed** |
| Trigger event | **New website booking/request only** (guest-created, not staff manual entries) |
| Recipients | **All subscribed devices** (everyone with the app) |
| Notification content | Brand + booking reference only — **no guest personal data** |

## Why OneSignal

It removes the heavy plumbing of direct FCM: no device-token table, no token
cleanup, no Google service-account OAuth, no per-device send loop. The app embeds
the OneSignal SDK (which auto-registers each device), and the backend makes **one
REST call** to notify all subscribers. Free at this volume. Since we send only a
brand + reference (no PII), third-party exposure is minimal.

## Existing system (verified)

- **Android app** (`skybook-mobile/`): package `com.trueskyventures.skybook`,
  `compileSdk 34`, `minSdk 26`. A thin WebView wrapper (`MainActivity`) loading
  `https://skybook-8rd.pages.dev/booking-admin.html`. No push today.
- **Automated build**: `.github/workflows/build-apk.yml` runs `./gradlew
  assembleDebug` and publishes a **GitHub Release** with the APK. Adding the SDK =
  the workflow produces a new APK to download/install. No local Android Studio
  needed.
- **Backend**: `booking-api` edge function. `createBooking`
  ([index.ts:~3425](../../../supabase/functions/booking-api/index.ts)) creates all
  bookings; `const isAdmin = payload.admin_created === true`
  ([index.ts:1731](../../../supabase/functions/booking-api/index.ts#L1731))
  distinguishes staff-created from guest/website bookings. Public site payloads set
  sources like `true_travel_inline_reservation` / `iventure_public_booking`.

## Architecture

Three small, isolated units plus external setup.

### External setup (done by Gerri — cannot be automated)
Create a free **OneSignal** account + app, run its wizard to connect to **Firebase
Cloud Messaging** (it generates the FCM key for you), and provide:
- **OneSignal App ID** (public — goes in the app code; not a secret)
- **OneSignal REST API key** (secret — server-side only)

### Unit 1 — Android app: OneSignal SDK
**What:** Register each device as a OneSignal subscriber and handle taps.
**Changes (`skybook-mobile`):**
- `app/build.gradle`: add `implementation 'com.onesignal:OneSignal:[5.x]'`.
- Init OneSignal with the **App ID** early in app startup (an `Application`
  subclass, or in `MainActivity.onCreate` before the WebView loads). Request the
  Android 13+ notification permission via the SDK.
- Optional: when a notification carries a launch `url`, open it in the WebView
  (so a tap deep-links to the specific booking).
- The **App ID is compiled into the app** (it's not secret). The REST key is NOT
  in the app.
**Build:** the existing `build-apk.yml` workflow rebuilds the APK and publishes a
new GitHub Release. Gerri installs the updated APK on each phone (and allows
notifications when prompted).
**Depends on:** the OneSignal App ID.

### Unit 2 — Edge function: send on new website booking
**What:** Fire one OneSignal notification when a guest website booking is created.
**Changes (`booking-api/index.ts`):** after a successful booking insert inside
`createBooking`, when the booking is **guest-created** (`!isAdmin`), call a new
`sendNewBookingPush(booking)` helper that POSTs to
`https://api.onesignal.com/notifications` with:
- header `Authorization: Basic <ONESIGNAL_REST_API_KEY>` (read from env)
- body: `app_id`, `included_segments: ["Subscribed Users"]`,
  `headings: {en: "New <Brand> booking"}`,
  `contents: {en: "<reference> · <service_name>"}`,
  and a launch `url` to the booking record page
  (`https://skybook-8rd.pages.dev/booking-admin.html?tab=bookings&booking=<id>&view=booking`).
**Secrets:** `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` set as Supabase
function secrets (`npx supabase secrets set ...`), read via `Deno.env.get(...)`.
**Isolation:** the call is wrapped in try/catch and **never throws into the
booking flow** — a push failure must not fail or delay the booking. Failures are
`console.error`-logged only. Skips silently if the secrets are unset (so the
feature is dark until configured).

### Unit 3 — Demo/no-op safety
No demo-mode change needed (push only fires server-side on real bookings). The
helper no-ops when secrets are absent, so nothing breaks before OneSignal is
configured or in environments without it.

## Data flow

1. Staff install/update the app → OneSignal SDK auto-registers the device as a
   subscriber (after the user allows notifications).
2. Guest books on truetravelnam.net / iventuretours.net → `booking-api`
   `createBooking` inserts the booking (`isAdmin === false`).
3. After insert, `sendNewBookingPush` POSTs once to OneSignal.
4. OneSignal pushes to all subscribed devices via FCM — phones buzz even if the
   app is closed.
5. Tap → app opens (to the booking via the launch URL, if implemented).

## Error handling & edge cases

- **Push must never break a booking:** the OneSignal call is best-effort,
  try/catch, non-blocking; the booking is already persisted before the call.
- **Secrets unset:** helper returns immediately (feature dark, no errors).
- **No PII:** only brand + reference + service name in the message — no guest
  name, email, or phone.
- **Staff-created bookings:** excluded (`!isAdmin`), so staff aren't pinged about
  their own manual entries.
- **Duplicate/retries:** one POST per created booking; createBooking is the single
  creation path.
- **Permission denied on a device:** that device simply won't receive pushes;
  others still do.

## Testing

- **OneSignal dashboard:** "Send test message" + delivery/clicked stats.
- **End-to-end:** place a real test booking on each brand's public site →
  confirm devices receive it in **foreground, background, and fully-closed**
  states. Verify a staff-created (admin) booking does **not** trigger a push.
- **Failure safety:** temporarily unset/incorrect REST key → confirm bookings
  still succeed and only a server log appears.
- **Deep link:** tap a notification → app opens to the right booking (if Unit 1's
  launch-URL handling is implemented).

## Scope & out of scope

**In scope:** new website booking pushes to all devices, app-closed delivery, tap
→ open.

**Out of scope (YAGNI for v1):**
- Per-role / per-brand targeting (everyone gets all — chosen).
- Other events (payments, cancellations) — easy to add later via the same helper.
- iOS app (none exists).
- In-app notification center / history (OneSignal dashboard covers auditing).
- Two-way actions on the notification (approve/decline from the push).

## Repositories touched

| Repo | Change |
| --- | --- |
| `skybook-mobile` | OneSignal SDK dependency + init + permission; rebuilt via existing Actions workflow |
| `skybook-main` | `sendNewBookingPush` helper + call in `createBooking`; Supabase secrets (shared backend) |
| `Skybook Final` | No change required (push is server-side on the shared backend) |

The edge function + secrets are shared infra — one deploy covers all sites.
