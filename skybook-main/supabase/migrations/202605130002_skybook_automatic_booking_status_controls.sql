insert into public.settings (setting_group, setting_key, setting_value, is_public)
values (
  'booking',
  'automation_rules',
  '{"autoConfirmPaidBookings":true,"autoCompletePastConfirmedBookings":true,"autoCancelExpiredAwaitingPayment":false,"awaitingPaymentExpiryHours":48,"sendOnBookingMade":true,"sendOnBookingConfirmed":false,"sendOnPaymentReceived":false,"sendOnCancellationRefund":false}'::jsonb,
  false
)
on conflict (setting_group, setting_key) do update
set setting_value = jsonb_set(
      coalesce(settings.setting_value, '{}'::jsonb),
      '{autoCompletePastConfirmedBookings}',
      'true'::jsonb,
      true
    ),
    updated_at = timezone('utc', now());
