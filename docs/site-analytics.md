# Site analytics

First-party visitor analytics for the two public brand sites, shown in SkyBook
at `analytics.html` (third card on the workspace gateway).

## How it works

1. `assets/js/site-analytics.js` sits on every page of each brand site and
   sends one beacon on load, then a second one when the visitor leaves.
2. `POST /analytics/collect` and `POST /analytics/engagement` on `booking-api`
   write to `site_visits`. Both are public and always answer 200 — a tracking
   failure must never surface on a guest's page.
3. `GET /admin/analytics` (requires the `reports` permission) aggregates a date
   window and returns every breakdown in one response.

## Privacy

No cookies, no IP addresses, no third party. The visitor id is a random string
in `localStorage` and the session id a random string in `sessionStorage`.
Country is derived from the browser's own timezone, not from an IP lookup, so
nothing personally identifying is stored. Bots, `localhost` and any URL carrying
`admin=1` are skipped.

Because it is first-party, an ad-blocker does not remove it — unlike Google
Analytics, which a large share of European visitors block.

## Tying traffic to revenue

The tracker keeps a first-touch and last-touch attribution record (referrer,
utm parameters, landing page) in `localStorage` and exposes it as
`window.SkyBookAnalytics.attribution()`. Each site's `apiRequest` attaches it to
every new booking under `metadata.analytics`, which is what lets the Revenue tab
report bookings and money by channel, source, campaign, country and device —
not just visits. That injection is wrapped: a missing or broken tracker can
never stop a booking going through.

## Where visitors came from (TikTok, Instagram, Facebook…)

Every session is credited to the platform it started on, decided on the server from the stored visit,
so older traffic is classified the same way (`visitSource` in `booking-api`). In order:

1. **utm tags** — `utm_source=tiktok|instagram|facebook|fb|ig|…` (normalised to a platform name).
2. **The app's built-in browser** — TikTok, Instagram, Facebook and Messenger open links inside
   themselves and name themselves in the user agent. The tracker sends only the app name (`in_app`),
   never the user agent. This catches social visits that carry no referrer and no tags.
3. **Ad click ids** — `ttclid` (TikTok ad), `gclid`/`gbraid`/`wbraid` (Google Ads), `msclkid` (Bing),
   and `fbclid` (Meta, split into Facebook or Instagram by the referrer or app).
4. **The referring site** — tiktok.com, instagram.com, facebook.com, google.*, chatgpt.com, …

A visit is "from ads" when the utm medium says paid/cpc/paid_social or a paid click id is present
(`fbclid` alone is not paid — Meta adds it to every link). Contact taps on the site (WhatsApp, phone,
email) are counted per source, which matters because most guests book over WhatsApp.

Website bookings are credited to the guest's last visit from a known source before booking (a TikTok
click followed by a direct return still counts for TikTok), else their first visit.

Bookings taken by staff never touch the website: the booking form's **Heard about us** field
(`metadata.heard_about`) records where the guest found the business, and the Social & promotions tab
reports it alongside the website numbers.

The **Social & promotions** tab shows TikTok / Instagram / Facebook visits against the previous
period, every source with its visits, ad visits, WhatsApp taps, online bookings and revenue, daily
charts per platform, promotions and campaigns, the staff "heard about us" answers, and a **promotion
link builder** that makes a tagged link (`utm_source`, `utm_medium`, `utm_campaign`) for a bio link,
story, post, WhatsApp status or ad. For Meta ads, set the URL parameters to
`utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`
so campaigns appear by name rather than by number.

## What it reports

Totals (page views, unique visitors, sessions, pages per session, bounce rate,
average time on page, new visitors); traffic per day; hour-of-day and
day-of-week; and ranked breakdowns of channel, referring site, page, country,
timezone, language, device, browser, OS, utm_source and utm_campaign. Every
panel has a table view, and the whole window exports to CSV.

Bounce = a session with under ten seconds of *visible* engagement. Elapsed time
is a poor proxy, since a forgotten background tab would otherwise count as
engaged.

The dashboard is tabbed: Overview, Acquisition, Behaviour, Audience, Technology,
Speed and Revenue. Every headline tile carries a change figure against the
immediately preceding period of the same length.

Speed numbers are real-user measurements (TTFB, first contentful paint, load
complete) taken from the Navigation Timing API in visitors' own browsers, so
"slowest pages" reflects what guests actually experience rather than a lab test.

## Important: it starts from zero

Analytics only counts visits from the moment the tracker is deployed. It cannot
show traffic from before then, and there is no historical data to import: the
Iventure site carried only a Google **Ads** conversion tag (`AW-…`, which is not
analytics), True Travel carried nothing, and no Cloudflare Web Analytics beacon
was installed on either.

## Deploying a change

The tracker is duplicated into each site repo (`assets/js/site-analytics.js`)
because they deploy separately. Editing the copy in this repo does not change
the live sites — copy it into `iventure-site` and `true-travel-site` and deploy
those too.

Backend changes need the migration plus a function deploy:

```
npx supabase db push --project-ref <ref>
npx supabase functions deploy booking-api --project-ref <ref> --use-api
```
