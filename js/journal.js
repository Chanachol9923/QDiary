'use strict';
/* The diary book: one day = a two-page spread (left + right). Typing, drawing (Apple Pencil friendly),
   photos, voice notes, stickers, tape & notes, and draggable page-corner turning between days. */
(function (QD) {
  const { h, ic } = QD;
  const S = QD.store;

  const W = 600, LINE = 32, HEAD = 160, HEAD_R = 64, DPR = 2, GROW = LINE * 8, COVER = 18, CORNER = 76;
  const H0 = 832;
  QD.PAGE_W = W; QD.PAGE_H = H0;

  const TOOLS = [
    { id: 'type', icon: 'type', label: 'Type & arrange', key: 't' },
    { id: 'pen', icon: 'pen', label: 'Pen', key: 'p', size: 3, min: 1, max: 14, alpha: 1 },
    { id: 'marker', icon: 'marker', label: 'Marker', key: 'm', size: 10, min: 4, max: 32, alpha: 0.85 },
    { id: 'highlight', icon: 'highlighter', label: 'Highlighter', key: 'h', size: 22, min: 10, max: 48, alpha: 0.38 },
    { id: 'pixel', icon: 'pixel', label: 'Pixel brush', key: 'x', size: 8, min: 4, max: 32, step: 4, alpha: 1 },
    { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'e', size: 24, min: 6, max: 90 },
  ];
  const TOOL = {};
  TOOLS.forEach(t => { TOOL[t.id] = t; });
  const PEN_SWATCHES = ['ink', '#ff5d8f', '#ff9f43', '#f5c400', '#2fbf71', '#3d8bff', '#8b5cf6', '#ffffff'];
  const HL_SWATCHES = ['#ffe45c', '#ff9ec4', '#8ff0bf', '#9ed2ff', '#cdb4ff', '#ffbf80'];
  const TEXT_COLORS = ['#3a3340', '#ff4d7e', '#ff8a3d', '#e0a800', '#22a861', '#2f7cf6', '#7c4dff', '#9b9b9b'];
  const MARK_COLORS = ['#fff176', '#ffc1d9', '#b8f5d4', '#c4e2ff', '#e2d4ff', '#ffd9b3'];
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const SIZE_PRESETS = { pen: [2, 3, 6], marker: [6, 10, 20], highlight: [14, 22, 36], pixel: [4, 8, 16], eraser: [12, 24, 60] };

  const prefs = (() => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('qd.tools')) || {}; } catch (e) { /* ignore */ }
    return Object.assign({ tool: 'type', colors: { pen: 'ink', marker: '#ff5d8f', highlight: '#ffe45c', pixel: 'ink' }, sizes: {}, zoom: 1 }, p);
  })();
  const savePrefs = () => { try { localStorage.setItem('qd.tools', JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
  const sizeOf = t => prefs.sizes[t] || TOOL[t].size;
  let penSeen = (() => { try { return localStorage.getItem('qd.pen') === '1'; } catch (e) { return false; } })();
  let lastShown = null;
  let pending = null; // set right before navigating after a page turn: { side, noAnim }

  const paperOf = (p, i) => (p.papers && p.papers[i]) || p.paper || 'lined';
  const textOf = el => el.innerText.replace(/ /g, ' ').trim();

  function resolvePage(p) {
    if (p.id && S.pages.has(p.id)) return S.pages.get(p.id);
    const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : QD.todayKey();
    return S.pagesOn(date)[0] || S.newDraft(date);
  }

  /* ---------- geometry helpers for the page curl ---------- */
  function clipPoly(pts, f) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }
  const polyCss = pts => (pts.length >= 3 ? `polygon(${pts.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})` : 'polygon(0 0, 0 0, 0 0)');

  /* ---------- items (shared by the live book and the static page previews) ---------- */
  function placeEl(el, it) {
    el.style.left = it.x + 'px';
    el.style.top = it.y + 'px';
    el.style.width = it.w + 'px';
    if (it.type === 'note' || it.type === 'tape') el.style.height = it.h + 'px';
    el.style.transform = `rotate(${it.r || 0}deg)`;
    el.style.zIndex = it.z || 1;
  }
  function buildItem(it, live) {
    const el = h('div', { class: `item it-${it.type}`, 'data-id': it.id });
    placeEl(el, it);
    const editable = (cls, text, ph, onInput, enterBlurs) => {
      const c = h('div', { class: cls, dir: 'auto', 'data-placeholder': live ? ph : '' });
      c.textContent = text || '';
      if (live) {
        QD.setEditable(c, true);
        c.spellcheck = !!S.settings.spellcheck;
        c.addEventListener('input', () => onInput(c));
        if (enterBlurs) c.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); c.blur(); } });
      }
      return c;
    };
    const cap = () => editable('pol-cap', it.caption, 'Add a caption…', c => { it.caption = c.textContent; live.changed(); }, true);
    if (it.type === 'photo') {
      el.classList.add('polaroid');
      const img = h('div', { class: 'pol-img', style: { aspectRatio: String(it.ar || 1) } }, h('img', { src: S.url(it.mediaId), alt: it.caption || 'Photo', draggable: 'false' }));
      el.append(h('div', { class: 'pol-tape', style: { '--tr': ((it.id.charCodeAt(it.id.length - 1) % 7) - 3) + 'deg' } }), img, cap());
      if (live) img.addEventListener('dblclick', () => QD.lightbox({ mediaId: it.mediaId, caption: it.caption, meta: 'Added ' + QD.fmtDateTime(it.createdAt) }));
    } else if (it.type === 'voice') {
      el.classList.add('polaroid');
      el.append(h('div', { class: 'pol-tape' }), QD.voiceFace(it.mediaId, it.color), cap());
    } else if (it.type === 'note') {
      el.style.setProperty('--note', it.color);
      el.append(h('div', { class: 'note-grip', title: 'Drag to move' }),
        editable('note-text', it.text, 'Write a note…', c => { it.text = c.innerText; live.changed(); }));
    } else if (it.type === 'sticker') {
      el.innerHTML = QD.stickerSvg(it.sticker);
    } else if (it.type === 'tape') {
      el.dataset.pattern = it.pattern;
    }
    return el;
  }

  function stampEl(date) {
    const d = QD.parseKey(date);
    return h('div', { class: 'p-stamp' },
      h('span', { class: 'st-mon', text: QD.MONTHS[d.getMonth()].slice(0, 3).toUpperCase() }),
      h('span', { class: 'st-day', text: d.getDate() }),
      h('span', { class: 'st-wd', text: QD.WEEKDAYS[d.getDay()].slice(0, 3) }));
  }
  function rightHead(date) {
    const d = QD.parseKey(date);
    return h('div', { class: 'p-rhead' },
      h('span', { class: 'rh-date', text: `${QD.WEEKDAYS[d.getDay()].slice(0, 3)} · ${QD.MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}` }));
  }

  /* A non-interactive copy of one side of a day — used under and on the back of a turning page. */
  function staticSide(p, i, height, inkCanvas) {
    const el = h('div', { class: 'side static side-' + (i ? 'r' : 'l'), 'data-paper': paperOf(p, i), style: { width: W + 'px', height: height + 'px' } });
    if (i === 0) {
      const chips = [p.mood, p.weather].filter(Boolean).map(e => h('span', { class: 'p-chip', html: `<span class="emo">${e}</span>` }));
      el.append(h('div', { class: 'p-header' }, stampEl(p.date),
        h('div', { class: 'p-hcol' }, h('div', { class: 'p-title', dir: 'auto', text: p.title || '' }), h('div', { class: 'p-meta' }, chips))));
    } else el.append(rightHead(p.date));
    el.append(h('div', { class: 'p-body', dir: 'auto', html: (i ? p.html2 : p.html) || '' }));
    const layer = h('div', { class: 'p-items' });
    (p.items || []).filter(it => (it.side || 0) === i).forEach(it => layer.append(buildItem(it, null)));
    el.append(layer);
    if (inkCanvas) {
      const c = h('canvas', { class: 'p-ink' });
      c.width = inkCanvas.width; c.height = inkCanvas.height;
      c.style.width = W + 'px'; c.style.height = inkCanvas.height / DPR + 'px';
      c.getContext('2d').drawImage(inkCanvas, 0, 0);
      el.append(c);
    } else {
      const ink = (p.inks || [])[i];
      if (ink && S.media.has(ink)) el.append(h('img', { class: 'p-ink-img', src: S.url(ink), alt: '' }));
    }
    return el;
  }

  QD.staticSide = staticSide;
  QD.views = QD.views || {};
  QD.views.journal = function (root, params) {
    const page = resolvePage(params);
    S.normalize(page);
    const arrived = pending || {};
    pending = null;
    let side = arrived.side === 1 ? 1 : 0; // visible side in one-page layout
    if (params.item) { const it0 = page.items.find(i => i.id === params.item); if (it0) side = it0.side || 0; }
    let tool = TOOL[prefs.tool] ? prefs.tool : 'type';
    let scale = 1, single = false, selected = null, ops = [], redo = [], op = null, destroyed = false, flipping = null, lastBody = null;
    let liveX = 0, liveKey = '';
    const baseImgs = [null, null];
    const dirty = new Set();
    const offs = [];
    const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };

    if (!page.draft) S.setSetting('lastPage', page.id);
    QD.app.setDate(page.date);

    /* ===== skeleton ===== */
    root.classList.add('view-journal');
    if (arrived.noAnim) root.classList.add('no-anim');
    root.classList.toggle('focus', !!prefs.focus);
    const bar = h('div', { class: 'j-bar', role: 'toolbar', 'aria-label': 'Page tools' });
    const palette = h('div', { class: 'j-palette bx' });
    const scroller = h('div', { class: 'j-scroll' });
    const zoomCtl = h('div', { class: 'j-zoom bx' });
    const zoomHud = h('div', { class: 'zoom-hud' });
    const dock = h('div', { class: 'j-dock bx' });
    root.append(bar, h('div', { class: 'j-stage' }, scroller, palette, zoomCtl, zoomHud, dock));

    /* ===== the book ===== */
    const sides = [0, 1].map(i => {
      const el = h('div', { class: 'side side-' + (i ? 'r' : 'l'), 'data-paper': paperOf(page, i) });
      const head = i === 0 ? h('div', { class: 'p-header' }) : rightHead(page.date);
      const body = h('div', {
        class: 'p-body', contenteditable: 'true', spellcheck: S.settings.spellcheck ? 'true' : 'false', dir: 'auto',
        'data-placeholder': i ? 'Keep writing…' : 'Dear diary…', 'aria-label': i ? 'Right page text' : 'Left page text',
        role: 'textbox', 'aria-multiline': 'true',
      });
      if (S.settings.lang) body.setAttribute('lang', S.settings.lang);
      body.innerHTML = (i ? page.html2 : page.html) || '';
      const items = h('div', { class: 'p-items' });
      const ink = h('canvas', { class: 'p-ink' });
      el.append(head, body, items, ink);
      return { el, head, body, items, ink, ctx: ink.getContext('2d') };
    });
    const liveC = h('canvas', { class: 'p-live' });
    const lctx = liveC.getContext('2d');
    const cursor = h('div', { class: 'brush-cursor' });
    const corners = {};
    for (const [k, kind] of [['tl', 'prev'], ['bl', 'prev'], ['tr', 'next'], ['br', 'next']]) {
      corners[k] = h('div', { class: 'corner c-' + k, 'data-corner': k, 'data-kind': kind, title: kind === 'next' ? 'Drag or tap to turn the page' : 'Drag or tap to turn back' });
    }
    const spread = h('div', { class: 'spread' }, sides[0].el, sides[1].el, h('div', { class: 'rings', style: { backgroundImage: QD.RING_URL } }), liveC, cursor, ...Object.values(corners));
    const catTab = h('button', { class: 'cat-tab', title: 'Category' });
    const book = h('div', { class: 'book', 'data-tool': tool }, h('div', { class: 'cover' }), spread, catTab, h('div', { class: 'ribbon' }));
    const wrap = h('div', { class: 'book-wrap' }, book);
    const moreBtn = h('button', { class: 'btn ghost more-paper', html: ic('plus') + '<span>Add more paper</span>', onclick: () => grow(GROW, true) });
    scroller.append(wrap, moreBtn);

    /* ===== save plumbing ===== */
    function changed() {
      if (destroyed) return;
      if (page.draft) {
        S.commit(page);
        history.replaceState(null, '', '#/page/' + page.id);
        S.setSetting('lastPage', page.id);
      }
      page.updatedAt = Date.now();
      S.savePage(page);
    }
    const setStatus = st => {
      if (!statusEl) return;
      statusEl.dataset.state = st;
      statusEl.innerHTML = st === 'saving' ? ic('clock') : st === 'saved' ? ic('check') : ic('pencil');
      statusEl.title = st === 'saving' ? 'Saving…' : st === 'saved' ? 'All changes saved' : 'Blank day — start writing to keep it';
    };
    offs.push(S.on('saving', id => { if (id === page.id) setStatus('saving'); }));
    offs.push(S.on('saved', id => { if (id === page.id) setStatus('saved'); }));

    /* ===== top bar (GoodNotes-style: one slim row) ===== */
    let statusEl = null, undoBtn = null, redoBtn = null;
    const jb = (icon, label, fn, cls = '') => h('button', { class: 'jb ' + cls, title: label, 'aria-label': label, html: ic(icon), onclick: e => fn(e.currentTarget) });
    function renderBar() {
      const day = S.pagesOn(page.date);
      const d = QD.parseKey(page.date);
      bar.innerHTML = '';
      const dateBtn = h('button', { class: 'jb-date', title: 'Jump to a date', html: `<span class="jd-long">${QD.esc(QD.fmtDate(page.date, 'long'))}</span><span class="jd-short">${QD.WEEKDAYS[d.getDay()].slice(0, 3)}, ${QD.MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}</span>${ic('chevD')}` });
      dateBtn.onclick = () => QD.popover(dateBtn, h('div', {},
        QD.miniCal({ selected: page.date, onPick: k => { QD.closePopover(); QD.app.go('#/day/' + k); } }),
        page.date !== QD.todayKey() ? h('button', { class: 'btn sm block', html: `${ic('sparkle')}<span>Go to today</span>`, onclick: () => { QD.closePopover(); QD.app.go('#/day/' + QD.todayKey()); } }) : null), { cls: 'pop-cal' });
      let legacy = null;
      if (day.length > 1 && !page.draft) {
        const i = day.indexOf(page);
        legacy = h('button', { class: 'jb-chip', title: 'This day has more than one entry', text: `${i + 1}/${day.length}`, onclick: () => QD.app.go('#/page/' + day[(i + 1) % day.length].id) });
      }
      const nav = h('div', { class: 'jb-group jb-nav' },
        jb('menu', 'Open menu', () => document.body.classList.add('drawer-open'), 'drawer-btn'),
        jb('chevL', 'Turn back (Alt+←)', () => flipTo('prev')), dateBtn, jb('chevR', 'Turn forward (Alt+→)', () => flipTo('next')), legacy);
      const tools = h('div', { class: 'jb-group jb-tools' });
      for (const t of TOOLS) {
        const b = h('button', { class: 'jb tool' + (t.id === tool ? ' active' : ''), 'data-tool': t.id, 'aria-pressed': String(t.id === tool), title: `${t.label} (${t.key.toUpperCase()})`, 'aria-label': t.label, html: ic(t.icon) });
        b.onclick = () => { if (tool === t.id && t.id !== 'type') { paletteHidden = !paletteHidden; renderPalette(); } else setTool(t.id); };
        tools.append(b);
      }
      tools.append(h('span', { class: 'jb-sep' }), jb('plus', 'Add photo, voice note, sticker…', a => insertMenu(a), 'jb-plus'));
      undoBtn = jb('undo', 'Undo drawing (Ctrl+Z · two-finger tap)', undo);
      redoBtn = jb('redo', 'Redo drawing (Ctrl+Y · three-finger tap)', redoOp);
      statusEl = h('span', { class: 'save-dot', role: 'status' });
      setStatus(page.draft ? 'new' : 'saved');
      const actions = h('div', { class: 'jb-group jb-actions' }, statusEl, undoBtn, redoBtn,
        jb('dots', 'More', a => moreMenu(a)), jb('chevU', 'Hide toolbar (\\)', () => setFocus(true), 'jb-collapse'));
      bar.append(nav, tools, actions);
      updateToolColors();
      updateUndo();
    }
    function updateToolColors() {
      QD.$$('.jb.tool', bar).forEach(b => {
        const t = b.dataset.tool;
        b.style.setProperty('--tc', t === 'type' || t === 'eraser' ? 'transparent' : inkColor(t, single ? side * W : 0));
      });
    }
    function insertMenu(anchor) {
      const tile = (icon, label, fn) => h('button', { class: 'ins-tile', html: `${ic(icon)}<span>${label}</span>`, onclick: () => { QD.closePopover(); fn(); } });
      QD.popover(anchor, h('div', { class: 'ins-grid' },
        tile('photo', 'Photo', () => fileIn.click()),
        tile('mic', 'Voice note', recordVoice),
        tile('note', 'Sticky note', addNote),
        tile('sticker', 'Sticker', () => stickerPicker(anchor)),
        tile('tape', 'Washi tape', () => tapePicker(anchor)),
        tile('paper', 'Paper', () => openPaperPicker(anchor))), { cls: 'pop-ins', align: 'center' });
    }
    function moreMenu(anchor) {
      const t = page.text || '', words = QD.countWords(t), chars = QD.countChars(t);
      const nP = page.items.filter(i => i.type === 'photo').length, nV = page.items.filter(i => i.type === 'voice').length;
      const extra = [nP && `${nP} photo${nP > 1 ? 's' : ''}`, nV && `${nV} voice note${nV > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
      QD.menu(anchor, [
        { info: `${words} ${words === 1 ? 'word' : 'words'} · ${chars} characters${extra ? ' · ' + extra : ''}`, sub: page.draft ? 'Blank day — start writing to keep it' : `Edited ${QD.timeAgo(page.updatedAt)}` },
        { icon: 'paper', label: 'Paper…', onClick: () => openPaperPicker(anchor) },
        { icon: 'calendar', label: 'Move to another day…', onClick: () => moveDate(anchor) },
        { icon: single ? 'spread' : 'single', label: single ? 'Show two pages' : 'Show one page', onClick: toggleLayout },
        { icon: 'expand', label: 'Fit page to screen', hint: 'Ctrl+0', onClick: () => zoomTo(1) },
        { icon: 'chevU', label: 'Hide toolbar', hint: '\\', onClick: () => setFocus(true) },
        { icon: 'print', label: 'Export PDF…', hint: 'Ctrl+P', onClick: exportPdf },
        { icon: 'help', label: 'Shortcuts & gestures', onClick: showShortcuts },
        '-',
        { icon: 'trash', label: 'Delete this day', danger: true, onClick: deletePage },
      ], { align: 'end' });
    }
    function exportPdf() {
      saveInk.now();
      if (!page.draft) S.flush(page.id);
      QD.pdfDialog({ date: page.date, live: { pageId: page.id, inks: sides.map(sd => sd.ink) } });
    }
    function setFocus(on) {
      prefs.focus = on; savePrefs();
      root.classList.toggle('focus', on);
      renderPalette(); renderDock();
      QD.sfx('click');
    }
    function renderDock() {
      dock.innerHTML = '';
      const cur = TOOL[tool];
      dock.append(
        jb(cur.icon, tool === 'type' ? 'Switch to ' + TOOL[prefs.lastDraw || 'pen'].label.toLowerCase() : 'Switch to typing', () => setTool(tool === 'type' ? (prefs.lastDraw || 'pen') : 'type'), tool !== 'type' ? 'active' : ''),
        jb('undo', 'Undo drawing', undo),
        jb('chevD', 'Show toolbar (\\)', () => setFocus(false)));
    }

    function moveDate(anchor) {
      QD.popover(anchor, h('div', {}, h('p', { class: 'pop-title', text: 'Move this day’s pages to…' }),
        QD.miniCal({
          selected: page.date, onPick: k => {
            QD.closePopover();
            if (k === page.date) return;
            if (S.pagesOn(k).length) { QD.toast('That day already has pages', { icon: 'close' }); return; }
            page.date = k;
            changed();
            QD.toast('Moved to ' + QD.fmtDate(k), { icon: 'calendar' });
            QD.app.go('#/page/' + page.id, true);
          },
        })), { cls: 'pop-cal', align: 'end' });
    }

    async function deletePage() {
      if (page.draft && S.isEmpty(page)) { QD.toast('This day is empty — nothing to delete'); return; }
      const ok = await QD.confirm({ title: 'Delete this day?', text: 'Both pages — text, drawings, photos and voice notes — will be removed for good.', ok: 'Delete', danger: true });
      if (!ok) return;
      if (QD.player.id && S.media.get(QD.player.id)?.pageId === page.id) QD.player.stop();
      destroyed = true;
      if (!page.draft) await S.deletePage(page.id);
      QD.sfx('del');
      QD.toast('Day deleted', { icon: 'trash' });
      QD.app.go('#/day/' + page.date, true);
    }

    /* ===== left-page header ===== */
    function renderHeader() {
      const head = sides[0].head;
      head.innerHTML = '';
      const title = h('input', { class: 'p-title', type: 'text', placeholder: 'Title of today…', maxlength: '120', dir: 'auto', 'aria-label': 'Page title', spellcheck: S.settings.spellcheck ? 'true' : 'false' });
      title.value = page.title;
      if (S.settings.lang) title.setAttribute('lang', S.settings.lang);
      title.addEventListener('input', () => { page.title = title.value; changed(); });
      title.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); placeCaretEnd(sides[0].body); } });
      const moodLabel = page.mood ? (QD.MOODS.find(m => m[0] === page.mood) || [page.mood, 'Mood'])[1] : '';
      const moodBtn = h('button', { class: 'p-chip', title: 'Mood', html: page.mood ? `<span class="emo">${page.mood}</span><span>${moodLabel}</span>` : `${ic('smile')}<span>Mood</span>` });
      moodBtn.onclick = () => emojiPicker(moodBtn, QD.MOODS, page.mood, v => { page.mood = v; changed(); renderHeader(); });
      const wLabel = page.weather ? (QD.WEATHER.find(m => m[0] === page.weather) || [page.weather, 'Weather'])[1] : '';
      const weatherBtn = h('button', { class: 'p-chip', title: 'Weather', html: page.weather ? `<span class="emo">${page.weather}</span><span>${wLabel}</span>` : `${ic('sun')}<span>Weather</span>` });
      weatherBtn.onclick = () => emojiPicker(weatherBtn, QD.WEATHER, page.weather, v => { page.weather = v; changed(); renderHeader(); });
      const cat = S.cat(page.categoryId);
      const catBtn = h('button', { class: 'p-chip cat-chip', title: 'Category', style: { '--cc': cat ? cat.color : '#b9b3c9' }, html: `<i class="dot"></i><span>${QD.esc(cat ? cat.name : 'No category')}</span>` });
      catBtn.onclick = () => categoryPicker(catBtn);
      head.append(stampEl(page.date), h('div', { class: 'p-hcol' }, title, h('div', { class: 'p-meta' }, moodBtn, weatherBtn, catBtn)));
      catTab.style.setProperty('--cc', cat ? cat.color : '#b9b3c9');
      catTab.innerHTML = `<span>${QD.esc(cat ? cat.name : 'No category')}</span>`;
      catTab.onclick = () => categoryPicker(catTab);
    }

    function emojiPicker(anchor, list, current, onPick) {
      const grid = h('div', { class: 'emoji-grid' }, list.map(([e, name]) => h('button', {
        class: 'emoji-btn' + (e === current ? ' active' : ''), title: name,
        html: `<span class="emo">${e}</span><small>${QD.esc(name)}</small>`,
        onclick: () => { QD.closePopover(); onPick(e); QD.sfx('pop'); },
      })));
      const content = h('div', {}, grid, current ? h('button', { class: 'linkbtn', html: ic('close') + '<span>Clear</span>', onclick: () => { QD.closePopover(); onPick(null); } }) : null);
      QD.popover(anchor, content, { cls: 'pop-emoji' });
    }

    function categoryPicker(anchor) {
      const list = h('div', { class: 'menu' });
      for (const c of [...S.categories, null]) {
        const active = c ? page.categoryId === c.id : !page.categoryId;
        list.append(h('button', {
          class: 'menu-item' + (active ? ' active' : ''), style: { '--cc': c ? c.color : '#b9b3c9' },
          html: `<i class="dot"></i><span>${QD.esc(c ? c.name : 'No category')}</span>${active ? ic('check') : ''}`,
          onclick: () => { page.categoryId = c ? c.id : null; changed(); renderHeader(); QD.closePopover(); QD.sfx('click'); },
        }));
      }
      const input = h('input', { class: 'input sm', placeholder: 'New category…', maxlength: '32', dir: 'auto' });
      const add = () => {
        const name = input.value.trim();
        if (!name) return;
        const c = { id: QD.uid('c'), name, color: QD.CAT_COLORS[S.categories.length % QD.CAT_COLORS.length] };
        S.categories.push(c);
        S.saveCategories();
        page.categoryId = c.id;
        changed(); renderHeader(); QD.closePopover();
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) add(); });
      QD.popover(anchor, h('div', {}, list, h('div', { class: 'menu-add' }, input, h('button', { class: 'icon-btn bx sm', 'aria-label': 'Add category', html: ic('plus'), onclick: add }))), { cls: 'pop-menu', align: anchor === catTab ? 'end' : 'start' });
    }

    function openPaperPicker(anchor) {
      let target = single ? String(side) : 'both';
      const grid = h('div', { class: 'paper-grid' });
      const drawTiles = () => {
        grid.innerHTML = '';
        const cur = page.papers[target === 'both' ? 0 : +target];
        for (const p of QD.PAPERS) {
          const tile = h('button', { class: 'paper-tile' + (p.id === cur ? ' active' : ''), title: p.name },
            h('span', { class: 'paper-mini' }, h('span', { class: 'pm-inner', 'data-paper': p.id })), h('span', { class: 'paper-name', text: p.name }));
          tile.onclick = () => {
            for (const i of target === 'both' ? [0, 1] : [+target]) { page.papers[i] = p.id; sides[i].el.dataset.paper = p.id; }
            if (!page.draft) changed();
            QD.sfx('click');
            drawTiles();
            renderPalette(); updateToolColors();
          };
          grid.append(tile);
        }
      };
      const seg = h('div', { class: 'seg seg-sm' });
      for (const [v, label] of [['both', 'Both pages'], ['0', 'Left'], ['1', 'Right']]) {
        const b = h('button', { class: 'seg-btn' + (v === target ? ' active' : ''), text: label });
        b.onclick = () => { target = v; QD.$$('.seg-btn', seg).forEach(x => x.classList.toggle('active', x === b)); drawTiles(); };
        seg.append(b);
      }
      drawTiles();
      const def = h('button', { class: 'linkbtn', html: ic('star') + '<span>Use for new days</span>', onclick: () => { S.setSetting('paper', page.papers[target === 'both' ? 0 : +target]); QD.toast('Default paper updated', { icon: 'check' }); QD.closePopover(); } });
      QD.popover(anchor, h('div', {}, h('p', { class: 'pop-title', text: 'Paper' }), seg, grid, def), { cls: 'pop-paper', align: 'end' });
    }

    /* ===== text on both pages ===== */
    let countTimer = 0;
    function syncBody() {
      page.html = sides[0].body.innerHTML;
      page.html2 = sides[1].body.innerHTML;
      page.text = [textOf(sides[0].body), textOf(sides[1].body)].filter(Boolean).join('\n');
      sides.forEach(s => s.body.classList.toggle('is-empty', !textOf(s.body) && !s.body.querySelector('.chk')));
    }
    sides.forEach(s => s.body.classList.toggle('is-empty', !s.body.textContent.trim() && !s.body.querySelector('.chk')));
    sides.forEach(s => {
      listen(s.body, 'focus', () => { lastBody = s.body; textFocused = true; renderPalette(); });
      listen(s.body, 'blur', () => setTimeout(() => {
        if (destroyed) return;
        textFocused = sides.some(x => x.body === document.activeElement);
        if (!textFocused && !document.querySelector('.pop-sw')) renderPalette();
      }, 120));
      listen(s.body, 'input', () => { syncBody(); autoGrow(); changed(); });
      listen(s.body, 'paste', e => {
        const cd = e.clipboardData;
        if (!cd) return;
        const files = Array.from(cd.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length) { e.preventDefault(); addPhotos(files); return; }
        e.preventDefault();
        document.execCommand('insertText', false, cd.getData('text/plain'));
      });
      listen(s.body, 'click', e => {
        const c = e.target.closest('.chk');
        if (c) { c.classList.toggle('on'); syncBody(); changed(); QD.sfx('click'); }
      });
      listen(s.body, 'keydown', e => {
        if (e.isComposing) return;
        if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, ' '); }
      });
    });

    function placeCaretEnd(el) {
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const s = getSelection();
      s.removeAllRanges(); s.addRange(r);
    }
    function ensureBodySelection() {
      const s = getSelection();
      if (s.rangeCount && sides.some(x => x.body.contains(s.anchorNode))) return;
      placeCaretEnd(lastBody || sides[single ? side : 0].body);
    }
    function fmt(cmd, val) {
      ensureBodySelection();
      document.execCommand('styleWithCSS', false, cmd === 'hiliteColor' || cmd === 'foreColor');
      document.execCommand(cmd, false, val);
      syncBody(); changed();
    }

    /* ===== sizing & layout ===== */
    function applyHeight() {
      spread.style.height = page.height + 'px';
      sides.forEach((s, i) => {
        s.el.style.height = page.height + 'px';
        s.body.style.minHeight = (page.height - (i ? HEAD_R : HEAD) - LINE) + 'px';
      });
      layout();
    }
    function layout() {
      const aw = Math.max(240, scroller.clientWidth - 28 - 44), ah = Math.max(240, scroller.clientHeight - 24);
      const spreadW = 2 * W + 2 * COVER, singleW = W + 2 * COVER, bh = H0 + 2 * COVER;
      const fitSpread = Math.min(aw / spreadW, ah / bh);
      const mode = S.settings.layout || 'auto';
      const was = single;
      single = mode === 'single' || (mode !== 'spread' && (aw < ah * 0.9 || fitSpread < 0.42));
      const fit = single ? Math.min(aw / singleW, ah / bh) : fitSpread;
      scale = QD.clamp(fit * (prefs.zoom || 1), 0.15, 5);
      const bw = single ? singleW : spreadW, bhh = page.height + 2 * COVER;
      book.classList.toggle('single', single);
      book.style.width = bw + 'px';
      book.style.height = bhh + 'px';
      book.style.transform = `scale(${scale})`;
      spread.style.transform = single ? `translateX(${-side * W}px)` : '';
      spread.style.width = (single ? (side + 1) * W : 2 * W) + 'px';
      sides.forEach((s, i) => s.el.classList.toggle('off', single && i !== side));
      setupLive();
      wrap.style.width = bw * scale + 'px';
      wrap.style.height = bhh * scale + 'px';
      root.style.setProperty('--nb-scale', scale);
      placeCorners();
      updateZoomUI();
      if (was !== single) deselect();
    }
    function placeCorners() {
      const nx = single ? side : 1, px = single ? side : 0;
      const put = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
      put(corners.tr, nx * W + W - CORNER, 0);
      put(corners.br, nx * W + W - CORNER, page.height - CORNER);
      put(corners.tl, px * W, 0);
      put(corners.bl, px * W, page.height - CORNER);
    }
    function grow(by, user) {
      page.height += by;
      applyHeight();
      sizeCanvases();
      if (user) {
        if (!page.draft) changed();
        QD.sfx('page');
        scroller.scrollBy({ top: by * scale * 0.8, behavior: 'smooth' });
      }
    }
    function autoGrow() {
      const need = Math.max(HEAD + sides[0].body.scrollHeight, HEAD_R + sides[1].body.scrollHeight) + LINE * 2;
      if (need > page.height) grow(Math.ceil((need - page.height) / GROW) * GROW);
    }
    const ro = new ResizeObserver(() => layout());
    ro.observe(scroller);
    offs.push(() => ro.disconnect());

    const capture = id => { try { spread.setPointerCapture(id); } catch (err) { /* pointer already gone */ } };
    function pt(e) {
      const r = spread.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale, p: e.pressure || 0.5 };
    }
    const sideAt = x => (single ? side : x < W ? 0 : 1);

    /* ===== zoom: buttons, pinch (two fingers), trackpad pinch / Ctrl+wheel ===== */
    let pinch = null, hudTimer = 0;
    const zoomLabel = h('button', { class: 'zoom-label', title: 'Fit page to screen', onclick: () => zoomTo(1) });
    const layoutBtn = h('button', { class: 'jb', onclick: () => toggleLayout() });
    zoomCtl.append(
      h('button', { class: 'jb', title: 'Zoom out', 'aria-label': 'Zoom out', html: ic('minus'), onclick: () => setZoom(-1) }),
      zoomLabel,
      h('button', { class: 'jb', title: 'Zoom in', 'aria-label': 'Zoom in', html: ic('plus'), onclick: () => setZoom(1) }),
      h('span', { class: 'jb-sep' }), layoutBtn);
    const zoomText = () => ((prefs.zoom || 1) === 1 ? 'Fit' : Math.round(prefs.zoom * 100) + '%');
    function showHud() {
      zoomHud.textContent = zoomText();
      zoomHud.classList.add('show');
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => zoomHud.classList.remove('show'), 650);
    }
    // zoom so the point under (cx, cy) stays put
    function zoomAt(z, cx, cy) {
      z = QD.clamp(z, 0.5, 4);
      const r0 = book.getBoundingClientRect(), s0 = scale;
      const px = (cx - r0.left) / s0, py = (cy - r0.top) / s0;
      prefs.zoom = Math.abs(z - 1) < 0.03 ? 1 : z;
      layout();
      const r1 = book.getBoundingClientRect();
      scroller.scrollLeft += r1.left - (cx - px * scale);
      scroller.scrollTop += r1.top - (cy - py * scale);
      showHud();
    }
    function zoomTo(z) {
      const r = scroller.getBoundingClientRect();
      zoomAt(z, r.left + r.width / 2, r.top + r.height / 2);
      if (z === 1) scroller.scrollTo({ left: 0, top: 0 });
      savePrefs();
    }
    function setZoom(dir) {
      const cur = prefs.zoom || 1;
      const next = dir > 0 ? ZOOMS.find(z => z > cur + 0.01) : [...ZOOMS].reverse().find(z => z < cur - 0.01);
      if (next) zoomTo(next);
      QD.sfx('click');
    }
    function updateZoomUI() {
      zoomLabel.textContent = zoomText();
      zoomCtl.classList.toggle('zoomed', (prefs.zoom || 1) !== 1);
      layoutBtn.innerHTML = ic(single ? 'spread' : 'single');
      layoutBtn.title = single ? 'Show two pages' : 'Show one page';
      layoutBtn.setAttribute('aria-label', layoutBtn.title);
    }
    function toggleLayout() {
      S.setSetting('layout', single ? 'spread' : 'single');
      layout(); renderBar(); QD.sfx('page');
    }
    function cancelStroke() {
      if (!op) return;
      if (op.tool === 'eraser') sides.forEach(s => s.ctx.restore());
      op = null;
      clearCtx(lctx);
      liveC.style.opacity = 1;
      redrawInk();
    }
    const tdist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const tmid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    let taps = null; // multi-finger tap detection: 2 fingers = undo, 3 = redo
    listen(scroller, 'touchstart', e => {
      const ts = Array.from(e.touches);
      if (ts.some(t => t.touchType === 'stylus') || flipping) return;
      if (ts.length >= 2) {
        e.preventDefault();
        if (op && op.touch) cancelStroke();
        taps = taps && performance.now() - taps.t0 < 250 ? { ...taps, n: Math.max(taps.n, ts.length) } : { t0: performance.now(), n: ts.length, moved: false };
        if (ts.length === 2) {
          const m = tmid(ts[0], ts[1]);
          pinch = { d0: tdist(ts[0], ts[1]), z0: prefs.zoom || 1, last: m };
          book.classList.add('pinching');
        }
      }
    }, { passive: false });
    listen(scroller, 'touchmove', e => {
      if (!pinch || e.touches.length < 2) return;
      e.preventDefault();
      const [a, b] = e.touches, m = tmid(a, b), d = tdist(a, b);
      if (taps && (Math.abs(d - pinch.d0) > 10 || Math.hypot(m.x - pinch.last.x, m.y - pinch.last.y) > 10)) taps.moved = true;
      scroller.scrollLeft -= m.x - pinch.last.x;
      scroller.scrollTop -= m.y - pinch.last.y;
      pinch.last = m;
      zoomAt(pinch.z0 * d / pinch.d0, m.x, m.y);
    }, { passive: false });
    const touchEnd = e => {
      if (e.touches.length >= 2) return;
      if (taps && !taps.moved && performance.now() - taps.t0 < 320 && e.type === 'touchend' && e.touches.length === 0) {
        if (taps.n === 2) { if (ops.length) { undo(); QD.toast('Undo', { icon: 'undo', timeout: 900 }); } }
        else if (taps.n >= 3) { if (redo.length) { redoOp(); QD.toast('Redo', { icon: 'redo', timeout: 900 }); } }
      }
      if (e.touches.length === 0) taps = null;
      if (pinch) { pinch = null; book.classList.remove('pinching'); savePrefs(); }
    };
    listen(scroller, 'touchend', touchEnd);
    listen(scroller, 'touchcancel', touchEnd);
    let wheelSave = 0;
    listen(scroller, 'wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt((prefs.zoom || 1) * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      clearTimeout(wheelSave);
      wheelSave = setTimeout(savePrefs, 300);
    }, { passive: false });
    // Safari: never zoom the whole app with a pinch
    listen(document, 'gesturestart', e => e.preventDefault());

    /* ===== ink (two canvases, strokes in spread coordinates) ===== */
    // the live (in-progress stroke) canvas covers what's visible: both pages, or just one
    function setupLive(force) {
      const key = `${single ? side : 'both'}:${page.height}`;
      if (key === liveKey && !force) return;
      liveKey = key;
      liveX = single ? side * W : 0;
      const lw = single ? W : 2 * W;
      liveC.width = lw * DPR; liveC.height = page.height * DPR;
      liveC.style.width = lw + 'px'; liveC.style.height = page.height + 'px'; liveC.style.left = liveX + 'px';
      lctx.setTransform(DPR, 0, 0, DPR, -liveX * DPR, 0);
    }
    function sizeCanvases() {
      setupLive(true);
      sides.forEach((s, i) => {
        s.ink.width = W * DPR; s.ink.height = page.height * DPR;
        s.ink.style.width = W + 'px'; s.ink.style.height = page.height + 'px';
        s.ctx.setTransform(DPR, 0, 0, DPR, -i * W * DPR, 0);
      });
      redrawInk();
    }
    function clearCtx(c) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }
    function redrawInk() {
      sides.forEach((s, i) => {
        clearCtx(s.ctx);
        if (baseImgs[i]) { s.ctx.save(); s.ctx.setTransform(1, 0, 0, 1, 0, 0); s.ctx.drawImage(baseImgs[i], 0, 0); s.ctx.restore(); }
      });
      const dead = deadIds();
      for (const o of ops) if (!dead.has(o.id)) replay(o);
    }
    // strokes removed by a scratch-out gesture
    function deadIds() {
      const dead = new Set();
      for (const o of ops) if (o.tool === 'delete') o.targets.forEach(t => dead.add(t));
      return dead;
    }
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const widthAt = (o, p) => (o.pressure ? o.size * (0.35 + p.p * 1.3) : o.size);
    function styleCtx(c, o) { c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = c.fillStyle = o.color; }
    function strokeSegs(c, o, from) {
      const pts = o.pts;
      styleCtx(c, o);
      if (pts.length === 1 && from <= 1) { c.beginPath(); c.arc(pts[0].x, pts[0].y, widthAt(o, pts[0]) / 2, 0, Math.PI * 2); c.fill(); return; }
      for (let i = Math.max(1, from); i < pts.length; i++) {
        const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i];
        const m1 = i === 1 ? p1 : mid(p0, p1), m2 = mid(p1, p2);
        c.lineWidth = widthAt(o, p1);
        c.beginPath(); c.moveTo(m1.x, m1.y); c.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y); c.stroke();
      }
    }
    function strokeEnd(c, o) {
      const pts = o.pts;
      if (pts.length < 2) return;
      const a = mid(pts[pts.length - 2], pts[pts.length - 1]), b = pts[pts.length - 1];
      styleCtx(c, o);
      c.lineWidth = widthAt(o, b);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    function pixelCells(c, o, from) {
      c.fillStyle = o.color;
      for (let i = from; i < o.cells.length; i++) c.fillRect(o.cells[i][0] * o.size, o.cells[i][1] * o.size, o.size, o.size);
    }
    function replay(o) {
      if (o.tool === 'clear') { (o.sides || [0, 1]).forEach(i => clearCtx(sides[i].ctx)); return; }
      if (o.tool === 'eraser' || o.tool === 'delete') {
        sides.forEach(s => { s.ctx.save(); s.ctx.globalCompositeOperation = 'destination-out'; strokeSegs(s.ctx, o, 0); strokeEnd(s.ctx, o); s.ctx.restore(); });
        return;
      }
      clearCtx(lctx);
      if (o.tool === 'pixel') pixelCells(lctx, o, 0); else { strokeSegs(lctx, o, 0); strokeEnd(lctx, o); }
      commitLive(o.alpha);
    }
    function commitLive(alpha) {
      sides.forEach((s, i) => {
        s.ctx.save(); s.ctx.setTransform(1, 0, 0, 1, 0, 0); s.ctx.globalAlpha = alpha;
        s.ctx.drawImage(liveC, (liveX - i * W) * DPR, 0);
        s.ctx.restore();
      });
      clearCtx(lctx);
    }
    function inkColor(t, x) {
      const c = prefs.colors[t] || 'ink';
      return c === 'ink' ? (getComputedStyle(sides[sideAt(x == null ? 0 : x)].el).getPropertyValue('--pink').trim() || '#3a3340') : c;
    }
    function opSides(o) {
      if (o.tool === 'clear') return o.sides || [0, 1];
      const xs = o.tool === 'pixel' ? o.cells.flatMap(c => [c[0] * o.size, (c[0] + 1) * o.size]) : o.pts.map(p => p.x);
      const lo = Math.min(...xs) - o.size, hi = Math.max(...xs) + o.size;
      const out = new Set([0, 1].filter(i => hi > i * W && lo < (i + 1) * W));
      if (o.tool === 'delete') for (const id of o.targets) { const t = ops.find(x => x.id === id) || redo.find(x => x.id === id); if (t) opSides(t).forEach(i => out.add(i)); }
      return [...out];
    }

    /* ---- scratch-out to erase (like GoodNotes): a quick zig-zag over ink deletes it ---- */
    const ptsOf = o => (o.tool === 'pixel' ? o.cells.map(c => ({ x: (c[0] + 0.5) * o.size, y: (c[1] + 0.5) * o.size })) : o.pts || []);
    function isScratch(o) {
      const pts = o.pts;
      if (!pts || pts.length < 12 || performance.now() - o.t0 > 1800) return false;
      let L = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach((q, i) => {
        if (i) L += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y);
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
      });
      const D = Math.hypot(x1 - x0, y1 - y0);
      if (D < 14 || D > 460 || L / D < 3) return false;
      const axis = x1 - x0 >= y1 - y0 ? 'x' : 'y';
      let rev = 0, dir = 0, acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += pts[i][axis] - pts[i - 1][axis];
        if (Math.abs(acc) < 5) continue;
        const sg = Math.sign(acc);
        if (dir && sg !== dir) rev++;
        dir = sg; acc = 0;
      }
      return rev >= 4;
    }
    function scratchTargets(o) {
      const dead = deadIds();
      const sp = o.pts;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      sp.forEach(q => { bx0 = Math.min(bx0, q.x); by0 = Math.min(by0, q.y); bx1 = Math.max(bx1, q.x); by1 = Math.max(by1, q.y); });
      const targets = [];
      for (const x of ops) {
        if (!x.id || dead.has(x.id) || !['pen', 'marker', 'highlight', 'pixel'].includes(x.tool)) continue;
        const r = (x.size + o.size) / 2 + 6, xp = ptsOf(x);
        const hit = xp.some((q, i) => (i % 2 === 0 || i === xp.length - 1) && q.x > bx0 - r && q.x < bx1 + r && q.y > by0 - r && q.y < by1 + r &&
          sp.some(t => Math.abs(t.x - q.x) < r && Math.abs(t.y - q.y) < r && Math.hypot(t.x - q.x, t.y - q.y) < r));
        if (hit) targets.push(x.id);
      }
      // anything already on the paper from earlier sessions?
      let pixel = false;
      sides.forEach((sd, i) => {
        if (pixel) return;
        const lx0 = Math.max(0, Math.floor((bx0 - i * W) * DPR)), lx1 = Math.min(sd.ink.width, Math.ceil((bx1 - i * W) * DPR));
        const ly0 = Math.max(0, Math.floor(by0 * DPR)), ly1 = Math.min(sd.ink.height, Math.ceil(by1 * DPR));
        if (lx1 <= lx0 || ly1 <= ly0) return;
        const data = sd.ctx.getImageData(lx0, ly0, lx1 - lx0, ly1 - ly0).data, w = lx1 - lx0;
        for (let k = 0; k < sp.length && !pixel; k += 2) {
          const px = Math.round((sp[k].x - i * W) * DPR) - lx0, py = Math.round(sp[k].y * DPR) - ly0;
          for (let dy = -3; dy <= 3 && !pixel; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
            const X = px + dx, Y = py + dy;
            if (X >= 0 && Y >= 0 && X < w && Y < ly1 - ly0 && data[(Y * w + X) * 4 + 3] > 40) { pixel = true; break; }
          }
        }
      });
      return { targets, pixel };
    }

    const saveInk = QD.debounce(() => {
      if (!S.pages.has(page.id)) return;
      for (const i of dirty) {
        const id = page.inks[i], pid = page.id;
        if (!id) continue;
        sides[i].ink.toBlob(blob => { if (blob) S.putMedia({ id, kind: 'drawing', side: i, blob, mime: 'image/png', pageId: pid, createdAt: Date.now() }); }, 'image/png');
      }
      dirty.clear();
    }, 700);
    function inkChanged(o) {
      for (const i of o ? opSides(o) : [0, 1]) {
        if (!page.inks[i]) page.inks[i] = QD.uid('d');
        dirty.add(i);
      }
      changed();
      saveInk();
      updateUndo();
    }

    function cellOf(p, size) { return [Math.floor(p.x / size), Math.floor(p.y / size)]; }
    function addCellsTo(o, a, b) {
      let [x0, y0] = a; const [x1, y1] = b;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        const k = x0 + ',' + y0;
        if (!o.seen.has(k)) { o.seen.add(k); o.cells.push([x0, y0]); }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }

    /* Pencil / finger policy (iPad): once an Apple Pencil is seen, fingers scroll & arrange and only the pencil draws. */
    const fingerDraws = () => S.settings.fingerDraw === 'on' || (S.settings.fingerDraw !== 'off' && !penSeen);
    function markPen() {
      if (penSeen) return;
      penSeen = true;
      try { localStorage.setItem('qd.pen', '1'); } catch (e) { /* ignore */ }
      book.classList.toggle('touch-pan', !fingerDraws());
      if (S.settings.fingerDraw !== 'on') QD.toast('Apple Pencil detected — the pencil draws, fingers scroll', { icon: 'pen' });
    }
    book.classList.toggle('touch-pan', !fingerDraws());

    function beginStroke(e, t) {
      if (e.pointerType === 'pen' && (e.buttons & 32)) t = 'eraser'; // stylus eraser button
      capture(e.pointerId);
      const p = pt(e), T = TOOL[t];
      op = { pid: e.pointerId, t0: performance.now(), touch: e.pointerType === 'touch', tool: t, size: sizeOf(t), alpha: T.alpha || 1, color: t === 'eraser' ? '#000' : inkColor(t, p.x), pressure: e.pointerType === 'pen' };
      if (t === 'pixel') {
        op.cells = []; op.seen = new Set(); op.last = cellOf(p, op.size);
        addCellsTo(op, op.last, op.last);
        clearCtx(lctx); liveC.style.opacity = op.alpha;
        pixelCells(lctx, op, 0);
        return;
      }
      op.pts = [p];
      if (t === 'eraser') sides.forEach(s => { s.ctx.save(); s.ctx.globalCompositeOperation = 'destination-out'; strokeSegs(s.ctx, op, 0); });
      else { clearCtx(lctx); liveC.style.opacity = op.alpha; strokeSegs(lctx, op, 0); }
    }
    function moveStroke(e) {
      const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      const list = evs.length ? evs : [e];
      if (op.tool === 'pixel') {
        const n0 = op.cells.length;
        for (const ev of list) { const c = cellOf(pt(ev), op.size); addCellsTo(op, op.last, c); op.last = c; }
        pixelCells(lctx, op, n0);
        return;
      }
      const n0 = op.pts.length;
      for (const ev of list) {
        const q = pt(ev), l = op.pts[op.pts.length - 1];
        if (Math.abs(q.x - l.x) + Math.abs(q.y - l.y) > 0.5) op.pts.push(q);
      }
      if (op.pts.length > n0) {
        if (op.tool === 'eraser') sides.forEach(s => strokeSegs(s.ctx, op, n0));
        else strokeSegs(lctx, op, n0);
      }
    }
    let opSeq = 0;
    function endStroke() {
      const o = op; op = null;
      if (S.settings.scratchErase !== false && (o.tool === 'pen' || o.tool === 'marker') && isScratch(o)) {
        const { targets, pixel } = scratchTargets(o);
        if (targets.length || pixel) {
          clearCtx(lctx);
          liveC.style.opacity = 1;
          const del = { id: ++opSeq, tool: 'delete', targets, pts: o.pts, size: Math.max(16, o.size * 2.5 + 12), pressure: false, color: '#000' };
          ops.push(del);
          redo = [];
          redrawInk();
          inkChanged(del);
          QD.sfx('del');
          return;
        }
      }
      o.id = ++opSeq;
      delete o.t0;
      if (o.tool === 'eraser') sides.forEach(s => { strokeEnd(s.ctx, o); s.ctx.restore(); });
      else if (o.tool === 'pixel') { delete o.seen; delete o.last; commitLive(o.alpha); }
      else { strokeEnd(lctx, o); commitLive(o.alpha); }
      liveC.style.opacity = 1;
      delete o.pid;
      ops.push(o);
      redo = [];
      inkChanged(o);
    }

    // one capture-phase handler decides: draw, or let the page/items/scrolling have the pointer
    listen(spread, 'pointerdown', e => {
      if (flipping || op || pinch || e.target.closest('.corner')) return;
      if (e.pointerType === 'pen') markPen();
      if (e.target.closest('.i-bar, .h-rot, .h-size')) return;
      const pencilDraws = tool === 'type' && e.pointerType === 'pen' && S.settings.pencil !== 'scribble';
      if (tool === 'type' && !pencilDraws) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'touch' && !fingerDraws()) return; // finger pans; pencil draws
      e.preventDefault();
      e.stopPropagation();
      deselect();
      if (document.activeElement && spread.contains(document.activeElement)) document.activeElement.blur();
      beginStroke(e, pencilDraws ? (S.settings.pencilTool || 'pen') : tool);
    }, true);
    listen(spread, 'pointermove', e => {
      if (op && e.pointerId === op.pid) { moveStroke(e); moveCursor(e); return; }
      if (tool !== 'type' && (e.pointerType !== 'touch')) moveCursor(e);
    });
    const finish = e => { if (op && e.pointerId === op.pid) endStroke(); };
    listen(spread, 'pointerup', finish);
    listen(spread, 'pointercancel', finish);
    listen(spread, 'pointerleave', () => { cursor.style.display = 'none'; });
    // iPad: stop the Apple Pencil from scrolling / selecting while it writes (fingers still scroll)
    const stylusGuard = e => {
      if (!Array.from(e.touches || []).some(t => t.touchType === 'stylus')) return;
      if (e.target.closest && e.target.closest('.corner')) return;
      if (tool !== 'type' || S.settings.pencil !== 'scribble') e.preventDefault();
    };
    listen(spread, 'touchstart', stylusGuard, { passive: false });
    listen(spread, 'touchmove', stylusGuard, { passive: false });

    function moveCursor(e) {
      if (tool === 'type' || flipping) { cursor.style.display = 'none'; return; }
      const p = pt(e), s = sizeOf(tool);
      cursor.style.display = 'block';
      cursor.style.width = cursor.style.height = s + 'px';
      if (tool === 'pixel') { cursor.style.left = Math.floor(p.x / s) * s + 'px'; cursor.style.top = Math.floor(p.y / s) * s + 'px'; }
      else { cursor.style.left = p.x - s / 2 + 'px'; cursor.style.top = p.y - s / 2 + 'px'; }
    }

    function undo() {
      if (!ops.length) return;
      const o = ops.pop(); redo.push(o);
      redrawInk(); inkChanged(o); QD.sfx('click');
    }
    function redoOp() {
      if (!redo.length) return;
      const o = redo.pop(); ops.push(o);
      redrawInk(); inkChanged(o); QD.sfx('click');
    }
    function updateUndo() {
      if (undoBtn) undoBtn.disabled = !ops.length;
      if (redoBtn) redoBtn.disabled = !redo.length;
    }

    /* ===== items ===== */
    const live = { changed: () => changed() };
    const itemById = id => page.items.find(i => i.id === id);
    const elFor = id => sides[0].items.querySelector(`[data-id="${id}"]`) || sides[1].items.querySelector(`[data-id="${id}"]`);
    const maxZ = () => page.items.reduce((m, i) => Math.max(m, i.z || 0), 0);
    function renderItems() {
      sides.forEach(s => { s.items.innerHTML = ''; });
      for (const it of page.items) sides[it.side || 0].items.append(buildItem(it, live));
    }

    function select(id) {
      if (selected === id) return;
      deselect();
      const it = itemById(id), el = elFor(id);
      if (!it || !el) return;
      selected = id;
      el.classList.add('sel');
      el.append(h('div', { class: 'h-rot', title: 'Drag to rotate' }), h('div', { class: 'h-size', title: 'Drag to resize' }), itemBar(it));
      el.classList.toggle('bar-below', it.y < 90);
    }
    function deselect() {
      if (!selected) return;
      const el = elFor(selected);
      if (el) { el.classList.remove('sel'); el.querySelectorAll('.h-rot, .h-size, .i-bar').forEach(n => n.remove()); }
      selected = null;
    }
    function itemBar(it) {
      const b = (icon, label, fn) => h('button', { class: 'ib', title: label, 'aria-label': label, html: ic(icon), onclick: e => { e.stopPropagation(); fn(); } });
      const bar = h('div', { class: 'i-bar' },
        b('front', 'Bring to front', () => { it.z = maxZ() + 1; placeEl(elFor(it.id), it); changed(); }),
        b('back', 'Send to back', () => { page.items.forEach(i => { i.z = (i.z || 1) + 1; }); it.z = 1; page.items.forEach(i => { const e = elFor(i.id); if (e) placeEl(e, i); }); changed(); }));
      if (it.type === 'note' || it.type === 'voice') {
        const colors = it.type === 'note' ? QD.NOTE_COLORS : QD.VOICE_COLORS;
        bar.append(b('palette', 'Change color', () => {
          it.color = colors[(colors.indexOf(it.color) + 1) % colors.length];
          const el = elFor(it.id);
          el.style.setProperty('--note', it.color);
          const vf = el.querySelector('.voice-face');
          if (vf) vf.style.setProperty('--vc', it.color);
          changed();
        }));
      }
      if (it.type === 'tape') bar.append(b('shuffle', 'Change pattern', () => { it.pattern = QD.TAPES[(QD.TAPES.findIndex(t => t.id === it.pattern) + 1) % QD.TAPES.length].id; elFor(it.id).dataset.pattern = it.pattern; changed(); }));
      if (it.type === 'sticker') bar.append(b('shuffle', 'Swap sticker', () => { const ids = Object.keys(QD.STICKERS); it.sticker = ids[(ids.indexOf(it.sticker) + 1) % ids.length]; elFor(it.id).querySelector('svg').outerHTML = QD.stickerSvg(it.sticker); changed(); }));
      if (it.type === 'photo') bar.append(b('expand', 'View larger', () => QD.lightbox({ mediaId: it.mediaId, caption: it.caption, meta: 'Added ' + QD.fmtDateTime(it.createdAt) })));
      bar.append(b('trash', 'Remove', () => removeItem(it.id)));
      bar.addEventListener('pointerdown', e => e.stopPropagation());
      return bar;
    }

    function onItemDown(e) {
      if (tool !== 'type' || flipping) return;
      const el = e.target.closest('.item');
      if (!el) return;
      const it = itemById(el.dataset.id);
      if (!it) return;
      select(it.id);
      const handle = e.target.closest('.h-rot, .h-size');
      if (!handle && e.target.closest('[contenteditable], button, .vwave')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (document.activeElement && document.activeElement !== document.body && !el.contains(document.activeElement)) document.activeElement.blur();
      const start = pt(e), o = { ...it }, ox = (o.side || 0) * W + o.x;
      const mode = !handle ? 'move' : handle.classList.contains('h-rot') ? 'rot' : 'size';
      const cx = ox + el.offsetWidth / 2, cy = o.y + el.offsetHeight / 2;
      let moved = false;
      // capture on the spread (the item may hop to the other page while dragging)
      capture(e.pointerId);
      el.classList.add('dragging');
      const move = ev => {
        if (ev.pointerId !== e.pointerId || pinch) return;
        const p = pt(ev), dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
        moved = true;
        if (mode === 'move') {
          const lo = single ? side * W : 0, hi = single ? side * W + W : 2 * W;
          const sx = QD.clamp(ox + dx, lo - it.w * 0.6, hi - it.w * 0.4);
          const ns = single ? side : (sx + it.w / 2 < W ? 0 : 1);
          if (ns !== (it.side || 0)) { it.side = ns; sides[ns].items.append(el); }
          it.x = Math.round(sx - ns * W);
          it.y = Math.round(QD.clamp(o.y + dy, -20, page.height - 40));
        } else if (mode === 'rot') {
          let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
          if (a > 180) a -= 360;
          if (ev.shiftKey) a = Math.round(a / 15) * 15;
          else if (Math.abs(a) < 3) a = 0;
          it.r = Math.round(a);
        } else {
          const rad = (o.r || 0) * Math.PI / 180;
          const lx = dx * Math.cos(rad) + dy * Math.sin(rad), ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
          const min = it.type === 'sticker' ? 32 : it.type === 'tape' ? 60 : 110;
          it.w = Math.round(QD.clamp(o.w + lx, min, W));
          if (it.type === 'note') it.h = Math.round(QD.clamp(o.h + ly, 90, 900));
        }
        placeEl(el, it);
      };
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return;
        spread.removeEventListener('pointermove', move);
        spread.removeEventListener('pointerup', up);
        spread.removeEventListener('pointercancel', up);
        el.classList.remove('dragging');
        el.classList.toggle('bar-below', it.y < 90);
        if (moved) changed();
      };
      spread.addEventListener('pointermove', move);
      spread.addEventListener('pointerup', up);
      spread.addEventListener('pointercancel', up);
    }
    sides.forEach(s => listen(s.items, 'pointerdown', onItemDown));
    listen(spread, 'pointerdown', e => { if (!e.target.closest('.item')) deselect(); });

    function viewCenter() {
      const r = spread.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      let x = (sr.left + sr.width / 2 - r.left) / scale;
      const y = QD.clamp((sr.top + sr.height / 2 - r.top) / scale, 200, page.height - 200);
      if (single) return { x: QD.clamp(x, side * W + 150, side * W + W - 150), y };
      if (Math.abs(x - W) < 160) {
        const n0 = page.items.filter(i => !i.side).length, n1 = page.items.length - n0;
        x = n1 < n0 ? W + W / 2 : W / 2;
      }
      return { x: QD.clamp(x, 150, 2 * W - 150), y };
    }
    function addItem(it, at, jitter = true) {
      const c = at || viewCenter();
      it.id = it.id || QD.uid('i');
      it.z = maxZ() + 1;
      it.createdAt = Date.now();
      if (it.r == null) it.r = Math.round(QD.rand(-5, 5));
      it.side = sideAt(c.x);
      const lx = c.x - it.side * W;
      const hh = it.h || it.w * (it.type === 'photo' ? 1 / (it.ar || 1) + 0.25 : 1.1);
      it.x = Math.round(lx - it.w / 2 + (jitter ? QD.rand(-20, 20) : 0));
      it.y = Math.round(c.y - hh / 2 + (jitter ? QD.rand(-12, 12) : 0));
      if (!at) {
        const near = () => page.items.some(o => (o.side || 0) === it.side && Math.abs(o.x - it.x) < 50 && Math.abs(o.y - it.y) < 50);
        for (let k = 0; k < 10 && near(); k++) {
          it.x = Math.round(QD.clamp(it.x + 50, -it.w / 3, W - it.w * 0.7));
          it.y += 44;
        }
      }
      page.items.push(it);
      const el = buildItem(it, live);
      el.classList.add('pop-in');
      sides[it.side].items.append(el);
      if (it.y + hh + LINE > page.height) grow(Math.ceil((it.y + hh + LINE - page.height) / GROW) * GROW);
      changed();
      setTool('type', true);
      select(it.id);
      QD.sfx('pop');
      return el;
    }
    function removeItem(id) {
      const idx = page.items.findIndex(i => i.id === id);
      if (idx < 0) return;
      const [it] = page.items.splice(idx, 1);
      if (selected === id) selected = null;
      const el = elFor(id);
      if (el) el.remove();
      changed();
      QD.sfx('del');
      const names = { photo: 'Photo', voice: 'Voice note', note: 'Note', sticker: 'Sticker', tape: 'Tape' };
      let undone = false;
      QD.toast(`${names[it.type]} removed`, {
        icon: 'trash', action: 'Undo',
        onAction: () => {
          undone = true;
          page.items.splice(Math.min(idx, page.items.length), 0, it);
          if (!destroyed) { const ne = buildItem(it, live); ne.classList.add('pop-in'); sides[it.side || 0].items.append(ne); }
          changed();
        },
        onDone: () => {
          if (undone || !it.mediaId) return;
          if (QD.player.id === it.mediaId) QD.player.stop();
          S.deleteMedia(it.mediaId);
        },
      });
    }

    async function addPhotos(files, at) {
      let i = 0;
      for (const f of files) {
        try {
          const { blob, w, h: hh } = await QD.processImage(f);
          const id = QD.uid('m'), itemId = QD.uid('i');
          await S.putMedia({ id, kind: 'photo', blob, mime: blob.type, pageId: page.id, itemId, createdAt: Date.now(), w, h: hh, name: f.name || '' });
          if (destroyed) return;
          const c = at ? { x: at.x + i * 26, y: at.y + i * 26 } : null;
          addItem({ id: itemId, type: 'photo', mediaId: id, w: 220, ar: +QD.clamp(w / hh, 0.62, 1.6).toFixed(3), caption: '' }, c, !at);
          i++;
        } catch (e) {
          console.error(e);
          QD.toast(`Couldn't read ${f.name || 'that image'}`, { icon: 'close' });
        }
      }
    }
    async function addVoiceFrom(res, at) {
      const id = QD.uid('m'), itemId = QD.uid('i');
      await S.putMedia({ id, kind: 'voice', blob: res.blob, mime: res.mime, pageId: page.id, itemId, createdAt: Date.now(), duration: res.duration, peaks: res.peaks });
      if (destroyed) return;
      addItem({ id: itemId, type: 'voice', mediaId: id, w: 200, color: QD.pick(QD.VOICE_COLORS), caption: res.caption || '' }, at);
    }
    async function recordVoice() {
      const res = await QD.recordVoice();
      if (res && !destroyed) await addVoiceFrom(res);
    }
    const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    fileIn.onchange = () => { const fs = Array.from(fileIn.files || []); fileIn.value = ''; if (fs.length) addPhotos(fs); };
    root.append(fileIn);

    listen(spread, 'dragover', e => {
      if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); book.classList.add('drop-hover'); }
    });
    listen(spread, 'dragleave', e => { if (!spread.contains(e.relatedTarget)) book.classList.remove('drop-hover'); });
    listen(spread, 'drop', async e => {
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      e.preventDefault();
      book.classList.remove('drop-hover');
      const at = pt(e);
      const imgs = files.filter(f => f.type.startsWith('image/'));
      if (imgs.length) addPhotos(imgs, at);
      for (const f of files.filter(x => x.type.startsWith('audio/'))) {
        try {
          const info = await QD.analyzeAudio(f);
          await addVoiceFrom({ blob: f, mime: f.type, duration: info.duration, peaks: info.peaks, caption: f.name.replace(/\.[^.]+$/, '') }, at);
        } catch (err) { QD.toast(`Couldn't read ${f.name}`, { icon: 'close' }); }
      }
    });

    function stickerPicker(anchor) {
      const grid = h('div', { class: 'sticker-grid' }, Object.entries(QD.STICKERS).map(([id, s]) => h('button', {
        class: 'sticker-btn', title: s.name, 'aria-label': s.name, html: QD.stickerSvg(id),
        onclick: () => { QD.closePopover(); addItem({ type: 'sticker', sticker: id, w: 84, r: Math.round(QD.rand(-12, 12)) }); },
      })));
      QD.popover(anchor, h('div', {}, h('p', { class: 'pop-title', text: 'Pixel stickers' }), grid), { cls: 'pop-sticker' });
    }
    function tapePicker(anchor) {
      const grid = h('div', { class: 'tape-grid' }, QD.TAPES.map(t => h('button', {
        class: 'tape-btn', title: t.name,
        onclick: () => { QD.closePopover(); addItem({ type: 'tape', pattern: t.id, w: 180, h: 32, r: Math.round(QD.rand(-25, 25)) }); },
      }, h('span', { class: 'tape-swatch it-tape', 'data-pattern': t.id }), h('small', { text: t.name }))));
      QD.popover(anchor, h('div', {}, h('p', { class: 'pop-title', text: 'Washi tape' }), grid), { cls: 'pop-tape' });
    }

    /* ===== floating tool palette ===== */
    let paletteHidden = false, textFocused = false;
    function addNote() {
      const el = addItem({ type: 'note', w: 190, h: 160, color: QD.pick(QD.NOTE_COLORS), text: '', r: Math.round(QD.rand(-4, 4)) });
      setTimeout(() => el.querySelector('.note-text').focus(), 50);
    }
    function setTool(id, quiet) {
      tool = id;
      prefs.tool = id;
      if (id !== 'type') prefs.lastDraw = id;
      savePrefs();
      paletteHidden = false;
      book.dataset.tool = id;
      book.classList.toggle('drawing', id !== 'type');
      QD.$$('.jb.tool', bar).forEach(b => { const on = b.dataset.tool === id; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
      if (id !== 'type') { deselect(); if (document.activeElement && spread.contains(document.activeElement)) document.activeElement.blur(); textFocused = false; }
      cursor.style.display = 'none';
      cursor.className = 'brush-cursor bc-' + id;
      renderPalette();
      renderDock();
      if (!quiet) QD.sfx('click');
    }

    function renderPalette() {
      palette.innerHTML = '';
      const nope = e => e.preventDefault();
      const pb = (label, title, fn, cls = '') => {
        const b = h('button', { class: 'pb ' + cls, title, 'aria-label': title, html: label });
        b.addEventListener('mousedown', nope);
        b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') e.preventDefault(); });
        b.addEventListener('click', e => fn(e.currentTarget));
        return b;
      };
      const sep = () => h('span', { class: 'pal-sep' });
      let show;
      if (tool === 'type') {
        show = textFocused;
        const colorPop = (anchor, colors, cmd) => {
          const g = h('div', { class: 'swatches' }, colors.map(c => {
            const b = h('button', { class: 'sw', style: { '--sw': c }, title: c, 'aria-label': 'Color ' + c });
            b.addEventListener('mousedown', nope);
            b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') e.preventDefault(); });
            b.addEventListener('click', () => { QD.closePopover(); fmt(cmd, c); });
            return b;
          }));
          QD.popover(anchor, g, { cls: 'pop-sw', align: 'center' });
        };
        palette.append(
          pb('<b>B</b>', 'Bold (Ctrl+B)', () => fmt('bold')),
          pb('<i>I</i>', 'Italic (Ctrl+I)', () => fmt('italic')),
          pb('<u>U</u>', 'Underline (Ctrl+U)', () => fmt('underline')),
          pb('<s>S</s>', 'Strikethrough', () => fmt('strikeThrough')), sep(),
          pb(ic('textcolor'), 'Text color', a => colorPop(a, TEXT_COLORS, 'foreColor'), 'fc'),
          pb(ic('highlighter'), 'Highlight text', a => colorPop(a, MARK_COLORS, 'hiliteColor')), sep(),
          pb(ic('list'), 'Bullet list', () => fmt('insertUnorderedList')),
          pb(ic('checkbox'), 'Checkbox', () => { ensureBodySelection(); document.execCommand('insertHTML', false, '<span class="chk" contenteditable="false"></span>&nbsp;'); syncBody(); changed(); }),
          pb(ic('clock'), 'Insert time', () => { ensureBodySelection(); document.execCommand('insertHTML', false, `<span class="tstamp" contenteditable="false">${QD.esc(QD.fmtTime(Date.now()))}</span>&nbsp;`); syncBody(); changed(); }),
          pb(ic('eraser'), 'Clear formatting', () => fmt('removeFormat')));
      } else {
        show = !paletteHidden;
        const t = TOOL[tool];
        if (tool !== 'eraser') {
          const list = tool === 'highlight' ? HL_SWATCHES : PEN_SWATCHES;
          const cur = prefs.colors[tool] || list[0];
          for (const c of list) {
            const real = c === 'ink' ? inkColor('__ink', single ? side * W : 0) : c;
            palette.append(h('button', {
              class: 'sw' + (c === cur ? ' active' : '') + (c === 'ink' ? ' sw-ink' : ''), style: { '--sw': real },
              title: c === 'ink' ? 'Page ink' : c, 'aria-label': c === 'ink' ? 'Page ink color' : 'Color ' + c,
              onclick: () => { prefs.colors[tool] = c; savePrefs(); renderPalette(); updateToolColors(); },
            }));
          }
          const custom = h('input', { type: 'color', class: 'sw-custom', title: 'Custom color', 'aria-label': 'Custom color', value: /^#/.test(cur) ? cur : '#ff6f9c' });
          custom.addEventListener('input', () => { prefs.colors[tool] = custom.value; savePrefs(); updateToolColors(); });
          custom.addEventListener('change', () => renderPalette());
          palette.append(h('label', { class: 'sw sw-rainbow' + (!list.includes(cur) ? ' active' : ''), title: 'Custom color', style: !list.includes(cur) ? { '--sw': cur } : null }, custom), sep());
        }
        const cur = sizeOf(tool), presets = SIZE_PRESETS[tool];
        presets.forEach((v, i) => {
          const dot = 5 + i * 6;
          palette.append(pb(`<i style="width:${dot}px;height:${dot}px"></i>`, `Size ${v}px`, () => { prefs.sizes[tool] = v; savePrefs(); renderPalette(); }, 'sz' + (tool === 'pixel' ? ' sq' : '') + (v === cur ? ' active' : '')));
        });
        const fine = pb(presets.includes(cur) ? ic('dots') : `<small>${cur}</small>`, 'Exact size', a => {
          const out = h('span', { class: 'size-val', text: sizeOf(tool) + 'px' });
          const range = h('input', { type: 'range', min: t.min, max: t.max, step: t.step || 1, value: sizeOf(tool), 'aria-label': 'Size' });
          range.addEventListener('input', () => { prefs.sizes[tool] = +range.value; out.textContent = range.value + 'px'; savePrefs(); });
          QD.popover(a, h('label', { class: 'size-pop' }, range, out), { cls: 'pop-size', align: 'center', onClose: () => renderPalette() });
        }, 'sz-more' + (presets.includes(cur) ? '' : ' active'));
        palette.append(fine);
        if (tool === 'eraser') {
          palette.append(sep(), pb(ic('trash') + `<span>Clear ${single ? 'page' : 'both pages'}</span>`, 'Clear drawing', async () => {
            if (!(await QD.confirm({ title: 'Clear drawing?', text: 'Removes pen, marker and pixel strokes. You can undo this.', ok: 'Clear', danger: true }))) return;
            const o = { tool: 'clear', sides: single ? [side] : [0, 1] };
            ops.push(o); redo = []; redrawInk(); inkChanged(o);
          }, 'pb-text danger-text'));
        }
      }
      palette.classList.toggle('show', !!show && !prefs.focus);
    }

    /* ===== page turning ===== */
    function dayTarget(date, s) { return { p: S.pagesOn(date)[0] || S.newDraft(date), side: s, date, same: false }; }
    function startFlip(kind, corner) {
      if (flipping || op) return null;
      deselect();
      QD.closePopover();
      if (document.activeElement && spread.contains(document.activeElement)) document.activeElement.blur();
      const Hh = page.height;
      const turnIdx = single ? side : (kind === 'next' ? 1 : 0);
      let tgt, underEl, backEl;
      if (single) {
        if (kind === 'next') tgt = side === 0 ? { p: page, side: 1, same: true } : dayTarget(QD.addDays(page.date, 1), 0);
        else tgt = side === 1 ? { p: page, side: 0, same: true } : dayTarget(QD.addDays(page.date, -1), 1);
        underEl = staticSide(tgt.p, tgt.side, Hh, tgt.same ? sides[tgt.side].ink : null);
        backEl = h('div', { class: 'side static flip-blank', 'data-paper': paperOf(page, turnIdx), style: { width: W + 'px', height: Hh + 'px' } });
      } else {
        tgt = dayTarget(QD.addDays(page.date, kind === 'next' ? 1 : -1), 0);
        underEl = staticSide(tgt.p, kind === 'next' ? 1 : 0, Hh);
        backEl = staticSide(tgt.p, kind === 'next' ? 0 : 1, Hh);
      }
      const under = h('div', { class: 'flip-under', style: { left: turnIdx * W + 'px', height: Hh + 'px' } }, underEl, h('div', { class: 'flip-ushade' }));
      const flap = h('div', { class: 'flip-flap', style: { height: Hh + 'px' } }, backEl, h('div', { class: 'flip-fshade' }));
      const flapWrap = h('div', { class: 'flip-flap-wrap', style: { left: turnIdx * W + 'px', height: Hh + 'px' } }, flap);
      spread.append(under, flapWrap);
      const turnEl = sides[turnIdx].el;
      turnEl.classList.add('turning');
      book.classList.add('flipping');
      const C = { x: kind === 'next' ? W : 0, y: corner[0] === 't' ? 0 : Hh };
      flipping = { kind, tgt, turnEl, under, flapWrap, flap, C, spineX: kind === 'next' ? 0 : W, H: Hh, M: { ...C }, turnIdx, raf: 0 };
      QD.sfx('page');
      return flipping;
    }
    function flipUpdate(M) {
      const f = flipping;
      if (!f) return;
      const { C, spineX, H: Hh } = f;
      const Sn = { x: spineX, y: C.y }, Sf = { x: spineX, y: Hh - C.y }, D = Math.hypot(W, Hh);
      let vx = M.x - Sn.x, vy = M.y - Sn.y, L = Math.hypot(vx, vy);
      if (L > W) M = { x: Sn.x + vx * W / L, y: Sn.y + vy * W / L };
      vx = M.x - Sf.x; vy = M.y - Sf.y; L = Math.hypot(vx, vy);
      if (L > D) M = { x: Sf.x + vx * D / L, y: Sf.y + vy * D / L };
      f.M = M;
      const dx = M.x - C.x, dy = M.y - C.y, len = Math.hypot(dx, dy);
      if (len < 0.5) { f.turnEl.style.clipPath = ''; f.flapWrap.style.visibility = 'hidden'; return; }
      f.flapWrap.style.visibility = '';
      const nx = dx / len, ny = dy / len, Qx = (C.x + M.x) / 2, Qy = (C.y + M.y) / 2;
      const fn = X => (X.x - Qx) * nx + (X.y - Qy) * ny;
      const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: Hh }, { x: 0, y: Hh }];
      f.turnEl.style.clipPath = polyCss(clipPoly(rect, fn));
      f.flap.style.clipPath = polyCss(clipPoly(rect, U => -fn({ x: W - U.x, y: U.y })));
      // back face = mirror (u → W-u) followed by a reflection across the fold line
      const R11 = 1 - 2 * nx * nx, R12 = -2 * nx * ny, R22 = 1 - 2 * ny * ny, qn = Qx * nx + Qy * ny;
      f.flap.style.transform = `matrix(${-R11},${-R12},${R12},${R22},${R11 * W + 2 * qn * nx},${R12 * W + 2 * qn * ny})`;
      f.flap.lastChild.style.transform = `translate(${W - Qx}px, ${Qy}px) rotate(${Math.atan2(-ny, nx)}rad) translate(0, -2000px)`;
      f.under.lastChild.style.transform = `translate(${Qx}px, ${Qy}px) rotate(${Math.atan2(-ny, -nx)}rad) translate(0, -2000px)`;
    }
    function flipEndPoint(f) { return { x: f.spineX === 0 ? -W : 2 * W, y: f.C.y }; }
    function animateFlip(T, arc, done) {
      const f = flipping;
      if (!f) return;
      const from = { ...f.M };
      const dist = Math.hypot(T.x - from.x, T.y - from.y);
      const ms = QD.clamp(dist / 2.4, 140, 560);
      const lift = arc ? (f.C.y === 0 ? 1 : -1) * Math.min(110, dist * 0.12) : 0;
      const t0 = performance.now();
      const step = now => {
        if (flipping !== f) return;
        const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        flipUpdate({ x: from.x + (T.x - from.x) * e, y: from.y + (T.y - from.y) * e + lift * Math.sin(Math.PI * k) });
        if (k < 1) f.raf = requestAnimationFrame(step); else done();
      };
      f.raf = requestAnimationFrame(step);
    }
    function cleanupFlip() {
      const f = flipping;
      if (!f) return;
      cancelAnimationFrame(f.raf);
      f.under.remove(); f.flapWrap.remove();
      f.turnEl.style.clipPath = '';
      f.turnEl.classList.remove('turning');
      book.classList.remove('flipping');
      flipping = null;
    }
    function flipDone() {
      const f = flipping;
      if (!f) return;
      if (f.tgt.same) {
        cleanupFlip();
        side = f.tgt.side;
        layout();
        return;
      }
      pending = { side: single ? f.tgt.side : 0, noAnim: true };
      QD.app.go('#/day/' + f.tgt.date);
    }
    function flipTo(kind) {
      const f = startFlip(kind, kind === 'next' ? 'br' : 'bl');
      if (f) animateFlip(flipEndPoint(f), true, flipDone);
    }
    function onCornerDown(e) {
      if (flipping || op) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const f = startFlip(el.dataset.kind, el.dataset.corner);
      if (!f) return;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const offX = f.turnIdx * W;
      const start = pt(e);
      const grab = { x: f.C.x - (start.x - offX), y: f.C.y - start.y };
      let last = { t: performance.now(), x: start.x }, vx = 0, moved = false;
      const move = ev => {
        if (ev.pointerId !== e.pointerId) return;
        const p = pt(ev);
        if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 5) moved = true;
        const now = performance.now();
        vx = 0.7 * vx + 0.3 * ((p.x - last.x) / Math.max(1, now - last.t));
        last = { t: now, x: p.x };
        flipUpdate({ x: p.x - offX + grab.x, y: p.y + grab.y });
      };
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return;
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (!moved) { animateFlip(flipEndPoint(f), true, flipDone); return; }
        const progress = f.spineX === 0 ? (W - f.M.x) / (2 * W) : f.M.x / (2 * W);
        const fling = f.spineX === 0 ? vx < -0.5 : vx > 0.5;
        const back = f.spineX === 0 ? vx > 0.5 : vx < -0.5;
        if ((progress > 0.35 || fling) && !back) animateFlip(flipEndPoint(f), false, flipDone);
        else animateFlip(f.C, false, cleanupFlip);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      flipUpdate({ x: f.C.x + (f.spineX === 0 ? -18 : 18), y: f.C.y + (f.C.y ? -18 : 18) });
    }
    Object.values(corners).forEach(c => listen(c, 'pointerdown', onCornerDown));

    function showShortcuts() {
      const rows = [
        ['Drag a corner', 'Turn to the next day (right corners) or back (left corners). A quick tap works too.'],
        ['Apple Pencil', 'Writes in any tool. Fingers scroll, type and move things.'],
        ['Pinch', 'Zoom in and out with two fingers (or a trackpad / Ctrl + scroll)'],
        ['2-finger tap', 'Undo drawing'], ['3-finger tap', 'Redo drawing'],
        ['\\', 'Hide / show the toolbar'], ['Ctrl+ = / - / 0', 'Zoom in / out / fit'],
        ['T', 'Type & arrange'], ['P / M / H', 'Pen / marker / highlighter'], ['X', 'Pixel brush'], ['E', 'Eraser'],
        ['[ and ]', 'Brush size'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo drawing'], ['Delete', 'Remove selected item'],
        ['Shift + rotate', 'Snap rotation to 15°'], ['Alt+← / Alt+→', 'Turn back / forward'], ['Ctrl+S', 'Save now'], ['Esc', 'Deselect / back to typing'],
      ];
      QD.modal({ title: 'Shortcuts & gestures', icon: 'help', cls: 'modal-sm', body: h('div', { class: 'kbd-list' }, rows.map(([k, v]) => h('div', { class: 'kbd-row' }, h('kbd', { text: k }), h('span', { text: v })))) });
    }

    /* ===== keyboard ===== */
    function onKey(e) {
      if (e.isComposing || e.keyCode === 229 || document.querySelector('.overlay')) return;
      const a = document.activeElement;
      const editing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
      const mod = e.ctrlKey || e.metaKey;
      if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        flipTo(e.key === 'ArrowLeft' ? 'prev' : 'next');
        return;
      }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPdf(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); S.flush(page.id); QD.toast(page.draft ? 'Nothing to save yet' : 'Saved', { icon: 'check' }); return; }
      if (mod && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) { e.preventDefault(); if (e.key === '0') zoomTo(1); else setZoom(e.key === '-' ? -1 : 1); return; }
      if (editing) { if (e.key === 'Escape') a.blur(); return; }
      if (e.key === '\\') { e.preventDefault(); setFocus(!prefs.focus); return; }
      if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); flipTo(e.key === 'PageDown' ? 'next' : 'prev'); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoOp() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redoOp(); return; }
      if (mod || e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeItem(selected); return; }
      if (e.key === 'Escape') { if (selected) deselect(); else setTool('type'); return; }
      const t = TOOLS.find(x => x.key === e.key.toLowerCase());
      if (t) { setTool(t.id); return; }
      if ((e.key === '[' || e.key === ']') && tool !== 'type') {
        const tt = TOOL[tool], st = tt.step || 1;
        prefs.sizes[tool] = QD.clamp(sizeOf(tool) + (e.key === ']' ? st : -st) * (tt.step ? 1 : 2), tt.min, tt.max);
        savePrefs(); renderPalette();
      }
    }
    listen(document, 'keydown', onKey);

    /* ===== boot ===== */
    renderBar();
    renderHeader();
    setTool(tool, true);
    renderItems();
    applyHeight();
    sizeCanvases();
    page.inks.forEach((id, i) => {
      const rec = id && S.media.get(id);
      if (rec) createImageBitmap(rec.blob).then(img => { if (!destroyed) { baseImgs[i] = img; redrawInk(); } }).catch(() => {});
    });
    if (!arrived.noAnim && lastShown && lastShown.id !== page.id) book.classList.add(page.date >= lastShown.date ? 'flip-next' : 'flip-prev');
    lastShown = { id: page.id, date: page.date };
    if (params.item) {
      requestAnimationFrame(() => {
        const it = itemById(params.item), el = elFor(params.item);
        if (!it || !el) return;
        scroller.scrollTo({ top: Math.max(0, wrap.offsetTop + (it.y + COVER) * scale - scroller.clientHeight / 3), behavior: 'smooth' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2400);
        if (tool !== 'type') setTool('type', true);
        select(it.id);
      });
    }

    /* ===== teardown ===== */
    return () => {
      destroyed = true;
      if (flipping) cancelAnimationFrame(flipping.raf);
      offs.forEach(f => f());
      saveInk.now();
      clearTimeout(countTimer);
      if (!page.draft) {
        if (S.pages.has(page.id) && S.isEmpty(page)) S.deletePage(page.id);
        else S.flush(page.id);
      }
    };
  };

  /* ---------- mini calendar (sidebar + date pickers) ---------- */
  QD.miniCal = ({ selected, onPick, month }) => {
    let cur = month || (selected || QD.todayKey()).slice(0, 7);
    const el = h('div', { class: 'mcal' });
    const draw = () => {
      el.innerHTML = '';
      const ws = +S.settings.weekStart || 0;
      const [y, m] = cur.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const days = new Date(y, m, 0).getDate();
      const lead = (first.getDay() - ws + 7) % 7;
      const today = QD.todayKey();
      const byDate = {};
      for (const p of S.pages.values()) if (p.date.startsWith(cur)) (byDate[p.date] = byDate[p.date] || []).push(p);
      el.append(h('div', { class: 'mcal-head' },
        h('button', { class: 'icon-btn sm', 'aria-label': 'Previous month', html: QD.ic('chevL'), onclick: e => { e.stopPropagation(); cur = QD.addMonths(cur, -1); draw(); } }),
        h('span', { class: 'mcal-title', text: QD.fmtMonth(cur) }),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Next month', html: QD.ic('chevR'), onclick: e => { e.stopPropagation(); cur = QD.addMonths(cur, 1); draw(); } })));
      const grid = h('div', { class: 'mcal-grid' });
      for (let i = 0; i < 7; i++) grid.append(h('span', { class: 'mcal-wd', text: QD.WEEKDAYS[(i + ws) % 7].slice(0, 2) }));
      for (let i = 0; i < lead; i++) grid.append(h('span'));
      for (let d = 1; d <= days; d++) {
        const k = `${cur}-${QD.pad(d)}`;
        const ps = byDate[k];
        const cat = ps && S.cat(ps[0].categoryId);
        grid.append(h('button', {
          class: 'mcal-day' + (k === today ? ' today' : '') + (k === selected ? ' sel' : '') + (ps ? ' has' : ''),
          style: ps ? { '--cc': cat ? cat.color : 'var(--accent)' } : null,
          title: QD.fmtDate(k), text: d, onclick: () => onPick(k),
        }));
      }
      el.append(grid);
    };
    draw();
    el.setSelected = k => { selected = k; if (k) cur = k.slice(0, 7); draw(); };
    el.redraw = draw;
    return el;
  };
})(window.QD);
