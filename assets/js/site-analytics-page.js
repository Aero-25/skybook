/* SkyBook site analytics dashboard.
 *
 * Reads GET /admin/analytics from the booking API with the signed-in admin's
 * token. Charts are inline SVG built here — no chart library, so the page has
 * no external dependency and works on a slow connection.
 */
(() => {
  'use strict';
  const booking = window.TrueTravelBooking;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { brand: 'iventure', from: '', to: '', tab: 'overview', data: null };

  const fmt = n => Number(n || 0).toLocaleString('en-GB');
  const dur = s => {
    s = Number(s || 0);
    if (!s) return '0s';
    const m = Math.floor(s / 60);
    return m ? `${m}m ${s % 60}s` : `${s}s`;
  };
  const isoDay = d => d.toISOString().slice(0, 10);
  const money = (v, cur) => `${cur || 'NAD'} ${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const ms = v => (Number(v || 0) >= 1000 ? (Number(v) / 1000).toFixed(2) + 's' : Math.round(Number(v || 0)) + 'ms');
  // A delta chip. `invert` marks metrics where a rise is bad (bounce rate).
  function delta(v, invert) {
    if (v === undefined || v === null) return '';
    const n = Number(v);
    if (!n) return '<span class="d flat">no change</span>';
    const good = invert ? n < 0 : n > 0;
    const arrow = n > 0 ? '▲' : '▼';
    return `<span class="d ${good ? 'up' : 'down'}">${arrow} ${Math.abs(n)}${invert ? ' pts' : '%'}</span>`;
  }

  function setRange(days) {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400000);
    state.from = isoDay(from);
    state.to = isoDay(to);
    $('from').value = state.from;
    $('to').value = state.to;
  }

  async function token() {
    const client = await booking.createSupabaseClient();
    const { data } = await client.auth.getSession();
    const t = data && data.session && data.session.access_token;
    if (!t) throw new Error('AUTH');
    return t;
  }

  async function load() {
    const cfg = booking.readConfig();
    const jwt = await token();
    // Inclusive of the whole end day.
    const url = `${cfg.apiBase}/admin/analytics?brand=${encodeURIComponent(state.brand)}`
      + `&from=${encodeURIComponent(state.from + 'T00:00:00.000Z')}`
      + `&to=${encodeURIComponent(state.to + 'T23:59:59.999Z')}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}`, 'x-brand-code': state.brand, apikey: cfg.supabaseAnonKey || '' }
    });
    if (res.status === 401 || res.status === 403) throw new Error('AUTH');
    if (!res.ok) throw new Error(`Analytics request failed (${res.status}).`);
    return res.json();
  }

  /* ---- Ranked bars: single series, every bar directly labelled ---- */
  function bars(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return '<p class="empty">No data in this period.</p>';
    const max = Math.max.apply(null, rows.map(r => r.count)) || 1;
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    return '<div class="bars">' + rows.map(r => {
      const pct = Math.round((r.count / total) * 100);
      const label = opts.label ? opts.label(r.label) : (r.label || 'Unknown');
      return `<div class="bar">
        <span class="lbl" title="${esc(r.label)}">${esc(label)}</span>
        <span class="num">${fmt(r.count)}<span style="color:var(--text-muted);font-weight:400"> · ${pct}%</span></span>
        <span class="track"><span class="fill" style="width:${Math.max(2, (r.count / max) * 100)}%"></span></span>
      </div>`;
    }).join('') + '</div>';
  }

  function revenue(rows, cur, lab) {
    if (!rows || !rows.length) return '<p class="empty">No bookings could be attributed to a traffic source in this period.</p>';
    return '<div class="rev"><span class="h">Source</span><span class="h">Bookings</span><span class="h">Revenue</span>'
      + rows.map(r => `<span class="lbl">${esc((lab ? lab(r.label) : r.label) || 'Unknown')}</span><span class="c">${fmt(r.count)}</span><span class="r">${esc(money(r.revenue, cur))}</span>`).join('')
      + '</div>';
  }

  /* Hour × weekday heatmap — a sequential single hue, light to dark */
  function heatmap(h) {
    if (!h || !h.matrix) return '';
    let max = 0;
    h.matrix.forEach(row => row.forEach(v => { if (v > max) max = v; }));
    if (!max) return '';
    const head = '<tr><th></th>' + [...Array(24)].map((_, i) => `<th>${i % 3 ? '' : String(i).padStart(2, '0')}</th>`).join('') + '</tr>';
    const body = h.matrix.map((row, d) => '<tr><td class="rowlab">' + esc(h.days[d]) + '</td>'
      + row.map((v, hr) => {
          const a = v / max;
          const bg = v ? `background:color-mix(in oklab, var(--series-1) ${Math.round(12 + a * 88)}%, var(--surface-2))` : '';
          return `<td><div class="cell" style="${bg}" title="${esc(h.days[d])} ${String(hr).padStart(2,'0')}:00 — ${fmt(v)} views"></div></td>`;
        }).join('') + '</tr>').join('');
    return `<p class="desc" style="margin:0 0 8px">Busiest hours across the week (UTC) — darker is busier</p>
      <div class="scrollx"><table class="heat" style="min-width:560px">${head}${body}</table></div>`;
  }

  function tableView(rows, head) {
    if (!rows || !rows.length) return '';
    return `<details><summary>Table view</summary><table><thead><tr><th>${esc(head)}</th><th class="n">Views</th></tr></thead><tbody>`
      + rows.map(r => `<tr><td>${esc(r.label || 'Unknown')}</td><td class="n">${fmt(r.count)}</td></tr>`).join('')
      + '</tbody></table></details>';
  }

  /* ---- Timeline: 2 series, crosshair + tooltip ---- */
  function timeline(points) {
    const box = $('tlbox');
    box.innerHTML = '';
    if (!points || !points.length) { box.innerHTML = '<p class="empty">No visits recorded in this period yet.</p>'; return; }

    const W = Math.max(560, box.clientWidth || 900), H = 260;
    const pad = { t: 14, r: 16, b: 30, l: 46 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(1, ...points.map(p => Math.max(p.views, p.visitors)));
    const x = i => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = v => pad.t + ih - (v / max) * ih;
    const path = key => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

    // Recessive gridlines with a tabular scale.
    const ticks = 4, grid = [];
    for (let i = 0; i <= ticks; i++) {
      const v = Math.round((max / ticks) * i), gy = y(v);
      grid.push(`<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="var(--grid)" stroke-width="1"/>`
        + `<text x="${pad.l - 8}" y="${gy + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${fmt(v)}</text>`);
    }
    // Label roughly every eighth point, plus the final one — but drop the final
    // label when it would sit on top of its neighbour.
    const step = Math.ceil(points.length / 8), xlab = [];
    let lastLabelX = -Infinity;
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % step && !isLast) return;
      const px = x(i);
      if (px - lastLabelX < 36) { if (!isLast) return; xlab.pop(); }
      lastLabelX = px;
      xlab.push(`<text x="${px}" y="${H - 10}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${esc(p.date.slice(5))}</text>`);
    });

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Page views and unique visitors per day">
      ${grid.join('')}
      <path d="${path('views')}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${path('visitors')}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.views)}" r="3" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>`).join('')}
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.visitors)}" r="3" fill="var(--series-2)" stroke="var(--surface-1)" stroke-width="2"/>`).join('')}
      ${xlab.join('')}
      <line id="cross" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + ih}" stroke="var(--border-strong)" stroke-width="1" opacity="0"/>
      <rect id="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg><div class="tip" id="tip"></div>`;

    const svg = box.querySelector('svg'), tip = $('tip'), cross = box.querySelector('#cross');
    box.querySelector('#hit').addEventListener('mousemove', ev => {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) * (W / r.width);
      let idx = 0, best = Infinity;
      points.forEach((p, i) => { const d = Math.abs(x(i) - sx); if (d < best) { best = d; idx = i; } });
      const p = points[idx];
      cross.setAttribute('x1', x(idx)); cross.setAttribute('x2', x(idx)); cross.setAttribute('opacity', '1');
      tip.innerHTML = `<div style="font-weight:700;margin-bottom:4px">${esc(p.date)}</div>
        <div><span style="color:var(--series-1)">■</span> Views <b>${fmt(p.views)}</b></div>
        <div><span style="color:var(--series-2)">■</span> Visitors <b>${fmt(p.visitors)}</b></div>`;
      tip.classList.add('on');
      const px = (x(idx) / W) * r.width;
      tip.style.left = Math.min(Math.max(px - 60, 0), r.width - 150) + 'px';
      tip.style.top = '8px';
    });
    box.querySelector('#hit').addEventListener('mouseleave', () => { tip.classList.remove('on'); cross.setAttribute('opacity', '0'); });
  }

  /* ---- Column chart for cyclical buckets (hour, weekday) ---- */
  function columns(target, rows, title) {
    const box = $(target);
    if (!rows || !rows.length) { box.innerHTML = ''; return; }
    const W = Math.max(560, box.clientWidth || 900), H = 170, pad = { t: 10, r: 10, b: 26, l: 40 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(1, ...rows.map(r => r.count));
    const bw = Math.max(6, (iw / rows.length) - 6);
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(title)}">
      <line x1="${pad.l}" y1="${pad.t + ih}" x2="${W - pad.r}" y2="${pad.t + ih}" stroke="var(--grid)" stroke-width="1"/>
      <text x="${pad.l - 8}" y="${pad.t + 8}" text-anchor="end" font-size="10" fill="var(--text-muted)">${fmt(max)}</text>
      ${rows.map((r, i) => {
        const h = (r.count / max) * ih, bx = pad.l + (iw / rows.length) * i + 3;
        return `<rect x="${bx}" y="${pad.t + ih - h}" width="${bw}" height="${Math.max(0, h)}" rx="4" fill="var(--series-1)"><title>${esc(r.label)}: ${fmt(r.count)} views</title></rect>`
          + `<text x="${bx + bw / 2}" y="${H - 9}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${esc(r.label)}</text>`;
      }).join('')}
    </svg>`;
  }

  function panel(title, desc, rows, head, labeller) {
    return `<section class="panel"><h2>${esc(title)}</h2><p class="desc">${esc(desc)}</p>${bars(rows, { label: labeller })}${tableView(rows, head)}</section>`;
  }

  function detailTable(rows, cols) {
    if (!rows || !rows.length) return '<p class="empty">No data in this period.</p>';
    return '<div class="scrollx"><table><thead><tr>'
      + cols.map(c => `<th${c.n ? ' class="n"' : ''}>${esc(c.h)}</th>`).join('')
      + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + cols.map(c => `<td${c.n ? ' class="n"' : ''}>${esc(c.f ? c.f(r) : r[c.k])}</td>`).join('') + '</tr>').join('')
      + '</tbody></table></div>';
  }

  function tiles(d) {
    const t = d.totals || {}, dl = d.deltas || {};
    const cur = t.currency;
    const list = [
      ['Page views', fmt(t.page_views), 'total pages opened', delta(dl.page_views)],
      ['Unique visitors', fmt(t.visitors), 'distinct browsers', delta(dl.visitors)],
      ['Sessions', fmt(t.sessions), 'separate visits', delta(dl.sessions)],
      ['Pages per session', (t.views_per_session || 0).toFixed(2), 'depth of visit', ''],
      ['Bounce rate', (t.bounce_rate || 0) + '%', 'under 10s engaged', delta(dl.bounce_rate, true)],
      ['Avg time on page', dur(t.avg_duration_seconds), 'engaged time', delta(dl.avg_duration_seconds)],
      ['Median time', dur(t.median_duration_seconds), 'typical visit', ''],
      ['Total engaged', (t.total_engaged_minutes || 0) + 'm', 'attention across all visits', ''],
      ['New visitors', fmt(t.new_visitors), 'first ever visit', ''],
      ['Bookings', fmt(t.total_bookings), 'created in this period', ''],
      ['Conversion rate', (t.conversion_rate || 0) + '%', 'sessions that booked', ''],
      ['Attributed revenue', money(t.attributed_revenue, cur), 'from tracked sessions', '']
    ];
    // Long values (a formatted currency total) get a smaller step so the tile
    // row keeps one height.
    $('tiles').innerHTML = list.map(([k, v, n, dd]) =>
      `<div class="tile"><div class="k">${esc(k)}</div><div class="v${String(v).length > 12 ? ' long' : ''}">${esc(v)}</div><div class="n">${esc(n)}</div>${dd}</div>`).join('');
  }

  const CHAN = { direct: 'Direct / typed in', search: 'Search engines', social: 'Social media', referral: 'Other websites', paid: 'Paid ads', email: 'Email', internal: 'Internal' };

  function sections(d) {
    const cur = (d.totals || {}).currency;
    const P = (t, desc, rows, head, lab) => panel(t, desc, rows, head, lab);
    const wide = (t, desc, inner) => `<section class="panel"><h2>${esc(t)}</h2><p class="desc">${esc(desc)}</p>${inner}</section>`;

    if (state.tab === 'overview') return {
      grid: [
        P('Where visitors came from', 'Traffic channel', d.channels, 'Channel', l => CHAN[l] || l),
        P('Referring sites', 'The domain that linked them here', d.referrers, 'Referrer', l => (!l || l === 'Unknown') ? 'Direct (no referrer)' : l),
        P('Most viewed pages', 'By page views', d.top_pages, 'Path'),
        P('Countries', 'From the visitor’s timezone', d.countries, 'Country'),
        P('Devices', 'Phone, tablet or desktop', d.devices, 'Device'),
        P('New vs returning', 'Page views by visitor type', d.visitor_split, 'Type')
      ].join(''), wide: ''
    };

    if (state.tab === 'acquisition') return {
      grid: [
        P('Channels', 'How they arrived', d.channels, 'Channel', l => CHAN[l] || l),
        P('Referring sites', 'Linking domain', d.referrers, 'Referrer', l => (!l || l === 'Unknown') ? 'Direct (no referrer)' : l),
        P('Landing pages', 'First page of the visit', d.landing_pages, 'Path'),
        P('Campaign sources', 'utm_source', d.utm_sources, 'Source'),
        P('Campaigns', 'utm_campaign', d.utm_campaigns, 'Campaign'),
        P('Campaign mediums', 'utm_medium', d.utm_mediums, 'Medium')
      ].join(''), wide: ''
    };

    if (state.tab === 'behaviour') return {
      grid: [
        P('Landing pages', 'Where visits start', d.landing_pages, 'Path'),
        P('Exit pages', 'Where visits end', d.exit_pages, 'Path'),
        P('Time on page', 'Engaged time per view', d.engagement_time, 'Bucket'),
        P('Scroll depth', 'How far down the page', d.scroll_depth, 'Depth'),
        P('Outbound clicks', 'Links off the site', d.outbound, 'Destination'),
        P('Contact clicks', 'Phone, email and WhatsApp taps', d.contact_clicks, 'Type',
          l => ({ contact_phone: 'Phone tap', contact_email: 'Email tap', contact_whatsapp: 'WhatsApp tap' })[l] || l)
      ].join(''),
      wide: wide('Page detail', 'Views, entries, exits, engaged time and scroll for every page',
          detailTable(d.page_table, [
            { h: 'Page', k: 'label' }, { h: 'Views', k: 'count', n: 1, f: r => fmt(r.count) },
            { h: 'Entries', k: 'entries', n: 1, f: r => fmt(r.entries) },
            { h: 'Exits', k: 'exits', n: 1, f: r => fmt(r.exits) },
            { h: 'Exit rate', k: 'exit_rate', n: 1, f: r => r.exit_rate + '%' },
            { h: 'Avg time', k: 'avg_seconds', n: 1, f: r => dur(r.avg_seconds) },
            { h: 'Avg scroll', k: 'avg_scroll', n: 1, f: r => r.avg_scroll + '%' }
          ]))
        + wide('Common journeys', 'The first pages of a session, in order', bars(d.journeys) + tableView(d.journeys, 'Journey'))
        + wide('Tracked interactions', 'Events fired on the sites', bars(d.events, { label: l => ({ cta: 'Tagged CTA', outbound: 'Outbound link', contact_phone: 'Phone tap', contact_email: 'Email tap', contact_whatsapp: 'WhatsApp tap' })[l] || l }))
    };

    if (state.tab === 'audience') return {
      grid: [
        P('Countries', 'From the visitor’s timezone', d.countries, 'Country'),
        P('Timezones', 'Raw browser timezone', d.timezones, 'Timezone'),
        P('Languages', 'Browser language', d.languages, 'Language'),
        P('New vs returning', 'Page views by visitor type', d.visitor_split, 'Type'),
        P('Local time of day', 'The visitor’s own clock', d.by_local_hour, 'Hour'),
        P('Preferences', 'What their device asks for', d.preferences, 'Preference')
      ].join(''), wide: ''
    };

    if (state.tab === 'technology') return {
      grid: [
        P('Devices', 'Phone, tablet or desktop', d.devices, 'Device'),
        P('Browsers', 'Browser in use', d.browsers, 'Browser'),
        P('Browser versions', 'Major version', d.browser_versions, 'Version'),
        P('Operating systems', 'Platform', d.operating_systems, 'OS'),
        P('OS versions', 'Platform version', d.os_versions, 'Version'),
        P('Screen sizes', 'Physical screen', d.screen_sizes, 'Resolution'),
        P('Viewport sizes', 'Actual browser window', d.viewport_sizes, 'Size'),
        P('Orientation', 'Portrait or landscape', d.orientations, 'Orientation'),
        P('Connection quality', 'Reported network type', d.connections, 'Connection'),
        P('CPU cores', 'Logical processors', d.cpu_cores, 'Cores'),
        P('Device memory', 'Reported RAM (GB)', d.device_memory, 'GB')
      ].join(''), wide: ''
    };

    if (state.tab === 'speed') {
      const sp = d.speed || {};
      const tile = (k, v, n) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="n">${esc(n)}</div></div>`;
      return {
        grid: '',
        wide: wide('Real-user page speed', `Measured in visitors’ own browsers · ${fmt(sp.samples)} samples`,
            '<div class="tiles" style="margin:0">'
            + tile('Server response', ms(sp.ttfb_median), 'median time to first byte')
            + tile('First paint', ms(sp.fcp_median), 'median first contentful paint')
            + tile('Fully loaded', ms(sp.load_median), 'median load complete')
            + tile('Avg response', ms(sp.ttfb_avg), 'mean TTFB')
            + tile('Avg first paint', ms(sp.fcp_avg), 'mean FCP')
            + tile('Avg loaded', ms(sp.load_avg), 'mean load')
            + '</div>')
          + wide('Slowest pages', 'Median full load time — the pages worth optimising first',
              detailTable(d.slowest_pages, [{ h: 'Page', k: 'label' }, { h: 'Median load', k: 'count', n: 1, f: r => ms(r.count) }]))
      };
    }

    // Revenue
    return {
      grid: '',
      wide: wide('Revenue by channel', 'Bookings attributed to how the guest arrived', revenue(d.revenue_by_channel, cur, l => CHAN[l] || l))
        + wide('Revenue by source', 'utm_source, or the referring domain', revenue(d.revenue_by_source, cur))
        + wide('Revenue by campaign', 'utm_campaign on the landing URL', revenue(d.revenue_by_campaign, cur))
        + wide('Revenue by country', 'Where the booking guest was browsing from', revenue(d.revenue_by_country, cur))
        + wide('Revenue by device', 'What they booked on', revenue(d.revenue_by_device, cur))
    };
  }

  function render(d) {
    state.data = d;
    tiles(d);
    timeline(d.timeline || []);
    columns('hourbox', d.by_hour || [], 'Page views by hour of day (UTC)');
    columns('daybox', d.by_weekday || [], 'Page views by day of week');
    $('heatwrap').innerHTML = heatmap(d.heatmap);

    const s = sections(d);
    $('panels').innerHTML = s.grid;
    $('wide').innerHTML = s.wide;
    // The time-of-day panel belongs to Overview only.
    $('whenpanel').classList.toggle('hide', state.tab !== 'overview');

    const none = !(d.totals || {}).page_views;
    $('nodata').classList.toggle('hide', !none);
    if (none) {
      $('nodata').innerHTML = '<b>No visits recorded for this brand yet.</b> Analytics counts visits from the moment the '
        + 'tracking script goes live on the site — it cannot show traffic from before then. If the site was deployed '
        + 'recently, check back in a few hours.';
    }
  }

  function csv() {
    const d = state.data;
    if (!d) return;
    const rows = [['section', 'label', 'count', 'extra']];
    [['channel', d.channels], ['referrer', d.referrers], ['page', d.top_pages], ['landing_page', d.landing_pages],
     ['exit_page', d.exit_pages], ['journey', d.journeys], ['country', d.countries], ['timezone', d.timezones],
     ['language', d.languages], ['device', d.devices], ['orientation', d.orientations], ['browser', d.browsers],
     ['browser_version', d.browser_versions], ['os', d.operating_systems], ['os_version', d.os_versions],
     ['connection', d.connections], ['screen_size', d.screen_sizes], ['viewport_size', d.viewport_sizes],
     ['cpu_cores', d.cpu_cores], ['device_memory', d.device_memory], ['preference', d.preferences],
     ['utm_source', d.utm_sources], ['utm_campaign', d.utm_campaigns], ['utm_medium', d.utm_mediums],
     ['engagement_time', d.engagement_time], ['scroll_depth', d.scroll_depth], ['event', d.events],
     ['outbound', d.outbound], ['contact_click', d.contact_clicks], ['slowest_page_ms', d.slowest_pages],
     ['local_hour', d.by_local_hour], ['hour_utc', d.by_hour], ['weekday', d.by_weekday]]
      .forEach(([name, list]) => (list || []).forEach(r => rows.push([name, r.label, r.count, ''])));
    [['revenue_by_channel', d.revenue_by_channel], ['revenue_by_source', d.revenue_by_source],
     ['revenue_by_campaign', d.revenue_by_campaign], ['revenue_by_country', d.revenue_by_country],
     ['revenue_by_device', d.revenue_by_device]]
      .forEach(([name, list]) => (list || []).forEach(r => rows.push([name, r.label, r.count, r.revenue])));
    (d.page_table || []).forEach(r => rows.push(['page_detail', r.label, r.count,
      `entries=${r.entries};exits=${r.exits};exit_rate=${r.exit_rate}%;avg_s=${r.avg_seconds};avg_scroll=${r.avg_scroll}%`]));
    Object.entries(d.totals || {}).forEach(([k, v]) => rows.push(['total', k, v, '']));
    Object.entries(d.speed || {}).forEach(([k, v]) => rows.push(['speed_ms', k, v, '']));
    (d.timeline || []).forEach(p => {
      rows.push(['daily_views', p.date, p.views, '']);
      rows.push(['daily_visitors', p.date, p.visitors, '']);
      rows.push(['daily_sessions', p.date, p.sessions, '']);
    });
    const body = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    a.download = `skybook-analytics-${state.brand}-${state.from}-to-${state.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function refresh() {
    $('sub').textContent = 'Loading…';
    try {
      render(await load());
      $('sub').textContent = `${state.brand === 'iventure' ? 'Iventure' : 'True Travel'} · ${state.from} to ${state.to}`;
    } catch (err) {
      if (err && err.message === 'AUTH') {
        location.href = 'login.html?next=analytics.html';
        return;
      }
      $('sub').textContent = (err && err.message) || 'Could not load analytics.';
    }
  }

  function bind() {
    document.querySelectorAll('[data-brand]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('[data-brand]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      state.brand = b.dataset.brand;
      refresh();
    }));
    document.querySelectorAll('[data-days]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('[data-days]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      setRange(Number(b.dataset.days));
      refresh();
    }));
    $('apply').addEventListener('click', () => {
      state.from = $('from').value || state.from;
      state.to = $('to').value || state.to;
      document.querySelectorAll('[data-days]').forEach(o => o.setAttribute('aria-pressed', 'false'));
      refresh();
    });
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach(o => o.setAttribute('aria-selected', String(o === b)));
      state.tab = b.dataset.tab;
      if (state.data) render(state.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    $('csv').addEventListener('click', csv);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (state.data) render(state.data); }, 180);
    });
  }

  (async () => {
    if (!booking || !booking.createSupabaseClient) {
      $('gate').textContent = 'The SkyBook shared library did not load. Reload the page.';
      return;
    }
    try {
      await token();
    } catch (e) {
      location.href = 'login.html?next=analytics.html';
      return;
    }
    $('gate').classList.add('hide');
    $('app').classList.remove('hide');
    setRange(30);
    bind();
    refresh();
  })();
})();
