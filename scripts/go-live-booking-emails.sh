#!/usr/bin/env bash
# Go-live for booking notification emails (Resend).
#
# Run from the repo root. Requires the Supabase CLI and an account with
# access to the project:  npx supabase login
#
# No database migration is needed — email_logs already has every column
# this feature writes (status, error_message, metadata, sent_at,
# provider_message_id) and email_log_status already accepts the statuses
# used. This script only sets function secrets and redeploys booking-api.

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-asagrwkixsaltkkrqdsz}"

if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "RESEND_API_KEY is not set." >&2
  echo "Use a freshly rotated key:  RESEND_API_KEY=re_xxx ./scripts/go-live-booking-emails.sh" >&2
  exit 1
fi

echo "Project: ${PROJECT_REF}"

echo "==> Setting function secrets"
npx supabase secrets set \
  EMAIL_PROVIDER=resend \
  RESEND_API_KEY="${RESEND_API_KEY}" \
  --project-ref "${PROJECT_REF}"

echo "==> Deploying booking-api"
npx supabase functions deploy booking-api --project-ref "${PROJECT_REF}"

echo "==> Confirming secrets are present (values stay hidden)"
npx supabase secrets list --project-ref "${PROJECT_REF}" | grep -E "EMAIL_PROVIDER|RESEND_API_KEY" || true

cat <<'NEXT'

Deployed. Before mail actually flows, both sending domains must show
Verified in the Resend dashboard:

  truetravelnam.net   -> add the TXT record shown under Claim domain
  iventuretours.net   -> waiting on Cloudflare DNS propagation

Resend rejects mail from an unverified domain, and the rejection is
recorded on the email_logs row.

To check delivery after a test booking:

  select created_at, template_key, recipient_email, status,
         provider_message_id, error_message,
         metadata->>'dispatch_provider' as provider
  from email_logs
  order by created_at desc
  limit 10;

Expect two rows per booking: booking_received (to the guest) and
consultant_alert (to the brand's bookings@ inbox).
NEXT
