'use strict';
/* Settings: themes, colors, fonts, journal defaults, categories, backup. */
(function (QD) {
  const { h, ic } = QD;
  const S = QD.store;
  QD.views = QD.views || {};

  const set = (k, v) => { S.setSetting(k, v); QD.applySettings(); };

  function seg(options, value, onChange, label) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || '' });
    for (const [v, text] of options) {
      const b = h('button', { class: 'seg-btn' + (v === value ? ' active' : ''), role: 'radio', 'aria-checked': String(v === value), html: text });
      b.onclick = () => {
        QD.$$('.seg-btn', wrap).forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
        onChange(v);
        QD.sfx('click');
      };
      wrap.append(b);
    }
    return wrap;
  }
  function toggle(checked, onChange, label) {
    const input = h('input', { type: 'checkbox', checked, 'aria-label': label });
    input.addEventListener('change', () => { onChange(input.checked); QD.sfx('click'); });
    return h('label', { class: 'switch' }, input, h('span', { class: 'switch-ui' }));
  }
  const row = (title, desc, control) => h('div', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('b', { text: title }), desc ? h('small', { text: desc }) : null), control);
  const section = (icon, title, ...kids) => h('section', { class: 'set-card bx' }, h('h2', { html: `${ic(icon)}<span>${QD.esc(title)}</span>` }), ...kids);

  QD.views.settings = root => {
    root.classList.add('view-settings');
    const st = S.settings;
    root.append(h('div', { class: 'view-head' }, h('h1', { html: `${ic('gear')}<span>Settings</span>` }), h('span', { class: 'muted', text: 'Changes are saved automatically' })));
    const cols = h('div', { class: 'set-cols' });
    root.append(cols);

    /* ----- Look & feel ----- */
    const themeGrid = h('div', { class: 'theme-grid' });
    const drawThemes = () => {
      themeGrid.innerHTML = '';
      for (const [id, t] of Object.entries(QD.THEMES)) {
        const c = t.c;
        themeGrid.append(h('button', {
          class: 'theme-tile' + (st.theme === id ? ' active' : ''), 'aria-pressed': String(st.theme === id),
          style: { '--t-bg': c.bg, '--t-surface': c.surface, '--t-accent': st.accent || c.accent, '--t-ink': c.ink, '--t-bg2': c.bg2 },
          onclick: () => { set('theme', id); drawThemes(); QD.sfx('pop'); },
        },
          h('span', { class: 'tt-prev' }, h('i', { class: 'tt-side' }), h('i', { class: 'tt-page' }, h('i'), h('i'), h('i')), h('i', { class: 'tt-dot' })),
          h('span', { class: 'tt-name', text: t.name }), t.dark ? h('small', { class: 'tt-badge', text: 'Dark' }) : null));
      }
    };
    drawThemes();

    const accentRow = h('div', { class: 'swatches big' });
    const drawAccent = () => {
      accentRow.innerHTML = '';
      accentRow.append(h('button', { class: 'sw sw-default' + (!st.accent ? ' active' : ''), title: 'Theme default', 'aria-label': 'Use theme default accent', html: ic('sparkle'), onclick: () => { set('accent', ''); drawAccent(); drawThemes(); } }));
      for (const c of QD.CAT_COLORS) {
        accentRow.append(h('button', { class: 'sw' + (st.accent === c ? ' active' : ''), style: { '--sw': c }, title: c, 'aria-label': 'Accent ' + c, onclick: () => { set('accent', c); drawAccent(); drawThemes(); } }));
      }
      const custom = h('input', { type: 'color', class: 'sw-custom', value: st.accent || '#ff6f9c', 'aria-label': 'Custom accent color' });
      custom.addEventListener('input', () => { set('accent', custom.value); });
      custom.addEventListener('change', () => { drawAccent(); drawThemes(); });
      const isCustom = st.accent && !QD.CAT_COLORS.includes(st.accent);
      accentRow.append(h('label', { class: 'sw sw-rainbow' + (isCustom ? ' active' : ''), style: isCustom ? { '--sw': st.accent } : null, title: 'Custom color' }, custom));
    };
    drawAccent();

    const nightSel = h('select', { class: 'input sm', 'aria-label': 'Night theme' },
      Object.entries(QD.THEMES).filter(([, t]) => t.dark).map(([id, t]) => h('option', { value: id, text: t.name, selected: st.nightTheme === id ? 'selected' : null })));
    nightSel.addEventListener('change', () => set('nightTheme', nightSel.value));

    cols.append(section('palette', 'Look & feel',
      h('p', { class: 'set-label', text: 'Theme' }), themeGrid,
      h('p', { class: 'set-label', text: 'Accent color' }), accentRow,
      row('Night mode', 'Switch to a dark theme when your device is in dark mode', h('div', { class: 'row-ctl' }, nightSel, toggle(st.autoNight, v => set('autoNight', v), 'Night mode'))),
      row('Interface style', 'Chunky pixel outlines or soft rounded corners', seg([['pixel', 'Pixel'], ['soft', 'Soft']], st.ui, v => set('ui', v), 'Interface style')),
      row('Desk pattern', 'The background behind your notebook', seg([['checker', 'Checker'], ['dots', 'Dots'], ['grid', 'Grid'], ['plain', 'Plain']], st.desk, v => set('desk', v), 'Desk pattern'))));

    /* ----- Writing ----- */
    const sample = 'Dear diary ♡ 123 · สวัสดี · こんにちは · 안녕';
    const fontGrid = h('div', { class: 'font-grid' });
    const drawFonts = () => {
      fontGrid.innerHTML = '';
      for (const f of QD.FONTS) {
        fontGrid.append(h('button', {
          class: 'font-tile' + (st.font === f.id ? ' active' : ''), 'aria-pressed': String(st.font === f.id),
          onclick: () => { set('font', f.id); drawFonts(); updatePreview(); },
        },
          h('span', { class: 'ft-sample', style: { fontFamily: QD.fontStack(f.family) }, text: sample }),
          h('span', { class: 'ft-name' }, h('b', { text: f.name }), h('small', { text: f.tag }))));
      }
    };
    drawFonts();
    const preview = h('div', { class: 'write-preview', dir: 'auto', 'data-paper': 'lined', text: 'Today I found a tiny café with pixel-art mugs. ☕ วันนี้อากาศดีมาก! 今日はいい日。' });
    const updatePreview = () => { preview.setAttribute('lang', st.lang || ''); };
    const sizeOut = h('span', { class: 'size-val', text: st.fontSize + 'px' });
    const sizeIn = h('input', { type: 'range', min: '14', max: '26', step: '1', value: st.fontSize, 'aria-label': 'Text size' });
    sizeIn.addEventListener('input', () => { set('fontSize', +sizeIn.value); sizeOut.textContent = sizeIn.value + 'px'; });
    const uiSel = h('select', { class: 'input sm', 'aria-label': 'Interface font' }, Object.entries(QD.UI_FONTS).map(([id, u]) => h('option', { value: id, text: u.name, selected: st.uiFont === id ? 'selected' : null })));
    uiSel.addEventListener('change', () => set('uiFont', uiSel.value));
    const langSel = h('select', { class: 'input sm', 'aria-label': 'Writing language' }, QD.LANGS.map(([id, name]) => h('option', { value: id, text: name, selected: st.lang === id ? 'selected' : null })));
    langSel.addEventListener('change', () => { set('lang', langSel.value); updatePreview(); });

    cols.append(section('font', 'Writing',
      h('p', { class: 'set-label', text: 'Handwriting font for your pages' }), fontGrid,
      preview,
      row('Text size', 'Lines on the paper stay aligned at any size', h('div', { class: 'row-ctl' }, sizeIn, sizeOut)),
      row('Interface font', 'Font for menus and buttons', uiSel),
      row('Writing language', 'Improves spellcheck and picks the right Chinese/Japanese glyph shapes. Typing in any language works either way — just switch your keyboard.', langSel),
      row('Spellcheck', 'Underline possible spelling mistakes', toggle(st.spellcheck, v => set('spellcheck', v), 'Spellcheck')),
      h('div', { class: 'tip', html: `${ic('help')}<span>Mixed languages are fine: each paragraph detects its own direction, so Arabic or Hebrew lines flow right-to-left next to English or Thai. Word counts understand languages written without spaces, like Thai, Japanese and Chinese.</span>` })));
    updatePreview();

    /* ----- Journal ----- */
    const paperRow = h('div', { class: 'paper-grid compact' });
    const drawPapers = () => {
      paperRow.innerHTML = '';
      for (const p of QD.PAPERS) {
        paperRow.append(h('button', { class: 'paper-tile' + (st.paper === p.id ? ' active' : ''), title: p.name, onclick: () => { set('paper', p.id); drawPapers(); } },
          h('span', { class: 'paper-mini' }, h('span', { class: 'pm-inner', 'data-paper': p.id })), h('span', { class: 'paper-name', text: p.name })));
      }
    };
    drawPapers();
    const catSel = h('select', { class: 'input sm', 'aria-label': 'Default category' });
    const drawCatSel = () => {
      catSel.innerHTML = '';
      catSel.append(h('option', { value: '', text: 'No category' }));
      S.categories.forEach(c => catSel.append(h('option', { value: c.id, text: c.name, selected: st.defaultCategory === c.id ? 'selected' : null })));
    };
    drawCatSel();
    catSel.addEventListener('change', () => set('defaultCategory', catSel.value || null));
    const dk = QD.todayKey(), d = QD.parseKey(dk), Ms = QD.MONTHS[d.getMonth()].slice(0, 3);

    cols.append(section('book', 'Journal',
      h('p', { class: 'set-label', text: 'Default paper for new pages' }), paperRow,
      row('Default category', 'Given to new pages', catSel),
      row('Week starts on', null, seg([[0, 'Sunday'], [1, 'Monday']], +st.weekStart, v => set('weekStart', v), 'Week start')),
      row('Date format', null, seg([['us', `${Ms} ${d.getDate()}, ${d.getFullYear()}`], ['eu', `${d.getDate()} ${Ms} ${d.getFullYear()}`], ['iso', dk]], st.dateFormat, v => set('dateFormat', v), 'Date format')),
      row('Time format', null, seg([['12', '3:42 PM'], ['24', '15:42']], st.timeFormat, v => set('timeFormat', v), 'Time format')),
      row('When QDiary opens', null, seg([['today', 'Today’s page'], ['last', 'Last page I opened']], st.openTo, v => set('openTo', v), 'Open to')),
      row('8-bit sound effects', 'Tiny bleeps when you click, record and stick things', toggle(st.sounds, v => { set('sounds', v); if (v) QD.sfx('ok'); }, 'Sound effects'))));

    /* ----- iPad, Apple Pencil & touch ----- */
    cols.append(section('pen', 'Apple Pencil & touch',
      row('Page layout', 'Auto shows two pages in landscape and one page in portrait', seg([['auto', 'Auto'], ['single', 'One page'], ['spread', 'Two pages']], st.layout || 'auto', v => set('layout', v), 'Page layout')),
      row('Apple Pencil in Type mode', 'Draw: the pencil always writes ink. Scribble: iPadOS turns your handwriting into typed text.', seg([['draw', 'Draw'], ['scribble', 'Scribble to text']], st.pencil || 'draw', v => set('pencil', v), 'Pencil in type mode')),
      row('Pencil writes with', 'The tool the pencil uses while you are in Type mode', seg([['pen', 'Pen'], ['marker', 'Marker'], ['pixel', 'Pixel brush']], st.pencilTool || 'pen', v => set('pencilTool', v), 'Pencil tool')),
      row('Finger drawing', 'Auto: fingers draw until a pencil is used, then fingers only scroll and move things — your palm can rest on the page.', seg([['auto', 'Auto'], ['on', 'Always'], ['off', 'Never']], st.fingerDraw || 'auto', v => set('fingerDraw', v), 'Finger drawing')),
      h('div', { class: 'tip', html: `${ic('book')}<span>Turn pages like a real notebook: drag the top or bottom corner of the right page to go to the next day, or a left-page corner to go back. A quick tap on a corner works too.</span>` })));

    /* ----- Categories ----- */
    const catList = h('div', { class: 'cat-list' });
    const drawCats = () => {
      catList.innerHTML = '';
      for (const c of S.categories) {
        const n = Array.from(S.pages.values()).filter(p => p.categoryId === c.id).length;
        const name = h('input', { class: 'input sm', value: c.name, maxlength: '32', 'aria-label': 'Category name', dir: 'auto' });
        name.addEventListener('change', () => { c.name = name.value.trim() || c.name; name.value = c.name; S.saveCategories(); drawCatSel(); });
        const colorBtn = h('button', { class: 'sw', style: { '--sw': c.color }, title: 'Change color', 'aria-label': 'Change color' });
        colorBtn.onclick = () => QD.popover(colorBtn, h('div', { class: 'swatches' }, QD.CAT_COLORS.map(col => h('button', {
          class: 'sw' + (col === c.color ? ' active' : ''), style: { '--sw': col }, 'aria-label': col,
          onclick: () => { c.color = col; S.saveCategories(); QD.closePopover(); drawCats(); },
        }))), { cls: 'pop-sw' });
        const del = h('button', {
          class: 'icon-btn sm', title: 'Delete category', 'aria-label': 'Delete category ' + c.name, html: ic('trash'),
          onclick: async () => {
            if (!(await QD.confirm({ title: `Delete “${c.name}”?`, text: n ? `${n} page${n > 1 ? 's' : ''} will move to “No category”. The pages themselves are kept.` : 'This category has no pages.', ok: 'Delete', danger: true }))) return;
            S.categories = S.categories.filter(x => x.id !== c.id);
            for (const p of S.pages.values()) if (p.categoryId === c.id) { p.categoryId = null; S.savePage(p); }
            if (st.defaultCategory === c.id) set('defaultCategory', null);
            S.saveCategories(); drawCats(); drawCatSel();
          },
        });
        catList.append(h('div', { class: 'cat-row' }, colorBtn, name, h('small', { class: 'muted', text: `${n} page${n === 1 ? '' : 's'}` }), del));
      }
      const add = h('input', { class: 'input sm', placeholder: 'Add a category…', maxlength: '32', dir: 'auto' });
      const doAdd = () => {
        const v = add.value.trim();
        if (!v) return;
        S.categories.push({ id: QD.uid('c'), name: v, color: QD.CAT_COLORS[S.categories.length % QD.CAT_COLORS.length] });
        S.saveCategories(); drawCats(); drawCatSel(); QD.sfx('pop');
      };
      add.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) doAdd(); });
      catList.append(h('div', { class: 'cat-row add' }, h('span', { class: 'sw sw-add', html: ic('plus') }), add, h('button', { class: 'btn sm', text: 'Add', onclick: doAdd })));
    };
    drawCats();
    cols.append(section('tag', 'Categories', catList));

    /* ----- Data ----- */
    const usage = h('span', { class: 'muted', text: 'Calculating…' });
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(e => {
        const mb = v => (v / 1048576).toFixed(v > 1048576 * 10 ? 0 : 1) + ' MB';
        usage.textContent = `${mb(e.usage || 0)} used${e.quota ? ` of about ${mb(e.quota)} available` : ''}`;
      }).catch(() => { usage.textContent = 'Unknown'; });
    } else usage.textContent = 'Unknown';
    const importIn = h('input', { type: 'file', accept: '.zip,.xlsx,.csv,.json,application/zip,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true });
    importIn.onchange = async () => {
      const f = importIn.files[0];
      importIn.value = '';
      if (!f) return;
      try {
        const msg = await QD.transfer.importFile(f);
        if (!msg) return;
        await S.load();
        QD.applySettings();
        QD.app.refresh();
        QD.toast(msg, { icon: 'check' });
      } catch (e) {
        console.error(e);
        QD.toast(e.message || 'That file could not be imported', { icon: 'close' });
      }
    };
    const job = (label, fn) => async e => {
      const b = e.currentTarget;
      b.disabled = true;
      const t = QD.toast(`Preparing ${label}…`, { icon: 'clock', timeout: 60000 });
      try { await fn(); t.finish(); QD.toast(`${label[0].toUpperCase() + label.slice(1)} ready`, { icon: 'check' }); }
      catch (err) { console.error(err); t.finish(); QD.toast('Export failed — ' + (err.message || 'unknown error'), { icon: 'close' }); }
      finally { b.disabled = false; }
    };
    const pages = S.pages.size, photos = S.mediaOf('photo').length, voices = S.mediaOf('voice').length;
    cols.append(section('download', 'Export & import',
      h('p', { class: 'muted', text: 'Everything lives privately in this browser on this device — nothing is uploaded anywhere. Export now and then to keep your memories safe, or to use them in other apps.' }),
      row('Your diary', `${pages} days · ${photos} photos · ${voices} voice notes`, usage),
      row('Everything (.zip)', 'Spreadsheet + every photo, voice note and drawing as files + one Markdown file per day. Import it back to restore all of it.', h('button', { class: 'btn primary', html: `${ic('download')}<span>Export .zip</span>`, onclick: job('export', () => QD.transfer.exportZip()) })),
      row('Spreadsheet (.xlsx)', 'Excel / Google Sheets / Numbers: Entries, Photos, Voice notes and Categories sheets. Edit it and import it back.', h('button', { class: 'btn', html: `${ic('list')}<span>Export .xlsx</span>`, onclick: job('spreadsheet', () => QD.transfer.exportXlsx()) })),
      row('Entries (.csv)', 'Plain table of all days (UTF-8), for any app', h('button', { class: 'btn', html: `${ic('file')}<span>Export .csv</span>`, onclick: job('CSV', async () => QD.transfer.exportCsv()) })),
      row('Single-file backup (.json)', 'Everything in one file with media embedded', h('button', { class: 'btn', html: `${ic('download')}<span>Export .json</span>`, onclick: job('backup', async () => QD.download(new Blob([JSON.stringify(await S.exportAll())], { type: 'application/json' }), `qdiary-backup-${QD.todayKey()}.json`)) })),
      row('Import', 'Accepts a QDiary .zip or .json (full restore), or an .xlsx / .csv with Date, Title and text columns. You will see a summary before anything changes.', h('button', { class: 'btn', html: `${ic('upload')}<span>Import…</span>`, onclick: () => importIn.click() })),
      importIn,
      row('Erase everything', 'Permanently deletes all pages, media and settings from this browser', h('button', {
        class: 'btn danger', html: `${ic('trash')}<span>Erase</span>`,
        onclick: async () => {
          if (!(await QD.confirm({ title: 'Erase your whole diary?', text: 'All pages, photos, drawings, voice notes and settings will be deleted from this browser. Export a backup first if you might want them back.', ok: 'Erase everything', danger: true }))) return;
          QD.player.stop();
          await S.wipe();
          location.hash = '';
          location.reload();
        },
      }))));

    cols.append(section('heart', 'About',
      h('p', { html: '<b>QDiary</b> — a cozy pixel notebook for words, doodles, photos and voices. Works offline and can be installed as an app from your browser’s menu.' }),
      h('div', { class: 'kbd-list' }, [['T P M H X E', 'Switch tools'], ['Alt+← / →', 'Flip pages'], ['Ctrl+Z / Y', 'Undo / redo drawing'], ['Ctrl+S', 'Save now']].map(([k, v]) => h('div', { class: 'kbd-row' }, h('kbd', { text: k }), h('span', { text: v }))))));

    const off = S.on('categories', () => { drawCatSel(); });
    return () => off();
  };
})(window.QD);
