# SkyBook

SkyBook is the shared booking, operations, finance, and reporting platform behind the public `True Travel` and `Iventure` sites.

## What lives here

- Shared booking admin
- Shared design studio
- Supabase schema and migrations
- Supabase Edge Functions
- Shared booking engine logic
- Reporting, invoicing, payments, operators, and multi-brand workflows

## Related repositories

- `true-travel-site`
- `iventure-site`

## Deployment model

- Deploy this repository to the admin domain or subdomain
- Keep both public sites on their own domains
- Point all three apps at the same Supabase backend
