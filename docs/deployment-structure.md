# Deployment Structure

## Public brands

- `sites/true-travel/`
  - Deploy to the True Travel domain
  - Ocean-led public brand
- `sites/iventure/`
  - Deploy to the Iventure domain
  - Sand-and-dune-led public brand

## Shared admin entity

- `ops/`
  - Deploy to the admin domain or subdomain
  - Brand name: `SkyBook`
  - Shared booking, finance, reporting, operator, and customer management

## Shared backend

All three frontends point to the same Supabase project and Edge Functions.

- Supabase database
- `booking-api`
- `payment-initiate`
- `payment-webhook`

## Brand behavior

- `sites/true-travel/` pages use `data-brand="true-travel"`
- `sites/iventure/` pages use `data-brand="iventure"`
- The shared booking layer tags bookings by brand and keeps references distinct

## Design studio note

`ops/design-admin.html` and `ops/tour-editor.html` read `window.SkyBookConfig.trueTravelSiteBase`.

Default local value:

```html
<script>
window.SkyBookConfig={trueTravelSiteBase:'../sites/true-travel'}
</script>
```

For a live split deployment, change that base to the deployed True Travel URL, for example:

```html
<script>
window.SkyBookConfig={trueTravelSiteBase:'https://www.truetravelnam.net'}
</script>
```

That keeps the admin entity standalone while still allowing the design workspace to preview the public site.
