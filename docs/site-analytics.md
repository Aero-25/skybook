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

## What it reports

Totals (page views, unique visitors, sessions, pages per session, bounce rate,
average time on page, new visitors); traffic per day; hour-of-day and
day-of-week; and ranked breakdowns of channel, referring site, page, country,
timezone, language, device, browser, OS, utm_source and utm_campaign. Every
panel has a table view, and the whole window exports to CSV.

Bounce = a session that lasted under ten seconds.

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
