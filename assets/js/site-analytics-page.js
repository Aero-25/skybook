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

  const state = { brand: 'iventure', from: '', to: '', data: null };

  const fmt = n => Number(n || 0).toLocaleString('en-GB');
  const dur = s => {
    s = Number(s || 0);
    if (!s) return '0s';
    const m = Math.floor(s / 60);
    return m ? `${m}m ${s % 60}s` : `${s}s`;
  };
  const isoDay = d => d.toISOString().slice(0, 10);

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

  function render(d) {
    state.data = d;
    const t = d.totals || {};
    $('tiles').innerHTML = [
      ['Page views', fmt(t.page_views), 'total pages opened'],
      ['Unique visitors', fmt(t.visitors), 'distinct browsers'],
      ['Sessions', fmt(t.sessions), 'separate visits'],
      ['Pages per session', (t.views_per_session || 0).toFixed(2), 'depth of visit'],
      ['Bounce rate', (t.bounce_rate || 0) + '%', 'left within 10s'],
      ['Avg time on page', dur(t.avg_duration_seconds), 'engaged time'],
      ['New visitors', fmt(t.new_visitors), 'first ever visit']
    ].map(([k, v, n]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="n">${esc(n)}</div></div>`).join('');

    timeline(d.timeline || []);
    columns('hourbox', d.by_hour || [], 'Page views by hour of day (UTC)');
    columns('daybox', d.by_weekday || [], 'Page views by day of week');

    const chan = { direct: 'Direct / typed in', search: 'Search engines', social: 'Social media', referral: 'Other websites', paid: 'Paid ads', email: 'Email', internal: 'Internal' };
    $('panels').innerHTML = [
      panel('Where visitors came from', 'Traffic channel', d.channels || [], 'Channel', l => chan[l] || l),
      panel('Referring sites', 'The domain that linked them here', d.referrers || [], 'Referrer', l => (l === 'Unknown' || !l) ? 'Direct (no referrer)' : l),
      panel('Most viewed pages', 'By page views', d.top_pages || [], 'Path'),
      panel('Countries', 'Derived from the visitor’s timezone', d.countries || [], 'Country'),
      panel('Devices', 'Phone, tablet or desktop', d.devices || [], 'Device'),
      panel('Browsers', 'Browser in use', d.browsers || [], 'Browser'),
      panel('Operating systems', 'Platform in use', d.operating_systems || [], 'OS'),
      panel('Languages', 'Browser language preference', d.languages || [], 'Language'),
      panel('Campaign sources', 'utm_source on the landing URL', d.utm_sources || [], 'Source'),
      panel('Campaigns', 'utm_campaign on the landing URL', d.utm_campaigns || [], 'Campaign'),
      panel('Timezones', 'Raw timezone reported by the browser', d.timezones || [], 'Timezone'),
      panel('Page titles', 'Titles of the pages opened', d.top_titles || [], 'Title')
    ].join('');

    const none = !t.page_views;
    $('nodata').classList.toggle('hide', !none);
    if (none) {
      $('nodata').innerHTML = '<b>No visits recorded for this brand yet.</b> Analytics only counts visits from the moment the '
        + 'tracking script is live on the site — it cannot show traffic from before then. If the site was deployed recently, '
        + 'check back in a few hours.';
    }
  }

  function csv() {
    const d = state.data;
    if (!d) return;
    const rows = [['section', 'label', 'count']];
    [['channel', d.channels], ['referrer', d.referrers], ['page', d.top_pages], ['country', d.countries],
     ['device', d.devices], ['browser', d.browsers], ['os', d.operating_systems], ['language', d.languages],
     ['utm_source', d.utm_sources], ['utm_campaign', d.utm_campaigns], ['timezone', d.timezones]]
      .forEach(([name, list]) => (list || []).forEach(r => rows.push([name, r.label, r.count])));
    (d.timeline || []).forEach(p => { rows.push(['daily_views', p.date, p.views]); rows.push(['daily_visitors', p.date, p.visitors]); });
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
