'use strict';
/* Calendar, Entries and the Photos / Voice notes library. */
(function (QD) {
  const { h, ic } = QD;
  const S = QD.store;
  QD.views = QD.views || {};

  const snippet = (t, n = 140) => { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  const firstPhoto = p => { const it = p.items.find(i => i.type === 'photo' && S.media.has(i.mediaId)); return it ? S.url(it.mediaId) : ''; };
  const count = (p, type) => p.items.filter(i => i.type === type).length;
  const pageTitle = p => p.title.trim() || 'Untitled page';
  const moodName = e => (QD.MOODS.find(m => m[0] === e) || [e, ''])[1];

  function emptyState(icon, title, text, action) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-art', html: ic(icon) }),
      h('h3', { text: title }), h('p', { text }),
      action ? h('button', { class: 'btn primary', html: ic(action.icon || 'pencil') + `<span>${QD.esc(action.label)}</span>`, onclick: action.onClick }) : null);
  }

  function catChips(current, onPick, counts) {
    const wrap = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Filter by category' });
    const opts = [{ id: null, name: 'All', color: null }, ...S.categories, { id: 'none', name: 'No category', color: '#b9b3c9' }];
    for (const c of opts) {
      const n = counts ? counts(c.id) : null;
      if (c.id === 'none' && !n) continue;
      wrap.append(h('button', {
        class: 'chip' + (current === c.id ? ' active' : ''), role: 'tab', 'aria-selected': String(current === c.id),
        style: c.color ? { '--cc': c.color } : null,
        html: (c.color ? '<i class="dot"></i>' : '') + `<span>${QD.esc(c.name)}</span>` + (n != null ? `<small>${n}</small>` : ''),
        onclick: () => onPick(c.id),
      }));
    }
    return wrap;
  }
  const inCat = (p, cat) => !cat || (cat === 'none' ? !S.cat(p.categoryId) : p.categoryId === cat);

  function pageCard(p, opts = {}) {
    const d = QD.parseKey(p.date), cat = S.cat(p.categoryId), thumb = firstPhoto(p);
    const nP = count(p, 'photo'), nV = count(p, 'voice');
    const meta = [];
    if (p.mood) meta.push(`<span title="${QD.esc(moodName(p.mood))}">${p.mood}</span>`);
    if (p.weather) meta.push(`<span>${p.weather}</span>`);
    if (nP) meta.push(`<span>${ic('photo')}${nP}</span>`);
    if (nV) meta.push(`<span>${ic('mic')}${nV}</span>`);
    if ((p.inks || []).some(Boolean)) meta.push(`<span title="Has drawings">${ic('pen')}</span>`);
    meta.push(`<span class="e-time">${ic('clock')}${QD.fmtTime(p.createdAt)}</span>`);
    return h('button', { class: 'entry bx', style: { '--cc': cat ? cat.color : '#b9b3c9' }, onclick: () => QD.app.go('#/page/' + p.id) },
      opts.noDate ? null : h('span', { class: 'e-date' }, h('b', { text: d.getDate() }), h('span', { text: QD.WEEKDAYS[d.getDay()].slice(0, 3) })),
      h('span', { class: 'e-main' },
        h('span', { class: 'e-title', dir: 'auto', text: pageTitle(p) }),
        h('span', { class: 'e-snip', dir: 'auto', text: snippet(p.text) || 'No text yet' }),
        h('span', { class: 'e-meta', html: meta.join('') + (cat ? `<span class="e-cat"><i class="dot"></i>${QD.esc(cat.name)}</span>` : '') })),
      thumb ? h('span', { class: 'e-thumb' }, h('img', { src: thumb, alt: '', loading: 'lazy' })) : null);
  }

  /* ================= Calendar ================= */
  QD.views.calendar = (root, params) => {
    let cur = /^\d{4}-\d{2}$/.test(params.month || '') ? params.month : QD.todayKey().slice(0, 7);
    let sel = QD.todayKey().startsWith(cur) ? QD.todayKey() : cur + '-01';
    root.classList.add('view-calendar');
    const head = h('div', { class: 'view-head' });
    const stats = h('div', { class: 'stats' });
    const grid = h('div', { class: 'cal bx' });
    const side = h('aside', { class: 'cal-side bx' });
    root.append(head, stats, h('div', { class: 'cal-layout' }, grid, side));

    function byDate() {
      const m = {};
      for (const p of S.sorted()) (m[p.date] = m[p.date] || []).push(p);
      return m;
    }
    function streak(map) {
      let n = 0, k = QD.todayKey();
      if (!map[k]) k = QD.addDays(k, -1);
      while (map[k]) { n++; k = QD.addDays(k, -1); }
      return n;
    }
    function draw() {
      const map = byDate();
      // header
      head.innerHTML = '';
      const monthIn = h('input', { type: 'month', class: 'input sm', value: cur, 'aria-label': 'Jump to month' });
      monthIn.addEventListener('change', () => { if (monthIn.value) setMonth(monthIn.value); });
      head.append(h('h1', { html: `${ic('calendar')}<span>Calendar</span>` }),
        h('div', { class: 'cal-nav' },
          h('button', { class: 'icon-btn bx', 'aria-label': 'Previous month', html: ic('chevL'), onclick: () => setMonth(QD.addMonths(cur, -1)) }),
          h('span', { class: 'cal-title', text: QD.fmtMonth(cur) }),
          h('button', { class: 'icon-btn bx', 'aria-label': 'Next month', html: ic('chevR'), onclick: () => setMonth(QD.addMonths(cur, 1)) }),
          monthIn,
          h('button', { class: 'btn sm', text: 'Today', onclick: () => { sel = QD.todayKey(); setMonth(sel.slice(0, 7)); } })));
      // stats
      const monthPages = S.sorted().filter(p => p.date.startsWith(cur));
      const moods = {};
      monthPages.forEach(p => { if (p.mood) moods[p.mood] = (moods[p.mood] || 0) + 1; });
      const topMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];
      const st = (icon, val, label) => h('div', { class: 'stat bx' }, h('span', { class: 'stat-ic', html: icon }), h('b', { text: val }), h('small', { text: label }));
      stats.innerHTML = '';
      stats.append(
        st(ic('book'), monthPages.length, 'pages this month'),
        st(ic('sparkle'), streak(map), 'day streak'),
        st(ic('photo'), monthPages.reduce((a, p) => a + count(p, 'photo'), 0), 'photos'),
        st(ic('mic'), monthPages.reduce((a, p) => a + count(p, 'voice'), 0), 'voice notes'),
        st(topMood ? `<span class="emo">${topMood[0]}</span>` : ic('smile'), topMood ? moodName(topMood[0]) : '—', 'top mood'));
      // grid
      grid.innerHTML = '';
      const ws = +S.settings.weekStart || 0;
      const [y, m] = cur.split('-').map(Number);
      const lead = (new Date(y, m - 1, 1).getDay() - ws + 7) % 7;
      const days = new Date(y, m, 0).getDate();
      const total = Math.ceil((lead + days) / 7) * 7;
      for (let i = 0; i < 7; i++) grid.append(h('div', { class: 'cal-wd', text: QD.WEEKDAYS[(i + ws) % 7].slice(0, 3) }));
      const start = new Date(y, m - 1, 1 - lead);
      const today = QD.todayKey();
      for (let i = 0; i < total; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const k = QD.dateKey(d), ps = map[k] || [], out = !k.startsWith(cur);
        const thumb = ps.map(firstPhoto).find(Boolean);
        const mood = (ps.find(p => p.mood) || {}).mood;
        const cell = h('button', {
          class: 'cal-cell' + (out ? ' out' : '') + (k === today ? ' today' : '') + (k === sel ? ' sel' : '') + (ps.length ? ' has' : ''),
          'aria-label': `${QD.fmtDate(k, 'long')}${ps.length ? `, ${ps.length} page${ps.length > 1 ? 's' : ''}` : ''}`,
        },
          h('span', { class: 'cc-top' }, h('span', { class: 'cc-num', text: d.getDate() }), mood ? h('span', { class: 'emo', text: mood }) : null),
          thumb ? h('span', { class: 'cc-thumb' }, h('img', { src: thumb, alt: '', loading: 'lazy' })) : (ps[0] ? h('span', { class: 'cc-title', dir: 'auto', text: pageTitle(ps[0]) }) : null),
          ps.length ? h('span', { class: 'cc-dots' }, ps.slice(0, 4).map(p => { const c = S.cat(p.categoryId); return h('i', { style: { background: c ? c.color : 'var(--accent)' } }); }), ps.length > 1 ? h('small', { text: ps.length }) : null) : null);
        cell.onclick = () => {
          if (out) { sel = k; setMonth(k.slice(0, 7)); return; }
          sel = k;
          QD.$$('.cal-cell.sel', grid).forEach(c => c.classList.remove('sel'));
          cell.classList.add('sel');
          drawSide(map);
          QD.sfx('click');
        };
        cell.ondblclick = () => QD.app.go('#/day/' + k);
        grid.append(cell);
      }
      QD.stagger(grid, '.cal-cell', 42);
      drawSide(map);
    }
    function drawSide(map) {
      const ps = map[sel] || [];
      side.innerHTML = '';
      side.append(h('div', { class: 'side-date' },
        h('span', { class: 'sd-day', text: QD.parseKey(sel).getDate() }),
        h('span', {}, h('b', { text: QD.WEEKDAYS[QD.parseKey(sel).getDay()] }), h('small', { text: QD.fmtDate(sel) }))));
      if (!ps.length) side.append(h('p', { class: 'muted', text: sel > QD.todayKey() ? 'A page from the future? Plan ahead!' : 'Nothing written on this day yet.' }));
      ps.forEach(p => side.append(pageCard(p, { noDate: true })));
      side.append(h('button', { class: 'btn primary block', html: ic(ps.length ? 'book' : 'pencil') + `<span>${ps.length ? 'Open this day' : 'Write on this day'}</span>`, onclick: () => QD.app.go('#/day/' + sel) }));
    }
    function setMonth(m) {
      cur = m;
      if (!sel.startsWith(cur)) sel = QD.todayKey().startsWith(cur) ? QD.todayKey() : cur + '-01';
      QD.app.replace('#/calendar/' + cur);
      draw();
    }
    draw();
    const off = S.on('pages', draw);
    return () => off();
  };

  /* ================= Entries ================= */
  QD.views.entries = (root, params) => {
    let cat = params.cat || null, query = params.q || '', sort = 'new', shown = [];
    root.classList.add('view-entries');
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search titles, text, captions…', value: query, 'aria-label': 'Search entries', dir: 'auto' });
    const sortBtn = h('button', { class: 'btn sm' });
    const chipsBox = h('div');
    const list = h('div', { class: 'entries' });
    const countEl = h('span', { class: 'muted' });
    root.append(
      h('div', { class: 'view-head' }, h('h1', { html: `${ic('list')}<span>All entries</span>` }), h('div', { class: 'row-ctl' }, countEl,
        h('button', { class: 'btn sm', title: 'Export the days shown here to Excel', html: `${ic('download')}<span>Export .xlsx</span>`, onclick: () => QD.transfer.exportXlsx(shown.slice().sort((x, y) => x.date.localeCompare(y.date)), `QDiary-entries-${QD.todayKey()}.xlsx`) }))),
      h('div', { class: 'filters' }, h('label', { class: 'search' }, h('span', { html: ic('search') }), search), sortBtn),
      chipsBox, list);

    const haystack = p => [p.title, p.text, moodName(p.mood), (S.cat(p.categoryId) || {}).name, ...p.items.map(i => i.caption || i.text || '')].join(' ').toLocaleLowerCase();
    function draw() {
      const all = S.sorted();
      chipsBox.innerHTML = '';
      chipsBox.append(catChips(cat, id => { cat = id; QD.app.replace('#/entries' + (cat ? '?cat=' + cat : '')); draw(); }, id => all.filter(p => inCat(p, id)).length));
      sortBtn.innerHTML = `${ic(sort === 'new' ? 'chevD' : 'chevU')}<span>${sort === 'new' ? 'Newest first' : 'Oldest first'}</span>`;
      const q = query.trim().toLocaleLowerCase();
      let ps = all.filter(p => inCat(p, cat) && (!q || haystack(p).includes(q)));
      if (sort === 'new') ps = ps.reverse();
      shown = ps;
      countEl.textContent = `${ps.length} ${ps.length === 1 ? 'day' : 'days'}`;
      list.innerHTML = '';
      if (!ps.length) {
        list.append(all.length
          ? emptyState('search', 'No matches', 'Try another word or category.')
          : emptyState('book', 'Your diary is empty', 'Every story starts with a single page.', { label: 'Write today', onClick: () => QD.app.go('#/day/' + QD.todayKey()) }));
        return;
      }
      let month = '';
      for (const p of ps) {
        const m = p.date.slice(0, 7);
        if (m !== month) { month = m; list.append(h('h2', { class: 'group-title', text: QD.fmtMonth(m) })); }
        list.append(pageCard(p));
      }
      QD.stagger(list, '.entry');
    }
    search.addEventListener('input', QD.debounce(() => { query = search.value; draw(); }, 150));
    sortBtn.onclick = () => { sort = sort === 'new' ? 'old' : 'new'; draw(); };
    draw();
    const offs = [S.on('pages', draw), S.on('categories', draw)];
    return () => offs.forEach(f => f());
  };

  /* ================= Photos & Voice notes ================= */
  QD.views.media = (root, params) => {
    const kind = params.kind === 'voice' ? 'voice' : 'photo';
    let cat = params.cat || null, query = '', sort = 'new';
    root.classList.add('view-media');
    const nPhoto = S.mediaOf('photo').length, nVoice = S.mediaOf('voice').length;
    const tabs = h('div', { class: 'tabs', role: 'tablist' },
      h('a', { class: 'tab' + (kind === 'photo' ? ' active' : ''), href: '#/photos', role: 'tab', 'aria-selected': String(kind === 'photo'), html: `${ic('photo')}<span>Photos</span><small>${nPhoto}</small>` }),
      h('a', { class: 'tab' + (kind === 'voice' ? ' active' : ''), href: '#/voice', role: 'tab', 'aria-selected': String(kind === 'voice'), html: `${ic('wave')}<span>Voice notes</span><small>${nVoice}</small>` }));
    const search = h('input', { class: 'input', type: 'search', placeholder: kind === 'photo' ? 'Search captions & pages…' : 'Search voice notes & pages…', 'aria-label': 'Search', dir: 'auto' });
    const sortBtn = h('button', { class: 'btn sm' });
    const chipsBox = h('div');
    const grid = h('div', { class: 'media-wrap' });
    root.append(
      h('div', { class: 'view-head' }, h('h1', { html: `${ic(kind === 'photo' ? 'photo' : 'wave')}<span>${kind === 'photo' ? 'Photo album' : 'Voice notes'}</span>` }), tabs),
      h('div', { class: 'filters' }, h('label', { class: 'search' }, h('span', { html: ic('search') }), search), sortBtn),
      chipsBox, grid);

    function entries() {
      const out = [];
      for (const rec of S.mediaOf(kind)) {
        const p = S.pages.get(rec.pageId);
        const it = p && p.items.find(i => i.mediaId === rec.id);
        if (it) out.push({ rec, p, it });
      }
      return out;
    }
    const metaRows = ({ rec, p }) => {
      const added = QD.dateKey(new Date(rec.createdAt)) === p.date ? QD.fmtTime(rec.createdAt) : QD.fmtDateTime(rec.createdAt);
      return h('div', { class: 'm-meta' },
        h('span', { class: 'm-from', title: 'From page', html: `${ic('book')}<span dir="auto">${QD.esc(pageTitle(p))}</span>` }),
        h('span', { title: 'Page date', html: `${ic('calendar')}<span>${QD.esc(QD.fmtDate(p.date, 'wd'))}</span>` }),
        h('span', { title: kind === 'photo' ? 'Added at' : 'Recorded at', html: `${ic('clock')}<span>${kind === 'photo' ? 'Added' : 'Recorded'} ${QD.esc(added)}</span>` }));
    };
    function card(e) {
      const { rec, p, it } = e;
      const open = () => QD.app.go(`#/page/${p.id}/item/${it.id}`);
      const cat = S.cat(p.categoryId);
      const face = kind === 'photo'
        ? h('div', { class: 'pol-img', style: { aspectRatio: String(it.ar || 1) } }, h('img', { src: S.url(rec.id), alt: it.caption || 'Photo', loading: 'lazy' }))
        : QD.voiceFace(rec.id, it.color);
      const c = h('div', { class: 'm-card polaroid', tabindex: '0', role: 'link', 'aria-label': `${it.caption || (kind === 'photo' ? 'Photo' : 'Voice note')} — open page ${pageTitle(p)}`, style: { '--cc': cat ? cat.color : '#b9b3c9', '--tilt': ((rec.id.charCodeAt(rec.id.length - 1) % 5) - 2) * 0.6 + 'deg' } },
        cat ? h('span', { class: 'm-cat', text: cat.name }) : null,
        face,
        h('div', { class: 'pol-cap' + (it.caption ? '' : ' empty-cap'), dir: 'auto', text: it.caption || (kind === 'photo' ? 'No caption' : 'Untitled voice note') }),
        metaRows(e),
        h('div', { class: 'm-actions' },
          kind === 'photo' ? h('button', { class: 'icon-btn sm', title: 'View larger', 'aria-label': 'View larger', html: ic('expand'), onclick: ev => { ev.stopPropagation(); QD.lightbox({ mediaId: rec.id, caption: it.caption, meta: `From “${pageTitle(p)}” · ${QD.fmtDate(p.date, 'long')}`, onOpen: open }); } }) : null,
          h('button', { class: 'btn sm', html: `<span>Open page</span>${ic('chevR')}`, onclick: ev => { ev.stopPropagation(); open(); } })));
      c.addEventListener('click', ev => { if (!ev.target.closest('button, .vwave')) open(); });
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target === c) open(); });
      return c;
    }
    function draw() {
      const all = entries();
      chipsBox.innerHTML = '';
      chipsBox.append(catChips(cat, id => { cat = id; QD.app.replace((kind === 'photo' ? '#/photos' : '#/voice') + (cat ? '?cat=' + cat : '')); draw(); }, id => all.filter(e => inCat(e.p, id)).length));
      sortBtn.innerHTML = `${ic(sort === 'new' ? 'chevD' : 'chevU')}<span>${sort === 'new' ? 'Newest first' : 'Oldest first'}</span>`;
      const q = query.trim().toLocaleLowerCase();
      let list = all.filter(e => inCat(e.p, cat) && (!q || [e.it.caption, e.p.title, e.rec.name].join(' ').toLocaleLowerCase().includes(q)));
      list.sort((a, b) => a.p.date.localeCompare(b.p.date) || a.rec.createdAt - b.rec.createdAt);
      if (sort === 'new') list.reverse();
      grid.innerHTML = '';
      if (!list.length) {
        grid.append(all.length ? emptyState('search', 'No matches', 'Try another word or category.')
          : kind === 'photo'
            ? emptyState('photo', 'No photos yet', 'Add photos to any page — they show up here as polaroids, linked back to their page.', { icon: 'book', label: 'Go to today', onClick: () => QD.app.go('#/day/' + QD.todayKey()) })
            : emptyState('mic', 'No voice notes yet', 'Record a voice note on any page with the mic tool. Every recording is collected here.', { icon: 'book', label: 'Go to today', onClick: () => QD.app.go('#/day/' + QD.todayKey()) }));
        return;
      }
      let month = '', g = null;
      for (const e of list) {
        const m = e.p.date.slice(0, 7);
        if (m !== month) {
          month = m;
          grid.append(h('h2', { class: 'group-title', text: QD.fmtMonth(m) }));
          g = h('div', { class: 'm-grid' + (kind === 'voice' ? ' voice' : '') });
          grid.append(g);
        }
        g.append(card(e));
      }
      QD.stagger(grid, '.m-card');
    }
    search.addEventListener('input', QD.debounce(() => { query = search.value; draw(); }, 150));
    sortBtn.onclick = () => { sort = sort === 'new' ? 'old' : 'new'; draw(); };
    draw();
    const offs = [S.on('media', draw), S.on('categories', draw)];
    return () => offs.forEach(f => f());
  };
})(window.QD);
