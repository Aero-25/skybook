/* SkyBook first-party analytics beacon.
 *
 * Cookie-free and IP-free. The visitor id is a random string kept in
 * localStorage; geography is derived from the browser's own timezone. Nothing
 * here can block or slow the page: every call is wrapped, failures are
 * swallowed, and the beacon is fire-and-forget.
 *
 * Usage on a brand site:
 *   <script src="assets/js/site-analytics.js"
 *           data-brand="iventure"
 *           data-api="https://<ref>.supabase.co/functions/v1/booking-api"
 *           defer></script>
 */
(function () {
  'use strict';
  try {
    var script = document.currentScript;
    if (!script) return;
    var BRAND = script.getAttribute('data-brand') || 'true-travel';
    var API = script.getAttribute('data-api') || '';
    if (!API) return;

    // Never record our own admin previews or local development.
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || location.search.indexOf('admin=1') > -1) return;

    // Obvious bots. Not exhaustive — it only needs to keep the crawlers that
    // execute JS out of the numbers.
    if (/bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix/i.test(navigator.userAgent)) return;

    var LS_VISITOR = 'skybook_analytics_visitor';
    var SS_SESSION = 'skybook_analytics_session';

    function rand() {
      return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
    }
    function store(read, key, make) {
      try {
        var value = read.getItem(key);
        if (!value) { value = make(); read.setItem(key, value); return { value: value, created: true }; }
        return { value: value, created: false };
      } catch (e) { return { value: make(), created: true }; }
    }

    var visitor = store(localStorage, LS_VISITOR, rand);
    var session = store(sessionStorage, SS_SESSION, rand);

    var ua = navigator.userAgent;
    function device() {
      if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
      if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'mobile';
      return 'desktop';
    }
    function browser() {
      if (/Edg\//.test(ua)) return 'Edge';
      if (/OPR\/|Opera/.test(ua)) return 'Opera';
      if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
      if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
      if (/Firefox\//.test(ua)) return 'Firefox';
      if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
      return 'Other';
    }
    function os() {
      if (/Windows NT/.test(ua)) return 'Windows';
      if (/Android/.test(ua)) return 'Android';
      if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
      if (/Mac OS X/.test(ua)) return 'macOS';
      if (/Linux/.test(ua)) return 'Linux';
      return 'Other';
    }

    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }

    // Timezone → country. Covers the regions this operator actually sees;
    // anything unmapped falls back to the timezone's own region so the row is
    // still useful rather than blank.
    var TZ_COUNTRY = {
      'Africa/Windhoek': 'Namibia', 'Africa/Johannesburg': 'South Africa', 'Africa/Gaborone': 'Botswana',
      'Africa/Harare': 'Zimbabwe', 'Africa/Maputo': 'Mozambique', 'Africa/Lusaka': 'Zambia',
      'Africa/Nairobi': 'Kenya', 'Africa/Lagos': 'Nigeria', 'Africa/Cairo': 'Egypt',
      'Africa/Accra': 'Ghana', 'Africa/Casablanca': 'Morocco', 'Africa/Luanda': 'Angola',
      'Europe/London': 'United Kingdom', 'Europe/Dublin': 'Ireland', 'Europe/Berlin': 'Germany',
      'Europe/Paris': 'France', 'Europe/Madrid': 'Spain', 'Europe/Rome': 'Italy',
      'Europe/Amsterdam': 'Netherlands', 'Europe/Brussels': 'Belgium', 'Europe/Vienna': 'Austria',
      'Europe/Zurich': 'Switzerland', 'Europe/Stockholm': 'Sweden', 'Europe/Oslo': 'Norway',
      'Europe/Copenhagen': 'Denmark', 'Europe/Helsinki': 'Finland', 'Europe/Warsaw': 'Poland',
      'Europe/Prague': 'Czechia', 'Europe/Budapest': 'Hungary', 'Europe/Lisbon': 'Portugal',
      'Europe/Athens': 'Greece', 'Europe/Bucharest': 'Romania', 'Europe/Moscow': 'Russia',
      'Europe/Kyiv': 'Ukraine', 'Europe/Kiev': 'Ukraine', 'Europe/Istanbul': 'Türkiye',
      'Europe/Luxembourg': 'Luxembourg', 'Europe/Zagreb': 'Croatia', 'Europe/Sofia': 'Bulgaria',
      'America/New_York': 'United States', 'America/Chicago': 'United States',
      'America/Denver': 'United States', 'America/Los_Angeles': 'United States',
      'America/Phoenix': 'United States', 'America/Anchorage': 'United States',
      'Pacific/Honolulu': 'United States', 'America/Detroit': 'United States',
      'America/Toronto': 'Canada', 'America/Vancouver': 'Canada', 'America/Edmonton': 'Canada',
      'America/Winnipeg': 'Canada', 'America/Halifax': 'Canada',
      'America/Mexico_City': 'Mexico', 'America/Sao_Paulo': 'Brazil', 'America/Argentina/Buenos_Aires': 'Argentina',
      'America/Santiago': 'Chile', 'America/Bogota': 'Colombia', 'America/Lima': 'Peru',
      'Asia/Dubai': 'United Arab Emirates', 'Asia/Riyadh': 'Saudi Arabia', 'Asia/Qatar': 'Qatar',
      'Asia/Jerusalem': 'Israel', 'Asia/Tokyo': 'Japan', 'Asia/Seoul': 'South Korea',
      'Asia/Shanghai': 'China', 'Asia/Hong_Kong': 'Hong Kong', 'Asia/Singapore': 'Singapore',
      'Asia/Bangkok': 'Thailand', 'Asia/Jakarta': 'Indonesia', 'Asia/Manila': 'Philippines',
      'Asia/Kolkata': 'India', 'Asia/Calcutta': 'India', 'Asia/Karachi': 'Pakistan',
      'Asia/Kuala_Lumpur': 'Malaysia', 'Asia/Taipei': 'Taiwan', 'Asia/Ho_Chi_Minh': 'Vietnam',
      'Australia/Sydney': 'Australia', 'Australia/Melbourne': 'Australia', 'Australia/Brisbane': 'Australia',
      'Australia/Perth': 'Australia', 'Australia/Adelaide': 'Australia',
      'Pacific/Auckland': 'New Zealand'
    };
    function country() {
      if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
      if (!tz) return '';
      var region = tz.split('/')[0];
      return region ? region.replace(/_/g, ' ') : '';
    }

    var params = new URLSearchParams(location.search);
    function utm(name) { return params.get(name) || ''; }

    function post(path, body) {
      try {
        var url = API.replace(/\/+$/, '') + path;
        var json = JSON.stringify(body);
        // sendBeacon survives the page unloading; fetch is the fallback.
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: 'application/json' }))) return;
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-brand-code': BRAND },
          body: json,
          keepalive: true,
          mode: 'cors'
        }).catch(function () {});
      } catch (e) { /* analytics must never break the page */ }
    }

    post('/analytics/collect', {
      brand_code: BRAND,
      visitor_id: visitor.value,
      session_id: session.value,
      is_new_visitor: visitor.created,
      path: location.pathname,
      query: location.search.slice(0, 500),
      title: document.title,
      host: location.hostname,
      referrer: document.referrer,
      utm_source: utm('utm_source'), utm_medium: utm('utm_medium'),
      utm_campaign: utm('utm_campaign'), utm_term: utm('utm_term'), utm_content: utm('utm_content'),
      country: country(), timezone: tz,
      language: (navigator.language || '').slice(0, 20),
      device_type: device(), browser: browser(), os: os(),
      screen_width: (window.screen && screen.width) || 0,
      screen_height: (window.screen && screen.height) || 0
    });

    // Engagement: how long they stayed and how far they scrolled.
    var started = Date.now();
    var maxScroll = 0;
    window.addEventListener('scroll', function () {
      try {
        var doc = document.documentElement;
        var reach = window.scrollY + window.innerHeight;
        var height = Math.max(doc.scrollHeight, document.body.scrollHeight) || 1;
        maxScroll = Math.max(maxScroll, Math.min(100, Math.round((reach / height) * 100)));
      } catch (e) {}
    }, { passive: true });

    var sent = false;
    function finish() {
      if (sent) return;
      sent = true;
      post('/analytics/engagement', {
        session_id: session.value,
        path: location.pathname,
        duration_ms: Date.now() - started,
        max_scroll_pct: maxScroll
      });
    }
    // pagehide is the reliable one on iOS Safari; visibilitychange covers tab switches.
    window.addEventListener('pagehide', finish);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') finish();
    });
  } catch (e) { /* never surface an analytics error to a visitor */ }
})();
