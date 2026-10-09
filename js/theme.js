'use strict';
/* Themes, fonts, papers & other catalogues + applying settings to the document. */
(function (QD) {
  QD.THEMES = {
    strawberry: { name: 'Strawberry Milk', c: { bg: '#ffeef3', bg2: '#ffe2eb', surface: '#fffafb', surface2: '#ffe9f0', ink: '#4b2a3a', ink2: '#94667b', line: '#4b2a3a', shadow: '#e8b4c5', accent: '#ff6f9c', accentInk: '#ffffff', cover: '#ff8fb1' } },
    matcha: { name: 'Matcha Latte', c: { bg: '#eef4e4', bg2: '#e3ecd5', surface: '#fbfdf6', surface2: '#e7f0da', ink: '#2f3a27', ink2: '#6c7a5e', line: '#2f3a27', shadow: '#bccfa6', accent: '#6fae4f', accentInk: '#ffffff', cover: '#8cc06c' } },
    soda: { name: 'Blueberry Soda', c: { bg: '#e9f1ff', bg2: '#dce8ff', surface: '#fafcff', surface2: '#e4edff', ink: '#22305a', ink2: '#6574a3', line: '#22305a', shadow: '#b2c4ee', accent: '#5b8cff', accentInk: '#ffffff', cover: '#7aa2ff' } },
    lavender: { name: 'Lavender Dream', c: { bg: '#f2edff', bg2: '#e8e0ff', surface: '#fcfaff', surface2: '#ede6ff', ink: '#3a2d5c', ink2: '#7d6fa6', line: '#3a2d5c', shadow: '#c9bbf0', accent: '#9b7bff', accentInk: '#ffffff', cover: '#b49bff' } },
    lemon: { name: 'Lemon Cake', c: { bg: '#fff8dc', bg2: '#fff0bd', surface: '#fffdf3', surface2: '#fff4cc', ink: '#4a3b12', ink2: '#8f7a3d', line: '#4a3b12', shadow: '#ecd68e', accent: '#ffc83d', accentInk: '#4a3b12', cover: '#ffd45e' } },
    peach: { name: 'Peach Soda', c: { bg: '#fff0e6', bg2: '#ffe3d1', surface: '#fffaf6', surface2: '#ffeadd', ink: '#4d2e22', ink2: '#9a6b58', line: '#4d2e22', shadow: '#f0c0a4', accent: '#ff8a5b', accentInk: '#ffffff', cover: '#ffa37f' } },
    midnight: { name: 'Midnight Pixel', dark: true, c: { bg: '#191830', bg2: '#1f1d3b', surface: '#26244a', surface2: '#312e5c', ink: '#f1ecff', ink2: '#a9a2d6', line: '#0b0a19', shadow: '#0b0a19', accent: '#ff8fc8', accentInk: '#2a1430', cover: '#6a5acd' } },
    cocoa: { name: 'Hot Cocoa', dark: true, c: { bg: '#241a17', bg2: '#2b201c', surface: '#34271f', surface2: '#413128', ink: '#fbeee3', ink2: '#c4a896', line: '#120c0a', shadow: '#120c0a', accent: '#ffb37c', accentInk: '#2a1709', cover: '#a0674a' } },
  };

  const FALLBACK = "'Noto Sans Thai', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans Arabic', 'Noto Sans', sans-serif";
  QD.fontStack = f => `${f}, ${FALLBACK}`;
  QD.FONTS = [
    { id: 'mali', name: 'Mali', family: "'Mali'", tag: 'Cute & rounded · Thai + Latin' },
    { id: 'itim', name: 'Itim', family: "'Itim'", tag: 'Friendly · Thai + Latin' },
    { id: 'sriracha', name: 'Sriracha', family: "'Sriracha'", tag: 'Handwriting · Thai + Latin' },
    { id: 'patrick', name: 'Patrick Hand', family: "'Patrick Hand'", tag: 'Handwriting · Latin' },
    { id: 'caveat', name: 'Caveat', family: "'Caveat'", tag: 'Script · Latin', scale: 1.22 },
    { id: 'gaegu', name: 'Gaegu', family: "'Gaegu'", tag: 'Doodle · Korean + Latin', scale: 1.15 },
    { id: 'klee', name: 'Klee One', family: "'Klee One'", tag: 'Pencil · Japanese + Latin' },
    { id: 'dotgothic', name: 'DotGothic16', family: "'DotGothic16'", tag: 'Pixel · Japanese + Latin' },
    { id: 'pixelify', name: 'Pixelify Sans', family: "'Pixelify Sans'", tag: 'Pixel · Latin' },
    { id: 'noto', name: 'Noto Sans', family: "'Noto Sans'", tag: 'Clean · most scripts' },
    { id: 'serif', name: 'Noto Serif', family: "'Noto Serif'", tag: 'Classic serif' },
    { id: 'system', name: 'System', family: 'system-ui', tag: "Your device's font" },
  ];
  QD.UI_FONTS = {
    pixel: { name: 'Pixel + rounded', display: "'Pixelify Sans', 'Nunito', sans-serif", text: "'Nunito', system-ui, sans-serif" },
    allpixel: { name: 'All pixel', display: "'Pixelify Sans', sans-serif", text: "'Pixelify Sans', 'Nunito', sans-serif" },
    rounded: { name: 'Rounded', display: "'Nunito', sans-serif", text: "'Nunito', system-ui, sans-serif" },
    cute: { name: 'Cute (Mali)', display: "'Mali', sans-serif", text: "'Mali', 'Nunito', sans-serif" },
    system: { name: 'System', display: 'system-ui, sans-serif', text: 'system-ui, sans-serif' },
  };
  QD.LANGS = [
    ['', 'Auto (follow my keyboard)'], ['en', 'English'], ['th', 'Thai'], ['ja', 'Japanese'], ['ko', 'Korean'],
    ['zh-Hans', 'Chinese (Simplified)'], ['zh-Hant', 'Chinese (Traditional)'], ['vi', 'Vietnamese'], ['id', 'Indonesian'],
    ['hi', 'Hindi'], ['ar', 'Arabic'], ['he', 'Hebrew'], ['ru', 'Russian'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'],
  ];

  QD.PAPERS = [
    { id: 'lined', name: 'Classic lined' },
    { id: 'grid', name: 'Grid' },
    { id: 'dots', name: 'Dot grid' },
    { id: 'blank', name: 'Blank' },
    { id: 'pixel', name: 'Pixel grid' },
    { id: 'gingham', name: 'Picnic gingham' },
    { id: 'sakura', name: 'Sakura lined' },
    { id: 'mint', name: 'Mint graph' },
    { id: 'legal', name: 'Legal pad' },
    { id: 'kraft', name: 'Kraft paper' },
    { id: 'night', name: 'Starry night', dark: true },
    { id: 'chalk', name: 'Chalkboard', dark: true },
  ];
  QD.TAPES = [
    { id: 'stripe', name: 'Candy stripe' }, { id: 'dots', name: 'Mint dots' }, { id: 'check', name: 'Lemon check' },
    { id: 'plain', name: 'Lavender' }, { id: 'grid', name: 'Sky grid' }, { id: 'hearts', name: 'Peach hearts' },
  ];
  QD.NOTE_COLORS = ['#fff3a3', '#ffd1dc', '#c9f2d9', '#cfe3ff', '#e5d6ff', '#ffdcbc'];
  QD.VOICE_COLORS = ['#ffb3c7', '#a8e6cf', '#ffd59e', '#b5d0ff', '#d7c4ff', '#ffc9a8'];
  QD.CAT_COLORS = ['#ff6f9c', '#ff8a5b', '#ffc83d', '#6fcf6f', '#3ec5b0', '#5b8cff', '#9b7bff', '#c06cff', '#a0674a', '#7d8597'];
  QD.MOODS = [['😄', 'Happy'], ['🥰', 'Loved'], ['😌', 'Calm'], ['🤩', 'Excited'], ['😐', 'Meh'], ['😴', 'Tired'], ['😢', 'Sad'], ['😠', 'Angry'], ['😰', 'Anxious'], ['🤒', 'Sick']];
  QD.WEATHER = [['☀️', 'Sunny'], ['⛅', 'Partly cloudy'], ['☁️', 'Cloudy'], ['🌧️', 'Rainy'], ['⛈️', 'Stormy'], ['❄️', 'Snowy'], ['🌬️', 'Windy'], ['🌫️', 'Foggy'], ['🌈', 'Rainbow'], ['🌙', 'Clear night']];

  const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  let mq = null;

  QD.currentTheme = () => {
    const s = QD.store.settings;
    let id = QD.THEMES[s.theme] ? s.theme : 'strawberry';
    if (s.autoNight && mq && mq.matches && !QD.THEMES[id].dark) id = QD.THEMES[s.nightTheme] ? s.nightTheme : 'midnight';
    return { id, ...QD.THEMES[id] };
  };

  QD.applySettings = () => {
    const s = QD.store.settings, root = document.documentElement;
    if (!mq && window.matchMedia) {
      mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => QD.applySettings());
    }
    const t = QD.currentTheme();
    const c = { ...t.c };
    if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent)) {
      c.accent = s.accent;
      c.cover = s.accent;
      c.accentInk = QD.isLight(s.accent) ? (t.dark ? '#1a1325' : c.ink) : '#ffffff';
    }
    const f = QD.FONTS.find(x => x.id === s.font) || QD.FONTS[0];
    const u = QD.UI_FONTS[s.uiFont] || QD.UI_FONTS.pixel;
    const vars = {};
    for (const k in c) vars['--' + kebab(k)] = c[k];
    vars['--font-write'] = QD.fontStack(f.family);
    vars['--write-size'] = Math.round(s.fontSize * (f.scale || 1)) + 'px';
    vars['--font-display'] = u.display;
    vars['--font-ui'] = u.text;
    for (const k in vars) root.style.setProperty(k, vars[k]);
    const attrs = { ui: s.ui, desk: s.desk, dark: t.dark ? '1' : '0' };
    Object.assign(root.dataset, attrs);
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = c.bg;
    try { localStorage.setItem('qd.boot', JSON.stringify({ vars, attrs })); } catch (e) { /* ignore */ }
  };
})(window.QD);
