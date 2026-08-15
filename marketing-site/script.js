(() => {
  'use strict';

  document.documentElement.classList.add('site-ready');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileDay = window.matchMedia('(max-width: 840px)');

  const header = document.querySelector('[data-header]');
  const menuToggle = document.querySelector('.menu-toggle');
  const primaryNav = document.querySelector('.primary-nav');

  const updateHeader = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 24);
  };

  const closeMenu = () => {
    if (!menuToggle || !primaryNav) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    primaryNav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
  };

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  if (menuToggle && primaryNav) {
    menuToggle.addEventListener('click', () => {
      const willOpen = menuToggle.getAttribute('aria-expanded') !== 'true';
      menuToggle.setAttribute('aria-expanded', String(willOpen));
      primaryNav.classList.toggle('is-open', willOpen);
      document.body.classList.toggle('nav-open', willOpen);
    });

    primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    mobileDay.addEventListener('change', (event) => {
      if (!event.matches) closeMenu();
    });
  }

  const revealItems = [...document.querySelectorAll('.reveal')];
  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  const tiltModel = document.querySelector('[data-tilt]');
  if (tiltModel && !reducedMotion.matches && window.matchMedia('(pointer: fine)').matches) {
    tiltModel.addEventListener('pointermove', (event) => {
      const bounds = tiltModel.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      tiltModel.style.setProperty('--tilt-y', `${((x - 0.5) * 5).toFixed(2)}deg`);
      tiltModel.style.setProperty('--tilt-x', `${((0.5 - y) * 4).toFixed(2)}deg`);
      tiltModel.style.setProperty('--light-x', `${(x * 100).toFixed(1)}%`);
      tiltModel.style.setProperty('--light-y', `${(y * 100).toFixed(1)}%`);
    });
    tiltModel.addEventListener('pointerleave', () => {
      tiltModel.style.setProperty('--tilt-y', '0deg');
      tiltModel.style.setProperty('--tilt-x', '0deg');
      tiltModel.style.setProperty('--light-x', '55%');
      tiltModel.style.setProperty('--light-y', '45%');
    });
  }

  const dayData = [
    {
      time: '07:10', glyph: 'BK', title: 'Reservation received',
      copy: 'A website-sourced booking arrives for review with customer and trip context attached.',
      mobile: 'Source, service, preferred date and guest context begin one connected record.',
      mapLabel: 'Booking received', marker: ['11%', '18%'], color: '#10c1c8',
      signals: [['Source', 'Website', true], ['Status', 'Review', true], ['Next signal', 'Availability', false]]
    },
    {
      time: '07:12', glyph: 'AV', title: 'Capacity checked',
      copy: 'The requested service meets schedule, capacity and availability rules before the team commits the departure.',
      mobile: 'Schedules, blackout rules and capacity help the team understand what can be promised.',
      mapLabel: 'Availability connected', marker: ['31%', '35%'], color: '#42ddd5',
      signals: [['Schedule', 'Matched', true], ['Seats', 'Held', true], ['Next signal', 'Resources', false]]
    },
    {
      time: '07:18', glyph: 'RS', title: 'Resources aligned',
      copy: 'A guide and operating resource are connected to the service with capacity and assignment context.',
      mobile: 'Vehicles, vessels, guides and operating partners meet the departure record.',
      mapLabel: 'Resource assigned', marker: ['52%', '48%'], color: '#4b93ff',
      signals: [['Guide', 'Assigned', true], ['Vehicle', 'Ready', true], ['Capacity', '8 seats', true]]
    },
    {
      time: '07:30', glyph: 'MF', title: 'Manifest takes shape',
      copy: 'Guest counts, pickups, operator details and status become a practical plan for the operating team.',
      mobile: 'The calendar and manifest turn connected records into a departure the team can run.',
      mapLabel: 'Manifest published', marker: ['69%', '60%'], color: '#76e3df',
      signals: [['Guests', '3 listed', true], ['Pickup', '08:15', true], ['Operator', 'Confirmed', true]]
    },
    {
      time: '09:05', glyph: 'CX', title: 'Guest context follows',
      copy: 'The customer profile, booking history, portal actions and support notes remain connected after departure prep.',
      mobile: 'Guest service can work with history and booking context without rebuilding the story.',
      mapLabel: 'Customer updated', marker: ['56%', '72%'], color: '#66d5d1',
      signals: [['Profile', 'Connected', true], ['Request', 'Recorded', true], ['History', 'Available', true]]
    },
    {
      time: '12:20', glyph: 'PY', title: 'Finance state moves',
      copy: 'Payment status, balance, refund or invoice work can follow the booking as the commercial state changes.',
      mobile: 'Payments, refunds, reconciliation and invoices stay tied to the operation that created them.',
      mapLabel: 'Payment recorded', marker: ['76%', '80%'], color: '#eea72e',
      signals: [['Deposit', 'Recorded', true], ['Balance', 'Tracked', true], ['Invoice', 'Linked', true]]
    },
    {
      time: '18:40', glyph: 'RP', title: 'The day becomes insight',
      copy: 'Reporting brings sales, payments, agents, invoices, guides and duty activity into the management handover.',
      mobile: 'Completed activity resolves into reports and a clearer view of what tomorrow needs.',
      mapLabel: 'Day reported', marker: ['88%', '86%'], color: '#4b93ff',
      signals: [['Day', 'Closed', true], ['Reports', 'Ready', true], ['Command', 'Updated', true]]
    }
  ];

  const dayCockpit = document.querySelector('[data-day-cockpit]');
  const dayButtons = [...document.querySelectorAll('[data-day-button]')];
  const dayChapters = [...document.querySelectorAll('[data-day-chapter]')];
  const dayTime = document.querySelector('#day-time');
  const dayCount = document.querySelector('#day-count');
  const dayGlyph = document.querySelector('#day-glyph');
  const dayTitle = document.querySelector('#day-visual-title');
  const dayCopy = document.querySelector('#day-visual-copy');
  const dayMobileCopy = document.querySelector('#day-mobile-copy');
  const dayMapLabel = document.querySelector('#day-map-label');
  const daySignals = document.querySelector('#day-signals');
  const dayProgress = document.querySelector('.cockpit-progress i');
  let activeDay = 0;
  let dayChangeTimer;

  const activateDay = (index, options = {}) => {
    const safeIndex = Math.max(0, Math.min(dayData.length - 1, index));
    const data = dayData[safeIndex];
    activeDay = safeIndex;

    dayButtons.forEach((button, buttonIndex) => {
      const isActive = buttonIndex === safeIndex;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    dayChapters.forEach((chapter, chapterIndex) => chapter.classList.toggle('is-active', chapterIndex === safeIndex));

    if (!dayCockpit) return;
    window.clearTimeout(dayChangeTimer);
    dayCockpit.classList.add('is-changing');
    dayCockpit.dataset.activeStage = String(safeIndex);
    dayCockpit.style.setProperty('--marker-x', data.marker[0]);
    dayCockpit.style.setProperty('--marker-y', data.marker[1]);
    dayCockpit.style.setProperty('--stage-color', data.color);
    if (dayTime) dayTime.textContent = data.time;
    if (dayCount) dayCount.textContent = `${String(safeIndex + 1).padStart(2, '0')} / 07`;
    if (dayGlyph) dayGlyph.textContent = data.glyph;
    if (dayTitle) dayTitle.textContent = data.title;
    if (dayCopy) dayCopy.textContent = data.copy;
    if (dayMobileCopy) dayMobileCopy.textContent = data.mobile;
    if (dayMapLabel) dayMapLabel.textContent = data.mapLabel;
    if (dayProgress) dayProgress.style.width = `${((safeIndex + 1) / dayData.length) * 100}%`;

    if (daySignals) {
      const rows = daySignals.querySelectorAll('p');
      data.signals.forEach((signal, signalIndex) => {
        const row = rows[signalIndex];
        if (!row) return;
        const label = row.querySelector('span');
        const value = row.querySelector('strong');
        const light = row.querySelector('i');
        if (label) label.textContent = signal[0];
        if (value) value.textContent = signal[1];
        if (light) light.classList.toggle('is-on', signal[2]);
      });
    }

    dayChangeTimer = window.setTimeout(() => dayCockpit.classList.remove('is-changing'), reducedMotion.matches ? 0 : 250);

    if (options.centerButton && dayButtons[safeIndex]) {
      dayButtons[safeIndex].scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  dayButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      activateDay(index, { centerButton: mobileDay.matches });
      if (!mobileDay.matches && dayChapters[index]) {
        dayChapters[index].scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
      }
    });
  });

  if ('IntersectionObserver' in window && dayChapters.length) {
    const dayObserver = new IntersectionObserver((entries) => {
      if (mobileDay.matches) return;
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) activateDay(Number(visible[0].target.dataset.dayChapter));
    }, { rootMargin: '-34% 0px -40% 0px', threshold: [0.01, 0.15, 0.35] });
    dayChapters.forEach((chapter) => dayObserver.observe(chapter));
  }

  if (dayCockpit) {
    let pointerStart = null;
    dayCockpit.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      pointerStart = { x: event.clientX, y: event.clientY };
    }, { passive: true });
    dayCockpit.addEventListener('pointerup', (event) => {
      if (!pointerStart || event.pointerType !== 'touch') return;
      const deltaX = event.clientX - pointerStart.x;
      const deltaY = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
      const next = deltaX < 0 ? activeDay + 1 : activeDay - 1;
      activateDay(next, { centerButton: true });
    }, { passive: true });
    dayCockpit.addEventListener('pointercancel', () => { pointerStart = null; }, { passive: true });
  }

  activateDay(0);

  const lensData = {
    operations: {
      angle: '-44deg', number: 'Lens 01 · Operations', heading: 'Can the departure run?', core: 'Ready to operate',
      description: 'Service, calendar, manifest, operator and resource context sit together so the team can prepare the actual departure.',
      points: ['Manifest and pickup context', 'Guide, vehicle or vessel assignment', 'Departure status and capacity']
    },
    guest: {
      angle: '0deg', number: 'Lens 02 · Guest', heading: 'What does the traveller need?', core: 'Guest context visible',
      description: 'Customer profile, booking history, portal actions and service details keep the guest conversation attached to the operational record.',
      points: ['Customer and booking history', 'Portal and support context', 'Service, date and pickup details']
    },
    finance: {
      angle: '46deg', number: 'Lens 03 · Finance', heading: 'What changed financially?', core: 'Balance tracked',
      description: 'Payment status, balance, refund, reconciliation and invoice work can be understood without losing the booking behind the transaction.',
      points: ['Payment and balance state', 'Refund and reconciliation trail', 'Guest and office invoicing context']
    },
    command: {
      angle: '145deg', number: 'Lens 04 · Command', heading: 'What does the day need next?', core: 'Command view updated',
      description: 'The Command Center, notifications, manifest and reporting layers help management see workload, attention and completed activity.',
      points: ['Live operational attention', 'Daily manifest and calendar', 'Sales, payment and duty reporting']
    }
  };

  const lensStage = document.querySelector('[data-lens-stage]');
  const lensButtons = [...document.querySelectorAll('[data-lens]')];
  const lensNumber = document.querySelector('#lens-number');
  const lensHeading = document.querySelector('#lens-heading');
  const lensDescription = document.querySelector('#lens-description');
  const lensList = document.querySelector('#lens-list');
  const coreLabel = document.querySelector('#record-core-label');

  const activateLens = (key, focusButton = false) => {
    const data = lensData[key];
    if (!data || !lensStage) return;
    lensStage.dataset.activeLens = key;
    lensStage.style.setProperty('--lens-angle', data.angle);
    lensButtons.forEach((button) => {
      const isActive = button.dataset.lens === key;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      if (isActive && focusButton) button.focus();
    });
    if (lensNumber) lensNumber.textContent = data.number;
    if (lensHeading) lensHeading.textContent = data.heading;
    if (lensDescription) lensDescription.textContent = data.description;
    if (coreLabel) coreLabel.textContent = data.core;
    if (lensList) {
      const items = lensList.querySelectorAll('li');
      data.points.forEach((point, index) => {
        if (items[index]) items[index].textContent = point;
      });
    }
  };

  lensButtons.forEach((button, index) => {
    button.addEventListener('click', () => activateLens(button.dataset.lens));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
      const nextIndex = (index + direction + lensButtons.length) % lensButtons.length;
      activateLens(lensButtons[nextIndex].dataset.lens, true);
    });
  });

  document.querySelectorAll('.module-row').forEach((row) => {
    row.addEventListener('toggle', () => {
      if (!row.open) return;
      document.querySelectorAll('.module-row').forEach((other) => {
        if (other !== row) other.open = false;
      });
    });
  });

  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
