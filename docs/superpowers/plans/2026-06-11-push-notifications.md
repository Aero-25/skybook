# Push Notifications (OneSignal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a guest books on the True Travel / Iventure website, push a notification to every SkyBook Android device — delivered even when the app is closed — via OneSignal.

**Architecture:** The Android app embeds the OneSignal SDK (auto-registers each device as a subscriber; OneSignal handles tokens + FCM delivery). The `booking-api` edge function, on a guest booking (`!isAdmin`), makes one best-effort REST call to OneSignal to notify all subscribers with brand + reference (no PII). The send is wrapped so it can never fail or delay a booking, and no-ops until the OneSignal secrets are configured.

**Tech Stack:** OneSignal Android SDK 5.x; Deno/TypeScript edge function (`booking-api`); Android (Java, AGP 8.3, compileSdk 34, minSdk 26) built by the existing `build-apk.yml` GitHub Actions workflow. **No automated test runner** — verification is `deno check`, the Actions APK build, and a manual end-to-end matrix.

**Spec:** `docs/superpowers/specs/2026-06-11-push-notifications-design.md`

---

## File Structure

| File | Role | Change |
| --- | --- | --- |
| `skybook-main/supabase/functions/booking-api/index.ts` | `sendNewBookingPush` helper + call in `createBooking` | Modify |
| Supabase function secrets | `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` | Config (gated on OneSignal account) |
| `skybook-mobile/app/build.gradle` | OneSignal SDK dependency | Modify |
| `skybook-mobile/app/src/main/java/com/trueskyventures/skybook/SkyBookApp.java` | `Application` subclass that initialises OneSignal + requests permission | Create |
| `skybook-mobile/app/src/main/AndroidManifest.xml` | register the Application class + notification permission | Modify |

**Verified anchors:**
- `createBooking(payload,{isAdmin=false,userId,brandCode})` — `index.ts:3538`; final `return {…}` — `index.ts:3721-3730`; `booking`, `bookingId` (`:3634`), `reference`, `brand`, `brandCode`, `service` all in scope there.
- Outbound `fetch` precedent: emailjs `:1895`, WhatsApp providers `:1958`. `Deno.env.get(...)` precedent: `:5-7`, `:1844+`.
- Android: empty `dependencies {}` in `app/build.gradle`; `<application>` in `AndroidManifest.xml` has no `android:name`; package `com.trueskyventures.skybook`; repos `google()`+`mavenCentral()` in `settings.gradle`.
- Build: `.github/workflows/build-apk.yml` runs `./gradlew assembleDebug` → publishes a GitHub Release with `SkyBook.apk`.

> **External prerequisite (Gerri, cannot be automated):** create a free OneSignal account + app, run its wizard to connect **Firebase Cloud Messaging** (OneSignal generates/uploads the FCM credentials in *their* dashboard — the app does NOT need `google-services.json`), then provide the **OneSignal App ID** (public) and **REST API key** (secret). The backend (Phase 1) ships first and stays dark until the secrets exist, so this prerequisite only gates Phase 1 Task 2 and Phase 3.

---

## Phase 1 — Backend send (ships first; dark until secrets set)

### Task 1: `sendNewBookingPush` helper + call in `createBooking`

**Files:**
- Modify: `supabase/functions/booking-api/index.ts`

- [ ] **Step 1: Add the helper near the other outbound-integration helpers**

Insert immediately **before** `const createBooking=async(` (line ~3538):

```typescript
const sendNewBookingPush=async(info:{reference:string, brandLabel:string, serviceName:string, bookingId:string})=>{
  // Best-effort push for new GUEST bookings. Never throws — a push failure must
  // not affect the booking. No-ops until the OneSignal secrets are configured.
  try{
    const appId=normalizeText(Deno.env.get('ONESIGNAL_APP_ID'))
    const restKey=normalizeText(Deno.env.get('ONESIGNAL_REST_API_KEY'))
    if(!appId||!restKey)return // feature dark until configured
    const launchUrl=`https://skybook-8rd.pages.dev/booking-admin.html?tab=bookings&booking=${encodeURIComponent(info.bookingId)}&view=booking`
    const body={
      app_id:appId,
      included_segments:['Subscribed Users'],
      headings:{ en:`New ${info.brandLabel} booking` },
      contents:{ en:`${info.reference}${info.serviceName?` · ${info.serviceName}`:''}` },
      url:launchUrl
    }
    const res=await fetch('https://api.onesignal.com/notifications',{
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Basic ${restKey}` },
      body:JSON.stringify(body)
    })
    if(!res.ok){
      const txt=await res.text().catch(()=> '')
      console.error('OneSignal push failed',res.status,txt)
    }
  }catch(err){
    console.error('OneSignal push error',err instanceof Error ? err.message : String(err))
  }
}
```

> `normalizeText` is already defined and used throughout. The `Authorization: Basic <REST key>` header matches OneSignal's REST auth.

- [ ] **Step 2: Call it for guest bookings, right before `createBooking` returns**

In `createBooking`, the success `return {…}` is at line ~3721 (just after `await processDueSystemJobs()`). Insert this **immediately before** that `return {`:

```typescript
  if(!isAdmin){
    await sendNewBookingPush({
      reference,
      brandLabel:String(brand.name || brand.code || brandCode),
      serviceName:String(service.name || ''),
      bookingId
    })
  }

```

> `await` (not fire-and-forget) so the call completes before the edge function returns — Deno may terminate pending promises after the response. The helper is fast and cannot throw, so this never blocks or breaks the booking. `brand`, `service`, `reference`, `bookingId`, `isAdmin` are all in scope here. If `brand.name` isn't a field on the brand object, the fallbacks (`brand.code`/`brandCode`) cover it — confirm by reading the `brand` shape near `:3724` (`String(brand.code || brandCode)` is already used there, so `brand.code` exists).

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/booking-api/index.ts` (or `npx --yes deno@1 check ...`).
Expected: no NEW errors referencing `sendNewBookingPush` (the file has ~160 pre-existing endemic Supabase typing warnings; compare counts with `git stash` if unsure — none of the new ones should name `sendNewBookingPush`).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/booking-api/index.ts
git commit -m "feat(push): send OneSignal notification on new guest booking (best-effort, dark until configured)"
```

- [ ] **Step 5: Deploy the edge function**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=<token>
npx supabase functions deploy booking-api --project-ref zegfirgyhdjyehvhlrnh
```
Expected: `Deployed Functions on project zegfirgyhdjyehvhlrnh: booking-api`. The feature is now live but **dark** (no secrets yet) — bookings behave exactly as before.

- [ ] **Step 6: Verify it stays dark (no regression)**

`curl` a normal services request to confirm the function is healthy:
```bash
curl -s "https://zegfirgyhdjyehvhlrnh.supabase.co/functions/v1/booking-api/services" -H "x-brand-code: true-travel" -o /dev/null -w "HTTP %{http_code}\n"
```
Expected: `HTTP 200`. (A full booking still succeeds; the push simply no-ops while secrets are unset.)

### Task 2: Set OneSignal secrets (GATED on Gerri's OneSignal account)

**Files:** none (Supabase secrets)

- [ ] **Step 1: Set the secrets once Gerri provides the App ID + REST API key**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=<token>
npx supabase secrets set ONESIGNAL_APP_ID=<app-id> ONESIGNAL_REST_API_KEY=<rest-api-key> --project-ref zegfirgyhdjyehvhlrnh
```
Expected: `Finished supabase secrets set.` (No redeploy needed — edge functions read secrets at runtime; if a redeploy is required for the runtime to pick them up, re-run the Task 1 Step 5 deploy.)

- [ ] **Step 2: Verify the secrets are set (names only)**

Run: `npx supabase secrets list --project-ref zegfirgyhdjyehvhlrnh`
Expected: `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` appear in the list (values are hashed/hidden).

---

## Phase 2 — Android app (OneSignal SDK)

> Requires the **OneSignal App ID** (public). The REST key is NOT used in the app.

### Task 3: Add OneSignal SDK + initialise it

**Files:**
- Modify: `skybook-mobile/app/build.gradle`
- Create: `skybook-mobile/app/src/main/java/com/trueskyventures/skybook/SkyBookApp.java`
- Modify: `skybook-mobile/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add the OneSignal dependency**

In `skybook-mobile/app/build.gradle`, replace the empty `dependencies {` block:

```gradle
dependencies {
}
```
with:
```gradle
dependencies {
    implementation 'com.onesignal:OneSignal:5.1.6'
}
```

> Pin: OneSignal Android SDK **5.x**. `5.1.6` is the example pin — before building, confirm the latest stable 5.x at https://mvnrepository.com/artifact/com.onesignal/OneSignal and use it. OneSignal 5.x needs **no** Gradle plugin and **no** `google-services.json` (FCM is configured in the OneSignal dashboard, not the app). minSdk 26 satisfies the SDK's requirement.

- [ ] **Step 2: Create the Application class that initialises OneSignal**

Create `skybook-mobile/app/src/main/java/com/trueskyventures/skybook/SkyBookApp.java`:

```java
package com.trueskyventures.skybook;

import android.app.Application;

import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;

public class SkyBookApp extends Application {

    // Public OneSignal App ID (NOT a secret). Replace with the real App ID from
    // the OneSignal dashboard before building.
    private static final String ONESIGNAL_APP_ID = "REPLACE_WITH_ONESIGNAL_APP_ID";

    @Override
    public void onCreate() {
        super.onCreate();

        OneSignal.getDebug().setLogLevel(LogLevel.NONE);
        OneSignal.initWithContext(this, ONESIGNAL_APP_ID);

        // Ask for the Android 13+ notification permission (no-op on older versions).
        OneSignal.getNotifications().requestPermission(true, com.onesignal.common.threading.Continue.none());
    }
}
```

> The init + permission API above follows OneSignal 5.x's documented Android (Java) setup. SDK method signatures occasionally change between 5.x minors — confirm against https://documentation.onesignal.com/docs/android-sdk-setup for the pinned version and adjust the `requestPermission`/`initWithContext` calls if the official sample differs. `REPLACE_WITH_ONESIGNAL_APP_ID` is a real value Gerri provides — substitute the actual App ID (it's public, safe to commit).

- [ ] **Step 3: Register the Application class + notification permission in the manifest**

In `skybook-mobile/app/src/main/AndroidManifest.xml`:
1. Add this permission alongside the existing `<uses-permission>` lines:
```xml
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```
2. Add `android:name=".SkyBookApp"` to the `<application>` opening tag, so it reads:
```xml
    <application
        android:name=".SkyBookApp"
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.SkyBook"
        android:usesCleartextTraffic="false">
```

- [ ] **Step 4: Build the APK via the existing GitHub Actions workflow**

Commit and push to trigger `build-apk.yml`:
```bash
cd skybook-mobile
git add app/build.gradle app/src/main/java/com/trueskyventures/skybook/SkyBookApp.java app/src/main/AndroidManifest.xml
git commit -m "feat(push): integrate OneSignal SDK for new-booking notifications"
git push origin main
```
Then open the repo's **Actions** tab → confirm "Build SkyBook APK" succeeds and a new **Release** with `SkyBook.apk` is published. (If the build fails on the OneSignal dependency resolution, re-check the pinned 5.x version from Step 1.)

- [ ] **Step 5: Install + grant permission**

Download the new `SkyBook.apk` from the GitHub Release, install on each staff phone, open it once, and **allow notifications** when prompted. Each device auto-registers as a OneSignal subscriber (visible in the OneSignal dashboard → Audience → Subscriptions).

---

## Phase 3 — End-to-end verification (gated on account + APK install)

### Task 4: Verify delivery

**Files:** none

- [ ] **Step 1: Dashboard test send**

In the OneSignal dashboard → **Messages → New Push → Send to Subscribed Users** a test message. Confirm it arrives on an installed device.

- [ ] **Step 2: Real booking, app states**

Place a test booking on **truetravelnam.net** and on **iventuretours.net**. For each, confirm a notification arrives on a subscriber device with the app:
1. **open** (foreground),
2. **backgrounded**,
3. **fully closed** (swiped away).
Each should read "New True Travel booking" / "New Iventure booking" + the reference.

- [ ] **Step 3: Staff booking must NOT push**

Create a booking **inside SkyBook** (staff/admin). Confirm **no** push is sent (it's `isAdmin`, excluded).

- [ ] **Step 4: Tap → opens to the booking**

Tap a notification → the app opens. Confirm it lands on the booking (via the launch URL) or at least opens SkyBook. (If it opens the system browser instead of the in-app WebView, that's acceptable for v1; see "Optional enhancement" below.)

- [ ] **Step 5: Failure safety**

Temporarily set a wrong `ONESIGNAL_REST_API_KEY` secret, place a website booking, and confirm: the **booking still succeeds** and only a server log line appears (no guest-facing error). Restore the correct key afterward.

---

## Optional enhancement (not required for v1)

**Open the tapped booking inside the app's WebView** instead of the system browser: add a `INotificationClickListener` in `SkyBookApp`/`MainActivity` that reads the notification's `url` (the launch URL) and calls `webView.loadUrl(url)` when `MainActivity` is foregrounded, starting `MainActivity` otherwise. This needs `MainActivity` to expose a way to load a URL into its existing `WebView`. Defer unless desired.

---

## Self-Review

**Spec coverage:**
- New website booking → push to all devices → Task 1 (`sendNewBookingPush`, `included_segments:['Subscribed Users']`) ✓
- App-closed delivery → Tasks 3 (OneSignal SDK in the app) + OneSignal/FCM ✓
- No PII (brand + reference + service only) → Task 1 Step 1 message body ✓
- Never breaks a booking → Task 1 (try/catch, no-op when unset, awaited fast call) + Task 4 Step 5 ✓
- Staff bookings excluded → Task 1 Step 2 (`if(!isAdmin)`) + Task 4 Step 3 ✓
- Secrets server-side; App ID public in app → Task 2 (secrets) + Task 3 Step 2 (App ID constant) ✓
- Rebuild via existing Actions workflow → Task 3 Step 4 ✓
- Tap opens the booking (deep link) → Task 1 `url` + Task 4 Step 4 (+ optional enhancement) ✓
- Standalone unaffected (shared backend) → no `Skybook Final` task ✓

**Placeholder scan:** No TBD/TODO. Two intentional real-value substitutions, not code placeholders: `<token>` (the Supabase access token), `REPLACE_WITH_ONESIGNAL_APP_ID` / `<app-id>` / `<rest-api-key>` (values only Gerri's OneSignal account provides). The OneSignal SDK version (`5.1.6`) and the exact 5.x init/permission API are flagged to confirm against the official doc before building — necessary because external SDK signatures evolve and must not be guessed.

**Type/name consistency:** `sendNewBookingPush` (defined Task 1 Step 1, called Task 1 Step 2) with the `{reference, brandLabel, serviceName, bookingId}` shape consistent across both steps. `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` env names consistent across Task 1 (read), Task 2 (set), and Task 3 (app uses App ID only). Android class `SkyBookApp` consistent between the created file (Task 3 Step 2) and the manifest registration (Task 3 Step 3).
