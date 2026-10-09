'use strict';
/* Photos, voice recording & playback. */
(function (QD) {
  const { h } = QD;
  const S = QD.store;

  /* ---------- images ---------- */
  QD.processImage = async file => {
    const MAX = 1600;
    let src;
    try {
      src = await createImageBitmap(file);
    } catch (e) {
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Unsupported image'));
        img.src = URL.createObjectURL(file);
      });
    }
    const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
    if (!w0 || !h0) throw new Error('Unsupported image');
    const keep = file.type === 'image/gif' || (w0 <= MAX && h0 <= MAX && file.size < 1.5e6 && /^image\/(png|jpeg|webp)$/.test(file.type));
    if (keep) return { blob: file, w: w0, h: h0 };
    const k = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.round(w0 * k), hh = Math.round(h0 * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    c.getContext('2d').drawImage(src, 0, 0, w, hh);
    let blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.88));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    return { blob, w, h: hh };
  };

  /* ---------- audio analysis ---------- */
  QD.analyzeAudio = async (blob, n = 32) => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ac = new OAC(1, 1, 44100);
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / n));
    const raw = [];
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 8) { sum += data[j] * data[j]; cnt++; }
      raw.push(Math.sqrt(sum / Math.max(1, cnt)));
    }
    const max = Math.max(0.02, ...raw);
    return { duration: buf.duration, peaks: raw.map(v => +(Math.min(1, v / max)).toFixed(3)) };
  };
  const downsample = (arr, n) => {
    if (!arr.length) return Array(n).fill(0.3);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * arr.length / n), b = Math.max(a + 1, Math.floor((i + 1) * arr.length / n));
      out.push(Math.max(...arr.slice(a, b)));
    }
    const max = Math.max(0.05, ...out);
    return out.map(v => +(v / max).toFixed(3));
  };

  /* ---------- player (Web Audio: precise seeking for any recorded format) ---------- */
  const P = QD.player = {
    id: null, ctx: null, src: null, startAt: 0, offset: 0, playing: false,
    cache: new Map(), temp: new Map(), raf: 0,
    rec(id) { return P.temp.get(id) || S.media.get(id) || null; },
    dur(id) { const b = P.cache.get(id); if (b) return b.duration; const r = P.rec(id); return (r && r.duration) || 0; },
    async buffer(id) {
      if (P.cache.has(id)) return P.cache.get(id);
      const r = P.rec(id);
      if (!r) throw new Error('missing');
      const buf = await P.ctx.decodeAudioData(await r.blob.arrayBuffer());
      P.cache.set(id, buf);
      if (P.cache.size > 8) P.cache.delete(P.cache.keys().next().value);
      return buf;
    },
    time() { return P.playing ? P.ctx.currentTime - P.startAt : P.offset; },
    stopSrc() {
      if (!P.src) return;
      const s = P.src; P.src = null; s.onended = null;
      try { s.stop(); } catch (e) { /* already stopped */ }
    },
    async play(id, from) {
      try {
        P.ctx = P.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (P.ctx.state === 'suspended') await P.ctx.resume();
        if (P.id !== id) { P.stopSrc(); P.playing = false; P.id = id; P.offset = 0; P.syncAll(); }
        const buf = await P.buffer(id);
        if (P.id !== id) return;
        P.stopSrc();
        let off = from != null ? from : P.offset;
        if (off >= buf.duration - 0.05) off = 0;
        const src = P.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(P.ctx.destination);
        src.start(0, off);
        src.onended = () => { if (P.src === src) { P.src = null; P.playing = false; P.offset = 0; P.syncAll(); } };
        P.src = src; P.startAt = P.ctx.currentTime - off; P.playing = true;
        P.syncAll();
        P.loop();
      } catch (e) {
        console.error(e);
        P.playing = false; P.syncAll();
        QD.toast("Couldn't play this recording", { icon: 'close' });
      }
    },
    pause() { if (!P.playing) return; P.offset = P.time(); P.stopSrc(); P.playing = false; P.syncAll(); },
    toggle(id) { if (P.id === id && P.playing) P.pause(); else P.play(id); },
    seek(id, frac) {
      const d = P.dur(id);
      const t = QD.clamp(frac, 0, 1) * d;
      if (P.id === id && !P.playing) { P.offset = t; P.syncAll(); }
      P.play(id, t);
    },
    stop() { P.stopSrc(); P.playing = false; P.id = null; P.offset = 0; P.syncAll(); },
    loop() {
      cancelAnimationFrame(P.raf);
      const step = () => {
        if (!P.playing) return;
        document.querySelectorAll(`[data-voice-id="${P.id}"]`).forEach(P.sync);
        P.raf = requestAnimationFrame(step);
      };
      P.raf = requestAnimationFrame(step);
    },
    sync(el) {
      const id = el.dataset.voiceId, on = id === P.id, playing = on && P.playing;
      const d = P.dur(id), t = on ? P.time() : 0;
      el.classList.toggle('playing', playing);
      el.style.setProperty('--prog', d ? QD.clamp(t / d, 0, 1).toFixed(4) : 0);
      const tm = el.querySelector('.vtime');
      if (tm) tm.textContent = on && t > 0.05 ? `${QD.fmtDuration(t)} / ${QD.fmtDuration(d)}` : QD.fmtDuration(d);
      const btn = el.querySelector('.vplay');
      if (btn && btn.dataset.state !== String(playing)) {
        btn.dataset.state = String(playing);
        btn.innerHTML = QD.ic(playing ? 'pause' : 'play');
        btn.setAttribute('aria-label', playing ? 'Pause voice note' : 'Play voice note');
      }
    },
    syncAll() { document.querySelectorAll('[data-voice-id]').forEach(P.sync); },
  };

  /* voice "photo" face used on polaroids everywhere */
  QD.voiceFace = (mediaId, color) => {
    const rec = P.rec(mediaId) || {};
    const peaks = rec.peaks && rec.peaks.length ? rec.peaks : Array(32).fill(0.3);
    const bars = cls => h('div', { class: 'vbars ' + cls }, peaks.map(v => h('i', { style: { height: Math.round(10 + v * 90) + '%' } })));
    const wave = h('div', { class: 'vwave', title: 'Click to jump' }, bars(''), bars('fill'));
    const btn = h('button', { class: 'vplay', 'aria-label': 'Play voice note', html: QD.ic('play') });
    const el = h('div', { class: 'voice-face', 'data-voice-id': mediaId, style: { '--vc': color || QD.VOICE_COLORS[0], '--prog': 0 } },
      h('div', { class: 'v-top' }, h('span', { class: 'v-label', html: QD.ic('mic') + '<span>VOICE</span>' }), h('span', { class: 'vtime', text: QD.fmtDuration(rec.duration) })),
      btn, wave);
    for (const n of [btn, wave]) n.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); P.toggle(mediaId); });
    wave.addEventListener('click', e => {
      e.stopPropagation();
      const r = wave.getBoundingClientRect();
      P.seek(mediaId, (e.clientX - r.left) / r.width);
    });
    P.sync(el);
    return el;
  };

  /* ---------- recorder modal ---------- */
  QD.recordVoice = () => new Promise(resolve => {
    let stream = null, mr = null, chunks = [], t0 = 0, raf = 0, ac = null, analyser = null;
    let levels = [], duration = 0, result = null, state = 'idle', tmpId = null, finished = false;

    const bars = Array.from({ length: 24 }, () => h('i'));
    const meter = h('div', { class: 'rec-meter' }, bars);
    const timeEl = h('div', { class: 'rec-time', text: '0:00' });
    const hint = h('p', { class: 'rec-hint', text: 'Press the big button to start recording.' });
    const mainBtn = h('button', { class: 'rec-btn', 'aria-label': 'Start recording', html: '<span class="rec-dot"></span>' });
    const stage = h('div', { class: 'rec-stage' }, meter, timeEl, mainBtn, hint);
    const previewBox = h('div', { class: 'rec-preview' });
    const caption = h('input', { class: 'input', type: 'text', placeholder: 'Give it a name (optional)', dir: 'auto', maxlength: '80' });
    const fileIn = h('input', { type: 'file', accept: 'audio/*', hidden: true });
    const importBtn = h('button', { class: 'linkbtn', html: QD.ic('upload') + '<span>Import an audio file instead</span>', onclick: () => fileIn.click() });
    const body = h('div', { class: 'rec' }, stage, previewBox,
      h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Caption' }), caption), importBtn, fileIn);

    const m = QD.modal({
      title: 'Record a voice note', icon: 'mic', body, cls: 'modal-rec',
      actions: [
        { label: 'Cancel' },
        { id: 'redo', label: 'Record again', icon: 'undo', cls: 'hidden', onClick: () => reset() },
        { id: 'ok', label: 'Stick on page', primary: true, icon: 'check', disabled: true, onClick: mm => { finished = true; mm.close(); } },
      ],
      onClose: () => {
        cleanup();
        resolve(finished && result ? { ...result, caption: caption.value.trim() } : null);
      },
    });
    setTimeout(() => mainBtn.focus(), 80);

    mainBtn.onclick = () => { if (state === 'idle') start(); else if (state === 'recording') stop(); };

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        setHint('Recording is not supported in this browser. You can import an audio file instead.', true);
        return;
      }
      state = 'starting';
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        state = 'idle';
        setHint(e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser’s site settings, then try again.'
          : e.name === 'NotFoundError' ? 'No microphone was found on this device.' : 'Could not start the microphone.', true);
        return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = []; levels = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => finishWith(new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' }), duration, levels);
      mr.start(250);
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaStreamSource(stream).connect(analyser);
      } catch (e) { analyser = null; }
      t0 = performance.now();
      state = 'recording';
      body.classList.add('is-rec');
      mainBtn.setAttribute('aria-label', 'Stop recording');
      setHint('Recording… press the button again to stop.');
      QD.sfx('rec');
      loop();
    }

    function loop() {
      let lvl = 0;
      if (analyser) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
        lvl = Math.min(1, Math.sqrt(sum / data.length) * 5);
      }
      levels.push(lvl);
      const recent = levels.slice(-bars.length);
      bars.forEach((b, i) => { const v = recent[recent.length - bars.length + i] || 0; b.style.height = Math.round(8 + v * 92) + '%'; });
      const sec = (performance.now() - t0) / 1000;
      timeEl.textContent = QD.fmtDuration(sec);
      if (sec >= 600) { stop(); return; }
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      if (state !== 'recording') return;
      state = 'processing';
      cancelAnimationFrame(raf);
      duration = (performance.now() - t0) / 1000;
      body.classList.remove('is-rec');
      stream.getTracks().forEach(t => t.stop());
      if (ac) ac.close();
      mr.stop();
      QD.sfx('stop');
      setHint('Processing…');
    }

    async function finishWith(blob, dur, lv) {
      let info = null;
      try { info = await QD.analyzeAudio(blob); } catch (e) { /* undecodable: fall back */ }
      if (!info && !dur) {
        state = 'idle';
        setHint("Couldn't read that audio file. Try an MP3, M4A, WAV or WebM file.", true);
        return;
      }
      result = { blob, mime: blob.type || 'audio/webm', duration: (info && info.duration) || dur, peaks: info ? info.peaks : downsample(lv, 32) };
      state = 'done';
      tmpId = 'tmp-' + QD.uid();
      P.temp.set(tmpId, result);
      previewBox.innerHTML = '';
      previewBox.append(h('div', { class: 'polaroid rec-pol' }, QD.voiceFace(tmpId, QD.pick(QD.VOICE_COLORS))));
      body.classList.add('is-done');
      m.btns.ok.disabled = false;
      m.btns.redo.classList.remove('hidden');
      importBtn.classList.add('hidden');
      caption.focus();
    }

    function reset() {
      if (tmpId) { if (P.id === tmpId) P.stop(); P.temp.delete(tmpId); tmpId = null; }
      result = null; state = 'idle';
      previewBox.innerHTML = '';
      body.classList.remove('is-done');
      timeEl.textContent = '0:00';
      bars.forEach(b => { b.style.height = ''; });
      m.btns.ok.disabled = true;
      m.btns.redo.classList.add('hidden');
      importBtn.classList.remove('hidden');
      setHint('Press the big button to start recording.');
    }

    function setHint(t, err) { hint.textContent = t; hint.classList.toggle('err', !!err); }

    fileIn.onchange = () => {
      const f = fileIn.files[0];
      fileIn.value = '';
      if (!f || state === 'recording') return;
      reset();
      setHint('Reading file…');
      finishWith(f, 0, []);
    };

    function cleanup() {
      cancelAnimationFrame(raf);
      if (mr && mr.state !== 'inactive') { mr.onstop = null; try { mr.stop(); } catch (e) { /* ignore */ } }
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ac && ac.state !== 'closed') ac.close();
      if (tmpId) { if (P.id === tmpId) P.stop(); P.temp.delete(tmpId); }
    }
  });

  /* ---------- photo lightbox ---------- */
  QD.lightbox = ({ mediaId, caption, meta, onOpen }) => {
    const rec = S.media.get(mediaId);
    if (!rec) return;
    const body = h('div', { class: 'lightbox' },
      h('img', { src: S.url(mediaId), alt: caption || 'Photo' }),
      caption ? h('p', { class: 'lb-cap', dir: 'auto', text: caption }) : null,
      meta ? h('p', { class: 'lb-meta', text: meta }) : null);
    const ext = (rec.blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    QD.modal({
      title: caption || 'Photo', icon: 'photo', body, cls: 'modal-lb',
      actions: [
        { label: 'Download', icon: 'download', onClick: () => QD.download(rec.blob, `qdiary-photo-${rec.id}.${ext}`) },
        onOpen ? { label: 'Open page', icon: 'book', primary: true, onClick: mm => { mm.close(); onOpen(); } } : null,
      ].filter(Boolean),
    });
  };
})(window.QD);
