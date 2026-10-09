'use strict';
/* Export & import: Excel (.xlsx), CSV, a complete .zip (spreadsheet + media files + Markdown + restorable backup),
   and the single-file .json backup. No libraries — small ZIP and XLSX writers/readers live here. */
(function (QD) {
  const S = QD.store;
  const enc = new TextEncoder();

  /* ================= ZIP ================= */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = bytes => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function dosTime(d = new Date()) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  /** files: [{ name, data: string | Uint8Array | Blob }] → Blob (stored, UTF-8 names) */
  async function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const { time, date } = dosTime();
    for (const f of files) {
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : f.data;
      const name = enc.encode(f.name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  /** Blob → Map(name → { blob(type), text() }) — supports stored and deflated entries */
  async function unzip(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const out = new Map();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = buf.subarray(start, start + csize);
      const bytes = async () => {
        if (method === 0) return raw;
        if (method === 8 && 'DecompressionStream' in window) return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        throw new Error('Unsupported zip compression');
      };
      if (!name.endsWith('/')) out.set(name, { blob: async type => new Blob([await bytes()], { type: type || '' }), text: async () => dec.decode(await bytes()) });
    }
    return out;
  }

  /* ================= XLSX ================= */
  const xmlEsc = s => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  /** sheets: [{ name, columns: [{ title, width, wrap }], rows: [[...]] }] → Blob */
  async function xlsx(sheets) {
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const files = [];
    const sheetXml = sh => {
      const ncol = sh.columns.length, last = colName(ncol - 1) + (sh.rows.length + 1);
      const cell = (v, r, c, style) => {
        const ref = colName(c) + r;
        if (v == null || v === '') return '';
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
        const t = xmlEsc(String(v).slice(0, 32000));
        return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${t}</t></is></c>`;
      };
      let x = `${head}<worksheet xmlns="${NS}" xmlns:r="${RNS}">`;
      x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
      x += '<cols>' + sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join('') + '</cols>';
      x += '<sheetData>';
      x += '<row r="1">' + sh.columns.map((c, i) => cell(c.title, 1, i, 1)).join('') + '</row>';
      sh.rows.forEach((row, ri) => {
        x += `<row r="${ri + 2}">` + row.map((v, ci) => cell(v, ri + 2, ci, sh.columns[ci] && sh.columns[ci].wrap ? 2 : 0)).join('') + '</row>';
      });
      x += '</sheetData>';
      if (sh.rows.length) x += `<autoFilter ref="A1:${last}"/>`;
      return x + '</worksheet>';
    };
    files.push({ name: '[Content_Types].xml', data: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    const defined = sheets.map((sh, i) => sh.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(sh.name)}'!$A$1:$${colName(sh.columns.length - 1)}$${sh.rows.length + 1}</definedName>` : '').join('');
    files.push({ name: 'xl/workbook.xml', data: `${head}<workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}</workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: `${head}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF6F9C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
    sheets.forEach((sh, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) }));
    const z = await zip(files);
    return new Blob([z], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /** .xlsx Blob → [{ name, rows: [[string|number]] }] */
  async function readXlsx(blob) {
    const files = await unzip(blob);
    const parse = async n => { const f = files.get(n); return f ? new DOMParser().parseFromString(await f.text(), 'application/xml') : null; };
    const tags = (doc, t) => Array.from(doc.getElementsByTagNameNS('*', t));
    const shared = [];
    const ss = await parse('xl/sharedStrings.xml');
    if (ss) tags(ss, 'si').forEach(si => shared.push(tags(si, 't').map(t => t.textContent).join('')));
    const wb = await parse('xl/workbook.xml');
    const rels = await parse('xl/_rels/workbook.xml.rels');
    if (!wb) throw new Error('Not an Excel file');
    const target = {};
    if (rels) tags(rels, 'Relationship').forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const out = [];
    for (const [i, sh] of tags(wb, 'sheet').entries()) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let path = target[rid] || `worksheets/sheet${i + 1}.xml`;
      path = path.startsWith('/') ? path.slice(1) : 'xl/' + path.replace(/^\.\//, '');
      const doc = await parse(path);
      if (!doc) continue;
      const rows = [];
      tags(doc, 'row').forEach(row => {
        const r = [];
        tags(row, 'c').forEach((c, ci) => {
          const ref = c.getAttribute('r');
          const col = ref ? ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : ci;
          const t = c.getAttribute('t');
          const v = tags(c, 'v')[0];
          let val = '';
          if (t === 's') val = shared[+(v && v.textContent)] ?? '';
          else if (t === 'inlineStr') val = tags(c, 't').map(x => x.textContent).join('');
          else if (v) val = t === 'str' || t === 'b' ? v.textContent : (isNaN(+v.textContent) ? v.textContent : +v.textContent);
          r[col] = val;
        });
        rows.push(Array.from(r, x => (x == null ? '' : x)));
      });
      out.push({ name: sh.getAttribute('name'), rows });
    }
    return out;
  }

  /* ================= CSV ================= */
  const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = (header, rows) => '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c !== ''));
  }

  /* ================= data → tables ================= */
  const pad = QD.pad;
  const isoTime = ts => { const d = new Date(ts); return `${QD.dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const moodText = e => { if (!e) return ''; const m = QD.MOODS.find(x => x[0] === e); return m ? `${m[0]} ${m[1]}` : e; };
  const weatherText = e => { if (!e) return ''; const m = QD.WEATHER.find(x => x[0] === e); return m ? `${m[0]} ${m[1]}` : e; };
  const htmlText = html => { const d = document.createElement('div'); d.innerHTML = (html || '').replace(/<\/(div|p|li)>/gi, '\n</$1>').replace(/<br\s*\/?>/gi, '\n'); return d.textContent.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim(); };
  const extOf = mime => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' }[(mime || '').split(';')[0]] || (mime || 'bin').split('/').pop().split(';')[0] || 'bin');
  const slug = s => (s || '').trim().replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, '').replace(/\s+/g, '-').slice(0, 32);

  function mediaPath(rec, page, item) {
    const folder = rec.kind === 'photo' ? 'photos' : rec.kind === 'voice' ? 'voice-notes' : 'drawings';
    const label = rec.kind === 'drawing' ? (page.inks[1] === rec.id ? 'right-page' : 'left-page') : slug(item && item.caption) || rec.kind;
    return `media/${folder}/${page.date}_${label}_${rec.id.slice(-6)}.${extOf(rec.mime || rec.blob.type)}`;
  }

  function tables(pages) {
    const ids = new Set(pages.map(p => p.id));
    const entries = pages.map(p => {
      const cat = S.cat(p.categoryId);
      const left = htmlText(p.html), right = htmlText(p.html2);
      return [p.id, p.date, QD.WEEKDAYS[QD.parseKey(p.date).getDay()], p.title, cat ? cat.name : '', moodText(p.mood), weatherText(p.weather), left, right,
        QD.countWords(p.text || ''), p.items.filter(i => i.type === 'photo').length, p.items.filter(i => i.type === 'voice').length,
        (p.inks || []).some(Boolean) ? 'Yes' : 'No', (p.papers || [])[0] || '', (p.papers || [])[1] || '', isoTime(p.createdAt), isoTime(p.updatedAt)];
    });
    const media = kind => {
      const rows = [];
      for (const p of pages) for (const it of p.items.filter(i => i.type === kind)) {
        const rec = S.media.get(it.mediaId);
        if (!rec || !ids.has(rec.pageId)) continue;
        const base = [rec.id, p.id, p.date, p.title, it.side ? 'Right' : 'Left', it.caption || ''];
        rows.push(kind === 'photo'
          ? [...base, mediaPath(rec, p, it), rec.w || '', rec.h || '', isoTime(rec.createdAt)]
          : [...base, Math.round(rec.duration || 0), QD.fmtDuration(rec.duration), mediaPath(rec, p, it), isoTime(rec.createdAt)]);
      }
      return rows;
    };
    return {
      entries, photos: media('photo'), voice: media('voice'),
      cats: S.categories.map(c => [c.id, c.name, c.color, pages.filter(p => p.categoryId === c.id).length]),
    };
  }
  const ENTRY_COLS = [
    { title: 'Page ID', width: 20 }, { title: 'Date', width: 12 }, { title: 'Weekday', width: 11 }, { title: 'Title', width: 30 },
    { title: 'Category', width: 14 }, { title: 'Mood', width: 13 }, { title: 'Weather', width: 16 },
    { title: 'Left page text', width: 60, wrap: true }, { title: 'Right page text', width: 60, wrap: true },
    { title: 'Words', width: 8 }, { title: 'Photos', width: 8 }, { title: 'Voice notes', width: 11 }, { title: 'Has drawing', width: 11 },
    { title: 'Left paper', width: 11 }, { title: 'Right paper', width: 11 }, { title: 'Created', width: 17 }, { title: 'Updated', width: 17 },
  ];

  function sheetsFor(pages) {
    const t = tables(pages);
    return [
      { name: 'Entries', columns: ENTRY_COLS, rows: t.entries },
      { name: 'Photos', columns: [{ title: 'Media ID', width: 20 }, { title: 'Page ID', width: 20 }, { title: 'Page date', width: 12 }, { title: 'Page title', width: 28 }, { title: 'Page side', width: 10 }, { title: 'Caption', width: 30, wrap: true }, { title: 'File in .zip export', width: 46 }, { title: 'Width', width: 8 }, { title: 'Height', width: 8 }, { title: 'Added', width: 17 }], rows: t.photos },
      { name: 'Voice notes', columns: [{ title: 'Media ID', width: 20 }, { title: 'Page ID', width: 20 }, { title: 'Page date', width: 12 }, { title: 'Page title', width: 28 }, { title: 'Page side', width: 10 }, { title: 'Caption', width: 30, wrap: true }, { title: 'Seconds', width: 9 }, { title: 'Length', width: 9 }, { title: 'File in .zip export', width: 46 }, { title: 'Recorded', width: 17 }], rows: t.voice },
      { name: 'Categories', columns: [{ title: 'Category ID', width: 18 }, { title: 'Name', width: 20 }, { title: 'Color', width: 10 }, { title: 'Pages', width: 8 }], rows: t.cats },
      { name: 'How to import', columns: [{ title: 'Tips for editing this file and importing it back into QDiary', width: 110, wrap: true }], rows: [
        ['Edit the Entries sheet, save as .xlsx (or .csv), then use Settings → Data → Import.'],
        ['Rows with a Page ID update that day: title, category, mood, weather and both page texts. Text formatting (bold, colors) is replaced by plain text only when you changed the text.'],
        ['Rows without a Page ID create a new day. Dates must look like 2026-10-09 (Excel date cells work too). If the day already exists, the text is added to its right page.'],
        ['Mood and weather accept an emoji or a name, e.g. “Happy” or “Rainy”. Unknown categories are created automatically.'],
        ['Photos, voice notes and drawings are not imported from the spreadsheet — use the .zip export for a complete backup.'],
      ] },
    ];
  }

  function markdown(p) {
    const cat = S.cat(p.categoryId);
    const lines = [`# ${p.title || 'Untitled'}`, '', `**${QD.fmtDate(p.date, 'long')}**`];
    const meta = [moodText(p.mood) && `Mood: ${moodText(p.mood)}`, weatherText(p.weather) && `Weather: ${weatherText(p.weather)}`, cat && `Category: ${cat.name}`].filter(Boolean);
    if (meta.length) lines.push('', meta.join(' · '));
    for (const [i, html] of [[0, p.html], [1, p.html2]]) {
      const txt = htmlText(html);
      const items = p.items.filter(it => (it.side || 0) === i && (it.type === 'photo' || it.type === 'voice' || it.type === 'note'));
      if (!txt && !items.length) continue;
      lines.push('', `## ${i ? 'Right page' : 'Left page'}`, '');
      if (txt) lines.push(txt, '');
      for (const it of items) {
        if (it.type === 'note') { lines.push(`> 🗒️ ${(it.text || '').replace(/\n/g, '\n> ')}`, ''); continue; }
        const rec = S.media.get(it.mediaId);
        if (!rec) continue;
        const path = '../' + mediaPath(rec, p, it);
        lines.push(it.type === 'photo' ? `![${it.caption || 'Photo'}](${encodeURI(path)})` : `🎙️ [${it.caption || 'Voice note'} (${QD.fmtDuration(rec.duration)})](${encodeURI(path)})`, '');
      }
    }
    return lines.join('\n') + '\n';
  }

  /* ================= exports ================= */
  const stamp = () => QD.todayKey();
  async function exportXlsx(pages = S.sorted(), name = `QDiary-${stamp()}.xlsx`) {
    QD.download(await xlsx(sheetsFor(pages)), name);
  }
  function exportCsv(pages = S.sorted()) {
    const t = tables(pages);
    QD.download(new Blob([toCsv(ENTRY_COLS.map(c => c.title), t.entries)], { type: 'text/csv;charset=utf-8' }), `QDiary-entries-${stamp()}.csv`);
  }
  async function exportZip() {
    const pages = S.sorted();
    const files = [];
    const mediaMeta = [];
    for (const rec of S.media.values()) {
      const p = S.pages.get(rec.pageId);
      if (!p) continue;
      const it = p.items.find(i => i.mediaId === rec.id);
      const path = mediaPath(rec, p, it);
      const { blob, ...meta } = rec;
      mediaMeta.push({ ...meta, mime: rec.mime || blob.type, file: path });
      files.push({ name: path, data: blob });
    }
    const manifest = { app: 'QDiary', version: 2, exportedAt: new Date().toISOString(), settings: S.settings, categories: S.categories, pages, media: mediaMeta };
    files.unshift(
      { name: 'README.txt', data: 'QDiary export\r\n\r\n- QDiary.xlsx: all entries, photos, voice notes and categories as a spreadsheet\r\n- entries.csv: the Entries sheet as CSV (UTF-8)\r\n- pages/: one Markdown file per day, linking to its media\r\n- media/: original photos, voice recordings and drawings\r\n- qdiary-backup.json: used by QDiary to restore everything — import this whole .zip from Settings → Data → Import\r\n' },
      { name: 'qdiary-backup.json', data: JSON.stringify(manifest) },
      { name: 'QDiary.xlsx', data: await xlsx(sheetsFor(pages)) },
      { name: 'entries.csv', data: toCsv(ENTRY_COLS.map(c => c.title), tables(pages).entries) },
      ...pages.map(p => ({ name: `pages/${p.date}_${slug(p.title) || 'day'}.md`, data: markdown(p) })));
    QD.download(await zip(files), `QDiary-export-${stamp()}.zip`);
  }

  /* ================= imports ================= */
  const textToHtml = t => String(t || '').split(/\r?\n/).map(l => `<div>${QD.esc(l) || '<br>'}</div>`).join('');
  const findEmoji = (list, v) => {
    v = String(v || '').trim();
    if (!v) return null;
    const m = list.find(([e, n]) => v.includes(e) || v.toLowerCase() === n.toLowerCase() || v.toLowerCase().endsWith(n.toLowerCase()));
    return m ? m[0] : v;
  };
  const toDateKey = v => {
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // day/month/year
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    const d = new Date(s);
    return isNaN(d) ? null : QD.dateKey(d);
  };

  /** rows (first row = header) → plan of changes */
  function planEntries(rows) {
    if (!rows.length) throw new Error('The file is empty');
    const hdr = rows[0].map(x => String(x).trim().toLowerCase());
    const col = (...names) => hdr.findIndex(x => names.includes(x));
    const c = {
      id: col('page id', 'id'), date: col('date', 'page date'), title: col('title'), cat: col('category'), mood: col('mood'), weather: col('weather'),
      left: col('left page text', 'text', 'left text', 'body'), right: col('right page text', 'right text'),
    };
    if (c.date < 0 && c.id < 0) throw new Error('Could not find a “Date” or “Page ID” column');
    const plan = [];
    for (const r of rows.slice(1)) {
      const get = i => (i >= 0 && r[i] != null ? r[i] : undefined);
      const id = String(get(c.id) || '').trim();
      const existing = id && S.pages.get(id);
      const date = toDateKey(get(c.date)) || (existing && existing.date);
      if (!date) continue;
      plan.push({ existing, date, title: get(c.title), cat: get(c.cat), mood: get(c.mood), weather: get(c.weather), left: get(c.left), right: get(c.right) });
    }
    return plan;
  }
  async function applyEntries(plan) {
    let created = 0, updated = 0, merged = 0;
    const touched = [];
    const catId = name => {
      name = String(name || '').trim();
      if (!name) return undefined;
      let cat = S.categories.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!cat) { cat = { id: QD.uid('c'), name, color: QD.CAT_COLORS[S.categories.length % QD.CAT_COLORS.length] }; S.categories.push(cat); }
      return cat.id;
    };
    for (const row of plan) {
      let p = row.existing || null, mode = 'update';
      if (!p) {
        p = S.pagesOn(row.date)[0];
        mode = p ? 'merge' : 'create';
        if (!p) { p = S.newDraft(row.date); delete p.draft; S.pages.set(p.id, p); }
      }
      if (row.title !== undefined && (mode !== 'merge' || !p.title)) p.title = String(row.title);
      if (row.cat !== undefined) { const id = catId(row.cat); if (id || mode !== 'merge') p.categoryId = id || null; }
      if (row.mood !== undefined && (mode !== 'merge' || !p.mood)) p.mood = findEmoji(QD.MOODS, row.mood);
      if (row.weather !== undefined && (mode !== 'merge' || !p.weather)) p.weather = findEmoji(QD.WEATHER, row.weather);
      if (mode === 'merge') {
        const add = [row.left, row.right].filter(x => x !== undefined && String(x).trim()).join('\n');
        if (add) p.html2 = (p.html2 || '') + textToHtml(add);
      } else {
        if (row.left !== undefined && String(row.left) !== htmlText(p.html)) p.html = textToHtml(row.left);
        if (row.right !== undefined && String(row.right) !== htmlText(p.html2)) p.html2 = textToHtml(row.right);
      }
      p.text = [htmlText(p.html), htmlText(p.html2)].filter(Boolean).join('\n');
      p.updatedAt = Date.now();
      touched.push(p);
      if (mode === 'create') created++; else if (mode === 'merge') merged++; else updated++;
    }
    await QD.db.putMany('pages', touched.map(p => JSON.parse(JSON.stringify(p))));
    S.saveCategories();
    S.emit('pages');
    return { created, updated, merged };
  }

  async function restoreZip(files) {
    const man = files.get('qdiary-backup.json');
    if (!man) {
      const x = Array.from(files.keys()).find(n => /\.xlsx$/i.test(n));
      if (x) return { entries: await readXlsx(await files.get(x).blob()) };
      throw new Error('This zip has no QDiary backup inside');
    }
    const data = JSON.parse(await man.text());
    if (data.app !== 'QDiary' || !Array.isArray(data.pages)) throw new Error('Not a QDiary backup');
    const media = [];
    for (const m of data.media || []) {
      const f = files.get(m.file);
      if (!f) continue;
      const { file, ...rest } = m;
      media.push({ ...rest, blob: await f.blob(m.mime) });
    }
    return { restore: { pages: data.pages, media, categories: data.categories || [] } };
  }
  async function applyRestore({ pages, media, categories }) {
    await QD.db.putMany('pages', pages);
    if (media.length) await QD.db.putMany('media', media);
    const cats = [...S.categories];
    for (const c of categories) if (!cats.some(x => x.id === c.id)) cats.push(c);
    await QD.db.put('meta', { key: 'categories', value: cats });
    return { pages: pages.length, media: media.length };
  }

  /** Reads any supported file and asks before changing anything. Resolves to a summary string or null. */
  async function importFile(file) {
    const name = (file.name || '').toLowerCase();
    let restore = null, rows = null;
    if (name.endsWith('.json')) {
      const data = JSON.parse(await file.text());
      if (!(await QD.confirm({ title: 'Import this backup?', text: `${plural((data.pages || []).length, 'day')} will be merged into your diary. Days with the same ID are replaced.`, ok: 'Import', icon: 'upload' }))) return null;
      const r = await S.importAll(data);
      return `Imported ${plural(r.pages, 'day')} and ${plural(r.media, 'media file')}`;
    }
    if (name.endsWith('.zip')) {
      const res = await restoreZip(await unzip(file));
      if (res.restore) restore = res.restore; else rows = pickEntries(res.entries);
    } else if (name.endsWith('.xlsx')) rows = pickEntries(await readXlsx(file));
    else if (name.endsWith('.csv') || name.endsWith('.txt')) rows = parseCsv(await file.text());
    else throw new Error('Choose a .zip, .xlsx, .csv or .json file');

    if (restore) {
      const ok = await QD.confirm({ title: 'Restore this export?', text: `${plural(restore.pages.length, 'day')} and ${plural(restore.media.length, 'media file')} (photos, voice notes, drawings) will be merged into your diary. Days with the same ID are replaced.`, ok: 'Restore', icon: 'upload' });
      if (!ok) return null;
      const r = await applyRestore(restore);
      return `Restored ${plural(r.pages, 'day')} and ${plural(r.media, 'media file')}`;
    }
    const plan = planEntries(rows);
    if (!plan.length) throw new Error('No rows with a valid date were found');
    const nUpd = plan.filter(p => p.existing).length, nNew = plan.filter(p => !p.existing && !S.pagesOn(p.date).length).length;
    const nMerge = plan.length - nUpd - nNew;
    const ok = await QD.confirm({ title: 'Import entries?', text: `${plural(plan.length, 'row')} found: ${plural(nNew, 'new day')}, ${plural(nUpd, 'update')}${nMerge ? `, ${nMerge} added to ${plural(nMerge, 'day')} that already exist` : ''}.`, ok: 'Import', icon: 'upload' });
    if (!ok) return null;
    const r = await applyEntries(plan);
    return `Imported: ${r.created} new, ${r.updated} updated${r.merged ? `, ${r.merged} merged` : ''}`;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const pickEntries = sheets => (sheets.find(s => /entries/i.test(s.name)) || sheets[0] || { rows: [] }).rows;

  QD.transfer = { zip, unzip, xlsx, readXlsx, parseCsv, exportXlsx, exportCsv, exportZip, importFile };
})(window.QD);
