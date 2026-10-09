'use strict';
window.QD = window.QD || {};

(function (QD) {
  /* ---------- DOM helpers ---------- */
  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }

  QD.h = function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') {
          if (typeof v === 'string') el.style.cssText = v;
          else for (const s in v) s.startsWith('--') ? el.style.setProperty(s, v[s]) : (el.style[s] = v[s]);
        } else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  };

  QD.$ = (s, r = document) => r.querySelector(s);
  QD.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  QD.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  QD.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  QD.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  QD.rand = (a, b) => a + Math.random() * (b - a);
  QD.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  QD.debounce = (fn, ms) => {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.cancel = () => clearTimeout(t);
    d.now = (...a) => { clearTimeout(t); fn(...a); };
    return d;
  };
  QD.setEditable = (el, plain) => {
    if (plain) {
      el.setAttribute('contenteditable', 'plaintext-only');
      if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    } else el.setAttribute('contenteditable', 'true');
  };

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  QD.pad = pad;
  QD.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  QD.WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  QD.dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  QD.todayKey = () => QD.dateKey();
  QD.parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  QD.addDays = (k, n) => { const d = QD.parseKey(k); d.setDate(d.getDate() + n); return QD.dateKey(d); };
  QD.addMonths = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const settings = () => (QD.store && QD.store.settings) || {};
  QD.fmtDate = (k, style = 'medium') => {
    const d = typeof k === 'string' ? QD.parseKey(k) : new Date(k);
    const f = settings().dateFormat || 'us';
    const M = QD.MONTHS[d.getMonth()], Ms = M.slice(0, 3), D = d.getDate(), Y = d.getFullYear();
    const Wd = QD.WEEKDAYS[d.getDay()];
    const mon = style === 'long' ? M : Ms;
    const base = f === 'iso' ? QD.dateKey(d) : f === 'eu' ? `${D} ${mon} ${Y}` : `${mon} ${D}, ${Y}`;
    if (style === 'long') return `${Wd}, ${base}`;
    if (style === 'wd') return `${Wd.slice(0, 3)}, ${base}`;
    return base;
  };
  QD.fmtMonth = ym => { const [y, m] = ym.split('-').map(Number); return `${QD.MONTHS[m - 1]} ${y}`; };
  QD.fmtTime = ts => {
    const d = new Date(ts);
    let H = d.getHours();
    const m = pad(d.getMinutes());
    if (settings().timeFormat === '24') return `${pad(H)}:${m}`;
    const ap = H < 12 ? 'AM' : 'PM';
    H = H % 12 || 12;
    return `${H}:${m} ${ap}`;
  };
  QD.fmtDateTime = ts => `${QD.fmtDate(ts, 'wd')} · ${QD.fmtTime(ts)}`;
  QD.fmtDuration = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  QD.timeAgo = ts => {
    const s = (Date.now() - ts) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return QD.fmtDate(ts);
  };

  /* ---------- text (multilingual counting) ---------- */
  let wordSeg = null, graphSeg = null;
  try { wordSeg = new Intl.Segmenter(undefined, { granularity: 'word' }); graphSeg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { /* older browser */ }
  QD.countWords = t => {
    if (!t || !t.trim()) return 0;
    if (wordSeg) { let n = 0; for (const s of wordSeg.segment(t)) if (s.isWordLike) n++; return n; }
    return t.trim().split(/\s+/).length;
  };
  QD.countChars = t => {
    t = (t || '').replace(/\s/g, '');
    if (graphSeg) { let n = 0; for (const _ of graphSeg.segment(t)) n++; return n; }
    return [...t].length;
  };

  /* ---------- color ---------- */
  QD.hexToRgb = hex => {
    let x = hex.replace('#', '');
    if (x.length === 3) x = x.split('').map(c => c + c).join('');
    const n = parseInt(x, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  QD.isLight = hex => {
    const [r, g, b] = QD.hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
  };

  /* ---------- blobs ---------- */
  QD.blobToDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  QD.dataURLToBlob = async url => (await fetch(url)).blob();
  QD.download = (blob, name) => {
    const a = QD.h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  /* ---------- 8-bit sound effects ---------- */
  let actx = null;
  const SFX = {
    click: [[880, 0.025]],
    pop: [[660, 0.04], [990, 0.05]],
    rec: [[523, 0.06], [784, 0.09]],
    stop: [[784, 0.06], [523, 0.09]],
    del: [[392, 0.05], [262, 0.08]],
    page: [[587, 0.03], [740, 0.04]],
    ok: [[784, 0.04], [1047, 0.06]],
  };
  QD.sfx = name => {
    if (!settings().sounds) return;
    const seq = SFX[name];
    if (!seq) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      let t = actx.currentTime + 0.01;
      for (const [f, d] of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + d + 0.02);
        t += d;
      }
    } catch (e) { /* audio unavailable */ }
  };

  /* ---------- popover ---------- */
  let pop = null;
  QD.closePopover = () => {
    if (!pop) return;
    const p = pop; pop = null;
    p.el.remove();
    document.removeEventListener('pointerdown', p.outside, true);
    document.removeEventListener('keydown', p.key, true);
    document.removeEventListener('scroll', p.scroll, true);
    window.removeEventListener('resize', p.close);
    p.anchor && p.anchor.classList.remove('open');
    p.onClose && p.onClose();
  };
  QD.popover = (anchor, content, opts = {}) => {
    if (pop && pop.anchor === anchor) { QD.closePopover(); return null; }
    QD.closePopover();
    const el = QD.h('div', { class: 'popover bx ' + (opts.cls || ''), role: 'dialog' }, content);
    document.body.append(el);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = el.offsetWidth, ph = el.offsetHeight;
      let x = opts.align === 'end' ? r.right - pw : opts.align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
      let y = r.bottom + 10;
      if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 10);
      x = QD.clamp(x, 8, Math.max(8, innerWidth - pw - 8));
      el.style.left = x + 'px'; el.style.top = y + 'px';
    };
    place();
    const p = {
      el, anchor, onClose: opts.onClose, close: QD.closePopover,
      outside: e => { if (!el.contains(e.target) && !anchor.contains(e.target) && !e.target.closest('.overlay')) QD.closePopover(); },
      key: e => { if (e.key === 'Escape') { e.stopPropagation(); QD.closePopover(); anchor.focus && anchor.focus(); } },
      scroll: e => { if (!el.contains(e.target)) QD.closePopover(); },
    };
    pop = p;
    anchor.classList.add('open');
    document.addEventListener('pointerdown', p.outside, true);
    document.addEventListener('keydown', p.key, true);
    document.addEventListener('scroll', p.scroll, true);
    window.addEventListener('resize', p.close);
    return { el, close: QD.closePopover, place };
  };

  /* menu built on popover */
  QD.menu = (anchor, items, opts = {}) => {
    const list = QD.h('div', { class: 'menu' });
    for (const it of items) {
      if (it === '-') { list.append(QD.h('div', { class: 'menu-sep' })); continue; }
      if (it.info) { list.append(QD.h('div', { class: 'menu-info' }, QD.h('b', { text: it.info }), it.sub ? QD.h('small', { text: it.sub }) : null)); continue; }
      list.append(QD.h('button', {
        class: 'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : ''),
        html: (it.icon ? QD.ic(it.icon) : '') + `<span>${QD.esc(it.label)}</span>` + (it.hint ? `<kbd>${QD.esc(it.hint)}</kbd>` : ''),
        onclick: () => { QD.closePopover(); it.onClick && it.onClick(); },
      }));
    }
    return QD.popover(anchor, list, Object.assign({ cls: 'pop-menu' }, opts));
  };

  /* ---------- modal ---------- */
  const openModals = new Set();
  QD.closeModals = () => Array.from(openModals).forEach(m => m.close());
  QD.modal = ({ title, body, actions = [], cls = '', onClose, icon }) => {
    const overlay = QD.h('div', { class: 'overlay' });
    const btns = {};
    let closed = false;
    const api = {
      btns,
      close(result) {
        if (closed) return;
        closed = true;
        openModals.delete(api);
        document.removeEventListener('keydown', key);
        overlay.classList.add('out');
        setTimeout(() => overlay.remove(), 180);
        onClose && onClose(result);
      },
    };
    const foot = actions.length ? QD.h('div', { class: 'modal-foot' }) : null;
    for (const a of actions) {
      const b = QD.h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '') + (a.cls ? ' ' + a.cls : ''), html: (a.icon ? QD.ic(a.icon) : '') + `<span>${QD.esc(a.label)}</span>` });
      if (a.disabled) b.disabled = true;
      b.onclick = () => (a.onClick ? a.onClick(api) : api.close());
      btns[a.id || a.label] = b;
      foot.append(b);
    }
    const box = QD.h('div', { class: 'modal bx ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      QD.h('div', { class: 'modal-head' },
        QD.h('h2', { html: (icon ? QD.ic(icon) : '') + `<span>${QD.esc(title)}</span>` }),
        QD.h('button', { class: 'icon-btn', 'aria-label': 'Close', title: 'Close', html: QD.ic('close'), onclick: () => api.close() })),
      QD.h('div', { class: 'modal-body' }, body),
      foot);
    api.el = box;
    openModals.add(api);
    overlay.append(box);
    const key = e => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); api.close(); } };
    document.addEventListener('keydown', key);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) api.close(); });
    document.getElementById('modal-root').append(overlay);
    const f = box.querySelector('.modal-body input, .modal-foot .primary');
    if (f) setTimeout(() => f.focus(), 60);
    return api;
  };

  QD.confirm = ({ title, text, ok = 'OK', danger = false, icon }) => new Promise(res => {
    let v = false;
    QD.modal({
      title, icon: icon || (danger ? 'trash' : 'help'), cls: 'modal-sm',
      body: QD.h('p', { class: 'confirm-text', text }),
      actions: [{ label: 'Cancel' }, { label: ok, primary: !danger, danger, onClick: m => { v = true; m.close(); } }],
      onClose: () => res(v),
    });
  });

  /* ---------- toast ---------- */
  let toastCur = null;
  QD.toast = (msg, opts = {}) => {
    if (toastCur) toastCur.finish();
    const el = QD.h('div', { class: 'toast bx', role: 'status' },
      opts.icon ? QD.h('span', { class: 'toast-ic', html: QD.ic(opts.icon) }) : null,
      QD.h('span', { class: 'toast-msg', text: msg }));
    let done = false, acted = false, timer = 0;
    const t = {
      finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        el.classList.add('out');
        setTimeout(() => el.remove(), 220);
        if (toastCur === t) toastCur = null;
        if (!acted && opts.onDone) opts.onDone();
      },
    };
    if (opts.action) {
      el.append(QD.h('button', { class: 'toast-act', text: opts.action, onclick: () => { acted = true; opts.onAction && opts.onAction(); t.finish(); } }));
    }
    document.getElementById('toast-root').append(el);
    timer = setTimeout(() => t.finish(), opts.timeout || (opts.action ? 6000 : 2600));
    toastCur = t;
    return t;
  };
  QD.flushToast = () => { if (toastCur) toastCur.finish(); };
})(window.QD);
