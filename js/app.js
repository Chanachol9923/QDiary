'use strict';
/* App shell: sidebar, routing, boot. */
(function (QD) {
  const { h, ic } = QD;
  const S = QD.store;
  let unmount = null;
  let sideCal = null, navEl = null, catsEl = null, countsEls = {};
  const main = () => document.getElementById('main');

  const NAV = [
    { key: 'journal', icon: 'book', label: 'Journal', href: () => '#/day/' + QD.todayKey() },
    { key: 'calendar', icon: 'calendar', label: 'Calendar', href: () => '#/calendar' },
    { key: 'entries', icon: 'list', label: 'Entries', href: () => '#/entries', count: () => S.pages.size },
    { key: 'photos', icon: 'photo', label: 'Photos', href: () => '#/photos', count: () => S.mediaOf('photo').length },
    { key: 'voice', icon: 'wave', label: 'Voice notes', href: () => '#/voice', count: () => S.mediaOf('voice').length },
    { key: 'settings', icon: 'gear', label: 'Settings', href: () => '#/settings' },
  ];

  QD.app = {
    go(hash, force) {
      if (location.hash === hash) { if (force) render(); }
      else location.hash = hash;
    },
    replace(hash) { history.replaceState(null, '', hash); },
    refresh() { buildSidebar(); render(); },
    setDate(k) { if (sideCal) sideCal.setSelected(k); },
  };

  function buildSidebar() {
    const side = document.getElementById('sidebar');
    side.innerHTML = '';
    const brand = h('div', { class: 'side-head' },
      h('a', { class: 'brand', href: '#/day/' + QD.todayKey(), 'aria-label': 'QDiary home' },
        h('span', { class: 'brand-logo', html: QD.pixelSvg(QD.ICONS.book, { '#': 'var(--accent)' }, 'ic') }),
        h('span', { class: 'brand-name' }, 'QDiary', h('small', { text: 'pixel notebook' }))),
      h('button', { class: 'icon-btn side-fold', title: 'Hide sidebar', 'aria-label': 'Hide sidebar', html: ic('chevL'), onclick: () => QD.app.toggleSidebar() }));
    const write = h('button', { class: 'btn primary block write-btn', html: `${ic('pencil')}<span>Write today</span>`, onclick: () => { closeDrawer(); QD.app.go('#/day/' + QD.todayKey(), true); } });
    navEl = h('nav', { class: 'nav', 'aria-label': 'Main' });
    countsEls = {};
    for (const n of NAV) {
      const c = n.count ? h('small', { class: 'nav-count' }) : null;
      if (c) countsEls[n.key] = c;
      navEl.append(h('a', { class: 'nav-item', 'data-key': n.key, href: n.href(), html: `${ic(n.icon)}<span>${n.label}</span>` }, c));
    }
    sideCal = QD.miniCal({ onPick: k => { closeDrawer(); QD.app.go('#/day/' + k); } });
    catsEl = h('div', { class: 'side-cats' });
    side.append(brand, write, navEl,
      h('div', { class: 'side-block' }, sideCal),
      h('div', { class: 'side-block' }, h('div', { class: 'side-title' }, h('span', { text: 'Categories' }), h('a', { class: 'icon-btn sm', href: '#/settings', title: 'Manage categories', 'aria-label': 'Manage categories', html: ic('gear') })), catsEl));
    updateSidebar();
  }

  function updateSidebar() {
    for (const n of NAV) if (countsEls[n.key]) { const v = n.count(); countsEls[n.key].textContent = v || ''; }
    if (sideCal) sideCal.redraw();
    if (!catsEl) return;
    catsEl.innerHTML = '';
    const counts = {};
    for (const p of S.pages.values()) counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
    const cur = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
    for (const c of S.categories) {
      catsEl.append(h('a', {
        class: 'cat-item' + (location.hash.startsWith('#/entries') && cur === c.id ? ' active' : ''), href: '#/entries?cat=' + c.id, style: { '--cc': c.color },
        html: `<i class="dot"></i><span>${QD.esc(c.name)}</span><small>${counts[c.id] || ''}</small>`,
        onclick: closeDrawer,
      }));
    }
  }

  function setActive(key) {
    if (!navEl) return;
    QD.$$('.nav-item', navEl).forEach(a => {
      const on = a.dataset.key === key;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    updateSidebar();
  }

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
  }

  function render() {
    QD.closePopover();
    QD.closeModals();
    if (unmount) { try { unmount(); } catch (e) { console.error(e); } unmount = null; }
    const { parts, q } = parse();
    const [view, a, b, c] = parts;
    const m = main();
    m.innerHTML = '';
    const root = h('div', { class: 'view' });
    m.append(root);
    let key = 'journal';
    switch (view) {
      case 'page': unmount = QD.views.journal(root, { id: a, item: b === 'item' ? c : null }); break;
      case 'day': unmount = QD.views.journal(root, { date: a }); break;
      case 'new': QD.app.replace('#/day/' + a); unmount = QD.views.journal(root, { date: a }); break;
      case 'calendar': key = 'calendar'; unmount = QD.views.calendar(root, { month: a }); break;
      case 'entries': key = 'entries'; unmount = QD.views.entries(root, { cat: q.get('cat'), q: q.get('q') }); break;
      case 'photos': key = 'photos'; unmount = QD.views.media(root, { kind: 'photo', cat: q.get('cat') }); break;
      case 'voice': key = 'voice'; unmount = QD.views.media(root, { kind: 'voice', cat: q.get('cat') }); break;
      case 'settings': key = 'settings'; unmount = QD.views.settings(root); break;
      default: {
        const last = S.settings.openTo === 'last' && S.pages.get(S.settings.lastPage);
        QD.app.replace(last ? '#/page/' + last.id : '#/day/' + QD.todayKey());
        render();
        return;
      }
    }
    document.body.dataset.view = key;
    setActive(key);
    m.scrollTop = 0;
    const titles = { journal: 'Journal', calendar: 'Calendar', entries: 'Entries', photos: 'Photos', voice: 'Voice notes', settings: 'Settings' };
    document.title = `${titles[key]} · QDiary`;
  }

  /* mobile drawer */
  function openDrawer() { document.body.classList.add('drawer-open'); }
  function closeDrawer() { document.body.classList.remove('drawer-open'); }
  const drawerMode = () => matchMedia('(max-width: 1180px)').matches;
  // wide screens: fold the sidebar away; narrow screens / iPad: slide-in drawer
  QD.app.toggleSidebar = () => {
    if (drawerMode()) { document.body.classList.toggle('drawer-open'); return; }
    const folded = document.body.classList.toggle('side-collapsed');
    try { localStorage.setItem('qd.side', folded ? '0' : '1'); } catch (e) { /* ignore */ }
  };
  try {
    const saved = localStorage.getItem('qd.side');
    if (saved === '0' || (saved == null && QD.isTablet)) document.body.classList.add('side-collapsed');
  } catch (e) { /* ignore */ }

  async function boot() {
    try {
      await S.load();
    } catch (e) {
      console.error(e);
      document.getElementById('main').innerHTML = '<div class="boot-error"><h2>QDiary could not open its storage</h2><p>Your browser may be blocking site storage (private mode or strict privacy settings). Allow storage for this site and reload.</p></div>';
      return;
    }
    QD.applySettings();
    document.getElementById('menu-btn').innerHTML = ic('menu');
    document.getElementById('menu-btn').onclick = () => QD.app.toggleSidebar();
    document.getElementById('scrim').onclick = closeDrawer;
    document.getElementById('mobile-brand').innerHTML = QD.pixelSvg(QD.ICONS.book, { '#': 'var(--accent)' }, 'ic') + '<span>QDiary</span>';
    buildSidebar();
    S.on('pages', updateSidebar);
    S.on('media', updateSidebar);
    S.on('categories', updateSidebar);
    S.on('settings', k => { if (k === 'weekStart' && sideCal) sideCal.redraw(); });
    window.addEventListener('hashchange', () => { closeDrawer(); render(); });
    render();
    document.body.classList.add('ready');
    // keep "today" fresh when the app stays open past midnight
    let day = QD.todayKey();
    setInterval(() => { if (QD.todayKey() !== day) { day = QD.todayKey(); buildSidebar(); } }, 60000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.QD);
