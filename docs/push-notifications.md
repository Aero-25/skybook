# Push notifications

Two separate pushes, both delivered through OneSignal
(app id `335a7927-cac2-43b6-a901-66f8d23d901d`).

| Push | Trigger | Code |
| --- | --- | --- |
| New booking | every website booking, as it is created | `sendNewBookingPush` in `booking-api` |
| Daily brief | 06:00 CAT (today's arrivals) and 15:00 CAT (tomorrow's prep) | `daily-brief` edge function |

Both broadcast to the `Total Subscriptions` segment — every subscribed device
gets every notification. There is no per-brand or per-consultant targeting.

## What has to be configured

Neither push sends anything until these function secrets exist. Both call
sites check for them and no-op silently when missing, so the failure mode is
silence, not an error.

```
npx supabase secrets set \
  ONESIGNAL_APP_ID=335a7927-cac2-43b6-a901-66f8d23d901d \
  ONESIGNAL_REST_API_KEY=<rest-api-key-from-onesignal> \
  --project-ref <project-ref>
```

The REST key format matters: keys starting `os_v2_` are sent as
`Authorization: Key …`, older keys as `Basic …`. Both call sites handle this.

## The daily brief needs a schedule

The function is complete but **nothing invokes it** — there is no cron job in
any migration. Deploy it, set `CRON_SECRET`, then run
`scripts/daily-brief-cron.sql` in the SQL editor:

```
npx supabase functions deploy daily-brief --project-ref <ref> --use-api --no-verify-jwt
npx supabase secrets set CRON_SECRET=<long-random-string> --project-ref <ref>
```

`--no-verify-jwt` is required: pg_cron calls the function with a shared secret
header, not a user JWT.

## Which devices actually receive a push

| Client | Receives? | How |
| --- | --- | --- |
| iPad / mobile PWA (installed from the site) | Yes | Web push via `sw.js`, which imports the OneSignal worker |
| Desktop browser (Chrome, Edge, Firefox) | Yes | Same web push |
| SkyBook Android app | Yes | Native OneSignal SDK. The page skips web init when the UA contains `SkyBookApp` |
| **SkyBook desktop app (Electron)** | **No** | See below |

The subscribe prompt only runs on `booking-admin.html`. A consultant who never
opens that page is never subscribed.

### The Electron desktop app does not get push

`electron/main.js` loads the hosted admin in a `BrowserWindow`. Electron ships
without a push service, so the Web Push API the OneSignal SDK depends on is not
available — the SDK init fails quietly inside its `try/catch` and the device
never registers. Nothing in the current setup can deliver a notification to it.

Options, if desktop notifications are needed:

- **Run the admin in a desktop browser instead of the Electron wrapper.** Zero
  work; web push already covers Chrome/Edge/Firefox, including when minimised.
- **Add a native notification path to Electron.** The renderer polls or
  subscribes to booking inserts (Supabase realtime) and the main process raises
  an OS notification. This is real work, not configuration.

## Bookings that do not push

`sendNewBookingPush` is called under `if(!isAdmin)`, so a booking a consultant
enters in the admin raises no push. Website bookings — the ones that "come in"
unattended — always do.

## Tap targets

Both pushes carry a launch URL built from a hard-coded host,
`https://skybook-8rd.pages.dev`, in `booking-api` and `daily-brief` (and again
as `SKYBOOK_URL` in `electron/main.js`). If the admin moves to another domain,
these three places must change together or taps will open the old host.
