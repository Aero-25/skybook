/* SkyBook first-party analytics beacon.
 *
 * Cookie-free and IP-free. The visitor id is a random string kept in
 * localStorage; geography is derived from the browser's own timezone. Nothing
 * here can block or slow the page: every call is wrapped, failures are
 * swallowed, and beacons are fire-and-forget.
 *
 * It also keeps a first-touch / last-touch attribution record and exposes it as
 * window.SkyBookAnalytics.attribution(), which the booking layer attaches to
 * new bookings so revenue can be traced back to the traffic that produced it.
 *
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
    var API = (script.getAttribute('data-api') || '').replace(/\/+$/, '');
    if (!API) return;

    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || location.search.indexOf('admin=1') > -1) return;
    if (/bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix|preview/i.test(navigator.userAgent)) return;

    var K_VISITOR = 'skybook_analytics_visitor';
    var K_SESSION = 'skybook_analytics_session';
    var K_FIRST = 'skybook_analytics_first_touch';
    var K_LAST = 'skybook_analytics_last_touch';
    var K_ENTRY = 'skybook_analytics_entry';

    function rand() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); }
    function get(store, key) { try { return store.getItem(key); } catch (e) { return null; } }
    function set(store, key, val) { try { store.setItem(key, val); } catch (e) {} }
    function getJson(store, key) { try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; } }

    var visitorId = get(localStorage, K_VISITOR);
    var isNew = !visitorId;
    if (!visitorId) { visitorId = rand(); set(localStorage, K_VISITOR, visitorId); }
    var sessionId = get(sessionStorage, K_SESSION);
    var isEntry = !sessionId;
    if (!sessionId) { sessionId = rand(); set(sessionStorage, K_SESSION, sessionId); }
    if (isEntry) set(sessionStorage, K_ENTRY, location.pathname);
    var landingPath = get(sessionStorage, K_ENTRY) || location.pathname;

    var ua = navigator.userAgent;
    function match(re) { var m = ua.match(re); return m ? m[1] : ''; }
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
    function browserVersion() {
      return match(/Edg\/(\d+)/) || match(/OPR\/(\d+)/) || match(/SamsungBrowser\/(\d+)/) ||
             match(/Chrome\/(\d+)/) || match(/Firefox\/(\d+)/) || match(/Version\/(\d+)/) || '';
    }
    function os() {
      if (/Windows NT/.test(ua)) return 'Windows';
      if (/Android/.test(ua)) return 'Android';
      if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
      if (/Mac OS X/.test(ua)) return 'macOS';
      if (/CrOS/.test(ua)) return 'ChromeOS';
      if (/Linux/.test(ua)) return 'Linux';
      return 'Other';
    }
    function osVersion() {
      var v = match(/Windows NT ([\d.]+)/);
      if (v) return ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' })[v] || v;
      return (match(/Android ([\d.]+)/) || match(/OS ([\d_]+)/) || match(/Mac OS X ([\d_]+)/)).replace(/_/g, '.');
    }

    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}

    var TZ_COUNTRY = {
      'Africa/Windhoek':'Namibia','Africa/Johannesburg':'South Africa','Africa/Gaborone':'Botswana',
      'Africa/Harare':'Zimbabwe','Africa/Maputo':'Mozambique','Africa/Lusaka':'Zambia','Africa/Nairobi':'Kenya',
      'Africa/Lagos':'Nigeria','Africa/Cairo':'Egypt','Africa/Accra':'Ghana','Africa/Casablanca':'Morocco',
      'Africa/Luanda':'Angola','Africa/Kampala':'Uganda','Africa/Dar_es_Salaam':'Tanzania','Africa/Addis_Ababa':'Ethiopia',
      'Europe/London':'United Kingdom','Europe/Dublin':'Ireland','Europe/Berlin':'Germany','Europe/Paris':'France',
      'Europe/Madrid':'Spain','Europe/Rome':'Italy','Europe/Amsterdam':'Netherlands','Europe/Brussels':'Belgium',
      'Europe/Vienna':'Austria','Europe/Zurich':'Switzerland','Europe/Stockholm':'Sweden','Europe/Oslo':'Norway',
      'Europe/Copenhagen':'Denmark','Europe/Helsinki':'Finland','Europe/Warsaw':'Poland','Europe/Prague':'Czechia',
      'Europe/Budapest':'Hungary','Europe/Lisbon':'Portugal','Europe/Athens':'Greece','Europe/Bucharest':'Romania',
      'Europe/Moscow':'Russia','Europe/Kyiv':'Ukraine','Europe/Kiev':'Ukraine','Europe/Istanbul':'Türkiye',
      'Europe/Luxembourg':'Luxembourg','Europe/Zagreb':'Croatia','Europe/Sofia':'Bulgaria','Europe/Vilnius':'Lithuania',
      'Europe/Riga':'Latvia','Europe/Tallinn':'Estonia','Europe/Bratislava':'Slovakia','Europe/Ljubljana':'Slovenia',
      'Europe/Belgrade':'Serbia','Europe/Malta':'Malta','Atlantic/Reykjavik':'Iceland',
      'America/New_York':'United States','America/Chicago':'United States','America/Denver':'United States',
      'America/Los_Angeles':'United States','America/Phoenix':'United States','America/Anchorage':'United States',
      'Pacific/Honolulu':'United States','America/Detroit':'United States','America/Indiana/Indianapolis':'United States',
      'America/Toronto':'Canada','America/Vancouver':'Canada','America/Edmonton':'Canada','America/Winnipeg':'Canada',
      'America/Halifax':'Canada','America/Mexico_City':'Mexico','America/Sao_Paulo':'Brazil',
      'America/Argentina/Buenos_Aires':'Argentina','America/Santiago':'Chile','America/Bogota':'Colombia',
      'America/Lima':'Peru','America/Montevideo':'Uruguay','America/Costa_Rica':'Costa Rica',
      'Asia/Dubai':'United Arab Emirates','Asia/Riyadh':'Saudi Arabia','Asia/Qatar':'Qatar','Asia/Kuwait':'Kuwait',
      'Asia/Jerusalem':'Israel','Asia/Tokyo':'Japan','Asia/Seoul':'South Korea','Asia/Shanghai':'China',
      'Asia/Hong_Kong':'Hong Kong','Asia/Singapore':'Singapore','Asia/Bangkok':'Thailand','Asia/Jakarta':'Indonesia',
      'Asia/Manila':'Philippines','Asia/Kolkata':'India','Asia/Calcutta':'India','Asia/Karachi':'Pakistan',
      'Asia/Kuala_Lumpur':'Malaysia','Asia/Taipei':'Taiwan','Asia/Ho_Chi_Minh':'Vietnam','Asia/Colombo':'Sri Lanka',
      'Australia/Sydney':'Australia','Australia/Melbourne':'Australia','Australia/Brisbane':'Australia',
      'Australia/Perth':'Australia','Australia/Adelaide':'Australia','Australia/Hobart':'Australia',
      'Pacific/Auckland':'New Zealand','Pacific/Fiji':'Fiji'
    };
    function country() {
      if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
      if (!tz) return '';
      var region = tz.split('/')[0];
      return region ? region.replace(/_/g, ' ') : '';
    }

    var params = new URLSearchParams(location.search);
    function utm(n) { return params.get(n) || ''; }

    var referrerHost = '';
    try { referrerHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}

    /* ---- Attribution: remembered so a booking can be traced to its source ---- */
    var touch = {
      referrer: document.referrer || '', referrer_host: referrerHost,
      utm_source: utm('utm_source'), utm_medium: utm('utm_medium'), utm_campaign: utm('utm_campaign'),
      utm_term: utm('utm_term'), utm_content: utm('utm_content'),
      landing_path: location.pathname, at: new Date().toISOString()
    };
    var isRealTouch = !!(touch.referrer_host || touch.utm_source || touch.utm_campaign);
    if (!getJson(localStorage, K_FIRST)) set(localStorage, K_FIRST, JSON.stringify(touch));
    if (isRealTouch || !getJson(localStorage, K_LAST)) set(localStorage, K_LAST, JSON.stringify(touch));

    window.SkyBookAnalytics = {
      visitorId: visitorId,
      sessionId: sessionId,
      attribution: function () {
        return {
          visitor_id: visitorId, session_id: sessionId,
          first_touch: getJson(localStorage, K_FIRST) || null,
          last_touch: getJson(localStorage, K_LAST) || null,
          landing_path: landingPath, country: country(), timezone: tz,
          device_type: device(), browser: browser(), os: os()
        };
      },
      track: function (type, label, href) { event(type, label, href); }
    };

    function post(path, body) {
      try {
        var url = API + path, json = JSON.stringify(body);
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: 'application/json' }))) return;
        fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-brand-code': BRAND },
          body: json, keepalive: true, mode: 'cors'
        }).catch(function () {});
      } catch (e) {}
    }
    function event(type, label, href) {
      post('/analytics/event', {
        brand_code: BRAND, visitor_id: visitorId, session_id: sessionId,
        event_type: String(type || 'click').slice(0, 40),
        label: String(label || '').slice(0, 200),
        href: String(href || '').slice(0, 300),
        path: location.pathname
      });
    }

    /* ---- Real-user page speed ---- */
    function speed() {
      var out = { ttfb_ms: 0, dom_ready_ms: 0, load_ms: 0, fcp_ms: 0 };
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
          out.ttfb_ms = Math.round(nav.responseStart || 0);
          out.dom_ready_ms = Math.round(nav.domContentLoadedEventEnd || 0);
          out.load_ms = Math.round(nav.loadEventEnd || 0);
        }
        var paint = performance.getEntriesByName('first-contentful-paint')[0];
        if (paint) out.fcp_ms = Math.round(paint.startTime || 0);
      } catch (e) {}
      return out;
    }

    var conn = navigator.connection || {};
    function sendVisit() {
      var s = speed();
      post('/analytics/collect', {
        brand_code: BRAND, visitor_id: visitorId, session_id: sessionId, is_new_visitor: isNew,
        is_entry: isEntry, landing_path: landingPath,
        path: location.pathname, query: location.search.slice(0, 500), title: document.title,
        host: location.hostname, referrer: document.referrer,
        utm_source: utm('utm_source'), utm_medium: utm('utm_medium'), utm_campaign: utm('utm_campaign'),
        utm_term: utm('utm_term'), utm_content: utm('utm_content'),
        country: country(), timezone: tz, language: (navigator.language || '').slice(0, 20),
        local_hour: new Date().getHours(),
        device_type: device(), browser: browser(), browser_version: browserVersion(),
        os: os(), os_version: osVersion(),
        screen_width: (window.screen && screen.width) || 0,
        screen_height: (window.screen && screen.height) || 0,
        viewport_width: window.innerWidth || 0, viewport_height: window.innerHeight || 0,
        orientation: (window.innerWidth || 0) >= (window.innerHeight || 0) ? 'landscape' : 'portrait',
        connection_type: conn.effectiveType || '',
        device_memory_gb: Number(navigator.deviceMemory || 0),
        cpu_cores: Number(navigator.hardwareConcurrency || 0),
        is_touch: (navigator.maxTouchPoints || 0) > 0,
        prefers_dark: !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches),
        prefers_reduced_motion: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
        ttfb_ms: s.ttfb_ms, dom_ready_ms: s.dom_ready_ms, load_ms: s.load_ms, fcp_ms: s.fcp_ms
      });
    }
    // Wait for load so the navigation timings are final.
    if (document.readyState === 'complete') setTimeout(sendVisit, 0);
    else window.addEventListener('load', function () { setTimeout(sendVisit, 0); });

    /* ---- Engagement: elapsed vs actually-visible time, and scroll depth ---- */
    var started = Date.now(), engagedMs = 0, lastTick = Date.now(), visible = document.visibilityState !== 'hidden', maxScroll = 0;
    function accrue() { var now = Date.now(); if (visible) engagedMs += now - lastTick; lastTick = now; }
    document.addEventListener('visibilitychange', function () {
      accrue(); visible = document.visibilityState !== 'hidden';
      if (!visible) finish(false);
    });
    window.addEventListener('scroll', function () {
      try {
        var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) || 1;
        maxScroll = Math.max(maxScroll, Math.min(100, Math.round(((window.scrollY + window.innerHeight) / h) * 100)));
      } catch (e) {}
    }, { passive: true });

    var lastSent = 0;
    function finish(final) {
      accrue();
      var now = Date.now();
      // Don't spam on repeated tab switches.
      if (!final && now - lastSent < 5000) return;
      lastSent = now;
      post('/analytics/engagement', {
        session_id: sessionId, path: location.pathname,
        duration_ms: now - started, engaged_ms: engagedMs, max_scroll_pct: maxScroll
      });
    }
    window.addEventListener('pagehide', function () { finish(true); });

    /* ---- Interactions worth counting ---- */
    document.addEventListener('click', function (ev) {
      try {
        var el = ev.target && ev.target.closest && ev.target.closest('a,[data-analytics]');
        if (!el) return;
        var tagged = el.getAttribute && el.getAttribute('data-analytics');
        var href = (el.getAttribute && el.getAttribute('href')) || '';
        var text = (el.textContent || '').trim().slice(0, 120);
        if (tagged) return event('cta', tagged, href);
        if (/^tel:/i.test(href)) return event('contact_phone', text || href.replace(/^tel:/i, ''), href);
        if (/^mailto:/i.test(href)) return event('contact_email', text || href.replace(/^mailto:/i, ''), href);
        if (/wa\.me|whatsapp/i.test(href)) return event('contact_whatsapp', text || 'WhatsApp', href);
        if (/^https?:/i.test(href)) {
          var h = '';
          try { h = new URL(href).hostname.replace(/^www\./, ''); } catch (e) { return; }
          if (h && h !== location.hostname.replace(/^www\./, '')) return event('outbound', h, href);
        }
      } catch (e) {}
    }, true);
  } catch (e) { /* never surface an analytics error to a visitor */ }
})();
