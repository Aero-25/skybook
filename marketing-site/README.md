# Sky Book marketing site

Standalone, dependency-free marketing experience for `skybook.space`. It is intentionally isolated from the operational Sky Book application: nothing in this directory is imported by the admin, booking, portal, login, Electron, PWA, service-worker or Supabase code.

## What is here

- `index.html` — semantic marketing page, SEO metadata, Open Graph/Twitter metadata and SoftwareApplication JSON-LD.
- `styles.css` — responsive visual system, workflow/cockpit illustrations, interaction states and reduced-motion treatment.
- `script.js` — native JavaScript for navigation, reveal states, the operations-day controller, touch swiping, the connected-record lens and module accordion.
- `assets/skybook-workspace-gateway.jpg` — optimized authentic capture of the existing Sky Book workspace gateway.
- `assets/skybook-icon-256.png` — optimized marketing copy of the existing `build/icon.png` source asset.
- `robots.txt` and `sitemap.xml` — crawl hints for the standalone public deployment.

All CSS-built interface scenes are visibly identified in the page as illustrative workflow models. They are not presented as product screenshots.

## Local preview

From `skybook-main`:

```powershell
python -m http.server 4173 --directory marketing-site
```

Then open `http://127.0.0.1:4173/`.

## Standalone deployment

Deploy the contents of `marketing-site/` as the web root. No build command, framework, package install or environment variable is required for the marketing page itself. The repository includes a separate `wrangler.marketing.jsonc`; it deliberately leaves the operational root configuration untouched.

For Cloudflare Pages, run this from `skybook-main`:

```powershell
npx wrangler pages deploy --config wrangler.marketing.jsonc
```

Then attach `skybook.space` (and, if used, `www.skybook.space`) to the `skybook-marketing` Pages project in Cloudflare. Keep the current operational deployment on its existing `*.pages.dev` hostname so `admin.html` and the other workspaces remain available.

Equivalent dashboard settings are:

- Build command: none
- Build output directory: `marketing-site`
- Pages project: `skybook-marketing`
- Production custom domain: `skybook.space`

The primary CTA opens an email to `info@aerodigital.space`. The secondary workspace CTA opens `https://skybook-8rd.pages.dev/admin.html` in a new tab.

## Required future product captures

Authenticated operating screens were not available for safe inclusion. The page reserves three explicit slots; replace the slot artwork only after the following sanitized captures exist.

### 1. Command Center

- PNG or WebP, desktop, minimum 1440 × 900.
- Use a believable seeded operating day.
- Keep operational status, alerts and daily workload visible.
- Remove or replace guest names, email addresses, phone numbers, booking IDs, credentials and any other personal data.

Suggested filename: `assets/skybook-command-center-sanitized.webp`.

### 2. Calendar and Manifest

- PNG or WebP, desktop, minimum 1440 × 900.
- Show a populated day and its manifest context.
- Include service, booking status and a resource assignment.
- Anonymize every guest, pickup, staff member and internal identifier.

Suggested filename: `assets/skybook-calendar-manifest-sanitized.webp`.

### 3. Finance and Reconciliation

- PNG or WebP, desktop, minimum 1440 × 900.
- Show payment, refund, invoice or reconciliation state in a coherent example.
- Remove provider tokens, bank/account data, personal IDs and production transaction identifiers.
- Sanitized amounts may be used if they preserve a truthful UI state.

Suggested filename: `assets/skybook-finance-reconciliation-sanitized.webp`.

After capture, preserve the visible “authentic product capture” label and update each image's `alt` text and caption with what is actually visible. Do not remove the per-deployment integration note: payment, email and provider readiness depends on configured providers, production credentials, domain setup and launch verification.

## QA checklist

- Test 1440px desktop, 1024px tablet, 390px mobile and 320px narrow mobile.
- Verify keyboard operation of navigation, operations-day controls, connected-record lens and module accordions.
- Verify left/right swipe on the operations cockpit at mobile width.
- Verify `prefers-reduced-motion: reduce` removes looping motion and smooth scrolling.
- Verify all mail and external workspace links.
- Validate the HTML, check contrast and inspect the browser console before release.
