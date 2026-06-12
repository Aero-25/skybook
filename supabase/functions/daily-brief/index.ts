// SkyBook daily ops briefs — scheduled push summaries.
//   ?type=morning   → 06:00 CAT: today's arrivals
//   ?type=afternoon → 15:00 CAT: tomorrow's arrivals (prep ahead)
//
// Invoked by Supabase cron (pg_cron + pg_net). Deployed with --no-verify-jwt and
// guarded by a shared CRON_SECRET so only the scheduler can trigger it.
// Sends a OneSignal broadcast to every subscribed device (Android + iOS PWA).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') ?? '';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

// Africa/Windhoek is UTC+2 all year (Namibia dropped DST in 2018).
function windhoekDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + 2 * 3600 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

async function arrivalsFor(date: string): Promise<{ bookings: number; guests: number }> {
  // Count non-cancelled / non-no-show bookings landing on this tour date.
  const url = `${SUPABASE_URL}/rest/v1/bookings`
    + `?select=quantity&preferred_date=eq.${date}`
    + `&status=not.in.(cancelled,no_show)`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return { bookings: 0, guests: 0 };
  const rows = await res.json();
  if (!Array.isArray(rows)) return { bookings: 0, guests: 0 };
  const guests = rows.reduce((sum, r) => sum + (Number(r?.quantity) || 0), 0);
  return { bookings: rows.length, guests };
}

async function broadcast(heading: string, content: string, launchUrl: string) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) return;
  const authHeader = ONESIGNAL_REST_API_KEY.startsWith('os_v2_')
    ? `Key ${ONESIGNAL_REST_API_KEY}`
    : `Basic ${ONESIGNAL_REST_API_KEY}`;
  await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      included_segments: ['Total Subscriptions'],
      headings: { en: heading },
      contents: { en: content },
      data: { open_url: launchUrl },
      web_url: launchUrl,
    }),
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'morning';
  const key = url.searchParams.get('key') || req.headers.get('x-cron-key') || '';
  if (CRON_SECRET && key !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const isMorning = type !== 'afternoon';
  const date = windhoekDate(isMorning ? 0 : 1);
  const { bookings, guests } = await arrivalsFor(date);

  const heading = isMorning ? '☀️ Today’s arrivals' : '📋 Tomorrow’s prep';
  const when = isMorning ? 'today' : 'tomorrow';
  const content = bookings === 0
    ? `No tours scheduled ${when}.`
    : `${bookings} booking${bookings !== 1 ? 's' : ''} · ${guests} guest${guests !== 1 ? 's' : ''} ${when}.`;
  // Tapping the brief opens the Arrivals list for that exact date and renders it.
  const launchUrl = `https://skybook-8rd.pages.dev/booking-admin.html?tab=manifest&date=${date}&arrivals=1`;

  try {
    await broadcast(heading, content, launchUrl);
  } catch (err) {
    console.error('daily-brief push failed', err instanceof Error ? err.message : String(err));
  }

  return new Response(
    JSON.stringify({ ok: true, type: isMorning ? 'morning' : 'afternoon', date, bookings, guests }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
