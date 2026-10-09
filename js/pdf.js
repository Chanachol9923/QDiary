'use strict';
/* Export to PDF: renders clean diary pages into a print-only layer and opens the system print dialog
   (choose "Save as PDF"). Pages are sized exactly like the diary in browsers that honour @page size. */
(function (QD) {
  const { h, ic } = QD;
  const S = QD.store;
  const W = 600;

  const hasRight = p => !!((p.html2 && p.html2.replace(/<[^>]*>|&nbsp;|\s/g, '')) || p.items.some(i => i.side === 1) || (p.inks || [])[1]);

  async function printDays(pages, { layout = 'spread', title = 'QDiary', live = null } = {}) {
    if (!pages.length) { QD.toast('No pages to export in that range', { icon: 'close' }); return; }
    const H = Math.max(QD.PAGE_H || 832, ...pages.map(p => p.height || 832));
    let root = document.getElementById('print-root');
    if (!root) { root = h('div', { id: 'print-root' }); document.body.append(root); }
    root.innerHTML = '';
    const sheetW = layout === 'spread' ? 2 * W : W;
    root.append(h('style', { text: `@page { size: ${sheetW}px ${H}px; margin: 0; }` }));
    const inkFor = (p, i) => (live && live.pageId === p.id ? live.inks[i] : null);
    for (const p of pages) {
      S.normalize(p);
      if (layout === 'spread') {
        const r = QD.staticSide(p, 1, H, inkFor(p, 1));
        r.style.left = W + 'px';
        root.append(h('div', { class: 'print-sheet spread', style: { width: 2 * W + 'px', height: H + 'px' } }, QD.staticSide(p, 0, H, inkFor(p, 0)), r, h('div', { class: 'print-gutter' })));
      } else {
        root.append(h('div', { class: 'print-sheet', style: { width: W + 'px', height: H + 'px' } }, QD.staticSide(p, 0, H, inkFor(p, 0))));
        if (hasRight(p)) root.append(h('div', { class: 'print-sheet', style: { width: W + 'px', height: H + 'px' } }, QD.staticSide(p, 1, H, inkFor(p, 1))));
      }
    }
    const busy = QD.toast('Preparing PDF…', { icon: 'clock', timeout: 30000 });
    const capped = (p, ms = 2500) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    await capped(Promise.all(Array.from(root.querySelectorAll('img')).map(img => (img.complete ? null : img.decode().catch(() => {})))));
    if (document.fonts && document.fonts.ready) await capped(document.fonts.ready, 1500);
    busy.finish();
    const oldTitle = document.title;
    document.title = title; // becomes the suggested PDF file name
    document.body.classList.add('printing');
    const done = () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing');
      document.title = oldTitle;
      root.innerHTML = '';
    };
    window.addEventListener('afterprint', done);
    await new Promise(r => setTimeout(r, 80));
    window.print();
    // Safari may not fire afterprint; clean up when the user comes back
    setTimeout(() => { if (document.body.classList.contains('printing')) window.addEventListener('focus', done, { once: true }); }, 500);
  }

  /** Dialog: pick a range and a layout, then print to PDF. opts: { date, live } */
  QD.pdfDialog = (opts = {}) => {
    const all = S.sorted();
    const date = opts.date || QD.todayKey();
    let range = opts.date ? 'day' : 'month', layout = 'spread';
    const from = h('input', { type: 'date', class: 'input sm', value: date.slice(0, 7) + '-01' });
    const to = h('input', { type: 'date', class: 'input sm', value: date });
    const custom = h('div', { class: 'pdf-custom hidden' }, h('label', {}, h('span', { text: 'From' }), from), h('label', {}, h('span', { text: 'To' }), to));
    const info = h('p', { class: 'muted pdf-info' });
    const pick = () => {
      if (range === 'day') return all.filter(p => p.date === date);
      if (range === 'month') return all.filter(p => p.date.startsWith(date.slice(0, 7)));
      if (range === 'custom') return all.filter(p => p.date >= (from.value || '0000') && p.date <= (to.value || '9999'));
      return all;
    };
    const update = () => {
      custom.classList.toggle('hidden', range !== 'custom');
      const ps = pick();
      const sheets = layout === 'spread' ? ps.length : ps.reduce((n, p) => n + 1 + (hasRight(p) ? 1 : 0), 0);
      info.textContent = ps.length ? `${ps.length} ${ps.length === 1 ? 'day' : 'days'} → ${sheets} PDF ${sheets === 1 ? 'page' : 'pages'}` : 'No written days in this range';
    };
    const seg = (options, value, onChange) => {
      const wrap = h('div', { class: 'seg' });
      for (const [v, label] of options) {
        const b = h('button', { class: 'seg-btn' + (v === value ? ' active' : ''), html: label });
        b.onclick = () => { QD.$$('.seg-btn', wrap).forEach(x => x.classList.toggle('active', x === b)); onChange(v); update(); };
        wrap.append(b);
      }
      return wrap;
    };
    from.addEventListener('change', update);
    to.addEventListener('change', update);
    const body = h('div', { class: 'pdf-dialog' },
      h('p', { class: 'field-label', text: 'Which days' }),
      seg([['day', 'This day'], ['month', QD.fmtMonth(date.slice(0, 7))], ['all', 'Everything'], ['custom', 'Choose dates…']], range, v => { range = v; }),
      custom,
      h('p', { class: 'field-label', text: 'Layout' }),
      seg([['spread', `${ic('spread')} Two pages side by side`], ['single', `${ic('single')} One page per sheet`]], layout, v => { layout = v; }),
      info,
      h('div', { class: 'tip', html: `${ic('help')}<span>In the print window choose <b>Save as PDF</b> as the printer. On iPad, tap Share → Print, then pinch out on the preview to get the PDF.</span>` }));
    update();
    QD.modal({
      title: 'Export PDF', icon: 'print', body, cls: 'modal-pdf',
      actions: [{ label: 'Cancel' }, {
        label: 'Export PDF', primary: true, icon: 'download', onClick: m => {
          const ps = pick();
          if (!ps.length) { QD.toast('No written days in this range', { icon: 'close' }); return; }
          m.close();
          const label = range === 'day' ? date : range === 'month' ? date.slice(0, 7) : range === 'custom' ? `${from.value}_to_${to.value}` : 'all';
          printDays(ps, { layout, live: opts.live, title: `QDiary ${label}` });
        },
      }],
    });
  };
  QD.printDays = printDays;
})(window.QD);
