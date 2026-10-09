'use strict';
/* IndexedDB persistence + in-memory state. */
(function (QD) {
  /* ---------- tiny IndexedDB wrapper ---------- */
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('qdiary', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const st = tx.objectStore(store);
      let out;
      const r = fn(st);
      if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  const db = QD.db = {
    all: s => run(s, 'readonly', st => st.getAll()),
    get: (s, k) => run(s, 'readonly', st => st.get(k)),
    put: (s, v) => run(s, 'readwrite', st => st.put(v)),
    putMany: (s, arr) => run(s, 'readwrite', st => { arr.forEach(v => st.put(v)); }),
    del: (s, k) => run(s, 'readwrite', st => st.delete(k)),
    clear: s => run(s, 'readwrite', st => st.clear()),
  };

  /* ---------- defaults ---------- */
  const DEFAULTS = {
    theme: 'strawberry', accent: '', autoNight: false, nightTheme: 'midnight',
    ui: 'pixel', desk: 'checker',
    font: 'mali', fontSize: 18, uiFont: 'pixel', lang: '', spellcheck: true,
    paper: 'lined', defaultCategory: 'personal',
    weekStart: 0, dateFormat: 'us', timeFormat: '12',
    sounds: true, openTo: 'today', lastPage: null,
    layout: 'auto', pencil: 'draw', fingerDraw: 'auto', pencilTool: 'pen',
  };
  const DEFAULT_CATS = [
    { id: 'personal', name: 'Personal', color: '#ff6f9c' },
    { id: 'study', name: 'Study & Work', color: '#5b8cff' },
    { id: 'travel', name: 'Travel', color: '#3ec5b0' },
    { id: 'food', name: 'Food', color: '#ff8a5b' },
    { id: 'dreams', name: 'Dreams', color: '#9b7bff' },
  ];

  /* ---------- state ---------- */
  const listeners = {};
  const S = QD.store = {
    DEFAULTS,
    settings: { ...DEFAULTS },
    categories: [],
    pages: new Map(),
    media: new Map(),
    urls: new Map(),
    on(evt, fn) { (listeners[evt] = listeners[evt] || new Set()).add(fn); return () => listeners[evt].delete(fn); },
    emit(evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  S.load = async () => {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    const [pages, media, meta] = await Promise.all([db.all('pages'), db.all('media'), db.all('meta')]);
    const m = Object.fromEntries(meta.map(r => [r.key, r.value]));
    S.settings = { ...DEFAULTS, ...(m.settings || {}) };
    S.categories = m.categories || DEFAULT_CATS.map(c => ({ ...c }));
    if (!m.categories) db.put('meta', { key: 'categories', value: S.categories });
    pages.forEach(S.normalize);
    S.pages = new Map(pages.map(p => [p.id, p]));
    S.media = new Map(media.map(r => [r.id, r]));
    S.urls.forEach(u => URL.revokeObjectURL(u));
    S.urls.clear();
    // drop media that no longer belongs to anything
    for (const rec of media) {
      const p = S.pages.get(rec.pageId);
      const orphan = !p || (rec.kind === 'drawing' ? !p.inks.includes(rec.id) : !p.items.some(i => i.mediaId === rec.id));
      if (orphan) S.deleteMedia(rec.id);
    }
  };

  /* settings & categories */
  S.saveSettings = QD.debounce(() => { db.put('meta', { key: 'settings', value: S.settings }); }, 250);
  S.setSetting = (k, v) => { S.settings[k] = v; S.saveSettings(); S.emit('settings', k); };
  S.saveCategories = () => { db.put('meta', { key: 'categories', value: S.categories }); S.emit('categories'); };
  S.cat = id => S.categories.find(c => c.id === id) || null;

  /* pages */
  /* A day = one record with two sides (left + right page). */
  S.newDraft = date => ({
    v: 2, id: QD.uid('p'), date, title: '', html: '', html2: '', text: '',
    papers: [S.settings.paper, S.settings.paper], mood: null, weather: null,
    categoryId: S.cat(S.settings.defaultCategory) ? S.settings.defaultCategory : null,
    height: 832, items: [], inks: [null, null],
    createdAt: Date.now(), updatedAt: Date.now(), draft: true,
  });
  // upgrade records saved by the single-page version
  S.normalize = p => {
    if (!Array.isArray(p.items)) p.items = [];
    if (p.v === 2) return p;
    const paper = p.paper || 'lined';
    p.papers = p.papers || [paper, paper];
    p.inks = p.inks || [p.drawingId || null, null];
    p.html2 = p.html2 || '';
    p.items.forEach(it => {
      if (it.side != null) return;
      it.side = 0;
      if (it.x + it.w / 2 > 600) { it.side = 1; it.x = Math.max(0, it.x - 300); }
    });
    p.height = Math.max(832, p.height || 832);
    delete p.paper; delete p.drawingId;
    p.v = 2;
    return p;
  };
  S.isEmpty = p => !p.title.trim() && !(p.text || '').trim() && !p.items.length && !(p.inks || []).some(Boolean) && !p.mood && !p.weather;
  S.commit = p => {
    if (!p.draft) return;
    delete p.draft;
    S.pages.set(p.id, p);
    S.emit('pages');
  };
  S.sorted = () => Array.from(S.pages.values()).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  S.pagesOn = date => S.sorted().filter(p => p.date === date);

  const timers = new Map();
  S.writePage = async p => {
    timers.delete(p.id);
    if (!S.pages.has(p.id)) return;
    try {
      await db.put('pages', JSON.parse(JSON.stringify(p)));
      S.emit('saved', p.id);
    } catch (e) {
      console.error(e);
      QD.toast('Could not save — storage may be full', { icon: 'close' });
    }
  };
  S.savePage = p => {
    S.emit('saving', p.id);
    clearTimeout(timers.get(p.id));
    timers.set(p.id, setTimeout(() => S.writePage(p), 450));
  };
  S.flush = id => {
    if (!timers.has(id)) return;
    clearTimeout(timers.get(id));
    const p = S.pages.get(id);
    if (p) S.writePage(p); else timers.delete(id);
  };
  S.flushAll = () => Array.from(timers.keys()).forEach(S.flush);
  S.deletePage = async id => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    S.pages.delete(id);
    await db.del('pages', id);
    for (const rec of Array.from(S.media.values())) if (rec.pageId === id) await S.deleteMedia(rec.id);
    S.emit('pages');
  };

  /* media (photos, voice notes, drawings) */
  S.putMedia = async rec => {
    S.media.set(rec.id, rec);
    if (S.urls.has(rec.id)) { URL.revokeObjectURL(S.urls.get(rec.id)); S.urls.delete(rec.id); }
    await db.put('media', rec);
    if (rec.kind !== 'drawing') S.emit('media');
  };
  S.deleteMedia = async id => {
    const rec = S.media.get(id);
    S.media.delete(id);
    if (S.urls.has(id)) { URL.revokeObjectURL(S.urls.get(id)); S.urls.delete(id); }
    await db.del('media', id);
    if (rec && rec.kind !== 'drawing') S.emit('media');
  };
  S.url = id => {
    if (!S.urls.has(id)) {
      const rec = S.media.get(id);
      if (!rec) return '';
      S.urls.set(id, URL.createObjectURL(rec.blob));
    }
    return S.urls.get(id);
  };
  S.mediaOf = kind => Array.from(S.media.values()).filter(r => r.kind === kind && S.pages.has(r.pageId));

  /* backup */
  S.exportAll = async () => {
    const media = [];
    for (const r of S.media.values()) {
      const { blob, ...rest } = r;
      media.push({ ...rest, data: await QD.blobToDataURL(blob) });
    }
    return { app: 'QDiary', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, categories: S.categories, pages: Array.from(S.pages.values()), media };
  };
  S.importAll = async data => {
    if (!data || data.app !== 'QDiary' || !Array.isArray(data.pages)) throw new Error('Not a QDiary backup file');
    const media = [];
    for (const r of data.media || []) {
      const { data: url, ...rest } = r;
      media.push({ ...rest, blob: await QD.dataURLToBlob(url) });
    }
    await db.putMany('pages', data.pages);
    if (media.length) await db.putMany('media', media);
    const cats = [...S.categories];
    for (const c of data.categories || []) if (!cats.some(x => x.id === c.id)) cats.push(c);
    await db.put('meta', { key: 'categories', value: cats });
    return { pages: data.pages.length, media: media.length };
  };
  S.wipe = async () => {
    await Promise.all([db.clear('pages'), db.clear('media'), db.clear('meta')]);
    try { localStorage.removeItem('qd.boot'); localStorage.removeItem('qd.tools'); } catch (e) { /* ignore */ }
  };

  window.addEventListener('pagehide', () => S.flushAll());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') S.flushAll(); });
})(window.QD);
