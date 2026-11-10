const { ipcRenderer, webFrame } = require('electron');

// ================================================================ HELPERS
const ICON = { min: '', toSmall: '', toFull: '', close: '' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function loadJSON(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? Object.assign({}, def, JSON.parse(v)) : Object.assign({}, def);
  } catch { return Object.assign({}, def); }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr(hex) { return hexToRgb(hex).join(','); }
function mix(hex, toHex, amt) {
  const a = hexToRgb(hex), b = hexToRgb(toHex);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const lighten = (hex, amt) => mix(hex, '#ffffff', amt);

// ================================================================ SETTINGS
const S = {
  viz: loadJSON('ccx_viz', { mode: 'off', color: 'orange', custom: '#22c55e', sens: 1, bassGlow: false, glowPower: 1 }),
  mini: loadJSON('ccx_mini', { style: 'classic', soundBg: false }),
  boost: loadJSON('ccx_boost', { on: false, gain: 1.5, bass: 4 }),
  theme: loadJSON('ccx_theme', { bg: null, text: null, accent: null, slider: null }),
  bar: loadJSON('ccx_bar', { style: 'glass', thick: true }),
  bg: loadJSON('ccx_bg', { mode: 'off', scene: 'darkwave', blur: 28, dim: 0.55, glass: true }),
  fx: loadJSON('ccx_fx', { repost: true, like: true }),
  nu: loadJSON('ccx_nu', { panel: false, collapsed: false }),
  rpc: loadJSON('ccx_rpc', { on: false, id: '', paused: false }),
  menu: loadJSON('ccx_menu', { bg: null, dim: 0.55 }),
  keys: loadJSON('ccx_keys', { on: true }),
  game: loadJSON('ccx_game', { diff: 'normal', keys: 'all', sound: true, best: {}, auto: false, offset: 0, mode: 'record' }),
  online: loadJSON('ccx_online', { show: true }),
};
const saveAll = () => {
  saveJSON('ccx_viz', S.viz);
  saveJSON('ccx_mini', S.mini);
  saveJSON('ccx_boost', S.boost);
  saveJSON('ccx_theme', S.theme);
  saveJSON('ccx_bar', S.bar);
  saveJSON('ccx_bg', S.bg);
  saveJSON('ccx_fx', S.fx);
  saveJSON('ccx_nu', S.nu);
  saveJSON('ccx_rpc', S.rpc);
  saveJSON('ccx_menu', S.menu);
  saveJSON('ccx_keys', S.keys);
  saveJSON('ccx_game', S.game);
  saveJSON('ccx_online', S.online);
};
const SCX_DISCORD_ID = '1564806679042728027';
const rpcId = () => S.rpc.id || SCX_DISCORD_ID;

const THEME_DEF = { bg: '#121212', text: '#ffffff', accent: '#ff5500', slider: '#ff5500' };
const accentColor = () => S.theme.accent || THEME_DEF.accent;
const sliderColor = () => S.theme.slider || S.theme.accent || THEME_DEF.slider;

let iconUrl = '';
ipcRenderer.on('assets', (_e, a) => {
  iconUrl = a.icon;
  document.querySelectorAll('.cc-ico').forEach((i) => { i.src = iconUrl; });
});

// ================================================================ TOP BAR
let mode = 'full';
let bar, smallBtn, hideTimer;

ipcRenderer.on('mode', (_e, m) => {
  mode = m;
  document.documentElement.dataset.ccMode = m;
  if (smallBtn) {
    smallBtn.textContent = m === 'mini' ? ICON.toFull : ICON.toSmall;
    smallBtn.title = m === 'mini' ? 'Full screen' : 'Small window';
  }
});

function makeBtn(action, icon, title, extraClass) {
  const b = el('button', 'cc-btn' + (extraClass ? ' ' + extraClass : ''), icon);
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBar();
    ipcRenderer.send('win', action);
  });
  return b;
}
function showBar() { clearTimeout(hideTimer); bar && bar.classList.add('cc-show'); }
function hideBar() { clearTimeout(hideTimer); bar && bar.classList.remove('cc-show'); }

function icoImg() {
  const i = el('img', 'cc-ico');
  i.alt = '';
  if (iconUrl) i.src = iconUrl;
  return i;
}

function injectBar() {
  if (document.getElementById('cc-bar')) return;
  const zone = el('div');
  zone.id = 'cc-zone';
  zone.addEventListener('mouseenter', showBar);

  bar = el('div');
  bar.id = 'cc-bar';

  const xBtn = el('button', 'cc-xbtn');
  xBtn.append(icoImg(), el('span', null, 'SoundCloud'), el('b', null, 'X'));
  xBtn.title = 'SoundCloudX menu';
  xBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBar();
    togglePanel();
  });

  const btns = el('div', 'cc-btns');
  smallBtn = makeBtn('mini', mode === 'mini' ? ICON.toFull : ICON.toSmall, 'Small window');
  btns.append(makeBtn('min', ICON.min, 'Minimize'), smallBtn, makeBtn('close', ICON.close, 'Close', 'cc-close'));

  bar.append(xBtn, btns);
  bar.addEventListener('mouseenter', showBar);
  document.body.append(zone, bar);
}

document.addEventListener('mousemove', (e) => {
  if (!bar || !bar.classList.contains('cc-show')) return;
  if (e.clientY > 60) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBar, 250);
  }
}, true);
document.addEventListener('mouseleave', () => { hideTimer = setTimeout(hideBar, 600); });

// ================================================================ TOAST
let toastEl, toastTimer;
function toast(text, actionLabel, onAction, ms = 3500) {
  if (!toastEl || !document.body.contains(toastEl)) {
    toastEl = el('div');
    toastEl.id = 'cc-toast';
    document.body.append(toastEl);
  }
  toastEl.textContent = '';
  toastEl.append(el('span', null, text));
  if (actionLabel) {
    const b = el('button', null, actionLabel);
    b.addEventListener('click', () => { onAction(); toastEl.classList.remove('cc-show'); });
    toastEl.append(b);
  }
  toastEl.classList.add('cc-show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => toastEl.classList.remove('cc-show'), ms);
}

// ================================================================ PANEL UI KIT
let panel, backdrop, statusEl;
const refreshers = [];
const refreshPanel = () => refreshers.forEach((f) => f());

function setStatus(text) { if (statusEl) statusEl.textContent = text || ''; }

function sectionTitle(t) { return el('div', 'cc-st', t); }
function note(t) { return el('div', 'cc-note', t); }

function cards(options, get, set, extraCls) {
  const wrap = el('div', 'cc-opts' + (extraCls ? ' ' + extraCls : ''));
  for (const [value, label, previewCls, bars] of options) {
    const o = el('button', 'cc-opt');
    const pv = el('div', 'cc-pv ' + previewCls);
    for (let i = 0; i < (bars || 0); i++) pv.append(el('i'));
    o.append(pv, el('span', 'cc-optl', label));
    o.addEventListener('click', () => set(value));
    refreshers.push(() => o.classList.toggle('cc-active', get() === value));
    wrap.append(o);
  }
  return wrap;
}

function segmented(options, get, set) {
  const wrap = el('div', 'cc-seg');
  for (const [value, label] of options) {
    const b = el('button', null, label);
    b.addEventListener('click', () => set(value));
    refreshers.push(() => b.classList.toggle('cc-active', get() === value));
    wrap.append(b);
  }
  return wrap;
}

function toggleRow(label, get, set) {
  const row = el('label', 'cc-row');
  const sw = el('button', 'cc-switch');
  sw.append(el('i'));
  sw.addEventListener('click', (e) => { e.preventDefault(); set(!get()); });
  refreshers.push(() => sw.classList.toggle('cc-on', !!get()));
  row.append(el('span', null, label), sw);
  return row;
}

function sliderRow(label, min, max, step, get, set, fmt) {
  const wrap = el('div', 'cc-slider');
  const top = el('div', 'cc-row');
  const val = el('span', 'cc-val');
  top.append(el('span', null, label), val);
  const r = el('input', 'cc-range');
  r.type = 'range'; r.min = min; r.max = max; r.step = step;
  r.addEventListener('input', () => { set(parseFloat(r.value)); val.textContent = fmt(parseFloat(r.value)); });
  refreshers.push(() => { r.value = get(); val.textContent = fmt(get()); });
  wrap.append(top, r);
  return wrap;
}

function colorRow(label, hint, key) {
  const row = el('div', 'cc-row cc-crow');
  const txt = el('div', 'cc-ctxt');
  txt.append(el('span', null, label), el('small', null, hint));
  const right = el('div', 'cc-cright');
  const reset = el('button', 'cc-reset', '↺');
  reset.title = 'Default';
  const input = el('input', 'cc-color');
  input.type = 'color';
  let t;
  input.addEventListener('input', () => {
    S.theme[key] = input.value;
    clearTimeout(t);
    t = setTimeout(() => { applyCSS(); saveAll(); refreshPanel(); }, 50);
  });
  reset.addEventListener('click', () => { S.theme[key] = null; applyCSS(); saveAll(); refreshPanel(); });
  refreshers.push(() => {
    const v = key === 'slider' ? sliderColor() : (S.theme[key] || THEME_DEF[key]);
    input.value = v;
    reset.style.visibility = S.theme[key] ? 'visible' : 'hidden';
  });
  right.append(reset, input);
  row.append(txt, right);
  return row;
}

function wideBtn(label, onClick, cls) {
  const b = el('button', 'cc-wide' + (cls ? ' ' + cls : ''), label);
  b.addEventListener('click', onClick);
  return b;
}

// ================================================================ PANEL
const TABS = ['Visual', 'Player', 'Sound', 'Theme', 'Online', 'Shop', 'Game', 'Stats', 'Discord', 'Admin'];
let activeTab = 'Visual';

function togglePanel(force) {
  injectPanel();
  const open = force != null ? force : !panel.classList.contains('cc-open');
  panel.classList.toggle('cc-open', open);
  backdrop.classList.toggle('cc-open', open);
  if (open) refreshPanel();
}

function buildVisualTab() {
  const t = el('div', 'cc-tab');
  const colorWrap = el('div', 'cc-colors');
  const customInput = el('input');
  customInput.type = 'color';
  customInput.className = 'cc-hidden-color';
  customInput.addEventListener('input', () => {
    S.viz.custom = customInput.value;
    S.viz.color = 'custom';
    saveAll();
    refreshPanel();
  });
  for (const c of ['orange', 'purple', 'cyan', 'rainbow', 'custom']) {
    const s = el('button', 'cc-sw cc-sw-' + c);
    s.title = c === 'custom' ? 'Your color' : c[0].toUpperCase() + c.slice(1);
    s.addEventListener('click', () => {
      if (c === 'custom') {
        customInput.value = S.viz.custom;
        customInput.click();
      }
      S.viz.color = c;
      saveAll();
      refreshPanel();
    });
    if (c === 'custom') refreshers.push(() => { s.style.background = S.viz.custom; });
    refreshers.push(() => s.classList.toggle('cc-active', S.viz.color === c));
    colorWrap.append(s);
  }
  colorWrap.append(customInput);

  t.append(
    sectionTitle('Sound Visual'),
    cards(
      [['off', 'Off', 'cc-pv-off'], ['wave', 'Wave', 'cc-pv-wave', 7], ['ball', 'Ball', 'cc-pv-ball', 1]],
      () => S.viz.mode,
      (v) => setVizMode(v)
    ),
    sectionTitle('Color'),
    colorWrap,
    note('The last circle is your own color. Click it to pick any color.'),
    sectionTitle('Sensitivity'),
    sliderRow('Sensitivity', 0.4, 2.5, 0.1, () => S.viz.sens, (v) => { S.viz.sens = v; saveAll(); }, (v) => v.toFixed(1) + 'x'),
    sectionTitle('Bass Visual'),
    toggleRow('Bass glow', () => S.viz.bassGlow, (v) => { S.viz.bassGlow = v; vizChanged(); }),
    sliderRow('Glow power', 0.3, 2, 0.1, () => S.viz.glowPower, (v) => { S.viz.glowPower = v; saveAll(); }, (v) => Math.round(v * 100) + '%'),
    note('On every bass hit the left and right sides of the screen light up in the visual color. Works with Wave, Ball or Off.'),
    sectionTitle('Next Up'),
    toggleRow('Next up on the right side', () => S.nu.panel, (v) => { S.nu.panel = v; saveAll(); renderNextUp(true); refreshPanel(); }),
    note('Shows the next songs in a card on the right. Click a song to play it.')
  );

  t.append(
    sectionTitle('Animations'),
    toggleRow('Repost animation', () => S.fx.repost, (v) => { S.fx.repost = v; saveAll(); refreshPanel(); }),
    toggleRow('Like animation', () => S.fx.like, (v) => { S.fx.like = v; saveAll(); refreshPanel(); })
  );
  return t;
}

function buildPlayerTab() {
  const t = el('div', 'cc-tab');
  const miniBtn = wideBtn('Open mini player', async () => {
    if (!miniPlayerOpen && miniNeedsBands()) await ensureAudio();
    ipcRenderer.send('mini-player', 'toggle');
    togglePanel(false);
  });
  refreshers.push(() => {
    miniBtn.textContent = miniPlayerOpen ? 'Close mini player' : 'Open mini player';
    miniBtn.classList.toggle('cc-ghost', miniPlayerOpen);
  });

  t.append(
    sectionTitle('Mini Player'),
    cards(
      [['classic', 'Classic', 'cc-pv-classic', 3], ['ball', 'Ball', 'cc-pv-ball', 1],
        ['wave', 'Wave', 'cc-pv-wave', 7], ['ultra', 'Ultra mini', 'cc-pv-ultra', 2]],
      () => S.mini.style,
      (v) => { S.mini.style = v; miniOptsChanged(); },
      'cc-opts4'
    ),
    toggleRow('Sound background', () => S.mini.soundBg, (v) => { S.mini.soundBg = v; miniOptsChanged(); }),
    note('Sound background: the song cover behind the mini player, pulsing to the music.'),
    miniBtn,
    note('A small window on top of everything. ❯ in it brings SoundCloud back. Ultra mini is just the cover, the title and the play buttons.'),
    sectionTitle('Player Bar'),
    segmented(
      [['classic', 'Classic'], ['glass', 'Glass'], ['floating', 'Floating']],
      () => S.bar.style,
      (v) => { S.bar.style = v; saveAll(); applyCSS(); refreshPanel(); }
    ),
    toggleRow('Thick progress bar', () => S.bar.thick, (v) => { S.bar.thick = v; saveAll(); applyCSS(); refreshPanel(); }),
    note('Progress bar color is set in Theme → Sliders.'),
    sectionTitle('Hotkeys'),
    toggleRow('X + P / X + O', () => S.keys.on, (v) => { S.keys.on = v; saveAll(); refreshPanel(); }),
    note('Hold X and press P to open / close the mini player, X + O to show / hide SoundCloudX. Works while SoundCloudX or the mini player is active.'),
    note('Anywhere in Windows (even in a game or browser): Ctrl + Alt + P and Ctrl + Alt + O.')
  );
  return t;
}

function buildSoundTab() {
  const t = el('div', 'cc-tab');
  t.append(
    sectionTitle('SoundBoost'),
    toggleRow('SoundBoost', () => S.boost.on, (v) => { S.boost.on = v; saveAll(); applyBoost(true); refreshPanel(); }),
    sliderRow('Volume', 1, 3, 0.05, () => S.boost.gain, (v) => { S.boost.gain = v; saveAll(); applyBoost(); }, (v) => Math.round(v * 100) + '%'),
    sliderRow('Bass', 0, 12, 0.5, () => S.boost.bass, (v) => { S.boost.bass = v; saveAll(); applyBoost(); }, (v) => '+' + v.toFixed(1) + ' dB'),
    note('A limiter keeps the sound from crackling. Turn it off to get the original sound back.'),
    sectionTitle('Download'),
    wideBtn('Download current track', downloadCurrent),
    wideBtn('Open downloads folder', () => ipcRenderer.send('open-downloads'), 'cc-ghost'),
    note('Uses SoundCloud\'s own "Download file" button, so it works for tracks where the artist allowed downloads. Files go to Downloads\\SoundCloudX.')
  );
  return t;
}

function imageInput(onImage) {
  const f = el('input');
  f.type = 'file';
  f.accept = 'image/*';
  f.className = 'cc-hidden-color';
  f.addEventListener('change', () => {
    const file = f.files && f.files[0];
    f.value = '';
    if (file) onImage(file);
  });
  return f;
}

function buildThemeTab() {
  const t = el('div', 'cc-tab');
  const setBg = (patch) => { Object.assign(S.bg, patch); saveAll(); applyBg(); refreshPanel(); };

  // ---- presets
  const grid = el('div', 'cc-themes');
  for (const name of SCENE_ORDER) {
    const sc = SCENES[name];
    const card = el('button', 'cc-theme');
    const thumb = el('div', 'cc-theme-pic');
    card.append(thumb, el('span', null, sc.emoji + ' ' + sc.name));
    card.addEventListener('click', () => applyPreset(name));
    refreshers.push(() => {
      card.classList.toggle('cc-active', S.bg.mode === 'scene' && S.bg.scene === name);
      if (!thumb.firstChild && panel && panel.classList.contains('cc-open') && activeTab === 'Theme') {
        thumb.append(sceneThumb(name)); // drawn once, the first time the tab is opened
      }
    });
    grid.append(card);
  }
  const themeFile = el('input');
  themeFile.type = 'file';
  themeFile.accept = '.scxtheme,.json,application/json';
  themeFile.className = 'cc-hidden-color';
  themeFile.addEventListener('change', () => {
    const f = themeFile.files && themeFile.files[0];
    themeFile.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => importTheme(String(r.result || ''));
    r.readAsText(f);
  });
  const fileRow = el('div', 'cc-btnrow');
  fileRow.append(
    wideBtn('Load theme…', () => themeFile.click(), 'cc-ghost'),
    wideBtn('Save my theme', exportTheme, 'cc-ghost')
  );

  // ---- background
  const bgFile = imageInput(async (file) => {
    if (await setSlotFile('bg', file)) setBg({ mode: 'custom' });
  });
  const bgBtns = el('div', 'cc-btnrow');
  bgBtns.append(
    wideBtn('Image / GIF…', () => bgFile.click(), 'cc-ghost'),
    wideBtn('Use this song', () => {
      const art = bigArt(artSrc);
      if (!art) return toast('Play a track first');
      setSlotUrl('bg', art);
      setBg({ mode: 'custom' });
      toast('Background set to this song\'s cover');
    }, 'cc-ghost')
  );

  // ---- menu
  const menuFile = imageInput(async (file) => {
    if (await setSlotFile('menu', file)) { applyMenu(); refreshPanel(); }
  });
  const menuBtns = el('div', 'cc-btnrow');
  const removeMenuImg = wideBtn('Remove image', () => {
    clearSlot('menu');
    applyMenu();
    refreshPanel();
  }, 'cc-ghost');
  refreshers.push(() => { removeMenuImg.style.opacity = IMG.menu.url ? '1' : '.4'; });
  menuBtns.append(wideBtn('Menu image / GIF…', () => menuFile.click(), 'cc-ghost'), removeMenuImg);

  const menuColor = el('div', 'cc-row cc-crow');
  const mtxt = el('div', 'cc-ctxt');
  mtxt.append(el('span', null, 'Menu color'), el('small', null, 'background of this menu'));
  const mright = el('div', 'cc-cright');
  const mreset = el('button', 'cc-reset', '↺');
  const minput = el('input', 'cc-color');
  minput.type = 'color';
  minput.addEventListener('input', () => { S.menu.bg = minput.value; saveAll(); applyMenu(); refreshPanel(); });
  mreset.addEventListener('click', () => { S.menu.bg = null; saveAll(); applyMenu(); refreshPanel(); });
  refreshers.push(() => { minput.value = S.menu.bg || '#101010'; mreset.style.visibility = S.menu.bg ? 'visible' : 'hidden'; });
  mright.append(mreset, minput);
  menuColor.append(mtxt, mright);

  t.append(
    sectionTitle('Themes'),
    grid,
    note('Every theme is a moving background with matching colors. Change anything below afterwards.'),
    fileRow,
    themeFile,
    note('Save my theme makes a .scxtheme file with your colors, backgrounds and pictures. Send it to friends — they press Load theme.'),

    sectionTitle('Background'),
    cards(
      [['off', 'Off', 'cc-pv-off'], ['song', 'Song cover', 'cc-pv-song', 1], ['custom', 'Your image', 'cc-pv-custom', 1], ['scene', 'Theme', 'cc-pv-scene', 1]],
      () => S.bg.mode,
      (v) => {
        if (v === 'custom' && !IMG.bg.url) { bgFile.click(); return; }
        setBg({ mode: v });
      },
      'cc-opts4'
    ),
    bgBtns,
    bgFile,
    sliderRow('Blur', 0, 60, 1, () => S.bg.blur, (v) => { S.bg.blur = v; saveAll(); applyBgVars(); }, (v) => v + 'px'),
    sliderRow('Darkness', 0, 0.9, 0.05, () => S.bg.dim, (v) => { S.bg.dim = v; saveAll(); applyBgVars(); }, (v) => Math.round(v * 100) + '%'),
    toggleRow('Glass panels', () => S.bg.glass, (v) => setBg({ glass: v })),

    sectionTitle('SoundCloudX Menu'),
    menuColor,
    menuBtns,
    menuFile,
    sliderRow('Image darkness', 0, 0.95, 0.05, () => S.menu.dim, (v) => { S.menu.dim = v; saveAll(); applyMenu(); }, (v) => Math.round(v * 100) + '%'),

    sectionTitle('App Visual'),
    colorRow('Background', 'page background', 'bg'),
    colorRow('Color 1', 'white by default: text, buttons', 'text'),
    colorRow('Color 2', 'orange by default: accents', 'accent'),
    colorRow('Sliders', 'progress bar and volume', 'slider'),
    wideBtn('Reset theme', () => {
      S.theme = { bg: null, text: null, accent: null, slider: null };
      S.menu = { bg: null, dim: 0.55 };
      S.bg = Object.assign({}, S.bg, { mode: 'off', blur: 28, dim: 0.55 });
      clearSlot('menu');
      saveAll(); applyCSS(); applyBg(); refreshPanel();
    }, 'cc-ghost')
  );
  return t;
}

// ---------- images (also GIFs) live in IndexedDB, so they keep their animation and can be big
const IDB = (() => {
  let ready;
  const open = () => ready || (ready = new Promise((res, rej) => {
    const r = indexedDB.open('ccx', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('img')) db.createObjectStore('img');
      if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = (store, mode, fn) => open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
  }));
  return {
    put: (k, v) => run('img', 'readwrite', (st) => st.put(v, k)),
    get: (k) => run('img', 'readonly', (st) => st.get(k)),
    del: (k) => run('img', 'readwrite', (st) => st.delete(k)),
    putIn: (store, k, v) => run(store, 'readwrite', (st) => st.put(v, k)),
    delIn: (store, k) => run(store, 'readwrite', (st) => st.delete(k)),
    all: (store) => run(store, 'readonly', (st) => st.getAll()),
  };
})();

const IMG = { bg: { url: '' }, menu: { url: '' } };
const SLOT_KEY = { bg: 'ccx_bgimg', menu: 'ccx_menuimg' };
function setSlotUrlRaw(slot, url) {
  const old = IMG[slot].url;
  if (old && old.startsWith('blob:') && old !== url) URL.revokeObjectURL(old);
  IMG[slot].url = url || '';
}
async function loadSlot(slot) {
  let ref = '';
  try { ref = localStorage.getItem(SLOT_KEY[slot]) || ''; } catch {}
  if (ref === 'idb') {
    try {
      const blob = await IDB.get(slot);
      setSlotUrlRaw(slot, blob ? URL.createObjectURL(blob) : '');
    } catch { setSlotUrlRaw(slot, ''); }
  } else setSlotUrlRaw(slot, safeImg(ref) ? ref : '');
}
function shrinkToBlob(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('bad image'))), 'image/jpeg', 0.88);
    };
    img.src = url;
  });
}
async function saveSlotBlob(slot, blob) {
  await IDB.put(slot, blob);
  try { localStorage.setItem(SLOT_KEY[slot], 'idb'); } catch {}
  setSlotUrlRaw(slot, URL.createObjectURL(blob));
}
async function setSlotFile(slot, file) {
  try {
    if (!/^image\//.test(file.type)) { toast('Pick a picture or a GIF'); return false; }
    let blob;
    if (file.type === 'image/gif' || file.type === 'image/webp') {
      // animated → keep the original file so it keeps moving
      if (file.size > 40 * 1024 * 1024) { toast('GIF is too big (max 40 MB)'); return false; }
      blob = file;
    } else {
      blob = await shrinkToBlob(file, 1920);
    }
    await saveSlotBlob(slot, blob);
    return true;
  } catch {
    toast('Could not open that image');
    return false;
  }
}
function setSlotUrl(slot, url) {
  try { localStorage.setItem(SLOT_KEY[slot], url); } catch {}
  IDB.del(slot).catch(() => {});
  setSlotUrlRaw(slot, url);
}
function clearSlot(slot) {
  try { localStorage.removeItem(SLOT_KEY[slot]); } catch {}
  IDB.del(slot).catch(() => {});
  setSlotUrlRaw(slot, '');
}
async function slotAsDataUrl(slot) {
  const url = IMG[slot].url;
  if (!url) return '';
  if (!url.startsWith('blob:')) return url;
  const blob = await IDB.get(slot);
  if (!blob) return '';
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => res('');
    r.readAsDataURL(blob);
  });
}
async function slotFromDataUrl(slot, data) {
  if (!data) return clearSlot(slot);
  if (data.startsWith('https://')) return setSlotUrl(slot, data);
  const blob = await (await fetch(data)).blob();
  await saveSlotBlob(slot, blob);
}

const safeImg = (v) => typeof v === 'string' && (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(v) || /^https:\/\/[^\s"'()<>]+$/i.test(v) || /^blob:https:\/\/soundcloud\.com\/[a-f0-9-]+$/i.test(v));
const cssUrl = (v) => 'url("' + v.replace(/["\\\n]/g, '') + '")';

function applyMenu() {
  const st = document.documentElement.style;
  const bg = S.menu.bg || '#101010';
  st.setProperty('--ccx-menu-bg', `rgba(${rgbStr(bg)},.96)`);
  const mi = IMG.menu.url;
  st.setProperty('--ccx-menu-img', mi && safeImg(mi) ? cssUrl(mi) : 'none');
  st.setProperty('--ccx-menu-dim', String(mi ? S.menu.dim : 0));
}

async function exportTheme() {
  toast('Saving theme…', null, null, 1500);
  const [bgData, menuData] = await Promise.all([slotAsDataUrl('bg'), slotAsDataUrl('menu')]);
  const data = {
    app: 'SoundCloudX', type: 'theme', version: 1,
    name: (S.bg.mode === 'scene' && SCENES[S.bg.scene] ? SCENES[S.bg.scene].name : 'My') + ' theme',
    theme: S.theme, menu: S.menu, bg: S.bg,
    viz: { color: S.viz.color, custom: S.viz.custom },
    bar: S.bar,
    images: {
      background: bgData,
      menu: menuData,
    },
  };
  ipcRenderer.send('save-theme', JSON.stringify(data));
}
ipcRenderer.on('theme-saved', (_e, r) => {
  if (r && r.ok) toast((r.what || 'Theme') + ' saved', 'Show', () => ipcRenderer.send('show-file', r.file), 6000);
  else if (r && r.error) toast('Could not save: ' + r.error);
});

async function importTheme(text) {
  let d;
  try { d = JSON.parse(text); } catch { return toast('This is not a SoundCloudX theme file'); }
  if (!d || d.app !== 'SoundCloudX' || d.type !== 'theme') return toast('This is not a SoundCloudX theme file');
  const col = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  const num = (v, a, b, def) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : def);
  const th = d.theme || {};
  S.theme = { bg: col(th.bg), text: col(th.text), accent: col(th.accent), slider: col(th.slider) };
  const m = d.menu || {};
  S.menu = { bg: col(m.bg), dim: num(m.dim, 0, 0.95, 0.55) };
  const b = d.bg || {};
  S.bg = {
    mode: ['off', 'song', 'custom', 'scene'].includes(b.mode) ? b.mode : 'off',
    scene: SCENES[b.scene] ? b.scene : 'darkwave',
    blur: num(b.blur, 0, 60, 28), dim: num(b.dim, 0, 0.9, 0.55), glass: b.glass !== false,
  };
  if (d.viz && col(d.viz.custom)) { S.viz.custom = d.viz.custom; S.viz.color = ['orange', 'purple', 'cyan', 'rainbow', 'custom'].includes(d.viz.color) ? d.viz.color : 'custom'; }
  if (d.bar && ['classic', 'glass', 'floating'].includes(d.bar.style)) S.bar = { style: d.bar.style, thick: !!d.bar.thick };
  const imgs = d.images || {};
  try {
    if (safeImg(imgs.background) && !imgs.background.startsWith('blob:')) await slotFromDataUrl('bg', imgs.background);
    else if (S.bg.mode === 'custom' && !IMG.bg.url) S.bg.mode = 'off';
    await slotFromDataUrl('menu', safeImg(imgs.menu) && !imgs.menu.startsWith('blob:') ? imgs.menu : '');
  } catch { toast('Some pictures in this theme could not be loaded'); }
  saveAll();
  applyCSS();
  applyBg();
  refreshPanel();
  toast('Theme loaded: ' + String(d.name || 'theme').slice(0, 40));
}

let rpcStatus = { state: 'off', text: '' };
ipcRenderer.on('rpc-status', (_e, st) => { rpcStatus = st || rpcStatus; refreshPanel(); });
function sendRpcConfig() {
  ipcRenderer.send('rpc-config', { enabled: !!S.rpc.on, clientId: rpcId(), showPaused: !!S.rpc.paused });
}

function buildDiscordTab() {
  const t = el('div', 'cc-tab');

  const idRow = el('div', 'cc-idrow');
  const id = el('input', 'cc-text');
  id.placeholder = 'Empty = built-in SoundCloudX app';
  id.spellcheck = false;
  let tm;
  id.addEventListener('input', () => {
    id.value = id.value.replace(/\D/g, '');
    clearTimeout(tm);
    tm = setTimeout(() => { S.rpc.id = id.value; saveAll(); sendRpcConfig(); }, 500);
  });
  refreshers.push(() => { if (document.activeElement !== id) id.value = S.rpc.id || ''; });
  idRow.append(id);

  const status = el('div', 'cc-rpcstatus');
  const dot = el('i');
  const stText = el('span');
  status.append(dot, stText);
  refreshers.push(() => {
    status.dataset.state = S.rpc.on ? rpcStatus.state : 'off';
    stText.textContent = S.rpc.on ? (rpcStatus.text || rpcStatus.state) : 'Off';
  });

  // preview card, roughly how Discord shows it
  const pv = el('div', 'cc-dpv');
  const pvArt = el('div', 'cc-dpv-art');
  const pvSmall = icoImg();
  pvSmall.className = 'cc-ico cc-dpv-small';
  pvArt.append(pvSmall);
  const pvTxt = el('div', 'cc-dpv-txt');
  const pvHead = el('div', 'cc-dpv-head', 'Listening to SoundCloudX');
  const pvTitle = el('div', 'cc-dpv-title');
  const pvArtist = el('div', 'cc-dpv-line');
  const pvBy = el('div', 'cc-dpv-line cc-dpv-by', 'SCX By W1CKIX');
  const pvBar = el('div', 'cc-dpv-bar');
  pvBar.append(el('i'));
  pvTxt.append(pvTitle, pvArtist, pvBy, pvBar);
  pv.append(pvHead, el('div', 'cc-dpv-row'));
  pv.lastChild.append(pvArt, pvTxt);
  refreshers.push(() => {
    const tr = lastTrackInfo || {};
    pvTitle.textContent = tr.title || 'Song title';
    pvArtist.textContent = tr.artist || 'Artist';
    pvArt.style.backgroundImage = tr.art ? 'url("' + tr.art + '")' : '';
    pvBar.firstChild.style.width = Math.round((tr.progress || 0.35) * 100) + '%';
  });

  const adv = el('details', 'cc-adv');
  const sum = el('summary', null, 'Advanced: use your own Discord app');
  adv.append(
    sum,
    note('SoundCloudX already has its own Discord app built in, so nothing needs to be set up. Only fill this in if you made your own app in the Discord Developer Portal.'),
    idRow,
    note('Your app needs an image named scx in Rich Presence → Art Assets for the small icon.'),
    wideBtn('Open Developer Portal', () => ipcRenderer.send('rpc-help', 'portal'), 'cc-ghost'),
    wideBtn('Show icon file', () => ipcRenderer.send('rpc-help', 'icon'), 'cc-ghost')
  );

  t.append(
    sectionTitle('Discord Rich Presence'),
    toggleRow('Show in Discord', () => S.rpc.on, (v) => { S.rpc.on = v; saveAll(); sendRpcConfig(); refreshPanel(); }),
    status,
    pv,
    toggleRow('Show when paused', () => S.rpc.paused, (v) => { S.rpc.paused = v; saveAll(); sendRpcConfig(); refreshPanel(); }),
    note('Works with the Discord app on this computer. In Discord: Settings → Activity Privacy → Share my activity must be on.'),
    adv
  );
  return t;
}

function injectPanel() {
  if (document.getElementById('cc-panel')) return;
  refreshers.length = 0;

  backdrop = el('div');
  backdrop.id = 'cc-backdrop';
  backdrop.addEventListener('click', () => togglePanel(false));

  panel = el('div');
  panel.id = 'cc-panel';

  const head = el('div', 'cc-ph');
  const logo = el('div', 'cc-plogo');
  logo.append(icoImg(), el('span', null, 'SoundCloud'), el('b', null, 'X'));
  const closeB = el('button', 'cc-pclose', ICON.close);
  closeB.title = 'Close menu';
  closeB.addEventListener('click', () => togglePanel(false));
  const coinBadge = el('div', 'cc-coins');
  const paintCoins = () => { coinBadge.textContent = '🪙 ' + coinBalance().toLocaleString('en-US'); };
  paintCoins();
  COINS.onChange(paintCoins);
  head.append(logo, coinBadge, closeB);

  const tabsRow = el('div', 'cc-tabs');
  const body = el('div', 'cc-pbody');
  const pages = {
    Visual: buildVisualTab(),
    Player: buildPlayerTab(),
    Sound: buildSoundTab(),
    Theme: buildThemeTab(),
    Discord: buildDiscordTab(),
    Online: buildOnlineTab(),
    Shop: buildShopTab(),
    Admin: buildAdminTab(),
    Game: buildGameTab(),
    Stats: buildStatsTab(),
  };
  const TAB_ICON = { Visual: '✨', Player: '🎧', Sound: '🔊', Theme: '🎨', Online: '🌐', Shop: '🛒', Game: '🎮', Stats: '📊', Discord: '💬', Admin: '🛡️' };
  for (const name of TABS) {
    const b = el('button');
    b.append(el('i', null, TAB_ICON[name] || '•'), el('span', null, name));
    b.addEventListener('click', () => { activeTab = name; refreshPanel(); });
    refreshers.push(() => {
      if (name === 'Admin' && activeTab === 'Admin' && !isAdmin()) activeTab = 'Online';
      b.classList.toggle('cc-active', activeTab === name);
      b.classList.toggle('cc-hidden', name === 'Admin' && !isAdmin());
      pages[name].style.display = activeTab === name ? '' : 'none';
    });
    tabsRow.append(b);
    body.append(pages[name]);
  }

  statusEl = el('div', 'cc-status');
  // sections on the left, the open section on the right
  const main = el('div', 'cc-main');
  const right = el('div', 'cc-right');
  right.append(body, statusEl);
  main.append(tabsRow, right);
  panel.append(head, main, el('div', 'cc-foot', 'X+P mini player  •  X+O SoundCloudX  •  F11 full screen'));
  document.body.append(backdrop, panel);
  refreshPanel();
}

let miniPlayerOpen = false;
ipcRenderer.on('mini-player-state', (_e, open) => {
  miniPlayerOpen = open;
  refreshPanel();
  if (open) {
    sendMiniOpts();
    lastSent = '';
    pollTrack();
    if (miniNeedsBands()) ensureAudio();
  }
  maybeReleaseAudio();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel && panel.classList.contains('cc-open')) togglePanel(false);
});

// ================================================================ THEME + PLAYER BAR CSS
const ORANGE_VARS = ['--special-color', '--font-special-color', '--checkbox-checked-background-color',
  '--checkbox-checked-border-color', '--button-secondary-selected-font-color', '--button-secondary-selected-active-font-color',
  '--button-tertiary-selected-font-color', '--button-tertiary-selected-active-font-color', '--toggle-on-body-color',
  '--toggle-on-body-hover-color', '--button-special-background-color'];
const ORANGE_FADE_VARS = ['--button-tertiary-selected-hover-font-color', '--button-secondary-selected-hover-font-color'];
const TEXT_VARS = ['--font-primary-color', '--primary-color', '--font-light-color', '--link-primary-color',
  '--button-secondary-font-color', '--button-tertiary-font-color', '--button-secondary-active-font-color',
  '--button-tertiary-active-font-color', '--input-default-font-color', '--input-focused-font-color',
  '--tag-default-font-color', '--button-primary-background-color', '--button-primary-active-background-color',
  '--button-dark-font-color', '--tag-selected-background-color'];
const BG_VARS = ['--background-surface-color', '--surface-color', '--background-dark-color',
  '--button-tertiary-background-color', '--button-dark-background-color'];
const HL_VARS = ['--highlight-color', '--background-highlight-color', '--button-secondary-background-color',
  '--input-default-background-color', '--tag-default-background-color', '--button-secondary-active-background-color'];

function themeCSS() {
  const th = S.theme;
  const v = [];
  const put = (names, val) => names.forEach((n) => v.push(`${n}:${val}!important`));
  let extra = '';
  if (th.bg) {
    const hl = mix(th.bg, '#ffffff', 0.12);
    put(BG_VARS, th.bg);
    put(['--surface-rgb', '--black-rgb'], rgbStr(th.bg));
    put(HL_VARS, hl);
    put(['--highlight-rgb'], rgbStr(hl));
    extra += `html body{background-color:${th.bg}!important}`;
  }
  if (th.text) {
    put(TEXT_VARS, th.text);
    put(['--primary-rgb'], rgbStr(th.text));
  }
  if (th.accent) {
    put(ORANGE_VARS, th.accent);
    put(ORANGE_FADE_VARS, `rgba(${rgbStr(th.accent)},0.4)`);
    put(['--special-rgb'], rgbStr(th.accent));
  }
  if (th.slider || th.accent) {
    const sl = sliderColor();
    extra += `.playbackTimeline__progressBar{background-color:${sl}!important}
      .playbackTimeline__progressHandle{border-color:${sl}!important}
      .volume__sliderProgress{background-color:${sl}!important}`;
  }
  const vars = v.length ? `html body,html body.theme-dark,html body.theme-light{${v.join(';')}}` : '';
  return vars + extra;
}

function barCSS() {
  const b = S.bar;
  const sl = sliderColor();
  const bgRgb = rgbStr(S.theme.bg || '#161616');
  let css = '';
  if (b.style !== 'classic') {
    css += `
      .playControls__inner{background:rgba(${bgRgb},0.6)!important;backdrop-filter:blur(26px) saturate(1.6)!important;border-top:1px solid rgba(255,255,255,.08)!important;transition:transform .25s ease!important}
      .playControls__bg{opacity:0!important}
      .playControls__play{border-radius:50%!important;transition:transform .15s ease,box-shadow .15s ease!important}
      .playControls__play:hover{transform:scale(1.08)!important;box-shadow:0 0 14px rgba(${rgbStr(sl)},.55)!important}
      .skipControl,.shuffleControl,.repeatControl,.volume__speakerIcon{transition:transform .15s ease,opacity .15s ease!important;background-color:transparent!important}
      .skipControl:hover,.shuffleControl:hover,.repeatControl:hover,.volume__speakerIcon:hover{transform:scale(1.12)!important}
      .playbackTimeline__progressBar{background:linear-gradient(90deg,${sl},${lighten(sl, 0.35)})!important;box-shadow:0 0 10px rgba(${rgbStr(sl)},.7)!important}
      .playbackTimeline__progressHandle{background-color:#fff!important;border-color:${sl}!important}
      .playbackTimeline__progressBackground{background-color:rgba(255,255,255,.12)!important}
      .playbackSoundBadge__avatar,.playbackSoundBadge__avatar .image,.playbackSoundBadge__avatar span{border-radius:6px!important}
      .playbackTimeline__timePassed,.playbackTimeline__duration{font-variant-numeric:tabular-nums!important;opacity:.85}`;
  }
  if (b.style === 'floating') {
    css += `.playControls__inner{margin:0 16px!important;transform:translateY(-12px)!important;border-radius:16px!important;border:1px solid rgba(255,255,255,.1)!important;box-shadow:0 12px 32px rgba(0,0,0,.55)!important}`;
  }
  if (b.thick) {
    css += `.playbackTimeline__progressBackground,.playbackTimeline__progressBar{height:4px!important;margin-top:-1px!important;border-radius:4px!important}
      .playbackTimeline__progressWrapper:hover .playbackTimeline__progressBackground,.playbackTimeline__progressWrapper:hover .playbackTimeline__progressBar{height:6px!important;margin-top:-2px!important}`;
  }
  return css;
}

function applyCSS() {
  ipcRenderer.send('css', { key: 'ccx', css: themeCSS() + barCSS() });
  document.documentElement.style.setProperty('--ccx-accent', accentColor());
  applyBgVars();
  applyMenu();
}

// ================================================================ SOUNDBOOST (runs in the page itself)
const MAIN_WORLD = `(() => {
  if (window.__ccx) return;
  const X = window.__ccx = { els: new Set(), nodes: new Map(), on: false, gain: 1, bass: 0, ctx: null };
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    X.els.add(this);
    if (X.on) X.attach(this);
    if (X.ctx && X.ctx.state === 'suspended') X.ctx.resume();
    return orig.apply(this, arguments);
  };
  X.attach = (m) => {
    if (X.nodes.has(m)) return;
    const src = m.currentSrc || m.src || '';
    if (src && !src.startsWith('blob:') && !m.crossOrigin) return; // would play silence
    if (!X.ctx) {
      X.ctx = new AudioContext();
      X.lo = X.ctx.createBiquadFilter(); X.lo.type = 'lowshelf'; X.lo.frequency.value = 110;
      X.g = X.ctx.createGain();
      X.lim = X.ctx.createDynamicsCompressor();
      X.lim.knee.value = 4; X.lim.attack.value = 0.003; X.lim.release.value = 0.2;
      X.lo.connect(X.g); X.g.connect(X.lim); X.lim.connect(X.ctx.destination);
    }
    try { const n = X.ctx.createMediaElementSource(m); n.connect(X.lo); X.nodes.set(m, n); } catch (e) {}
  };
  // exact song time for SCX Beat (the page's audio element is not reachable from SCX otherwise)
  setInterval(() => {
    let m = null;
    X.els.forEach((e) => { if (!e.paused) m = e; });
    if (!m) X.els.forEach((e) => { m = e; });
    if (m) window.postMessage({ __ccx: 'clock', t: m.currentTime, d: m.duration || 0, p: !m.paused && !m.ended }, '*');
  }, 50);
  X.set = (on, gain, bass) => {
    X.on = on;
    document.querySelectorAll('audio,video').forEach((m) => X.els.add(m));
    if (on) X.els.forEach(X.attach);
    if (X.ctx) {
      const t = X.ctx.currentTime;
      X.g.gain.setTargetAtTime(on ? gain : 1, t, 0.05);
      X.lo.gain.setTargetAtTime(on ? bass : 0, t, 0.05);
      X.lim.threshold.value = on ? -3 : 0;
      X.lim.ratio.value = on ? 12 : 1;
      if (X.ctx.state === 'suspended') X.ctx.resume();
    }
    return X.nodes.size;
  };
})();`;

webFrame.executeJavaScript(MAIN_WORLD).catch(() => {});

async function applyBoost(announce) {
  try {
    const n = await webFrame.executeJavaScript(
      `window.__ccx ? window.__ccx.set(${!!S.boost.on}, ${S.boost.gain}, ${S.boost.bass}) : -1`, true);
    if (announce && S.boost.on) {
      setStatus(n > 0 ? '' : 'SoundBoost will kick in when a track starts playing.');
    } else if (!S.boost.on) setStatus('');
  } catch {}
}

// ================================================================ DOWNLOAD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(120);
  }
  return null;
}

async function downloadCurrent() {
  const link = document.querySelector('.playbackSoundBadge__titleLink');
  if (!link) return toast('Play a track first');
  const href = (link.getAttribute('href') || '').split('?')[0];
  togglePanel(false);
  if (location.pathname !== href) {
    link.click(); // SoundCloud opens the track page without stopping the music
    await waitFor(() => location.pathname === href, 6000);
    await sleep(600);
  }
  const more = await waitFor(() => document.querySelector('.l-listen-wrapper .soundActions .sc-button-more'), 6000);
  if (!more) return toast('Could not open the track page');
  more.click();
  const dl = await waitFor(() => document.querySelector('.moreActions .sc-button-download'), 1500);
  if (!dl) {
    more.click();
    return toast('The artist has not enabled downloads for this track');
  }
  dl.click();
}

ipcRenderer.on('download', (_e, d) => {
  if (d.state === 'started') toast('Downloading: ' + d.name, null, null, 0);
  else if (d.state === 'progress') toast('Downloading: ' + Math.round(d.p * 100) + '%', null, null, 0);
  else if (d.state === 'done') toast('Saved: ' + d.name, 'Show', () => ipcRenderer.send('open-downloads'), 6000);
  else toast('Download failed');
});

// ================================================================ AUDIO CAPTURE (for visuals)
let audioCtx = null, analyser = null, freq = null, stream = null, gameAn = null, gameFreq = null;

async function grabStream() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } });
  } catch {
    return await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  }
}

async function ensureAudio() {
  if (analyser) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return true;
  }
  try {
    stream = await grabStream();
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('no audio track');
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    src.connect(analyser); // analysis only, never to the speakers
    // sharper second "ear" for the game, so drum hits are not smoothed away
    gameAn = audioCtx.createAnalyser();
    gameAn.fftSize = 1024;
    gameAn.smoothingTimeConstant = 0.15;
    src.connect(gameAn);
    gameFreq = new Uint8Array(gameAn.frequencyBinCount);
    freq = new Uint8Array(analyser.frequencyBinCount);
    track.addEventListener('ended', releaseAudio);
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    setStatus('');
    return true;
  } catch (e) {
    releaseAudio();
    setStatus('Could not capture sound: ' + (e && e.message ? e.message : e));
    return false;
  }
}

function releaseAudio() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) audioCtx.close().catch(() => {});
  stream = audioCtx = analyser = freq = gameAn = gameFreq = null;
}

let gameLiveOn = false;
const miniNeedsBands = () => S.mini.soundBg || S.mini.style === 'ball' || S.mini.style === 'wave';
const needAudio = () => S.viz.mode !== 'off' || S.viz.bassGlow || (miniPlayerOpen && miniNeedsBands())
  || (S.bg.mode === 'scene' && SCENES[S.bg.scene] && SCENES[S.bg.scene].needsAudio) || REC.on
  || gameLiveOn;
function maybeReleaseAudio() { if (!needAudio()) releaseAudio(); }

function sendMiniOpts() {
  ipcRenderer.send('mini-opts', { style: S.mini.style, soundBg: !!S.mini.soundBg });
}
async function miniOptsChanged() {
  saveAll();
  refreshPanel();
  sendMiniOpts();
  if (miniPlayerOpen && miniNeedsBands()) await ensureAudio();
  maybeReleaseAudio();
}

function getBands(n) {
  const out = new Float32Array(n);
  if (!freq) return out;
  const minB = 2, maxB = Math.min(freq.length - 1, 560);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(minB * Math.pow(maxB / minB, i / n));
    const b = Math.max(a + 1, Math.floor(minB * Math.pow(maxB / minB, (i + 1) / n)));
    let s = 0;
    for (let k = a; k < b; k++) s += freq[k];
    const v = (s / (b - a) / 255) * (1 + (i / n) * 0.9) * S.viz.sens;
    out[i] = Math.min(1, v * v * 1.15 + v * 0.15);
  }
  return out;
}

function makeSmoother(size) {
  const sm = new Float32Array(size);
  return (b) => {
    for (let i = 0; i < b.length; i++) {
      const k = b[i] > sm[i] ? 0.55 : 0.14;
      sm[i] += (b[i] - sm[i]) * k;
    }
    return sm.subarray(0, b.length);
  };
}
const smoothMain = makeSmoother(128);
const smoothMini = makeSmoother(128);

const PALETTES = {
  orange: ['#ff5500', '#ffb347'],
  purple: ['#7c3aed', '#ec4899'],
  cyan: ['#06b6d4', '#3b82f6'],
};
function palette(t) {
  if (S.viz.color === 'rainbow') {
    const h = (t * 0.04) % 360;
    return [`hsl(${h},95%,60%)`, `hsl(${(h + 70) % 360},95%,62%)`];
  }
  if (S.viz.color === 'custom') return [S.viz.custom, lighten(S.viz.custom, 0.4)];
  if (S.viz.color === 'cycle' && Array.isArray(S.viz.cycle) && S.viz.cycle.length > 1) {
    // flows through the theme's colors, like Rainbow but with your own set
    const c = S.viz.cycle, n = c.length, k = ((t / 2500) % n + n) % n, i = Math.floor(k), f = k - i;
    const a = mix(c[i], c[(i + 1) % n], f), b2 = mix(c[(i + 1) % n], c[(i + 2) % n], f);
    return [a, b2];
  }
  return PALETTES[S.viz.color] || PALETTES.orange;
}

// ================================================================ VISUALIZER ON THE PAGE
let canvas = null, ctx = null, raf = 0, frameN = 0, playerH = 0;
let particles = [], bassAvg = 0, lastBeat = 0, spin = 0;
const artImg = new Image();
let artSrc = '';
let isPlaying = false;

function ensureCanvas() {
  if (canvas && document.body.contains(canvas)) return;
  canvas = el('canvas');
  canvas.id = 'cc-viz';
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
}

function measurePlayer() {
  const pc = document.querySelector('.playControls');
  if (!pc) return 0;
  const r = pc.getBoundingClientRect();
  return r.height && r.top < innerHeight ? Math.max(0, innerHeight - r.top) : 0;
}

function placeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  let w, h;
  canvas.dataset.kind = S.viz.mode;
  const lift = S.bar.style === 'floating' ? 12 : 0;
  if (S.viz.mode === 'wave') {
    w = innerWidth; h = 190;
    Object.assign(canvas.style, { left: '0px', right: 'auto', bottom: playerH + lift + 'px', width: w + 'px', height: h + 'px' });
  } else {
    w = h = 340;
    Object.assign(canvas.style, { left: 'auto', right: '18px', bottom: playerH + lift + 6 + 'px', width: w + 'px', height: h + 'px' });
  }
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
}

async function setVizMode(m) {
  S.viz.mode = m;
  vizChanged();
}

// start/stop the drawing loop for the visualizer and the bass glow
async function vizChanged() {
  saveAll();
  refreshPanel();
  if (S.viz.mode === 'off' && canvas) { canvas.style.display = 'none'; particles = []; }
  if (!S.viz.bassGlow) hideGlow();
  if (S.viz.mode !== 'off' || S.viz.bassGlow) {
    if (await ensureAudio()) startViz();
  } else {
    stopViz();
  }
}

function startViz() {
  if (S.viz.mode !== 'off') {
    ensureCanvas();
    canvas.style.display = 'block';
    playerH = measurePlayer();
    placeCanvas();
  }
  if (S.viz.bassGlow) ensureGlow();
  if (!raf) raf = requestAnimationFrame(frame);
}

function stopViz() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (canvas) canvas.style.display = 'none';
  particles = [];
  hideGlow();
  maybeReleaseAudio();
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  if (!analyser || document.hidden) return;
  analyser.getByteFrequencyData(freq);
  if (S.viz.mode !== 'off') {
    if (!canvas || !document.body.contains(canvas)) { ensureCanvas(); canvas.style.display = 'block'; placeCanvas(); }
    if (++frameN % 30 === 0 || !canvas.width) { playerH = measurePlayer(); placeCanvas(); }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (S.viz.mode === 'wave') drawWave(t);
    else drawBall(t);
  }
  if (S.viz.bassGlow) drawGlow(t);
}

// ---------- BASS GLOW: the sides of the screen light up on bass
let glowL = null, glowR = null, glowLevel = 0, glowAvg = 0;
const smoothGlow = makeSmoother(16);
function ensureGlow() {
  if (glowL && document.body.contains(glowL)) return;
  glowL = el('div', 'cc-glow cc-glow-l');
  glowR = el('div', 'cc-glow cc-glow-r');
  document.body.append(glowL, glowR);
}
function hideGlow() {
  glowLevel = 0;
  if (glowL) { glowL.style.opacity = 0; glowR.style.opacity = 0; }
}
function drawGlow(t) {
  ensureGlow();
  const b = smoothGlow(getBands(16));
  const bass = (b[0] + b[1] + b[2] + b[3]) / 4;
  // react to hits (bass above its recent average), not just to loud songs
  glowAvg = glowAvg * 0.97 + bass * 0.03;
  const hit = Math.max(0, bass - glowAvg * 0.85) * 2.4 + bass * 0.35;
  const target = Math.min(1, hit * S.viz.glowPower);
  glowLevel += (target - glowLevel) * (target > glowLevel ? 0.6 : 0.1);
  const [c1, c2] = palette(t);
  glowL.style.setProperty('--gc', c1);
  glowR.style.setProperty('--gc', S.viz.color === 'rainbow' ? c2 : c1);
  glowL.style.opacity = glowR.style.opacity = glowLevel.toFixed(3);
  const w = (10 + glowLevel * 14).toFixed(1) + 'vw';
  glowL.style.width = glowR.style.width = w;
}

function drawWave(t) {
  const W = canvas.width, H = canvas.height;
  const b = smoothMain(getBands(40));
  const pts = [];
  for (let i = b.length - 1; i >= 0; i--) pts.push(b[i]);
  for (let i = 0; i < b.length; i++) pts.push(b[i]);
  const [c1, c2] = palette(t);

  const layer = (amp, alpha, phase, stroke) => {
    const n = pts.length;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
      const wob = 0.85 + 0.15 * Math.sin(t / 520 + i * 0.33 + phase);
      xs.push((i / (n - 1)) * W);
      ys.push(H - (0.035 + pts[i] * amp * wob) * H * 0.95);
    }
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, ys[0]);
    for (let i = 0; i < n - 1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
    ctx.lineTo(W, ys[n - 1]);
    ctx.lineTo(W, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, c2); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fill();
    if (stroke) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
      ctx.strokeStyle = g;
      ctx.shadowBlur = 16;
      ctx.shadowColor = c1;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  };
  layer(1.0, 0.22, 2.1, false);
  layer(0.78, 0.35, 1.0, false);
  layer(0.55, 0.75, 0, true);
  ctx.globalAlpha = 1;
}

function drawBall(t) {
  const S2 = canvas.width, c = S2 / 2;
  const b = smoothMain(getBands(60));
  const [c1, c2] = palette(t);

  let bass = 0;
  for (let i = 0; i < 6; i++) bass += b[i];
  bass /= 6;

  if (bass > bassAvg * 1.3 + 0.07 && t - lastBeat > 170) {
    lastBeat = t;
    const count = 10 + Math.round(bass * 14);
    for (let i = 0; i < count; i++) {
      particles.push({
        a: Math.random() * Math.PI * 2, d: 0,
        sp: S2 * (0.004 + Math.random() * 0.009) * (0.7 + bass),
        life: 1, size: S2 * (0.005 + Math.random() * 0.009),
      });
    }
  }
  bassAvg = bassAvg * 0.94 + bass * 0.06;

  const r = S2 * 0.17 + bass * S2 * 0.05;
  if (isPlaying) spin += 0.004;

  ctx.save();
  ctx.translate(c, c);
  const N = 120;
  ctx.lineCap = 'round';
  ctx.lineWidth = S2 * 0.009;
  for (let i = 0; i < N; i++) {
    const idx = i < N / 2 ? i : N - 1 - i;
    const v = b[Math.floor((idx / (N / 2)) * 59)];
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r0 = r + S2 * 0.028;
    const r1 = r0 + S2 * 0.012 + v * S2 * 0.2;
    ctx.globalAlpha = 0.55 + 0.45 * v;
    ctx.strokeStyle = v > 0.45 ? c2 : c1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
    ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.d += p.sp;
    p.life -= 0.022;
    const dist = r + S2 * 0.03 + p.d;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(Math.cos(p.a) * dist, Math.sin(p.a) * dist, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.shadowBlur = S2 * 0.05 * (0.4 + bass * 1.4);
  ctx.shadowColor = c1;
  ctx.lineWidth = S2 * 0.014;
  ctx.strokeStyle = c1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - S2 * 0.006, 0, Math.PI * 2);
  ctx.clip();
  if (artImg.complete && artImg.naturalWidth) {
    ctx.rotate(spin);
    const d = (r - S2 * 0.006) * 2;
    ctx.drawImage(artImg, -d / 2, -d / 2, d, d);
  } else {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, c2);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(18,18,18,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// bands for the mini player (works while the main window is minimized)
setInterval(() => {
  if (!miniPlayerOpen || !miniNeedsBands() || !analyser) return;
  analyser.getByteFrequencyData(freq);
  const b = smoothMini(getBands(48));
  const [c1, c2] = palette(performance.now());
  ipcRenderer.send('bands', { b: Array.from(b, (v) => Math.round(v * 100) / 100), c1, c2 });
}, 33);

// ================================================================ TRACK → MINI PLAYER
function getTrack() {
  let title = '', artist = '', art = '';
  const ms = navigator.mediaSession && navigator.mediaSession.metadata;
  if (ms) {
    title = ms.title || '';
    artist = ms.artist || '';
    if (ms.artwork && ms.artwork.length) art = ms.artwork[ms.artwork.length - 1].src || '';
  }
  if (!title) {
    const tl = document.querySelector('.playbackSoundBadge__titleLink');
    if (tl) title = tl.getAttribute('title') || tl.textContent.trim();
  }
  if (!artist) {
    const al = document.querySelector('.playbackSoundBadge__lightLink');
    if (al) artist = al.getAttribute('title') || al.textContent.trim();
  }
  if (!art) {
    const sp = document.querySelector('.playbackSoundBadge__avatar span[style*="background-image"]');
    if (sp) {
      const m = sp.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      if (m) art = m[1];
    }
  }
  art = art.replace(/-(t\d+x\d+|large|small|badge|tiny)\./, '-t300x300.');

  const playBtn = document.querySelector('.playControls__play');
  const playing = playBtn
    ? playBtn.classList.contains('playing')
    : !!(navigator.mediaSession && navigator.mediaSession.playbackState === 'playing');

  let progress = 0, cur = 0, dur = 0;
  const pw = document.querySelector('.playbackTimeline__progressWrapper');
  if (pw) {
    cur = parseFloat(pw.getAttribute('aria-valuenow')) || 0;
    dur = parseFloat(pw.getAttribute('aria-valuemax')) || 0;
    if (dur > 0) progress = cur / dur;
  }
  const vs = document.querySelector('.volume__sliderWrapper');
  const vol = vs ? parseFloat(vs.getAttribute('aria-valuenow')) : 1;
  const muted = !!document.querySelector('.volume.muted');
  const tl = document.querySelector('.playbackSoundBadge__titleLink');
  const href = tl ? (tl.getAttribute('href') || '').split('?')[0] : '';
  const url = href.startsWith('/') ? 'https://soundcloud.com' + href : '';
  return {
    title, artist, art, bigArt: bigArt(art), url, playing, progress, cur, dur,
    vol: isNaN(vol) ? 1 : vol, muted, accent: sliderColor(), next: readNextUp(),
  };
}

function bigArt(url) {
  return url ? url.replace(/-(t\d+x\d+|large|small|badge|tiny|crop)\./, '-t500x500.') : '';
}

// ================================================================ SEEK + VOLUME (drive SoundCloud's own controls)
function fakeMouse(target, type, x, y) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window }));
}

function seekBy(sec) {
  const pw = document.querySelector('.playbackTimeline__progressWrapper');
  if (!pw) return;
  seekToTime((parseFloat(pw.getAttribute('aria-valuenow')) || 0) + sec);
}
function seekToTime(sec) {
  const pw = document.querySelector('.playbackTimeline__progressWrapper');
  if (!pw) return;
  const max = parseFloat(pw.getAttribute('aria-valuemax')) || 0;
  if (!max) return;
  const target = Math.max(0, Math.min(max - 0.5, sec));
  const r = pw.getBoundingClientRect();
  if (!r.width) return;
  const x = r.left + r.width * (target / max) + 0.5, y = r.top + r.height / 2;
  fakeMouse(pw, 'mousedown', x, y);
  fakeMouse(document, 'mousemove', x, y);
  fakeMouse(document, 'mouseup', x, y);
}

let volBusy = false, volPending = null;
async function setVolume(p) {
  volPending = Math.max(0, Math.min(1, p));
  if (volBusy) return;
  volBusy = true;
  try {
    while (volPending != null) {
      const want = volPending;
      volPending = null;
      const v = document.querySelector('.volume');
      const sw = document.querySelector('.volume__sliderWrapper');
      if (!v || !sw) break;
      if (v.classList.contains('muted') && want > 0) {
        const spk = document.querySelector('.volume__speakerIcon');
        if (spk) spk.click();
      }
      fakeMouse(v, 'mouseover', 0, 0);
      await sleep(320); // let the slider open
      const bg = document.querySelector('.volume__sliderBackground');
      if (!bg) break;
      let aim = want;
      for (let i = 0; i < 2; i++) { // second pass corrects the small offset of the slider
        const r = bg.getBoundingClientRect();
        if (!r.height) break;
        const x = r.left + r.width / 2, y = r.bottom - r.height * aim;
        fakeMouse(sw, 'mousedown', x, y);
        fakeMouse(document, 'mousemove', x, y);
        fakeMouse(document, 'mouseup', x, y);
        await sleep(40);
        const got = parseFloat(sw.getAttribute('aria-valuenow'));
        if (isNaN(got) || Math.abs(got - want) < 0.015) break;
        aim = Math.max(0, Math.min(1, aim + (want - got)));
      }
      fakeMouse(v, 'mouseout', 0, 0);
      v.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    }
  } finally {
    volBusy = false;
  }
}

function toggleMute() {
  const spk = document.querySelector('.volume__speakerIcon');
  if (spk) spk.click();
}

// ================================================================ BACKGROUND + GLASS

let bgEl = null, bgLayers = [], bgFront = 0, bgShown = '';

function ensureBgEl() {
  if (bgEl && document.body.contains(bgEl)) return;
  bgEl = el('div');
  bgEl.id = 'cc-bg';
  bgLayers = [el('div', 'cc-bgl'), el('div', 'cc-bgl')];
  bgEl.append(...bgLayers);
  document.body.prepend(bgEl);
  bgShown = '';
}

function applyBgVars() {
  const st = document.documentElement.style;
  st.setProperty('--ccx-bg-blur', S.bg.blur + 'px');
  st.setProperty('--ccx-bg-bright', String(1 - S.bg.dim));
  st.setProperty('--ccx-panel', rgbStr(S.theme.bg || '#121212'));
}

function applyBg() {
  if (!document.body) return;
  applyBgVars();
  const root = document.documentElement;
  const url = S.bg.mode === 'song' ? bigArt(artSrc) : S.bg.mode === 'custom' ? IMG.bg.url : '';
  root.classList.toggle('ccx-glass', !!S.bg.glass);
  root.classList.toggle('ccx-bg', S.bg.mode !== 'off');
  if (S.bg.mode === 'off') { stopScene(); return; }
  ensureBgEl();
  if (S.bg.mode === 'scene') { startScene(S.bg.scene); return; }
  stopScene();
  if (!url || url === bgShown) return;
  bgShown = url;
  const img = new Image();
  img.onload = () => {
    if (bgShown !== url) return;
    const next = bgLayers[1 - bgFront];
    next.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    next.classList.add('cc-on');
    bgLayers[bgFront].classList.remove('cc-on');
    bgFront = 1 - bgFront;
  };
  img.src = url;
}

// ================================================================ REPOST / LIKE ANIMATIONS
const REPOST_SVG = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
const HEART_SVG = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

function burst(btn, kind) {
  const r = btn.getBoundingClientRect();
  if (!r.width) return;
  const box = el('div', 'cc-burst cc-burst-' + kind);
  box.style.left = r.left + r.width / 2 + 'px';
  box.style.top = r.top + r.height / 2 + 'px';
  box.append(el('i', 'cc-ring'));
  const n = kind === 'repost' ? 10 : 8;
  for (let i = 0; i < n; i++) {
    const p = el('b', 'cc-part');
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = 26 + Math.random() * 22;
    p.style.setProperty('--dx', Math.cos(a) * d + 'px');
    p.style.setProperty('--dy', Math.sin(a) * d + 'px');
    p.style.animationDelay = Math.random() * 60 + 'ms';
    if (kind === 'like') p.innerHTML = HEART_SVG;
    box.append(p);
  }
  const icon = el('span', 'cc-bicon');
  icon.innerHTML = kind === 'repost' ? REPOST_SVG : HEART_SVG;
  box.append(icon);
  document.body.append(box);
  btn.classList.remove('cc-pop');
  void btn.offsetWidth;
  btn.classList.add('cc-pop');
  setTimeout(() => { box.remove(); btn.classList.remove('cc-pop'); }, 900);
}

// ================================================================ COINS 🪙
// Earned for listening and for activity on SoundCloud. Each like / repost / comment pays once per track per day,
// each follow once per artist, so you can't farm by clicking on and off.
const COINS = (() => {
  const KEY = 'ccx_coins';
  let c;
  try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  c = Object.assign({ total: 0, day: '', today: 0, hours: 0, liked: {}, reposted: {}, commented: {}, followed: {} }, c || {});
  const dayNow = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function roll() {
    const d = dayNow();
    if (c.day !== d) {
      c.day = d; c.today = 0; c.hours = 0;
      c.liked = {}; c.reposted = {}; c.commented = {};
    }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };
  const listeners = [];
  function add(n, why, quiet) {
    roll();
    n = Math.max(0, Math.round(n));
    if (!n) return;
    c.total += n;
    c.today += n;
    save();
    listeners.forEach((f) => f());
    if (!quiet) coinToast(n, why);
  }
  function once(map, key, n, why) {
    roll();
    if (!key || c[map][key]) return false;
    c[map][key] = 1;
    add(n, why);
    return true;
  }
  // 1h 500 · 2h 1500 · 3h 2500 · 4h 3500 · 5h 5000 · after that 5000 + hours × 200
  const hourBonus = (h) => (h === 1 ? 500 : h === 2 ? 1500 : h === 3 ? 2500 : h === 4 ? 3500 : h === 5 ? 5000 : 5000 + h * 200);
  function checkHours(appSecToday) {
    roll();
    const h = Math.floor(appSecToday / 3600);
    while (c.hours < h) {
      c.hours++;
      add(hourBonus(c.hours), c.hours + (c.hours === 1 ? ' hour' : ' hours') + ' in SCX');
    }
  }
  roll();
  return {
    add, once, checkHours, hourBonus,
    total: () => c.total,
    today: () => { roll(); return c.today; },
    onChange: (f) => listeners.push(f),
    ping: () => listeners.forEach((f) => f()),
    // another computer earned more → take the bigger number (never goes down)
    raiseTo(n) { n = Math.floor(Number(n) || 0); if (n > c.total) { c.total = n; save(); listeners.forEach((f) => f()); } },
  };
})();

let coinToastEl = null, coinToastT = 0;
function coinToast(n, why) {
  if (!document.body) return;
  if (!coinToastEl || !document.body.contains(coinToastEl)) {
    coinToastEl = el('div');
    coinToastEl.id = 'cc-coin';
    document.body.append(coinToastEl);
  }
  coinToastEl.textContent = '';
  coinToastEl.append(el('b', null, '+' + n.toLocaleString('en-US') + ' 🪙'), el('span', null, why));
  coinToastEl.classList.remove('cc-show');
  void coinToastEl.offsetWidth;
  coinToastEl.classList.add('cc-show');
  clearTimeout(coinToastT);
  coinToastT = setTimeout(() => coinToastEl.classList.remove('cc-show'), 2600);
}

// which track / artist a button belongs to
function itemKey(btn) {
  if (btn.closest('.playControls, .playbackSoundBadge')) return (lastTrackInfo && lastTrackInfo.url) || 'now:' + (lastTrackInfo && lastTrackInfo.title);
  const box = btn.closest('.soundList__item, .searchList__item, .sound, .soundBadge, .trackItem, .queueItemView, .compactTrackListItem, .userStream__item, .badgeList__item, .systemPlaylistTrackList__item, .trackList__item');
  const a = box && box.querySelector('a.soundTitle__title, .queueItemView__title a, a.trackItem__trackTitle, a.soundBadge__title, a[href^="/"][href*="/"]');
  const href = a && a.getAttribute('href');
  return (href || location.pathname).split('?')[0];
}
function userKey(btn) {
  const box = btn.closest('.userBadge, .userInfoBar, .userItem, .userBadgeListItem, .playbackSoundBadge, .soundBadge, .sound, .soundList__item, .sidebarModule, .userStream__item');
  const a = box && box.querySelector('a[href^="/"]:not([href*="/sets"])');
  const href = a ? a.getAttribute('href') : location.pathname;
  return href.split('?')[0].split('/').filter(Boolean)[0] || '';
}

document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest && e.target.closest('.sc-button-repost, .sc-button-like, .sc-button-follow');
  if (!t) return;
  const kind = t.classList.contains('sc-button-repost') ? 'repost' : t.classList.contains('sc-button-like') ? 'like' : 'follow';
  const was = t.classList.contains('sc-button-selected');
  const key = kind === 'follow' ? userKey(t) : itemKey(t);
  setTimeout(() => {
    const now = t.classList.contains('sc-button-selected');
    if (was === now) return;
    STATS.add(kind === 'like' ? 'likes' : kind === 'repost' ? 'reposts' : 'follows', now ? 1 : -1);
    if (!now) return;
    if (kind === 'like') COINS.once('liked', key, 50, 'Like');
    else if (kind === 'repost') COINS.once('reposted', key, 100, 'Repost');
    else COINS.once('followed', key, 500, 'Follow');
    if (kind !== 'follow' && S.fx[kind]) burst(t, kind);
  }, 250);
}, true);

// comments: Enter in SoundCloud's comment box
function commentSent(form) {
  const key = itemKey(form);
  setTimeout(() => {
    STATS.add('comments');
    COINS.once('commented', key, 250, 'Comment');
  }, 700);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || !e.target || !e.target.closest) return;
  const form = e.target.closest('.commentForm');
  if (!form) return;
  const text = (e.target.value != null ? e.target.value : e.target.textContent || '').trim();
  if (text.length >= 2) commentSent(form);
}, true);
document.addEventListener('submit', (e) => {
  const form = e.target && e.target.closest && e.target.closest('.commentForm');
  const input = form && form.querySelector('input, textarea');
  if (form && input && input.value.trim().length >= 2) commentSent(form);
}, true);

// ================================================================ NEXT UP (read from SoundCloud's queue)
let nextEls = [];
function readNextUp() {
  nextEls = [];
  const box = document.querySelector('.queue__itemsContainer');
  if (!box) return [];
  const rows = [...box.querySelectorAll('.queue__itemWrapper')]
    .map((w) => {
      const m = (w.style.transform || '').match(/translate(?:3d)?\([^,]+,\s*(-?[\d.]+)px/);
      return { w, y: m ? parseFloat(m[1]) : 0 };
    })
    .sort((a, b) => a.y - b.y)
    .map((x) => x.w.querySelector('.queueItemView'))
    .filter(Boolean);
  const ai = rows.findIndex((r) => r.classList.contains('m-active'));
  if (ai < 0) return [];
  const list = [];
  for (const r of rows.slice(ai + 1, ai + 6)) {
    const t = r.querySelector('.queueItemView__title a');
    const u = r.querySelector('.queueItemView__username');
    const sp = r.querySelector('.queueItemView__artwork span');
    let art = '';
    const m = sp && (sp.style.backgroundImage || '').match(/url\(["']?(.*?)["']?\)/);
    if (m) art = m[1].replace(/-(t\d+x\d+|large|small|badge|tiny)\./, '-large.');
    if (!t) continue;
    nextEls.push(r);
    list.push({ title: t.textContent.trim(), artist: u ? u.textContent.trim() : '', art });
  }
  return list;
}

let primedAt = 0, primeTitle = '', primeTries = 0;
async function primeQueue() {
  // SoundCloud only builds the queue list after it was opened once: open + close it invisibly
  const a = document.querySelector('.playbackSoundBadge__showQueue');
  const title = lastTrackInfo ? lastTrackInfo.title : '';
  if (title !== primeTitle) { primeTitle = title; primeTries = 0; }
  if (!a || primeTries >= 3 || Date.now() - primedAt < 20000) return;
  primeTries++;
  primedAt = Date.now();
  const root = document.documentElement;
  root.classList.add('ccx-q-hide');
  a.click();
  await sleep(450);
  a.click();
  await sleep(450);
  root.classList.remove('ccx-q-hide');
  pollTrack();
}

function playNextUp(i) {
  const r = nextEls[i];
  const b = r && r.querySelector('.queueItemView__playButton .sc-button-play:not(.sc-button-pause)');
  if (b) b.click();
  else if (i === 0) { const n = document.querySelector('.playControls__next'); if (n) n.click(); }
}

let nuEl = null, nuKey = '', nuFirst = '';
function renderNextUp(force) {
  if (!document.body) return;
  if (!S.nu.panel) { if (nuEl) { nuEl.remove(); nuEl = null; nuKey = ''; } return; }
  const list = (lastTrackInfo && lastTrackInfo.next) || [];
  const key = JSON.stringify(list) + S.nu.collapsed;
  if (!nuEl || !document.body.contains(nuEl)) {
    nuEl = el('div');
    nuEl.id = 'cc-nu';
    document.body.append(nuEl);
    force = true;
  }
  nuEl.classList.toggle('cc-nu-hidden', !lastTrackInfo || !lastTrackInfo.title);
  if (!force && key === nuKey) return;
  const prevFirst = nuFirst;
  nuKey = key;
  nuFirst = list[0] ? list[0].title : '';
  nuEl.textContent = '';
  nuEl.classList.toggle('cc-nu-collapsed', !!S.nu.collapsed);

  const head = el('div', 'cc-nu-head');
  head.append(el('span', null, 'Next up'), el('small', null, list.length ? String(list.length) : ''));
  const col = el('button', 'cc-nu-col', S.nu.collapsed ? '\uE70D' : '\uE70E');
  col.title = S.nu.collapsed ? 'Show' : 'Hide';
  col.addEventListener('click', () => { S.nu.collapsed = !S.nu.collapsed; saveAll(); renderNextUp(true); });
  head.append(col);
  nuEl.append(head);

  const box = el('div', 'cc-nu-list');
  if (!list.length) box.append(el('div', 'cc-nu-empty', 'Autoplay will pick similar tracks'));
  list.forEach((it, i) => {
    const row = el('button', 'cc-nu-item');
    const art = el('i', 'cc-nu-art');
    if (it.art) art.style.backgroundImage = 'url("' + it.art + '")';
    const txt = el('div', 'cc-nu-txt');
    txt.append(el('b', null, it.title), el('span', null, it.artist));
    row.append(art, txt);
    row.title = 'Play ' + it.title;
    row.addEventListener('click', () => { playNextUp(i); setTimeout(pollTrack, 300); });
    box.append(row);
  });
  // songs moved up one place (track changed) → slide the list up
  if (prevFirst && list[0] && prevFirst !== list[0].title) {
    box.classList.add('cc-nu-shift');
  } else if (force || !prevFirst) {
    box.classList.add('cc-nu-fade');
  }
  nuEl.append(box);
}

let lastSent = '';
let lastTrackInfo = null;
function pollTrack() {
  const tr = getTrack();
  lastTrackInfo = tr;
  isPlaying = tr.playing;
  if (tr.title && !document.querySelector('.queue__itemsContainer .queueItemView')) primeQueue();
  renderNextUp(false);
  if (tr.art && tr.art !== artSrc) {
    artSrc = tr.art;
    artImg.src = tr.art;
    if (S.bg.mode === 'song') applyBg();
  }
  const json = JSON.stringify(tr);
  if (json !== lastSent) {
    lastSent = json;
    ipcRenderer.send('track', tr);
  }
}

ipcRenderer.on('control', (_e, c) => {
  const action = typeof c === 'string' ? c : c.action;
  if (action === 'seek') seekBy(c.value);
  else if (action === 'playNext') playNextUp(c.value);
  else if (action === 'volume') setVolume(c.value);
  else if (action === 'mute') toggleMute();
  else {
    const sel = { prev: '.playControls__prev', play: '.playControls__play', next: '.playControls__next' }[action];
    const btn = sel && document.querySelector(sel);
    if (btn) btn.click();
  }
  setTimeout(pollTrack, 120);
  setTimeout(pollTrack, 450);
});

// ================================================================ THEME SCENES (animated backgrounds)
// Each scene: init(w, h) → state, draw(ctx, w, h, t, state, audio). Everything is drawn in code.
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function starPath(c, x, y, r, inner, rot) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * TAU;
    const rr = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

const SCENES = {
  // 1 ------------------------------------------------------------------
  darkwave: {
    name: 'Dark Wave', emoji: '🌌',
    preset: { accent: '#ff5500', slider: '#ff5500', menu: '#0a0a0a', panel: '#0b0b0b', dim: 0.05 },
    init(w, h) {
      return { parts: Array.from({ length: 90 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.6, 2.2), vy: rand(4, 18), ph: rand(0, TAU) })) };
    },
    draw(c, w, h, t, st, au) {
      const s = t / 1000, bass = au ? au.bass : 0;
      c.fillStyle = '#040404';
      c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h * 0.75, 0, w / 2, h * 0.75, Math.max(w, h) * 0.7);
      g.addColorStop(0, `rgba(255,85,0,${0.16 + bass * 0.25})`);
      g.addColorStop(1, 'rgba(255,85,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (let k = 0; k < 6; k++) {
        const amp = h * (0.06 + k * 0.018) * (1 + bass * 1.4);
        const base = h * (0.58 + k * 0.035);
        c.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = base + Math.sin(x * 0.006 + s * (0.5 + k * 0.12) + k) * amp
            + Math.sin(x * 0.013 - s * 0.7 + k * 2) * amp * 0.35;
          x ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.strokeStyle = `rgba(255,${85 + k * 18},${k * 10},${0.75 - k * 0.11})`;
        c.lineWidth = k === 0 ? 2.4 : 1.4;
        c.shadowColor = '#ff5500';
        c.shadowBlur = k === 0 ? 18 : 0;
        c.stroke();
      }
      c.shadowBlur = 0;
      for (const p of st.parts) {
        p.y -= p.vy * 0.03 * (1 + bass * 2);
        if (p.y < -5) { p.y = h + 5; p.x = rand(0, w); }
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(s * 2 + p.ph));
        c.fillStyle = `rgba(255,${140 + (p.r * 30) | 0},60,${a})`;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, TAU);
        c.fill();
      }
    },
  },

  // 2 ------------------------------------------------------------------
  cyberpunk: {
    name: 'Cyberpunk City', emoji: '🌃',
    preset: { accent: '#ff6a00', slider: '#05d9e8', menu: '#0d0618', panel: '#0f0820', dim: 0.05 },
    init(w, h) {
      const hz = h * 0.64;
      const city = offscreen(w, h);
      const c = city.getContext('2d');
      const sky = c.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, '#05010d'); sky.addColorStop(0.6, '#170a2b'); sky.addColorStop(1, '#3a1240');
      c.fillStyle = sky; c.fillRect(0, 0, w, hz);
      const layers = [['#160b26', 0.25, 0.55], ['#0d0618', 0.45, 0.85], ['#07030d', 0.6, 1]];
      const signs = [];
      for (const [col, minH, maxH] of layers) {
        let x = -20;
        while (x < w) {
          const bw = rand(w * 0.03, w * 0.08), bh = rand(hz * minH * 0.6, hz * maxH * 0.75);
          c.fillStyle = col;
          c.fillRect(x, hz - bh, bw, bh);
          if (col === '#07030d' || col === '#0d0618') {
            for (let wy = hz - bh + 8; wy < hz - 6; wy += 9) {
              for (let wx = x + 4; wx < x + bw - 5; wx += 7) {
                if (Math.random() < 0.22) {
                  c.fillStyle = ['rgba(255,140,60,.8)', 'rgba(5,217,232,.7)', 'rgba(255,42,109,.7)', 'rgba(255,220,150,.6)'][(Math.random() * 4) | 0];
                  c.fillRect(wx, wy, 3, 4);
                }
              }
            }
            if (Math.random() < 0.35 && bh > hz * 0.3) {
              signs.push({
                x: x + bw * 0.2, y: hz - bh + rand(14, bh * 0.4), w: bw * 0.6, h: rand(6, 14),
                col: ['#ff5500', '#ff2a6d', '#05d9e8', '#ff8c1a'][(Math.random() * 4) | 0], ph: rand(0, 10),
              });
            }
          }
          x += bw + rand(0, 6);
        }
      }
      // wet street + reflection
      c.save();
      c.translate(0, hz * 2);
      c.scale(1, -1);
      c.globalAlpha = 0.35;
      c.drawImage(city, 0, 0, w, hz, 0, 0, w, hz);
      c.restore();
      const street = c.createLinearGradient(0, hz, 0, h);
      street.addColorStop(0, 'rgba(10,4,20,.55)'); street.addColorStop(1, 'rgba(3,1,6,.95)');
      c.fillStyle = street; c.fillRect(0, hz, w, h - hz);
      return {
        city, signs, hz,
        rain: Array.from({ length: 260 }, () => ({ x: rand(0, w), y: rand(0, h), l: rand(8, 22), v: rand(9, 16) })),
      };
    },
    draw(c, w, h, t, st, au) {
      c.drawImage(st.city, 0, 0, w, h);
      const s = t / 1000;
      for (const g of st.signs) {
        const on = Math.sin(s * 3 + g.ph) > -0.9 || Math.random() > 0.3;
        c.globalAlpha = on ? 0.95 : 0.25;
        c.shadowColor = g.col; c.shadowBlur = 16;
        c.fillStyle = g.col;
        c.fillRect(g.x, g.y, g.w, g.h);
        c.shadowBlur = 0;
        // reflection on the wet street
        const ry = st.hz + (st.hz - g.y);
        const gr = c.createLinearGradient(0, ry - 10, 0, ry + 60);
        gr.addColorStop(0, g.col); gr.addColorStop(1, 'transparent');
        c.globalAlpha = on ? 0.28 : 0.08;
        c.fillStyle = gr;
        c.fillRect(g.x, ry - 4, g.w, 64);
      }
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(170,200,255,.32)';
      c.lineWidth = 1;
      c.beginPath();
      for (const d of st.rain) {
        d.y += d.v; d.x -= d.v * 0.18;
        if (d.y > h) { d.y = -d.l; d.x = rand(0, w + 60); }
        c.moveTo(d.x, d.y);
        c.lineTo(d.x + d.l * 0.18, d.y - d.l);
      }
      c.stroke();
      const fog = c.createLinearGradient(0, st.hz - 60, 0, st.hz + 40);
      fog.addColorStop(0, 'rgba(255,60,120,0)'); fog.addColorStop(0.5, `rgba(255,70,120,${0.08 + (au ? au.bass * 0.15 : 0)})`); fog.addColorStop(1, 'rgba(255,60,120,0)');
      c.fillStyle = fog; c.fillRect(0, st.hz - 60, w, 100);
    },
  },

  // 3 ------------------------------------------------------------------
  y2k: {
    name: 'Y2K / 2000s', emoji: '🖤',
    preset: { accent: '#9aa4b2', slider: '#dfe3e8', menu: '#141417', panel: '#141417', dim: 0.05 },
    init(w, h) {
      return {
        stars: Array.from({ length: 16 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(10, 42), rot: rand(0, TAU), sp: rand(-0.2, 0.2), ph: rand(0, TAU) })),
        rings: Array.from({ length: 3 }, (_, i) => ({ x: rand(w * 0.15, w * 0.85), y: rand(h * 0.2, h * 0.8), r: rand(60, 140), ph: i * 2 })),
      };
    },
    draw(c, w, h, t, st) {
      const s = t / 1000;
      const bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#000'); bg.addColorStop(0.5, '#2a2a2f'); bg.addColorStop(1, '#060607');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      // grid floor
      c.strokeStyle = 'rgba(200,210,230,.05)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x < w; x += 40) { c.moveTo(x, 0); c.lineTo(x, h); }
      for (let y = 0; y < h; y += 40) { c.moveTo(0, y); c.lineTo(w, y); }
      c.stroke();
      for (const r of st.rings) {
        c.save();
        c.translate(r.x, r.y);
        c.rotate(Math.sin(s * 0.3 + r.ph) * 0.6);
        const g = c.createLinearGradient(-r.r, -r.r, r.r, r.r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#5f6368'); g.addColorStop(0.55, '#e8eaed'); g.addColorStop(1, '#3c4043');
        c.strokeStyle = g; c.lineWidth = 7; c.globalAlpha = 0.5;
        c.beginPath(); c.ellipse(0, 0, r.r, r.r * 0.32, 0, 0, TAU); c.stroke();
        c.restore();
      }
      c.globalAlpha = 1;
      for (const p of st.stars) {
        p.rot += p.sp * 0.02;
        const sc = 0.85 + 0.15 * Math.sin(s * 1.5 + p.ph);
        const r = p.r * sc;
        const g = c.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#9aa0a6'); g.addColorStop(0.5, '#f1f3f4'); g.addColorStop(0.7, '#5f6368'); g.addColorStop(1, '#dadce0');
        c.fillStyle = g;
        c.shadowColor = 'rgba(255,255,255,.5)'; c.shadowBlur = 12;
        starPath(c, p.x, p.y, r, 0.28, p.rot);
        c.fill();
        c.shadowBlur = 0;
      }
      // glossy sheen sweeping across
      const x = ((s * 120) % (w + 800)) - 400;
      const sh = c.createLinearGradient(x, 0, x + 300, h);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.07)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sh; c.fillRect(0, 0, w, h);
    },
  },

  // 4 ------------------------------------------------------------------
  liquid: {
    name: 'Liquid Chrome', emoji: '🌊',
    preset: { accent: '#b8c0cc', slider: '#f1f3f4', menu: '#0b0b0c', panel: '#0c0c0d', dim: 0.1 },
    init() { return {}; },
    draw(c, w, h, t, st, au) {
      const s = t / 1000, bass = au ? au.bass : 0;
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        const base = h * (0.3 + i * 0.09);
        const amp = h * (0.07 + i * 0.01) * (1 + bass * 0.6);
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = base + Math.sin(x * 0.004 + s * (0.25 + i * 0.05) + i * 1.3) * amp
            + Math.sin(x * 0.0091 - s * 0.33 + i) * amp * 0.45;
          c.lineTo(x, y);
        }
        c.lineTo(w, h);
        c.closePath();
        const g = c.createLinearGradient(0, base - amp, 0, base + amp * 2.2);
        g.addColorStop(0, '#f5f5f5'); g.addColorStop(0.12, '#8a8d91'); g.addColorStop(0.3, '#1b1c1e');
        g.addColorStop(0.55, '#c9cdd2'); g.addColorStop(0.8, '#2a2b2e'); g.addColorStop(1, '#050505');
        c.globalAlpha = 0.35 + i * 0.1;
        c.fillStyle = g;
        c.fill();
        c.globalAlpha = 0.5;
        c.strokeStyle = 'rgba(255,255,255,.55)';
        c.lineWidth = 1;
        c.stroke();
      }
      c.globalAlpha = 1;
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)');
      c.fillStyle = v; c.fillRect(0, 0, w, h);
    },
  },

  // 5 ------------------------------------------------------------------
  space: {
    name: 'Space / Saturn', emoji: '🌠',
    preset: { accent: '#e8b04a', slider: '#e8b04a', menu: '#07070d', panel: '#08080f', dim: 0.05 },
    init(w, h) {
      const neb = offscreen(w, h);
      const c = neb.getContext('2d');
      c.globalCompositeOperation = 'lighter';
      for (const [x, y, r, col] of [[0.25, 0.3, 0.5, '90,40,140'], [0.6, 0.2, 0.4, '30,60,150'], [0.4, 0.7, 0.45, '150,50,90'], [0.8, 0.5, 0.35, '40,90,160']]) {
        const g = c.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h) * r);
        g.addColorStop(0, `rgba(${col},.28)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
      return {
        neb,
        stars: Array.from({ length: 420 }, () => ({ x: rand(0, w), y: rand(0, h), r: Math.random() < 0.9 ? rand(0.3, 1.1) : rand(1.2, 2), ph: rand(0, TAU), sp: rand(0.5, 2.5) })),
        shoot: null,
      };
    },
    draw(c, w, h, t, st) {
      const s = t / 1000;
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      c.drawImage(st.neb, Math.sin(s * 0.05) * 20, Math.cos(s * 0.04) * 14, w, h);
      for (const p of st.stars) {
        c.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s * p.sp + p.ph));
        c.fillStyle = '#fff';
        c.fillRect(p.x, p.y, p.r, p.r);
      }
      c.globalAlpha = 1;
      if (!st.shoot && Math.random() < 0.004) st.shoot = { x: rand(0, w * 0.6), y: rand(0, h * 0.4), life: 1 };
      if (st.shoot) {
        const k = st.shoot;
        k.x += 14; k.y += 6; k.life -= 0.03;
        const g = c.createLinearGradient(k.x - 120, k.y - 50, k.x, k.y);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${k.life})`);
        c.strokeStyle = g; c.lineWidth = 2;
        c.beginPath(); c.moveTo(k.x - 120, k.y - 50); c.lineTo(k.x, k.y); c.stroke();
        if (k.life <= 0) st.shoot = null;
      }
      // Saturn
      const R = Math.min(w, h) * 0.15, px = w * 0.82, py = h * 0.7 + Math.sin(s * 0.3) * 6;
      c.save();
      c.translate(px, py);
      c.rotate(-0.38);
      const ring = (from, to) => {
        for (let i = 0; i < 7; i++) {
          c.strokeStyle = `rgba(${220 - i * 8},${185 - i * 10},${130 - i * 8},${0.25 + (i % 3) * 0.12})`;
          c.lineWidth = R * 0.05;
          c.beginPath();
          c.ellipse(0, 0, R * (1.45 + i * 0.09), R * (0.32 + i * 0.02), 0, from, to);
          c.stroke();
        }
      };
      ring(Math.PI, TAU);
      const pg = c.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
      pg.addColorStop(0, '#f3d9a4'); pg.addColorStop(0.6, '#c08a46'); pg.addColorStop(1, '#3a2410');
      c.fillStyle = pg;
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.save();
      c.clip();
      for (let i = -6; i <= 6; i++) {
        c.fillStyle = `rgba(${i % 2 ? '90,55,20' : '255,230,180'},.12)`;
        c.fillRect(-R, i * R * 0.15, R * 2, R * 0.07);
      }
      const shade = c.createLinearGradient(-R, 0, R, 0);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.6)');
      c.fillStyle = shade; c.fillRect(-R, -R, R * 2, R * 2);
      c.restore();
      ring(0, Math.PI);
      c.restore();
    },
  },

  // 6 ------------------------------------------------------------------
  visualizer: {
    name: 'Audio Visualizer', emoji: '🎵', needsAudio: true,
    preset: { accent: '#ff5500', slider: '#ff5500', menu: '#0a0a0a', panel: '#0a0a0a', dim: 0.05 },
    init() { return { sm: new Float32Array(64) }; },
    draw(c, w, h, t, st, au) {
      const s = t / 1000;
      const b = st.sm;
      for (let i = 0; i < 64; i++) {
        const v = au ? au.bands[i] || 0 : 0.18 + 0.12 * Math.sin(s * 1.6 + i * 0.35);
        b[i] += (v - b[i]) * (v > b[i] ? 0.5 : 0.12);
      }
      const bass = (b[0] + b[1] + b[2] + b[3]) / 4;
      c.fillStyle = '#060606'; c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * (0.4 + bass * 0.3));
      g.addColorStop(0, `rgba(255,85,0,${0.12 + bass * 0.3})`); g.addColorStop(1, 'rgba(255,85,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // huge wave (bass in the middle)
      const pts = [];
      for (let i = 47; i >= 0; i--) pts.push(b[i]);
      for (let i = 0; i < 48; i++) pts.push(b[i]);
      for (const [amp, alpha, lw] of [[0.42, 0.18, 0], [0.3, 0.35, 2.5]]) {
        c.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = (i / (pts.length - 1)) * w;
          const y = h / 2 - pts[i] * h * amp * (0.9 + 0.1 * Math.sin(s * 3 + i * 0.3));
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        for (let i = pts.length - 1; i >= 0; i--) {
          const x = (i / (pts.length - 1)) * w;
          c.lineTo(x, h / 2 + pts[i] * h * amp * 0.8);
        }
        c.closePath();
        c.fillStyle = `rgba(255,110,30,${alpha})`;
        c.fill();
        if (lw) { c.strokeStyle = 'rgba(255,140,60,.8)'; c.lineWidth = lw; c.shadowColor = '#ff5500'; c.shadowBlur = 20; c.stroke(); c.shadowBlur = 0; }
      }
      // equalizer bars along the bottom
      const n = 64, bw = w / n;
      for (let i = 0; i < n; i++) {
        const v = b[i];
        const bh = 6 + v * h * 0.22;
        const gr = c.createLinearGradient(0, h - bh, 0, h);
        gr.addColorStop(0, 'rgba(255,170,90,.9)'); gr.addColorStop(1, 'rgba(255,85,0,.25)');
        c.fillStyle = gr;
        c.fillRect(i * bw + bw * 0.18, h - bh, bw * 0.64, bh);
      }
    },
  },

  // 7 ------------------------------------------------------------------
  rainy: {
    name: 'Rainy Window', emoji: '🌧️',
    preset: { accent: '#ffb36b', slider: '#ffb36b', menu: '#0e1018', panel: '#0e1018', dim: 0.05 },
    init(w, h) {
      const bok = offscreen(w, h);
      const c = bok.getContext('2d');
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#070a14'); bg.addColorStop(1, '#141a2a');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.filter = 'blur(' + Math.round(Math.min(w, h) * 0.02) + 'px)';
      for (let i = 0; i < 70; i++) {
        const col = ['255,170,80', '255,90,60', '120,170,255', '255,230,190', '255,120,40'][(Math.random() * 5) | 0];
        const r = rand(10, Math.min(w, h) * 0.06);
        const x = rand(0, w), y = rand(h * 0.35, h * 0.95);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${col},.75)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      }
      c.filter = 'none';
      const st = {
        bok, glass: offscreen(w, h), next: 0,
        drops: Array.from({ length: 260 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(1, 3.4) })),
        slide: Array.from({ length: 22 }, () => ({ x: rand(0, w), y: rand(-h, h), r: rand(2.5, 5), v: rand(0.6, 2.4), tr: [] })),
      };
      return st;
    },
    draw(c, w, h, t, st) {
      const s = t / 1000;
      c.globalAlpha = 0.9 + 0.1 * Math.sin(s * 0.7);
      c.drawImage(st.bok, 0, 0, w, h);
      c.globalAlpha = 1;
      const drop = (x, y, r) => {
        const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(160,180,210,.18)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      };
      if (t > st.next) { // drops slowly appear / dry up
        st.next = t + 400;
        for (let i = 0; i < 6; i++) st.drops[(Math.random() * st.drops.length) | 0] = { x: rand(0, w), y: rand(0, h), r: rand(1, 3.4) };
      }
      for (const d of st.drops) drop(d.x, d.y, d.r);
      for (const d of st.slide) {
        d.v += (Math.random() - 0.5) * 0.15;
        d.v = Math.max(0.3, Math.min(3, d.v));
        d.y += d.v;
        d.x += Math.sin(s * 2 + d.r) * 0.15;
        d.tr.push([d.x, d.y]);
        if (d.tr.length > 40) d.tr.shift();
        if (d.y > h + 10) { d.y = rand(-60, 0); d.x = rand(0, w); d.tr = []; }
        if (d.tr.length > 2) {
          c.strokeStyle = 'rgba(200,215,240,.14)';
          c.lineWidth = d.r * 0.7;
          c.lineCap = 'round';
          c.beginPath();
          d.tr.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.stroke();
        }
        drop(d.x, d.y, d.r);
      }
    },
  },

  // 8 ------------------------------------------------------------------
  underground: {
    name: 'Underground', emoji: '🕸️',
    preset: { accent: '#ff4d00', slider: '#ff4d00', menu: '#050505', panel: '#070707', dim: 0.05 },
    init(w, h) {
      const tex = offscreen(w, h);
      const c = tex.getContext('2d');
      c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 180; i++) {
        const x = rand(0, w), y = rand(0, h), r = rand(20, 160);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${Math.random() < 0.5 ? '30,30,30' : '0,0,0'},.35)`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const noise = offscreen(160, 160);
      const lines = Array.from({ length: 14 }, () => {
        const v = Math.random() < 0.5;
        return { v, p: rand(0, v ? w : h), a: rand(0.15, 0.6), ph: rand(0, TAU), len: rand(0.2, 0.9) };
      });
      return { tex, noise, lines, n: 0, glitch: 0 };
    },
    draw(c, w, h, t, st, au) {
      const s = t / 1000, bass = au ? au.bass : 0;
      c.drawImage(st.tex, 0, 0, w, h);
      // thin orange lines
      for (const l of st.lines) {
        const fl = Math.random() < 0.03 ? 0.1 : 1;
        c.strokeStyle = `rgba(255,77,0,${(l.a * (0.6 + 0.4 * Math.sin(s * 1.3 + l.ph)) + bass * 0.4) * fl})`;
        c.lineWidth = 1;
        c.beginPath();
        if (l.v) { c.moveTo(l.p, h * (1 - l.len) / 2); c.lineTo(l.p, h * (1 + l.len) / 2); }
        else { c.moveTo(w * (1 - l.len) / 2, l.p); c.lineTo(w * (1 + l.len) / 2, l.p); }
        c.stroke();
      }
      // scanline moving down
      const sy = (s * 90) % (h + 40) - 20;
      const sg = c.createLinearGradient(0, sy - 20, 0, sy + 20);
      sg.addColorStop(0, 'rgba(255,77,0,0)'); sg.addColorStop(0.5, 'rgba(255,77,0,.08)'); sg.addColorStop(1, 'rgba(255,77,0,0)');
      c.fillStyle = sg; c.fillRect(0, sy - 20, w, 40);
      // film noise
      if (st.n++ % 3 === 0) {
        const nc = st.noise.getContext('2d');
        const img = nc.createImageData(160, 160);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 22;
        }
        nc.putImageData(img, 0, 0);
      }
      c.fillStyle = c.createPattern(st.noise, 'repeat');
      c.fillRect(0, 0, w, h);
      // rare glitch
      if (st.glitch > 0 || Math.random() < 0.006 + bass * 0.02) {
        st.glitch = st.glitch > 0 ? st.glitch - 1 : 4;
        const y = rand(0, h * 0.9), hh = rand(6, 40);
        c.drawImage(c.canvas, 0, y, w, hh, rand(-30, 30), y, w, hh);
        c.fillStyle = 'rgba(255,0,60,.06)'; c.fillRect(0, y, w, hh);
      }
      // flicker
      if (Math.random() < 0.02) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, w, h); }
    },
  },
};
const SCENE_ORDER = ['darkwave', 'cyberpunk', 'y2k', 'liquid', 'space', 'visualizer', 'rainy', 'underground'];

// ---- scene player (runs inside the background layer)
let sceneCv = null, sceneCx = null, sceneSt = null, sceneName = '', sceneRaf = 0, sceneLast = 0;
const sceneAudio = { bands: new Float32Array(64), bass: 0 };
const smoothScene = makeSmoother(64);

function sceneSize() {
  const k = 0.6; // render smaller, stretch with CSS → fast
  return [Math.max(320, Math.round(innerWidth * k)), Math.max(200, Math.round(innerHeight * k))];
}

function startScene(name) {
  const sc = SCENES[name];
  if (!sc) return stopScene();
  ensureBgEl();
  if (!sceneCv || !bgEl.contains(sceneCv)) {
    sceneCv = el('canvas', 'cc-bgl cc-scene');
    bgEl.append(sceneCv);
    sceneCx = sceneCv.getContext('2d');
  }
  const [w, h] = sceneSize();
  if (name !== sceneName || sceneCv.width !== w || sceneCv.height !== h) {
    sceneCv.width = w; sceneCv.height = h;
    sceneSt = sc.init(w, h);
    sceneName = name;
  }
  sceneCv.classList.add('cc-on');
  bgLayers.forEach((l) => l.classList.remove('cc-on'));
  bgShown = '';
  if (sc.needsAudio) ensureAudio();
  if (!sceneRaf) sceneRaf = requestAnimationFrame(sceneFrame);
}

function stopScene() {
  if (sceneRaf) cancelAnimationFrame(sceneRaf);
  sceneRaf = 0;
  if (sceneCv) sceneCv.classList.remove('cc-on');
  sceneName = '';
}

function sceneFrame(t) {
  sceneRaf = requestAnimationFrame(sceneFrame);
  if (document.hidden || t - sceneLast < 33) return; // ~30 fps is plenty for a background
  sceneLast = t;
  const sc = SCENES[sceneName];
  if (!sc || !sceneCx) return;
  const [w, h] = sceneSize();
  if (sceneCv.width !== w || sceneCv.height !== h) { sceneCv.width = w; sceneCv.height = h; sceneSt = sc.init(w, h); }
  let au = null;
  if (analyser) {
    analyser.getByteFrequencyData(freq);
    const b = smoothScene(getBands(64));
    sceneAudio.bands = b;
    sceneAudio.bass = (b[0] + b[1] + b[2] + b[3]) / 4;
    au = sceneAudio;
  }
  sceneCx.save();
  sc.draw(sceneCx, w, h, t, sceneSt, au);
  sceneCx.restore();
}

// small still picture of a scene for the theme cards
function sceneThumb(name, w = 192, h = 108) {
  const cv = offscreen(w, h);
  const sc = SCENES[name];
  try {
    const st = sc.init(w, h);
    const c = cv.getContext('2d');
    for (let i = 0; i < 4; i++) { c.save(); sc.draw(c, w, h, 2200 + i * 33, st, null); c.restore(); }
  } catch {}
  return cv;
}

function applyPreset(name) {
  const sc = SCENES[name];
  if (!sc) return;
  const p = sc.preset;
  S.theme.accent = p.accent;
  S.theme.slider = p.slider;
  S.theme.bg = p.panel;
  S.menu.bg = p.menu;
  S.viz.custom = p.accent;
  S.viz.color = 'custom';
  S.bg = Object.assign({}, S.bg, { mode: 'scene', scene: name, blur: 0, dim: p.dim, glass: true });
  saveAll();
  applyCSS();
  applyBg();
  refreshPanel();
  toast(sc.emoji + ' ' + sc.name + ' theme on');
}

// ================================================================ SCX BEAT (osu!-style mini game, beat maps)
// 1. Listen to a song once → SCX records where the beats are and saves a beat map.
// 2. Play the map: the song starts from the beginning, circles come exactly on the recorded beats.
//    Tap circles: aim + press the key (A S D W E Q) or click M1 / M2. Hold circles: press and keep holding.
const GAME_DIFF = {
  easy:   { label: 'Easy',   approach: 1.25, r: 58, thr: 0.45, every: 2, holds: 0.3, win: [100, 170, 240] },
  normal: { label: 'Normal', approach: 0.95, r: 50, thr: 0.28, every: 1, holds: 0.28, win: [80, 140, 200] },
  hard:   { label: 'Hard',   approach: 0.7,  r: 42, thr: 0.18, every: 0.5, holds: 0.22, win: [60, 110, 160] },
};
const GAME_KEYS = {
  all:   ['A', 'S', 'D', 'W', 'E', 'Q', 'M1', 'M2'],
  keys:  ['A', 'S', 'D', 'W', 'E', 'Q'],
  mouse: ['M1', 'M2'],
};
const CODE_TO_KEY = { KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyW: 'W', KeyE: 'E', KeyQ: 'Q', Space: 'SPACE' };

// ---- exact song clock from the page's audio player (sent by the main-world script ~20× a second)
const SONG = { t: 0, d: 0, p: false, at: 0 };
addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== window || !d || d.__ccx !== 'clock') return;
  SONG.t = Number(d.t) || 0;
  SONG.d = Number(d.d) || 0;
  SONG.p = !!d.p;
  SONG.at = performance.now();
});
// backup clock: the moment SoundCloud's progress bar ticks to a new second is an exact time mark
const ARIA = { v: -1, at: 0, max: 0 };
setInterval(() => {
  const pw = document.querySelector('.playbackTimeline__progressWrapper');
  if (!pw) return;
  const v = parseFloat(pw.getAttribute('aria-valuenow'));
  ARIA.max = parseFloat(pw.getAttribute('aria-valuemax')) || ARIA.max;
  if (!isNaN(v) && v !== ARIA.v) { ARIA.v = v; ARIA.at = performance.now(); }
}, 25);
const clockLive = () => performance.now() - SONG.at < 400;
function songNow() {
  if (clockLive()) return SONG.t + (SONG.p ? Math.min(0.25, (performance.now() - SONG.at) / 1000) : 0);
  if (ARIA.v < 0) return 0;
  const b = document.querySelector('.playControls__play');
  const playing = !!(b && b.classList.contains('playing'));
  return ARIA.v + (playing ? Math.min(1.2, (performance.now() - ARIA.at) / 1000) : 0);
}
const songDur = () => (clockLive() && SONG.d) || ARIA.max || SONG.d || 0;
const songPlaying = () => (clockLive() ? SONG.p : !!(document.querySelector('.playControls__play.playing')));

function gameAudio() {
  if (gameAn && gameFreq) { gameAn.getByteFrequencyData(gameFreq); return gameFreq; }
  if (analyser && freq) { analyser.getByteFrequencyData(freq); return freq; }
  return null;
}

// ---- beat maps live in IndexedDB (store "maps", key = track link)
const MAPS = {
  list: [],
  async load() { try { this.list = (await IDB.all('maps')) || []; } catch { this.list = []; } this.list.sort((a, b) => b.created - a.created); return this.list; },
  get(url) { return this.list.find((m) => m.url === url && !m.custom) || null; },
  own(url) { return this.list.find((m) => m.url === url && m.custom) || null; },
  async save(m) { await IDB.putIn('maps', m.id || m.url, m); await this.load(); },
  async remove(m) { await IDB.delIn('maps', m.id || m.url); await this.load(); },
};

// ================================================================ RECORDING
const REC = { on: false, url: '', meta: null, dur: 0, env: null, en: null, cov: null, prevE: 0, timer: 0, progress: 0 };

async function startRecording() {
  const tr = lastTrackInfo || {};
  if (!tr.url || !tr.title) return toast('Play a song first');
  if (REC.on) return;
  if (!(await ensureAudio())) return toast('SCX can\'t hear the music — check that Visual → Wave works');
  const dur = tr.dur || songDur();
  if (!dur || dur < 20) return toast('This song is too short');
  if (dur > 20 * 60) return toast('Songs longer than 20 minutes can\'t be recorded');
  Object.assign(REC, {
    on: true, url: tr.url, dur, prevE: 0, progress: 0,
    meta: { url: tr.url, title: tr.title, artist: tr.artist, art: tr.art },
    env: new Float32Array(Math.ceil(dur * 100) + 20),
    en: new Float32Array(Math.ceil(dur * 20) + 10),
    cov: new Uint8Array(Math.ceil(dur) + 2),
  });
  clearInterval(REC.timer);
  REC.timer = setInterval(recTick, 10);
  paintRecPill();
  refreshPanel();
}

function recProgress() {
  let c = 0;
  const n = Math.ceil(REC.dur);
  for (let x = 0; x < n; x++) c += REC.cov[x];
  REC.progress = c / n;
  paintRecPill();
  const t = songNow();
  const atEnd = t >= REC.dur - 1;
  if (REC.progress >= 0.97 || (atEnd && REC.progress >= 0.85)) stopRecording(false);
}

function recTick() {
  if (!REC.on) return;
  const tr = lastTrackInfo || {};
  if (tr.url !== REC.url) return stopRecording(true);
  const now = performance.now();
  if (now - (REC.checked || 0) > 300) { REC.checked = now; recProgress(); if (!REC.on) return; }
  if (!songPlaying()) return;
  const f = gameAudio();
  if (!f) return;
  const t = songNow();
  const bins = gameAn ? 7 : 10;
  let e = 0;
  for (let i = 1; i <= bins; i++) e += f[i];
  e /= bins * 255;
  const flux = Math.max(0, e - REC.prevE);
  REC.prevE = e;
  const i = Math.round(t * 100);
  if (i >= 0 && i < REC.env.length) REC.env[i] = Math.max(REC.env[i], flux);
  const j = Math.floor(t * 20);
  if (j >= 0 && j < REC.en.length) REC.en[j] = Math.max(REC.en[j], e);
  const k = Math.floor(t);
  if (k >= 0 && k < REC.cov.length) REC.cov[k] = 1;
}

async function stopRecording(cancelledByUser) {
  if (!REC.on) return;
  REC.on = false;
  clearInterval(REC.timer);
  paintRecPill();
  maybeReleaseAudio();
  if (REC.progress < 0.85) {
    toast('Recording stopped — listened to only ' + Math.round(REC.progress * 100) + '% of the song');
    refreshPanel();
    return;
  }
  try {
    const map = buildMap(REC);
    if (!map) throw new Error('No clear beat found in this song');
    await MAPS.save(map);
    toast('🎮 Beat map ready: ' + map.title + ' · ' + Math.round(map.bpm) + ' BPM', 'Play', () => startMapGame(map), 8000);
  } catch (e) {
    toast(e.message || 'Could not make a beat map');
  }
  refreshPanel();
}

// small "● REC" pill so you always see that recording is on
let recPill = null;
function paintRecPill() {
  if (!document.body) return;
  if (!recPill || !document.body.contains(recPill)) {
    recPill = el('button');
    recPill.id = 'cc-rec';
    recPill.addEventListener('click', () => { togglePanel(true); activeTab = 'Game'; refreshPanel(); });
    document.body.append(recPill);
  }
  recPill.classList.toggle('cc-show', REC.on);
  if (REC.on) recPill.textContent = '● REC ' + Math.round(REC.progress * 100) + '%  ·  ' + ((REC.meta && REC.meta.title) || '');
}

// ---- turning the recording into beats
function buildMap(rec) {
  const SR = 100, env = rec.env, N = env.length;
  const a = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = env[i];
    if (!v) continue;
    for (let k = -4; k <= 4; k++) {
      const x = i + k;
      if (x >= 0 && x < N) a[x] = Math.max(a[x], v * Math.max(0, 1 - Math.abs(k) / 4.5));
    }
  }
  // strength scale: 90th percentile of real hits
  const hits = Array.from(env).filter((v) => v > 0.01).sort((x, y) => x - y);
  if (hits.length < 30) return null;
  const p90 = hits[Math.floor(hits.length * 0.9)] || hits[hits.length - 1];
  let mean = 0;
  for (let i = 0; i < N; i++) mean += a[i];
  mean /= N;
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) b[i] = Math.max(0, a[i] - mean);
  // tempo over the whole song (60–180 BPM, gently preferring ~120)
  const corr = new Float32Array(101);
  let best = 0, bestL = 0;
  for (let L = 33; L <= 100; L++) {
    let c = 0;
    for (let i = L; i < N; i++) c += b[i] * b[i - L];
    corr[L] = c;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(L / 50), 2));
    if (c * w > best) { best = c * w; bestL = L; }
  }
  if (!bestL) return null;
  if (bestL >= 66) {
    const h = Math.round(bestL / 2);
    if (Math.max(corr[h - 1], corr[h], corr[h + 1]) > corr[bestL] * 0.6) bestL = corr[h - 1] > corr[h] ? h - 1 : corr[h + 1] > corr[h] ? h + 1 : h;
  }
  let L = bestL;
  if (bestL > 33 && bestL < 100) {
    const y0 = corr[bestL - 1], y1 = corr[bestL], y2 = corr[bestL + 1], d = y0 - 2 * y1 + y2;
    if (d < 0) L = bestL + (0.5 * (y0 - y2)) / d;
  }
  const P = L / SR;
  const at = (t) => a[Math.round(t * SR)] || 0;
  const peakNear = (t, w) => {
    let bi = -1, bv = 0;
    for (let i = Math.round((t - w) * SR); i <= Math.round((t + w) * SR); i++) if (a[i] > bv) { bv = a[i]; bi = i; }
    return { t: bi / SR, v: bv };
  };
  const strength = (t) => { let m = 0; for (let i = Math.round(t * SR) - 4; i <= Math.round(t * SR) + 4; i++) m = Math.max(m, env[i] || 0); return Math.min(1.5, m / p90); };
  const enMed = (() => { const s = Array.from(rec.en).filter((v) => v > 0).sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0.1; })();
  const energy = (t) => Math.min(3, (rec.en[Math.floor(t * 20)] || 0) / enMed);
  // where in the beat cycle the hits fall around time t (circular average of the hits within ±2 beats)
  const strongHit = p90 * 0.35;
  const phaseShift = (t) => {
    let sx = 0, sy = 0;
    for (let i = Math.max(0, Math.round((t - 2 * P) * SR)); i <= Math.min(N - 1, Math.round((t + 2 * P) * SR)); i++) {
      const v = env[i];
      if (v < strongHit) continue;
      const ang = (2 * Math.PI * (i / SR - t)) / P;
      sx += Math.cos(ang) * v;
      sy += Math.sin(ang) * v;
    }
    if (!sx && !sy) return null;
    return (Math.atan2(sy, sx) / (2 * Math.PI)) * P; // −P/2 … +P/2
  };
  // first beat: first strong hit, then walk through the song beat by beat, re-centering on the real hits
  let t = 0.3;
  while (t < rec.dur && (env[Math.round(t * SR)] || 0) < strongHit) t += 0.01;
  if (t >= rec.dur) return null;
  const beats = [];
  while (t < rec.dur - 0.1) {
    const d = phaseShift(t);
    if (d != null) t += d * 0.7;
    beats.push([+t.toFixed(3), +strength(t).toFixed(2), +energy(t).toFixed(2)]);
    t += P;
  }
  const halfs = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const th = (beats[i][0] + beats[i + 1][0]) / 2;
    halfs.push([+th.toFixed(3), +strength(th).toFixed(2)]);
  }
  return {
    v: 1, app: 'SoundCloudX', type: 'beatmap',
    url: rec.meta.url, title: rec.meta.title, artist: rec.meta.artist || '', art: rec.meta.art || '',
    dur: +rec.dur.toFixed(2), bpm: +(60 / P).toFixed(1), beats, halfs, created: Date.now(), best: {},
  };
}

// ---- beats → notes for a difficulty (always the same for the same song + difficulty)
function seededRng(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let x = h;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNotes(map, diffKey, keys) {
  const D = GAME_DIFF[diffKey] || GAME_DIFF.normal;
  const rng = seededRng((map.id || map.url) + '|' + diffKey + '|' + keys.join(''));
  const P = 60 / (map.bpm || 120);
  if (map.custom) return placeNotes((map.notes || []).map((n) => ({ t: n[0], end: n[1] || 0 })), keys, rng);
  let cand = map.beats.filter((b) => b[1] >= D.thr && b[2] > 0.25).map((b) => ({ t: b[0], e: b[2] }));
  if (diffKey === 'hard') cand = cand.concat(map.halfs.filter((h) => h[1] >= 0.55).map((h) => ({ t: h[0], e: 1 })));
  cand.sort((x, y) => x.t - y.t);
  const minGap = P * D.every * 0.95;
  const notes = [];
  for (const c of cand) {
    if (c.t < 1.5) continue; // give the player a moment at the start
    if (notes.length && c.t - notes[notes.length - 1].t < minGap) continue;
    notes.push({ t: c.t, e: c.e });
  }
  // holds: sometimes a note becomes a HOLD that lasts 2–3 beats (the notes it covers are left out)
  const out = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    out.push(n);
    const gap = (i + 1 < notes.length ? notes[i + 1].t : Infinity) - n.t;
    if (n.e < 0.8) continue;
    if (gap >= P * 1.9 && rng() < D.holds) {
      n.end = n.t + Math.max(P * 0.9, Math.min(gap - P * 0.55, P * 4));
    } else if (rng() < D.holds * 0.45) {
      n.end = n.t + (rng() < 0.5 ? 2 : 3) * P * 0.92;
      while (i + 1 < notes.length && notes[i + 1].t < n.end + P * 0.45) i++;
    }
  }
  return placeNotes(out, keys, rng);
}

// positions (0..1 of the play area) flowing from one to the next; taps get a key, holds are always SPACE
function placeNotes(notes, keys, rng) {
  let x = 0.5, y = 0.5, num = 0;
  for (const n of notes) {
    const a = rng() * Math.PI * 2, d = 0.12 + rng() * 0.22;
    x = Math.max(0.06, Math.min(0.94, x + Math.cos(a) * d));
    y = Math.max(0.08, Math.min(0.92, y + Math.sin(a) * d * 1.4));
    n.x = x; n.y = y;
    n.key = n.end ? 'SPACE' : keys[Math.floor(rng() * keys.length)];
    n.num = (num = (num % 9) + 1);
  }
  return notes;
}

// ================================================================ PLAYING
const G = {
  on: false, el: null, cv: null, cx: null, bgEl: null, hud: {}, raf: 0, res: null,
  map: null, notes: [], next: 0, circles: [], fx: [], trail: [], mouse: { x: 0, y: 0 }, down: new Set(),
  score: 0, shownScore: 0, combo: 0, maxCombo: 0, hits: { 300: 0, 100: 0, 50: 0, miss: 0 },
  diff: GAME_DIFF.normal, diffKey: 'normal', keys: GAME_KEYS.all, pulse: 0, beatI: 0, hitCtx: null,
  phase: 'off', countEnd: 0, fr: 0, lastT: 0,
};

const gameT = () => (G.mode === 'live' ? liveT() : songNow() + (Number(S.game.offset) || 0) / 1000);

function buildGameUi() {
  if (G.el && document.body.contains(G.el)) return;
  G.el = el('div');
  G.el.id = 'cc-game';
  G.bgEl = el('div', 'cg-bg');
  G.cv = el('canvas', 'cg-cv');
  G.cx = G.cv.getContext('2d');
  const hud = el('div', 'cg-hud');
  const song = el('div', 'cg-song');
  G.hud.art = el('i', 'cg-art');
  const st = el('div', 'cg-songtxt');
  G.hud.title = el('b');
  G.hud.artist = el('span');
  st.append(G.hud.title, G.hud.artist);
  song.append(G.hud.art, st);
  const right = el('div', 'cg-right');
  G.hud.score = el('div', 'cg-score', '0');
  G.hud.acc = el('div', 'cg-acc', '100.00%');
  right.append(G.hud.score, G.hud.acc);
  G.hud.combo = el('div', 'cg-combo', '');
  G.hud.msg = el('div', 'cg-msg', '');
  G.hud.bar = el('div', 'cg-progress');
  G.hud.bar.append(el('i'));
  const hint = el('div', 'cg-hint', 'Aim with the mouse  •  press the key on the circle (A S D W E Q) or click M1 / M2  •  HOLD circles: hold SPACE  •  Esc to stop');
  hud.append(song, right, G.hud.combo, G.hud.msg, G.hud.bar, hint);
  G.res = el('div', 'cg-results');
  G.el.append(G.bgEl, G.cv, hud, G.res);
  document.body.append(G.el);

  G.el.addEventListener('mousemove', (e) => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
  G.el.addEventListener('mousedown', (e) => {
    if (!G.on || G.res.classList.contains('cg-show')) return;
    e.preventDefault();
    const k = e.button === 2 ? 'M2' : e.button === 0 ? 'M1' : '';
    if (!k) return;
    G.down.add(k);
    gameInput(k);
  });
  G.el.addEventListener('mouseup', (e) => { G.down.delete(e.button === 2 ? 'M2' : 'M1'); });
  G.el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function sizeGameCanvas() {
  const dpr = window.devicePixelRatio || 1;
  G.cv.width = Math.round(innerWidth * dpr);
  G.cv.height = Math.round(innerHeight * dpr);
  G.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function playBtn() { return document.querySelector('.playControls__play'); }
const isPlayingNow = () => { const b = playBtn(); return !!(b && b.classList.contains('playing')); };

async function startMapGame(map) {
  if (!map) return;
  buildGameUi();
  togglePanel(false);
  G.diffKey = GAME_DIFF[S.game.diff] ? S.game.diff : 'normal';
  G.diff = GAME_DIFF[G.diffKey];
  G.keys = GAME_KEYS[S.game.keys] || GAME_KEYS.all;
  Object.assign(G, {
    on: true, map, notes: makeNotes(map, G.diffKey, G.keys), next: 0, circles: [], fx: [], trail: [], down: new Set(),
    score: 0, shownScore: 0, combo: 0, maxCombo: 0, hits: { 300: 0, 100: 0, 50: 0, miss: 0 }, beatI: 0, phase: 'load', lastT: 0,
  });
  G.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  G.res.classList.remove('cg-show');
  G.res.textContent = '';
  G.el.style.setProperty('--acc', accentColor());
  G.el.style.setProperty('--acc2', lighten(accentColor(), 0.45));
  G.el.classList.add('cg-on');
  document.documentElement.classList.add('ccx-game');
  sizeGameCanvas();
  G.mode = 'map';
  gameLiveOn = false;
  G.hud.title.textContent = map.title + (map.custom ? '  ✏️' : '');
  G.hud.artist.textContent = map.artist + '  ·  ' + Math.round(map.bpm || 0) + ' BPM  ·  ' + G.diff.label;
  const big = bigArt(map.art);
  G.bgEl.style.backgroundImage = big && safeImg(big) ? cssUrl(big) : '';
  G.hud.art.style.backgroundImage = map.art && safeImg(map.art) ? cssUrl(map.art) : '';
  G.hud.msg.textContent = 'Loading the song…';
  if (!G.raf) G.raf = requestAnimationFrame(gameFrame);

  // open the song, rewind to the start, count down, play
  if (!lastTrackInfo || lastTrackInfo.url !== map.url) {
    goSoundCloud(map.url);
    const path = new URL(map.url).pathname;
    await waitFor(() => location.pathname === path, 7000);
    const hero = await waitFor(() => document.querySelector('.l-listen-hero .sc-button-play, .fullHero__playButton .sc-button-play, .listenHero .sc-button-play'), 7000);
    if (hero) hero.click();
    await waitFor(() => { pollTrack(); return lastTrackInfo && lastTrackInfo.url === map.url; }, 8000);
  }
  if (!G.on) return;
  if (!lastTrackInfo || lastTrackInfo.url !== map.url) { G.hud.msg.textContent = 'Could not open this song'; return; }
  // countdown starts right away; pause + rewind happen during it
  G.phase = 'count';
  G.countEnd = performance.now() + 2500;
  if (isPlayingNow()) playBtn().click();
  setTimeout(() => seekBy(-1e6), 150);
}

// ================================================================ REAL TIME mode (no map: circles follow the beat live)
async function startLiveGame() {
  const tr = lastTrackInfo || {};
  if (!tr.title || !tr.playing) return toast('Play a song first');
  if (!(await ensureAudio())) return toast('SCX can\'t hear the music — check that Visual → Wave works');
  buildGameUi();
  togglePanel(false);
  G.diffKey = GAME_DIFF[S.game.diff] ? S.game.diff : 'normal';
  G.diff = GAME_DIFF[G.diffKey];
  G.keys = GAME_KEYS[S.game.keys] || GAME_KEYS.all;
  Object.assign(G, {
    on: true, mode: 'live', map: { url: tr.url, title: tr.title, artist: tr.artist, art: tr.art, dur: 0, beats: [], best: {} },
    notes: [], next: 0, circles: [], fx: [], trail: [], down: new Set(), last: null,
    score: 0, shownScore: 0, combo: 0, maxCombo: 0, hits: { 300: 0, 100: 0, 50: 0, miss: 0 }, beatI: 0,
    env: [], prevE: 0, loud: 0, period: 0, anchor: 0, conf: 0, lastAnalyze: 0, lastPlanned: -1, hasBeat: false,
    phase: 'count', countEnd: performance.now() + 2500, t0: performance.now() / 1000,
  });
  gameLiveOn = true;
  G.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  G.res.classList.remove('cg-show');
  G.res.textContent = '';
  G.el.style.setProperty('--acc', accentColor());
  G.el.style.setProperty('--acc2', lighten(accentColor(), 0.45));
  G.el.classList.add('cg-on');
  document.documentElement.classList.add('ccx-game');
  sizeGameCanvas();
  G.hud.title.textContent = tr.title + '  ⚡';
  G.hud.artist.textContent = (tr.artist || '') + '  ·  Real time  ·  ' + G.diff.label;
  const big = bigArt(tr.art);
  G.bgEl.style.backgroundImage = big && safeImg(big) ? cssUrl(big) : '';
  G.hud.art.style.backgroundImage = tr.art && safeImg(tr.art) ? cssUrl(tr.art) : '';
  if (!G.raf) G.raf = requestAnimationFrame(gameFrame);
}
const liveT = () => performance.now() / 1000 - G.t0;

function liveAnalyze(t) {
  const f = gameAudio();
  if (!f) return;
  const bins = gameAn ? 7 : 10;
  let e = 0;
  for (let i = 1; i <= bins; i++) e += f[i];
  e /= bins * 255;
  const flux = Math.max(0, e - G.prevE);
  G.prevE = e;
  G.loud = G.loud * 0.97 + e * 0.03;
  G.pulse = Math.max(G.pulse, Math.min(1, flux * 6 + e * 0.3));
  G.env.push([t, flux]);
  while (G.env.length && G.env[0][0] < t - 9) G.env.shift();
  if (t - G.lastAnalyze < 0.4 || !G.env.length || t - G.env[0][0] < 3) return;
  G.lastAnalyze = t;
  const SR = 100, span = Math.min(8.5, t - G.env[0][0]), N = Math.floor(span * SR), t0 = t - span;
  const a = new Float32Array(N);
  for (const [ti, fl] of G.env) {
    const x = (ti - t0) * SR, i0 = Math.round(x);
    for (let k = -4; k <= 4; k++) { const i = i0 + k; if (i >= 0 && i < N) a[i] = Math.max(a[i], fl * Math.max(0, 1 - Math.abs(i - x) / 4.5)); }
  }
  let mean = 0;
  for (let i = 0; i < N; i++) mean += a[i];
  mean /= N || 1;
  let c0 = 0;
  for (let i = 0; i < N; i++) { a[i] = Math.max(0, a[i] - mean); c0 += a[i] * a[i]; }
  if (c0 <= 1e-6) { G.conf = 0; return; }
  const corr = new Float32Array(101);
  let best = 0, bestL = 0;
  for (let L = 33; L <= 100; L++) {
    let c = 0;
    for (let i = L; i < N; i++) c += a[i] * a[i - L];
    corr[L] = c;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(L / 50), 2));
    if (c * w > best) { best = c * w; bestL = L; }
  }
  if (!bestL) return;
  if (bestL >= 66) { const h = Math.round(bestL / 2); if (Math.max(corr[h - 1], corr[h], corr[h + 1]) > corr[bestL] * 0.6) bestL = h; }
  let L = bestL;
  if (bestL > 33 && bestL < 100) { const y0 = corr[bestL - 1], y1 = corr[bestL], y2 = corr[bestL + 1], d = y0 - 2 * y1 + y2; if (d < 0) L = bestL + (0.5 * (y0 - y2)) / d; }
  const P = L / SR;
  if (G.period) {
    const r = P / G.period;
    if (Math.abs(r - 1) < 0.08) G.period = G.period * 0.8 + P * 0.2;
    else if (!(Math.abs(r - 2) < 0.15 || Math.abs(r - 0.5) < 0.08) && corr[bestL] / c0 > 0.3) G.period = P;
  } else G.period = P;
  G.conf = G.conf * 0.6 + (corr[bestL] / c0) * 0.4;
  let peak = 0;
  for (const [ti, fl] of G.env) if (ti > t - 3) peak = Math.max(peak, fl);
  let sx = 0, sy = 0;
  for (const [ti, fl] of G.env) {
    if (ti <= t - 3 || fl < peak * 0.35) continue;
    const ang = (2 * Math.PI * ti) / G.period;
    sx += Math.cos(ang) * fl; sy += Math.sin(ang) * fl;
  }
  if (!sx && !sy) return;
  const ph = (Math.atan2(sy, sx) / (2 * Math.PI)) * G.period;
  const lastBeat = ph + Math.floor((t - ph) / G.period) * G.period;
  if (!G.anchor) G.anchor = lastBeat;
  else {
    let d = (lastBeat - G.anchor) % G.period;
    if (d > G.period / 2) d -= G.period;
    if (d < -G.period / 2) d += G.period;
    G.anchor = lastBeat - d * 0.5;
  }
}

function liveSchedule(t) {
  const D = G.diff;
  if (!G.period || !G.anchor || G.conf < 0.06 || G.loud < 0.04) return false;
  let step = G.period * Math.max(1, D.every);
  if (G.diffKey === 'hard' && G.period > 0.55) step = G.period / 2;
  const k = Math.ceil((t + D.approach - G.anchor) / step);
  const bt = G.anchor + k * step;
  if (bt <= G.lastPlanned + step * 0.6) return true;
  const sz = Math.min(1.2, Math.max(0.75, innerHeight / 900));
  const r = D.r * sz, mx = r + 70, top = 110 + r, bottom = innerHeight - 130 - r;
  let x = 0, y = 0;
  for (let i = 0; i < 12; i++) {
    if (G.last) { const a = Math.random() * Math.PI * 2, dist = r * (2.4 + Math.random() * 3); x = G.last.x + Math.cos(a) * dist; y = G.last.y + Math.sin(a) * dist; }
    else { x = innerWidth / 2; y = innerHeight / 2; }
    x = Math.max(mx, Math.min(innerWidth - mx, x));
    y = Math.max(top, Math.min(bottom, y));
    if (G.circles.every((c) => c.done || Math.hypot(c.x - x, c.y - y) > c.r + r + 8)) break;
  }
  const hold = Math.random() < D.holds * 0.5;
  const end = hold ? bt + step * 2 * 0.92 : 0;
  G.circles.push({ x, y, r, key: hold ? 'SPACE' : G.keys[(Math.random() * G.keys.length) | 0], num: (G.num = ((G.num || 0) % 9) + 1),
    hitT: bt, spawnT: bt - D.approach, approach: D.approach, end, done: false });
  G.last = { x, y };
  G.lastPlanned = hold ? end : bt;
  return true;
}

function stopGame(showResults) {
  if (!G.on) return;
  G.on = false;
  G.phase = 'off';
  G.circles = [];
  if (showResults && G.hits[300] + G.hits[100] + G.hits[50] + G.hits.miss > 0) showGameResults();
  else closeGame();
}

function closeGame() {
  G.on = false;
  G.phase = 'off';
  if (G.raf) cancelAnimationFrame(G.raf);
  G.raf = 0;
  if (G.el) G.el.classList.remove('cg-on');
  if (G.res) G.res.classList.remove('cg-show');
  if (!ED.on) document.documentElement.classList.remove('ccx-game');
  gameLiveOn = false;
  setTimeout(maybeReleaseAudio, 50);
}

function gameAccuracy() {
  const n = G.hits[300] + G.hits[100] + G.hits[50] + G.hits.miss;
  if (!n) return 1;
  return (G.hits[300] * 300 + G.hits[100] * 100 + G.hits[50] * 50) / (n * 300);
}
function gameRank() {
  const a = gameAccuracy();
  if (a === 1) return 'SS';
  if (a >= 0.95 && !G.hits.miss) return 'S';
  if (a >= 0.9) return 'A';
  if (a >= 0.8) return 'B';
  if (a >= 0.7) return 'C';
  return 'D';
}

async function showGameResults() {
  const rank = gameRank();
  const key = G.diffKey;
  const score = Math.round(G.score);
  const mapBest = (G.map.best && G.map.best[key]) || 0;
  const isBest = score > mapBest && G.mode !== 'live';
  if (isBest) {
    G.map.best = Object.assign({}, G.map.best, { [key]: score });
    try { await MAPS.save(G.map); } catch {}
  }
  if (score > (S.game.best[key] || 0)) { S.game.best[key] = score; saveAll(); }
  STATS.addGame();
  const earned = Math.floor(score / 10);
  COINS.add(earned, 'SCX Beat');
  const r = G.res;
  r.textContent = '';
  const card = el('div', 'cg-rcard');
  card.append(
    el('div', 'cg-rtitle', G.map.title + ' — ' + G.diff.label),
    el('div', 'cg-rank cg-rank-' + rank.toLowerCase(), rank),
    el('div', 'cg-rscore', score.toLocaleString('en-US')),
    el('div', 'cg-rbest', (isBest ? '★ New best on this song!' : G.mode === 'live' ? 'Real time' : 'Best: ' + mapBest.toLocaleString('en-US')) + '  ·  +' + earned.toLocaleString('en-US') + ' 🪙')
  );
  const grid = el('div', 'cg-rgrid');
  for (const [k, v] of [['Accuracy', (gameAccuracy() * 100).toFixed(2) + '%'], ['Max combo', 'x' + G.maxCombo],
    ['300', G.hits[300]], ['100', G.hits[100]], ['50', G.hits[50]], ['Miss', G.hits.miss]]) {
    const c = el('div');
    c.append(el('small', null, k), el('b', null, String(v)));
    grid.append(c);
  }
  const btns = el('div', 'cg-rbtns');
  const again = el('button', 'cg-btn cg-primary', 'Play again');
  again.addEventListener('click', () => (G.mode === 'live' ? startLiveGame() : startMapGame(G.map)));
  const close = el('button', 'cg-btn', 'Close');
  close.addEventListener('click', closeGame);
  btns.append(again, close);
  card.append(grid, btns);
  r.append(card);
  r.classList.add('cg-show');
}

// ---- input
function gameInput(k) {
  if (!k || !G.on || G.phase !== 'play') return;
  const t = gameT();
  const w = G.diff.win;
  let target = null;
  for (const c of G.circles) {
    if (c.done || c.holding) continue;
    const d = Math.hypot(G.mouse.x - c.x, G.mouse.y - c.y);
    if (d > c.r * 1.15 || Math.abs(t - c.hitT) * 1000 > w[2]) continue;
    if (!target || c.hitT < target.hitT) target = c;
  }
  if (!target) return;
  if (target.key !== k) {
    judge(target, 'miss');
    if (target.end) judge(target, 'miss', true);
    return;
  }
  const ms = Math.abs(t - target.hitT) * 1000;
  const res = ms <= w[0] ? 300 : ms <= w[1] ? 100 : 50;
  if (target.end) {
    target.holding = true;
    target.headRes = res;
    judge(target, res, false, true);
  } else judge(target, res);
}

addEventListener('keydown', (e) => {
  if (!G.on && !(G.el && G.el.classList.contains('cg-on') && G.res && G.res.classList.contains('cg-show'))) return;
  if (e.key === 'F11') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') {
    if (G.on) stopGame(true); else closeGame();
    return;
  }
  const k = CODE_TO_KEY[e.code] || '';
  if (!k || e.repeat) return;
  G.down.add(k);
  gameInput(k);
}, true);
addEventListener('keyup', (e) => {
  if (!G.on) return;
  e.stopImmediatePropagation();
  const k = CODE_TO_KEY[e.code];
  if (k) G.down.delete(k);
}, true);
addEventListener('blur', () => G.down.clear());

// res: 300 / 100 / 50 / 'miss'. tail = the end of a hold. keep = hold continues (head only)
function judge(c, res, tail, keep) {
  if (!keep) { c.done = true; c.res = res; c.doneAt = performance.now(); }
  if (res === 'miss') {
    G.hits.miss++;
    if (G.combo >= 10) G.fx.push({ kind: 'break', x: c.x, y: c.y, t: performance.now() });
    G.combo = 0;
  } else {
    G.hits[res]++;
    G.combo++;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    G.score += res * (1 + G.combo / 25);
    hitSound(res);
    for (let i = 0; i < (res === 300 ? 14 : 8); i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      G.fx.push({ kind: 'p', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: performance.now() });
    }
    G.hud.combo.classList.remove('cg-bump');
    void G.hud.combo.offsetWidth;
    G.hud.combo.classList.add('cg-bump');
  }
  G.fx.push({ kind: 'j', x: c.x, y: c.y - c.r - 6, res, tail: !!tail, t: performance.now() });
  G.hud.acc.textContent = (gameAccuracy() * 100).toFixed(2) + '%';
  G.hud.combo.textContent = G.combo > 1 ? G.combo + 'x' : '';
}

function hitSound(res) {
  if (!S.game.sound) return;
  try {
    const ac = G.hitCtx || (G.hitCtx = new AudioContext());
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = res === 300 ? 1320 : res === 100 ? 990 : 760;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.09);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.1);
  } catch {}
}

// ---- frame
function gameFrame() {
  G.raf = requestAnimationFrame(gameFrame);
  if (!G.el || !G.el.classList.contains('cg-on')) return;
  if (G.cv.width !== Math.round(innerWidth * (devicePixelRatio || 1))) sizeGameCanvas();
  const c = G.cx, W = innerWidth, H = innerHeight, now = performance.now();
  const acc = accentColor(), acc2 = lighten(acc, 0.45);

  if (G.on && G.phase === 'count' && now >= G.countEnd) {
    G.phase = 'play';
    if (G.mode !== 'live' && !isPlayingNow() && playBtn()) playBtn().click();
  }
  const t = gameT();
  let msg = '';
  if (G.phase === 'load') msg = 'Loading the song…';
  else if (G.phase === 'count') {
    msg = String(Math.ceil((G.countEnd - now) / 1000));
    if (G.mode === 'live') liveAnalyze(t);
  } else if (G.phase === 'play' && G.mode === 'live') {
    if (lastTrackInfo && lastTrackInfo.url && lastTrackInfo.url !== G.map.url) return stopGame(true);
    liveAnalyze(t);
    G.hasBeat = liveSchedule(t);
    if (!G.hasBeat && !G.circles.length) msg = 'Listening for the beat…';
    for (const k of G.circles) {
      if (k.done) continue;
      if (k.holding) {
        if (t >= k.end) { k.holding = false; judge(k, 300, true); }
        else if (!G.down.has(k.key) && t < k.end - 0.12) { k.holding = false; judge(k, 'miss', true); }
      } else if (t > k.hitT + G.diff.win[2] / 1000) {
        judge(k, 'miss');
        if (k.end) G.hits.miss++;
      }
    }
  } else if (G.phase === 'play') {
    if (!songPlaying() && t > 0.5) msg = 'Music paused — press play';
    // song changed or finished → results
    if (lastTrackInfo && lastTrackInfo.url && lastTrackInfo.url !== G.map.url) return stopGame(true);
    const last = G.notes.length ? (G.notes[G.notes.length - 1].end || G.notes[G.notes.length - 1].t) : 0;
    if ((G.map.dur && t >= G.map.dur - 0.3) || (G.next >= G.notes.length && !G.circles.length && t > last + 1.5)) return stopGame(true);
    // spawn the notes whose ring should start closing now
    const sz = Math.min(1.2, Math.max(0.75, H / 900));
    const left = 70, top = 110, w = W - 140, h = H - 240;
    while (G.next < G.notes.length && G.notes[G.next].t - G.diff.approach <= t) {
      const n = G.notes[G.next++];
      G.circles.push({
        x: left + n.x * w, y: top + n.y * h, r: G.diff.r * sz, key: n.key, num: n.num,
        hitT: n.t, spawnT: n.t - G.diff.approach, approach: G.diff.approach, end: n.end || 0, done: false,
      });
    }
    // misses + holds
    for (const k of G.circles) {
      if (k.done) continue;
      if (k.holding) {
        if (t >= k.end) { k.holding = false; judge(k, 300, true); }
        else if (!G.down.has(k.key) && t < k.end - 0.12) { k.holding = false; judge(k, 'miss', true); }
      } else if (t > k.hitT + G.diff.win[2] / 1000) {
        judge(k, 'miss');
        if (k.end) G.hits.miss++;
      }
    }
    // background pulses on the recorded beats
    const beats = G.map.beats;
    while (G.beatI < beats.length && beats[G.beatI][0] <= t) { G.pulse = Math.min(1, 0.35 + beats[G.beatI][1] * 0.5); G.beatI++; }
  }
  G.pulse *= 0.92;
  G.el.style.setProperty('--pulse', G.pulse.toFixed(3));
  G.hud.msg.textContent = msg;
  G.hud.msg.classList.toggle('cg-count', G.phase === 'count');
  G.hud.bar.firstChild.style.width = (G.mode === 'live' ? (songDur() ? Math.min(100, (songNow() / songDur()) * 100) : 0) : G.map && G.map.dur ? Math.min(100, (Math.max(0, t) / G.map.dur) * 100) : 0) + '%';
  G.circles = G.circles.filter((k) => !k.done || now - k.doneAt < 300);
  G.shownScore += (G.score - G.shownScore) * 0.2;
  G.hud.score.textContent = Math.round(G.shownScore).toLocaleString('en-US');

  c.clearRect(0, 0, W, H);
  const live = G.circles.filter((k) => !k.done).sort((a, b) => a.hitT - b.hitT);
  c.lineWidth = 3;
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1], b = live[i];
    const al = Math.min(1, Math.max(0, 1 - (b.hitT - t) / b.approach)) * 0.35;
    c.strokeStyle = `rgba(255,255,255,${al})`;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  for (let i = live.length - 1; i >= 0; i--) {
    const k = live[i];
    const p = Math.min(1, Math.max(0, (t - k.spawnT) / k.approach));
    const fade = Math.min(1, p * 4);
    const mouse = k.key === 'M1' || k.key === 'M2';
    c.globalAlpha = fade;
    if (k.end) {
      // hold: outer track + how much of the hold is done
      c.strokeStyle = 'rgba(255,255,255,.25)';
      c.lineWidth = 8;
      c.beginPath(); c.arc(k.x, k.y, k.r + 12, 0, Math.PI * 2); c.stroke();
      if (k.holding) {
        const q = Math.min(1, Math.max(0, (t - k.hitT) / (k.end - k.hitT)));
        c.strokeStyle = acc2;
        c.shadowColor = acc; c.shadowBlur = 16;
        c.beginPath(); c.arc(k.x, k.y, k.r + 12, -Math.PI / 2, -Math.PI / 2 + q * Math.PI * 2); c.stroke();
        c.shadowBlur = 0;
      }
    }
    if (!k.holding) {
      c.strokeStyle = mouse ? acc2 : acc;
      c.lineWidth = 3;
      c.beginPath(); c.arc(k.x, k.y, k.r * (1 + 2.6 * (1 - p)), 0, Math.PI * 2); c.stroke();
    }
    const g = c.createRadialGradient(k.x - k.r * 0.3, k.y - k.r * 0.3, k.r * 0.1, k.x, k.y, k.r);
    g.addColorStop(0, mouse ? acc2 : lighten(acc, 0.25)); g.addColorStop(1, acc);
    c.fillStyle = g;
    c.shadowColor = acc; c.shadowBlur = k.holding ? 30 : 18;
    c.beginPath(); c.arc(k.x, k.y, k.r * (k.holding ? 1.06 : 1), 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 4; c.strokeStyle = '#fff';
    c.stroke();
    c.fillStyle = '#fff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${Math.round(k.r * (k.key === 'SPACE' ? 0.36 : mouse ? 0.62 : 0.78))}px "Segoe UI", system-ui, sans-serif`;
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6;
    c.fillText(k.key, k.x, k.y + 1);
    c.shadowBlur = 0;
    c.font = `800 ${Math.round(k.r * 0.26)}px "Segoe UI", sans-serif`;
    c.globalAlpha = fade * 0.85;
    c.fillText(k.end ? 'HOLD' : String(k.num), k.x, k.y + k.r * 0.62);
    c.globalAlpha = 1;
  }
  for (const k of G.circles) {
    if (!k.done) continue;
    const q = (now - k.doneAt) / 300;
    c.globalAlpha = Math.max(0, 1 - q);
    c.strokeStyle = k.res === 'miss' ? '#ff4060' : '#fff';
    c.lineWidth = 4;
    c.beginPath(); c.arc(k.x, k.y, k.r * (1 + q * 0.6), 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  G.fx = G.fx.filter((f) => now - f.t < (f.kind === 'j' ? 700 : 500));
  for (const f of G.fx) {
    const q = (now - f.t) / (f.kind === 'j' ? 700 : 500);
    if (f.kind === 'p') {
      f.x += f.vx; f.y += f.vy; f.vx *= 0.94; f.vy *= 0.94;
      c.globalAlpha = 1 - q;
      c.fillStyle = Math.random() < 0.5 ? acc : acc2;
      c.beginPath(); c.arc(f.x, f.y, 3.2 * (1 - q) + 1, 0, Math.PI * 2); c.fill();
    } else if (f.kind === 'j') {
      c.globalAlpha = 1 - q * q;
      const col = f.res === 300 ? acc2 : f.res === 100 ? '#7cf29a' : f.res === 50 ? '#ffd166' : '#ff4060';
      c.fillStyle = col;
      c.font = `800 ${f.res === 'miss' ? 34 : f.tail ? 20 : 26}px "Segoe UI", sans-serif`;
      c.textAlign = 'center';
      c.shadowColor = col; c.shadowBlur = 12;
      c.fillText(f.res === 'miss' ? '✕' : String(f.res), f.x, f.y - q * 26 - (f.tail ? 22 : 0));
      c.shadowBlur = 0;
    } else if (f.kind === 'break') {
      c.globalAlpha = 1 - q;
      c.fillStyle = '#ff4060';
      c.font = '800 18px "Segoe UI", sans-serif';
      c.fillText('combo break', f.x, f.y + 40 + q * 10);
    }
  }
  c.globalAlpha = 1;
  G.trail.push([G.mouse.x, G.mouse.y]);
  if (G.trail.length > 14) G.trail.shift();
  G.trail.forEach(([x, y], i) => {
    c.globalAlpha = (i / G.trail.length) * 0.5;
    c.fillStyle = acc;
    c.beginPath(); c.arc(x, y, 3 + i * 0.35, 0, Math.PI * 2); c.fill();
  });
  c.globalAlpha = 1;
  c.fillStyle = '#fff';
  c.shadowColor = acc; c.shadowBlur = 14;
  c.beginPath(); c.arc(G.mouse.x, G.mouse.y, 9, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = acc; c.lineWidth = 3; c.stroke();
  if (!G.on && !G.res.classList.contains('cg-show')) closeGame();
}

// ================================================================ MAP FILES (share / delete / import)
function exportMap(map) {
  const data = Object.assign({}, map, { best: {} });
  const name = (map.artist ? map.artist + ' - ' : '') + map.title;
  ipcRenderer.send('save-file', { kind: 'map', name, json: JSON.stringify(data) });
}
function importMapText(text) {
  let d;
  try { d = JSON.parse(text); } catch { return toast('This is not a SCX beat map'); }
  const num = (v) => typeof v === 'number' && isFinite(v);
  const own = !!(d && d.custom && Array.isArray(d.notes));
  if (!d || d.app !== 'SoundCloudX' || d.type !== 'beatmap' || !/^https:\/\/soundcloud\.com\/[^\s"'<>#]{1,300}$/.test(d.url || '')
    || (!own && (!num(d.bpm) || d.bpm < 40 || d.bpm > 300)) || !Array.isArray(d.beats || []) || (d.beats || []).length > 20000 || !num(d.dur)
    || (own && d.notes.length > 5000)) {
    return toast('This is not a SCX beat map');
  }
  const beats = (d.beats || []).filter((b) => Array.isArray(b) && b.length >= 3 && b.every(num)).map((b) => [b[0], b[1], b[2]]);
  const halfs = (Array.isArray(d.halfs) ? d.halfs : []).filter((b) => Array.isArray(b) && b.length >= 2 && b.every(num)).slice(0, 20000).map((b) => [b[0], b[1]]);
  const map = {
    v: 1, app: 'SoundCloudX', type: 'beatmap', url: d.url,
    title: String(d.title || 'Song').slice(0, 200), artist: String(d.artist || '').slice(0, 120),
    art: safeImg(d.art) && !String(d.art).startsWith('blob:') ? d.art : '',
    dur: Math.min(1200, d.dur), bpm: num(d.bpm) ? Math.max(0, Math.min(300, d.bpm)) : 0, beats, halfs, created: Date.now(), best: {},
  };
  if (own) {
    map.custom = true;
    map.id = map.url + '#custom';
    map.notes = d.notes.filter((n) => Array.isArray(n) && num(n[0]) && n[0] >= 0 && n[0] < 1200)
      .map((n) => [n[0], num(n[1]) && n[1] > n[0] ? Math.min(n[1], n[0] + 30) : 0]).sort((a, b) => a[0] - b[0]);
  }
  MAPS.save(map).then(() => { toast('Beat map added: ' + map.title); refreshPanel(); });
}

// ================================================================ MAKE OWN (map editor)
const ED = { on: false, el: null };
function openEditor(existing) {
  const tr = lastTrackInfo || {};
  const url = existing ? existing.url : tr.url;
  if (!url) return toast('Play a song first');
  if (existing && tr.url !== existing.url) {
    toast('Opening the song…');
    goSoundCloud(existing.url);
    waitFor(() => location.href.split('?')[0].replace(/\/$/, '') === existing.url, 7000).then(async () => {
      await sleep(900);
      const hero = document.querySelector('.l-listen-hero .sc-button-play, .fullHero__playButton .sc-button-play, .listenHero .sc-button-play');
      if (hero) hero.click();
      await waitFor(() => { pollTrack(); return lastTrackInfo && lastTrackInfo.url === existing.url; }, 8000);
      if (lastTrackInfo && lastTrackInfo.url === existing.url) openEditor(existing); else toast('Could not open this song');
    });
    return;
  }
  const rec = MAPS.get(url);
  Object.assign(ED, {
    on: true, url, title: (existing && existing.title) || tr.title || 'Song', artist: (existing && existing.artist) || tr.artist || '',
    art: (existing && existing.art) || tr.art || '', rec,
    notes: existing ? existing.notes.map((n) => [n[0], n[1] || 0]) : [], undo: [], sel: -1, spaceAt: -1, snap: !!rec,
    view: 10, dirty: false, best: (existing && existing.best) || {},
  });
  togglePanel(false);
  buildEditor();
  ED.el.classList.add('ce-on');
  document.documentElement.classList.add('ccx-game');
  edLoop();
}
const edNow = () => songNow() + (Number(S.game.offset) || 0) / 1000;
function edSnap(t) {
  if (!ED.snap || !ED.rec) return t;
  let best = t, bd = 0.15;
  for (const list of [ED.rec.beats, ED.rec.halfs || []]) for (const b of list) { const d = Math.abs(b[0] - t); if (d < bd) { bd = d; best = b[0]; } }
  return best;
}
function edPush() { ED.undo.push(JSON.stringify(ED.notes)); if (ED.undo.length > 200) ED.undo.shift(); ED.dirty = true; }
function edAdd(t, end) {
  t = edSnap(t);
  if (end) end = Math.max(t + 0.25, edSnap(end));
  if (ED.notes.some((n) => Math.abs(n[0] - t) < 0.06)) return;
  edPush();
  ED.notes.push([t, end || 0]);
  ED.notes.sort((a, b) => a[0] - b[0]);
  ED.sel = ED.notes.findIndex((n) => n[0] === t);
  ED.flash = performance.now();
}
function edUndo() { if (!ED.undo.length) return; ED.notes = JSON.parse(ED.undo.pop()); ED.sel = -1; ED.dirty = true; }
function edDelete() { if (ED.sel < 0 || !ED.notes[ED.sel]) return; edPush(); ED.notes.splice(ED.sel, 1); ED.sel = -1; }
function edMap() {
  const r = ED.rec;
  return {
    v: 1, app: 'SoundCloudX', type: 'beatmap', id: ED.url + '#custom', custom: true, url: ED.url,
    title: ED.title, artist: ED.artist, art: safeImg(ED.art) && !String(ED.art).startsWith('blob:') ? ED.art : '',
    dur: Math.min(1200, songDur() || (r && r.dur) || (ED.notes.length ? ED.notes[ED.notes.length - 1][0] + 5 : 60)),
    bpm: r ? r.bpm : 0, beats: r ? r.beats : [], halfs: [], notes: ED.notes, created: Date.now(), best: ED.best,
  };
}
async function edSave(quiet) {
  if (!ED.notes.length) { toast('Add some points first'); return null; }
  const m = edMap();
  await MAPS.save(m);
  ED.dirty = false;
  if (!quiet) toast('✓ Map saved · ' + m.notes.length + ' points');
  return m;
}
function closeEditor() {
  if (!ED.on) return;
  ED.on = false;
  if (ED.el) ED.el.classList.remove('ce-on');
  if (!G.on) document.documentElement.classList.remove('ccx-game');
  refreshPanel();
}
function edToggle() { const b = playBtn(); if (b) b.click(); }

function buildEditor() {
  if (ED.el) ED.el.remove();
  const root = el('div', 'ce-root');
  const head = el('div', 'ce-head');
  const art = el('i', 'cc-gart');
  if (safeImg(ED.art)) art.style.backgroundImage = cssUrl(ED.art);
  const txt = el('div', 'cc-gtxt');
  txt.append(el('b', null, '✏️ ' + ED.title), el('span', null, ED.artist + (ED.rec ? '  ·  ' + Math.round(ED.rec.bpm) + ' BPM (recorded)' : '')));
  ED.count = el('div', 'ce-count');
  const x = el('button', 'ce-x', '✕');
  x.title = 'Close (Esc)';
  x.addEventListener('click', () => closeEditor());
  head.append(art, txt, ED.count, x);

  ED.over = el('canvas', 'ce-over');
  ED.lane = el('canvas', 'ce-lane');
  const seekAt = (cv, e, from, span) => { const r = cv.getBoundingClientRect(); return from + ((e.clientX - r.left) / r.width) * span; };
  ED.over.addEventListener('mousedown', (e) => { seekToTime(seekAt(ED.over, e, 0, songDur() || 1)); });
  ED.lane.addEventListener('mousedown', (e) => {
    const t = seekAt(ED.lane, e, ED.from, ED.view);
    const px = ED.view / ED.lane.getBoundingClientRect().width;
    let hit = -1, hd = 9 * px;
    ED.notes.forEach((n, i) => {
      const d = n[1] && t > n[0] && t < n[1] ? 0 : Math.abs(n[0] - t);
      if (d < hd) { hd = d; hit = i; }
    });
    if (hit >= 0) ED.sel = hit;
    else { ED.sel = -1; seekToTime(t - (Number(S.game.offset) || 0) / 1000); }
  });
  ED.lane.addEventListener('dblclick', (e) => { edAdd(seekAt(ED.lane, e, ED.from, ED.view)); });
  ED.lane.addEventListener('wheel', (e) => { e.preventDefault(); ED.view = Math.max(3, Math.min(40, ED.view * (e.deltaY > 0 ? 1.15 : 0.87))); }, { passive: false });

  const btn = (label, title, fn, cls) => { const b = el('button', 'ce-btn' + (cls ? ' ' + cls : ''), label); b.title = title; b.addEventListener('click', fn); return b; };
  ED.time = el('div', 'ce-time');
  ED.playB = btn('▶', 'Play / pause (P)', edToggle, 'ce-play');
  const transport = el('div', 'ce-row');
  transport.append(
    btn('⏮', 'Back to start', () => seekToTime(0)),
    btn('−5s', 'Back 5 s (←)', () => seekBy(-5)),
    btn('−1s', 'Back 1 s (Shift+←)', () => seekBy(-1)),
    ED.playB,
    btn('+1s', 'Forward 1 s (Shift+→)', () => seekBy(1)),
    btn('+5s', 'Forward 5 s (→)', () => seekBy(5)),
    ED.time
  );
  const pad = el('button', 'ce-pad');
  pad.append(el('b', null, '＋ POINT'), el('span', null, 'tap F / J / K / Enter  ·  hold SPACE = HOLD circle'));
  pad.addEventListener('mousedown', (e) => { e.preventDefault(); edAdd(edNow()); });
  const tools = el('div', 'ce-row');
  ED.snapB = btn('🧲 Snap: ' + (ED.snap ? 'on' : 'off'), ED.rec ? 'Snap points to the recorded beat' : 'Record a beat map of this song to snap to the beat', () => {
    if (!ED.rec) return toast('Record this song first (Record mode) to snap to the beat');
    ED.snap = !ED.snap; ED.snapB.textContent = '🧲 Snap: ' + (ED.snap ? 'on' : 'off');
  });
  let clearArm = 0;
  const clearB = btn('🧹 Clear', 'Remove all points', () => {
    if (Date.now() - clearArm > 3000) { clearArm = Date.now(); clearB.textContent = 'Sure?'; setTimeout(() => (clearB.textContent = '🧹 Clear'), 3000); return; }
    edPush(); ED.notes = []; ED.sel = -1; clearB.textContent = '🧹 Clear';
  });
  tools.append(
    btn('↶ Undo', 'Undo (Backspace)', edUndo),
    btn('🗑 Delete', 'Delete the selected point (Del)', edDelete),
    clearB,
    ED.snapB,
    btn('💾 Save', 'Save the map', () => edSave()),
    btn('▶ Test play', 'Save and play from the start', async () => { const m = await edSave(true); if (m) { closeEditor(); startMapGame(m); } }, 'ce-go')
  );
  const help = el('div', 'ce-help', 'Click the timeline to jump  ·  double-click it to add a point  ·  click a point to select it  ·  mouse wheel = zoom  ·  ← / → seek  ·  P play/pause  ·  Esc close');
  root.append(head, ED.over, ED.lane, transport, pad, tools, help);
  const wrap = el('div', 'ce-wrap');
  wrap.append(root);
  document.documentElement.append(wrap);
  ED.el = wrap;
}

function edCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, r.height);
  return [c, r.width, r.height];
}
function edLoop() {
  if (!ED.on) return;
  requestAnimationFrame(edLoop);
  const acc = accentColor(), t = edNow(), dur = songDur() || 1;
  ED.time.textContent = fmtTime(songNow()) + ' / ' + fmtTime(dur);
  ED.playB.textContent = songPlaying() ? '⏸' : '▶';
  ED.count.textContent = ED.notes.length + ' points' + (ED.dirty ? ' · not saved' : '');
  // overview: whole song
  let [c, W, H] = edCanvas(ED.over);
  c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0, 0, W, H);
  c.fillStyle = acc;
  for (const n of ED.notes) { const x = (n[0] / dur) * W; c.fillRect(x, 4, Math.max(1.5, n[1] ? ((n[1] - n[0]) / dur) * W : 1.5), H - 8); }
  c.fillStyle = '#fff'; c.fillRect((songNow() / dur) * W - 1, 0, 2, H);
  // lane: zoomed around the playhead
  [c, W, H] = edCanvas(ED.lane);
  const from = (ED.from = t - ED.view * 0.35), px = W / ED.view, X = (s) => (s - from) * px;
  c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(0, 0, W, H);
  if (ED.rec) {
    for (const b of ED.rec.beats) { if (b[0] < from - 1 || b[0] > from + ED.view + 1) continue; c.fillStyle = 'rgba(255,255,255,' + (0.07 + b[1] * 0.2) + ')'; c.fillRect(X(b[0]), 0, 1, H); }
  } else {
    c.fillStyle = 'rgba(255,255,255,.08)';
    for (let s = Math.ceil(from); s < from + ED.view; s++) { c.fillRect(X(s), 0, 1, H); }
  }
  c.font = '600 10px "Segoe UI", system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,.35)';
  for (let s = Math.ceil(from); s < from + ED.view; s++) if (s >= 0 && s % 2 === 0) c.fillText(fmtTime(s), X(s) + 3, H - 6);
  const cy = H / 2 - 4, rr = Math.min(16, H / 4);
  ED.notes.forEach((n, i) => {
    if ((n[1] || n[0]) < from - 1 || n[0] > from + ED.view + 1) return;
    const x = X(n[0]), sel = i === ED.sel;
    if (n[1]) { c.fillStyle = acc + '55'; c.fillRect(x, cy - rr * 0.6, (n[1] - n[0]) * px, rr * 1.2); c.strokeStyle = acc; c.lineWidth = 2; c.strokeRect(x, cy - rr * 0.6, (n[1] - n[0]) * px, rr * 1.2); }
    c.beginPath(); c.arc(x, cy, rr, 0, Math.PI * 2);
    c.fillStyle = sel ? '#fff' : acc; c.fill();
    c.lineWidth = 2; c.strokeStyle = sel ? acc : 'rgba(255,255,255,.85)'; c.stroke();
    c.fillStyle = sel ? '#000' : '#fff'; c.font = '800 ' + (n[1] ? 8 : 11) + 'px "Segoe UI", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(n[1] ? 'SPACE' : String((i % 9) + 1), x, cy + 0.5);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  });
  if (ED.spaceAt >= 0) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(X(ED.spaceAt), cy - rr * 0.6, Math.max(2, (t - ED.spaceAt) * px), rr * 1.2); }
  const fl = ED.flash ? Math.max(0, 1 - (performance.now() - ED.flash) / 250) : 0;
  c.fillStyle = fl ? `rgba(255,255,255,${0.6 + fl * 0.4})` : '#fff';
  c.fillRect(X(t) - 1, 0, 2 + fl * 3, H);
}

addEventListener('keydown', (e) => {
  if (!ED.on || G.on) return;
  if (e.key === 'F11') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.repeat) return;
  const k = e.code;
  if (k === 'Escape') closeEditor();
  else if (k === 'Space') ED.spaceAt = edNow();
  else if (k === 'KeyF' || k === 'KeyJ' || k === 'KeyK' || k === 'KeyD' || k === 'KeyT' || k === 'Enter' || k === 'NumpadEnter') edAdd(edNow());
  else if (k === 'Backspace' || (k === 'KeyZ' && e.ctrlKey)) edUndo();
  else if (k === 'Delete') edDelete();
  else if (k === 'ArrowLeft') seekBy(e.shiftKey ? -1 : -5);
  else if (k === 'ArrowRight') seekBy(e.shiftKey ? 1 : 5);
  else if (k === 'KeyP') edToggle();
  else if (k === 'KeyS' && e.ctrlKey) edSave();
}, true);
addEventListener('keyup', (e) => {
  if (!ED.on || G.on) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.code === 'Space' && ED.spaceAt >= 0) {
    const a = ED.spaceAt, b = edNow();
    ED.spaceAt = -1;
    if (b - a >= 0.25) edAdd(a, b); else edAdd(a);
  }
}, true);

// ================================================================ GAME TAB
function buildGameTab() {
  const t = el('div', 'cc-tab');
  const hero = el('div', 'cc-gamehero');
  hero.append(el('b', null, 'SCX Beat'), el('span', null, 'listen to a song once → play it osu!-style'));

  // current song card
  const cur = el('div', 'cc-gcur');
  const curRender = () => {
    cur.textContent = '';
    const tr = lastTrackInfo || {};
    const map = tr.url ? MAPS.get(tr.url) : null;
    const art = el('i', 'cc-gart');
    if (safeImg(tr.art)) art.style.backgroundImage = cssUrl(tr.art);
    const txt = el('div', 'cc-gtxt');
    txt.append(el('b', null, tr.title || 'Nothing playing'), el('span', null, tr.artist || 'Play a song in SoundCloud'));
    const top = el('div', 'cc-gtop');
    top.append(art, txt);
    cur.append(top);
    const mode = S.game.mode;
    if (mode === 'live') {
      cur.append(note(tr.playing ? 'Starts instantly — circles follow the beat live while the song plays.' : 'Play a song, then press the button.'),
        wideBtn('⚡  Play now', startLiveGame));
      return;
    }
    if (mode === 'make') {
      if (!tr.url) return;
      const own = MAPS.own(tr.url);
      cur.append(note(own ? '✏️ Your map · ' + (own.notes || []).length + ' points' : 'Make your own map: scrub through the song and put points where you want.'));
      if (own) cur.append(wideBtn('▶  Play my map', () => startMapGame(own)));
      cur.append(wideBtn(own ? '✏️  Edit my map' : '✏️  Make my map', () => openEditor(own), own ? 'cc-ghost' : ''));
      return;
    }
    if (REC.on && REC.url === tr.url) {
      const bar = el('div', 'cc-recbar');
      const fill = el('i');
      fill.style.width = Math.round(REC.progress * 100) + '%';
      bar.append(fill);
      cur.append(bar, note('● Recording the beat… ' + Math.round(REC.progress * 100) + '% — just keep listening (the song can play in the background).'),
        wideBtn('Stop recording', () => stopRecording(true), 'cc-ghost'));
    } else if (map) {
      cur.append(note('✓ Beat map ready · ' + Math.round(map.bpm) + ' BPM · ' + fmtTime(map.dur)), wideBtn('▶  Play this song', () => startMapGame(map)));
    } else if (tr.url) {
      cur.append(note('No beat map yet. Record it: listen to the whole song once and SCX writes down every beat.'),
        wideBtn('●  Record beat map', startRecording));
    }
  };

  const list = el('div', 'cc-maps');
  const listRender = () => {
    list.textContent = '';
    if (!MAPS.list.length) { list.append(note('No beat maps yet.')); return; }
    for (const m of MAPS.list) {
      const row = el('div', 'cc-maprow');
      const art = el('i', 'cc-gart cc-gart-s');
      if (safeImg(m.art)) art.style.backgroundImage = cssUrl(m.art);
      const txt = el('div', 'cc-gtxt');
      const best = Math.max(0, ...Object.values(m.best || {}));
      txt.append(el('b', null, (m.custom ? '✏️ ' : '') + m.title),
        el('span', null, (m.custom ? (m.notes || []).length + ' points' : Math.round(m.bpm) + ' BPM') + ' · ' + fmtTime(m.dur) + (best ? ' · best ' + best.toLocaleString('en-US') : '')));
      const play = el('button', 'cc-sbtn', '▶');
      play.title = 'Play';
      play.addEventListener('click', () => startMapGame(m));
      const share = el('button', 'cc-sbtn cc-ghostbtn', '⤓');
      share.title = 'Save as a file to share';
      share.addEventListener('click', () => exportMap(m));
      const del = el('button', 'cc-sbtn cc-redbtn', '🗑');
      del.title = 'Delete';
      let arm = 0;
      del.addEventListener('click', async () => {
        if (Date.now() - arm > 3000) { arm = Date.now(); del.textContent = 'Sure?'; return; }
        await MAPS.remove(m);
        refreshPanel();
      });
      row.append(art, txt, play);
      if (m.custom) {
        const ed = el('button', 'cc-sbtn cc-ghostbtn', '✏️');
        ed.title = 'Edit';
        ed.addEventListener('click', () => openEditor(m));
        row.append(ed);
      }
      row.append(share, del);
      list.append(row);
    }
  };

  const imp = el('input');
  imp.type = 'file';
  imp.accept = '.scxmap,.json,application/json';
  imp.className = 'cc-hidden-color';
  imp.addEventListener('change', () => {
    const f = imp.files && imp.files[0];
    imp.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => importMapText(String(r.result || ''));
    r.readAsText(f);
  });

  const best = el('div', 'cc-gamebest');
  const modeNote = note('');
  const autoRow = toggleRow('Auto-record songs I listen to', () => S.game.auto, (v) => { S.game.auto = v; saveAll(); refreshPanel(); });
  refreshers.push(() => {
    modeNote.textContent = S.game.mode === 'live' ? 'Real time: no waiting — play any song right now (less exact than a recorded map).'
      : S.game.mode === 'make' ? 'Make own: build your own map — rewind the song, tap points, hold Space for HOLD circles.'
      : 'Record: SCX listens to the song once, then you play a perfect map.';
    autoRow.style.display = S.game.mode === 'live' || S.game.mode === 'make' ? 'none' : '';
    curRender();
    listRender();
    best.textContent = '';
    for (const k of ['easy', 'normal', 'hard']) {
      const c = el('div');
      c.append(el('small', null, GAME_DIFF[k].label), el('b', null, (S.game.best[k] || 0).toLocaleString('en-US')));
      best.append(c);
    }
  });
  let lastKey = '';
  setInterval(() => { // keep the song card fresh while the tab is open
    if (!(panel && panel.classList.contains('cc-open') && activeTab === 'Game')) return;
    const tr = lastTrackInfo || {};
    const k = tr.url + '|' + tr.playing + '|' + REC.on + '|' + Math.round(REC.progress * 100) + '|' + MAPS.list.length + '|' + MAPS.list.map((m) => (m.notes || []).length).join();
    if (k !== lastKey) { lastKey = k; curRender(); listRender(); }
  }, 700);

  t.append(
    hero,
    sectionTitle('Mode'),
    segmented([['record', '● Record'], ['live', '⚡ Real time'], ['make', '✏️ Make own']], () => S.game.mode, (v) => { S.game.mode = v; saveAll(); refreshPanel(); }),
    modeNote,
    sectionTitle('This song'),
    cur,
    autoRow,
    sectionTitle('Difficulty'),
    segmented([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], () => S.game.diff, (v) => { S.game.diff = v; saveAll(); refreshPanel(); }),
    sectionTitle('Buttons'),
    segmented([['all', 'All'], ['keys', 'Keyboard'], ['mouse', 'Mouse']], () => S.game.keys, (v) => { S.game.keys = v; saveAll(); refreshPanel(); }),
    note('All: A S D W E Q + M1 (left click) + M2 (right click). HOLD circles: hold SPACE until the ring is full.'),
    toggleRow('Hit sound', () => S.game.sound, (v) => { S.game.sound = v; saveAll(); refreshPanel(); }),
    sliderRow('Timing offset', -200, 200, 5, () => S.game.offset || 0, (v) => { S.game.offset = v; saveAll(); }, (v) => (v > 0 ? '+' : '') + v + ' ms'),
    note('If circles feel late, move the offset to the left; if early, to the right.'),
    sectionTitle('My beat maps'),
    list,
    wideBtn('Import beat map…', () => imp.click(), 'cc-ghost'),
    imp,
    note('⤓ saves a .scxmap file — send it to a friend, they press Import and can play the song right away.'),
    sectionTitle('Best scores'),
    best
  );
  MAPS.load().then(() => refreshPanel());
  return t;
}

function fmtTime(s) {
  s = Math.max(0, Math.round(s || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// auto-record: start on a new song that has no map yet
setInterval(() => {
  if (!S.game.auto || REC.on || G.on) return;
  const tr = lastTrackInfo || {};
  if (!tr.url || !tr.playing || MAPS.get(tr.url)) return;
  if (SONG.t > 15) return; // only from (near) the start
  startRecording();
}, 2500);

// ================================================================ STATS (today + all time)
const STATS = (() => {
  const KEY = 'ccx_stats';
  const blank = () => ({ songs: 0, app: 0, listen: 0, likes: 0, reposts: 0, comments: 0, follows: 0, games: 0 });
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!data || typeof data !== 'object') data = {};
  data.days = data.days && typeof data.days === 'object' ? data.days : {};
  data.total = Object.assign(blank(), data.total || {});

  const dayKey = (d = new Date()) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function today() {
    const k = dayKey();
    if (!data.days[k]) {
      data.days[k] = Object.assign(blank(), { artists: {} });
      const keys = Object.keys(data.days).sort();
      while (keys.length > 60) delete data.days[keys.shift()]; // keep two months
    }
    return data.days[k];
  }
  function add(field, n = 1) {
    const d = today();
    d[field] = Math.max(0, (d[field] || 0) + n);
    data.total[field] = Math.max(0, (data.total[field] || 0) + n);
  }
  let dirty = 0;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    dirty = 0;
  }

  // a song counts as listened after 30 seconds (or half of a short song)
  let songKey = '', playedSec = 0, counted = false;
  setInterval(() => {
    add('app');
    const tr = lastTrackInfo;
    if (tr && tr.title) {
      const k = tr.title + '|' + tr.artist;
      if (k !== songKey) { songKey = k; playedSec = 0; counted = false; }
      if (tr.playing) {
        add('listen');
        playedSec++;
        const need = tr.dur > 0 ? Math.min(30, tr.dur * 0.5) : 30;
        if (!counted && playedSec >= need) {
          counted = true;
          add('songs');
          COINS.add(50, 'Song');
          const d = today();
          if (tr.artist) d.artists[tr.artist] = (d.artists[tr.artist] || 0) + 1;
        }
      }
    }
    COINS.checkHours(today().app);
    if (++dirty >= 15) save();
  }, 1000);
  addEventListener('beforeunload', save);

  return {
    today, add, save,
    total: () => data.total,
    last7() {
      const out = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = dayKey(d);
        out.push({ d, k, v: data.days[k] || blank() });
      }
      return out;
    },
    addGame() { add('games'); save(); },
    reset() { data = { days: {}, total: blank() }; save(); },
  };
})();

function fmtDur(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm';
  return sec + 's';
}

function buildStatsTab() {
  const t = el('div', 'cc-tab');
  const tiles = el('div', 'cc-stiles');
  const mk = (icon, label) => {
    const c = el('div', 'cc-stile');
    const v = el('b', null, '0');
    c.append(el('i', null, icon), v, el('small', null, label));
    tiles.append(c);
    return v;
  };
  const vSongs = mk('🎵', 'songs today');
  const vApp = mk('⏱️', 'in SCX today');
  const vLikes = mk('❤️', 'likes today');
  const vReposts = mk('🔁', 'reposts today');
  const vCoins = mk('🪙', 'coins');
  const vCoinsToday = mk('✨', 'coins today');
  const listenRow = el('div', 'cc-srow');
  const vListen = el('b');
  listenRow.append(el('span', null, '🎧 Listening today'), vListen);

  const top = el('div', 'cc-stop');
  const chart = el('div', 'cc-schart');
  const totals = el('div', 'cc-stotal');

  let armed = 0;
  const resetBtn = wideBtn('Reset stats', () => {
    if (Date.now() - armed > 3000) { armed = Date.now(); resetBtn.textContent = 'Click again to reset'; return; }
    STATS.reset();
    armed = 0;
    resetBtn.textContent = 'Reset stats';
    refreshPanel();
  }, 'cc-ghost');

  const render = () => {
    const d = STATS.today();
    vSongs.textContent = d.songs;
    vApp.textContent = fmtDur(d.app);
    vLikes.textContent = d.likes;
    vReposts.textContent = d.reposts;
    vCoins.textContent = coinBalance().toLocaleString('en-US');
    vCoinsToday.textContent = '+' + COINS.today().toLocaleString('en-US');
    vListen.textContent = fmtDur(d.listen);

    top.textContent = '';
    const arts = Object.entries(d.artists || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!arts.length) top.append(el('div', 'cc-note', 'Listen to a few songs and your top artists of the day show up here.'));
    arts.forEach(([name, n], i) => {
      const r = el('div', 'cc-srow');
      r.append(el('span', null, ['🥇', '🥈', '🥉'][i] + ' ' + name), el('b', null, n + (n === 1 ? ' song' : ' songs')));
      top.append(r);
    });

    chart.textContent = '';
    const days = STATS.last7();
    const max = Math.max(1, ...days.map((x) => x.v.songs));
    days.forEach((x, i) => {
      const col = el('div', 'cc-sbar' + (i === 6 ? ' cc-today' : ''));
      const bar = el('i');
      bar.style.height = Math.max(4, (x.v.songs / max) * 100) + '%';
      col.title = x.v.songs + ' songs, ' + fmtDur(x.v.listen) + ' listening';
      col.append(el('em', null, String(x.v.songs)), bar, el('small', null, x.d.toLocaleDateString('en-US', { weekday: 'short' })));
      chart.append(col);
    });

    const tt = STATS.total();
    totals.textContent = '';
    for (const [k, v] of [['Songs', tt.songs], ['Listening', fmtDur(tt.listen)], ['Time in SCX', fmtDur(tt.app)],
      ['Likes', tt.likes], ['Reposts', tt.reposts], ['Comments', tt.comments || 0], ['Follows', tt.follows || 0], ['Games played', tt.games]]) {
      const r = el('div', 'cc-srow');
      r.append(el('span', null, k), el('b', null, String(v)));
      totals.append(r);
    }
  };
  refreshers.push(render);
  // keep the numbers ticking while the tab is open
  setInterval(() => { if (panel && panel.classList.contains('cc-open') && activeTab === 'Stats') render(); }, 1000);

  t.append(
    sectionTitle('Today'),
    tiles,
    listenRow,
    sectionTitle('Top artists today'),
    top,
    sectionTitle('Last 7 days · songs'),
    chart,
    sectionTitle('All time'),
    totals,
    sectionTitle('How to earn coins'),
    note('🎵 Song +50 · ❤️ Like +50 · 🔁 Repost +100 · 💬 Comment +250 · 👤 Follow +500 · 🎮 SCX Beat: your score'),
    note('⏱️ Time in SCX today: 1h +500 · 2h +1500 · 3h +2500 · 4h +3500 · 5h +5000 · every next hour 5000 + hours × 200'),
    note('A song counts after 30 seconds of listening. Like / repost / comment pay once per track a day, follow once per artist.'),
    resetBtn
  );
  return t;
}

// ================================================================ SCX ONLINE (profiles, who is online, followers, leaderboards)
let appVersion = '';
ipcRenderer.on('assets', (_e, a) => { if (a && a.version) appVersion = a.version; });

const ON = {
  ready: false, uid: null, me: null, err: '', busy: false,
  online: [], following: [], top: [], topKind: 'coins', results: [], q: '',
  counts: { followers: 0, following: 0 }, view: null, editing: false, root: null,
};

const bal = (p) => Number(p && (p.balance != null ? p.balance : p.coins)) || 0;
function coinBalance() {
  if (!ON.me) return COINS.total();
  return Math.max(COINS.total(), Number(ON.me.coins) || 0) + (Number(ON.me.bonus) || 0) - (Number(ON.me.spent) || 0);
}
function tagEl(p) {
  const t = el('span', 'cc-tag', p.tag_text);
  if (/^#[0-9a-f]{6}$/i.test(p.tag_color || '')) t.style.setProperty('--tc', p.tag_color);
  return t;
}
function nickLine(p) {
  const b = el('b', 'cc-nickline');
  b.append(el('span', null, (p && p.nick) || '?'));
  if (p && p.tag_text) b.append(tagEl(p));
  return b;
}

function onlineCall(op, args) {
  return ipcRenderer.invoke('online', Object.assign({ op }, args || {})).catch((e) => {
    let m = String((e && e.message) || e).replace(/^Error invoking remote method 'online':\s*(Error:\s*)?/, '');
    if (/column .*(coins|stats|sc_url|scx_version)/i.test(m)) m = 'Run the v1.7 SQL update in Supabase (SQL Editor) first.';
    if (/fetch failed|network|ENOTFOUND|ECONN/i.test(m)) m = 'No connection to SCX Online. Check your internet.';
    throw new Error(m);
  });
}

const safeAvatar = (u) => (typeof u === 'string' && /^https:\/\/[a-z0-9.-]*sndcdn\.com\//i.test(u) ? u : '');
function frameCss(f) {
  if (!f || typeof f !== 'object') return null;
  if (f.style === 'image') {
    if (!safeImg(f.url)) return null;
    const sc = Math.max(1, Math.min(1.8, Number(f.scale) || 1.3));
    return { style: 'image', url: f.url, scale: sc, layer: f.layer === 'over' ? 'over' : 'behind' };
  }
  const cols = (Array.isArray(f.colors) ? f.colors : []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8);
  if (!cols.length) return null;
  const list = cols.length === 1 ? [cols[0], cols[0]] : cols;
  const style = ['gradient', 'spin', 'glow'].includes(f.style) ? f.style : 'gradient';
  return { style, bg: 'conic-gradient(' + list.concat(list[0]).join(',') + ')', c1: list[0] };
}
function avatarEl(p, size) {
  const a = el('div', 'cc-av');
  a.style.width = a.style.height = size + 'px';
  const src = safeAvatar(p && p.avatar);
  if (src) a.style.backgroundImage = cssUrl(src);
  else a.textContent = ((p && p.nick) || '?').slice(0, 1).toUpperCase();
  const fc = frameCss(p && p.frame);
  if (!fc) return a;
  if (fc.style === 'image') {
    // picture / GIF around (or behind) the profile picture, like Discord avatar decorations
    const w = el('div', 'cc-avf ccf-image ccf-' + fc.layer);
    const img = el('img', 'cc-deco');
    img.src = fc.url;
    img.alt = '';
    img.style.width = img.style.height = Math.round(size * fc.scale) + 'px';
    w.append(img, a);
    return w;
  }
  // ring around the picture (a frame bought in the Shop)
  const w = el('div', 'cc-avf ccf-' + fc.style);
  w.style.setProperty('--fb', fc.bg);
  w.style.setProperty('--fc', fc.c1);
  w.style.setProperty('--fw', (size >= 60 ? 4 : 3) + 'px');
  w.append(el('i', 'cc-ring'), a);
  return w;
}

// ---- gifts (Telegram style): emoji or picture + rarity
const RARITY = {
  common: ['Common', '#e5e7eb'], uncommon: ['Uncommon', '#22c55e'], rare: ['Rare', '#3b82f6'], epic: ['Epic', '#a855f7'],
  legendary: ['Legendary', '#f59e0b'], mythic: ['Mythic', '#f43f5e'], divine: ['Divine', '#7dd3fc'],
};
const RARITY_ORDER = Object.keys(RARITY);
const rarityOf = (d) => (d && RARITY[d.rarity] ? d.rarity : 'common');
function giftEl(d, size) {
  d = d || {};
  const r = rarityOf(d);
  const g = el('div', 'cc-gift cc-r-' + r);
  g.style.setProperty('--rc', RARITY[r][1]);
  g.style.width = g.style.height = size + 'px';
  if (safeImg(d.url)) {
    const i = el('img');
    i.src = d.url;
    i.alt = '';
    g.append(i);
  } else {
    const e = el('span', null, String(d.emoji || '🎁').slice(0, 8));
    e.style.fontSize = Math.round(size * 0.56) + 'px';
    g.append(e);
  }
  return g;
}
function rarityChip(d) {
  const r = rarityOf(d);
  const c = el('span', 'cc-rchip cc-r-' + r, RARITY[r][0]);
  c.style.setProperty('--rc', RARITY[r][1]);
  return c;
}
function pinnedGiftsEl(list, size) {
  const row = el('div', 'cc-pgifts');
  (list || []).slice(0, 3).forEach((g) => {
    const w = el('div', 'cc-pgift');
    w.title = g.name + (g.num ? ' #' + g.num : '') + (g.from && g.from.nick ? ' — from ' + g.from.nick : '');
    w.append(giftEl(g.data, size));
    row.append(w);
  });
  return row;
}

function mySoundCloud() {
  const a = document.querySelector('a.header__userNavUsernameButton');
  const href = a && a.getAttribute('href');
  const user = href && href.split('?')[0].split('/').filter(Boolean)[0];
  const sp = a && a.querySelector('span[style*="background-image"]');
  const m = sp && sp.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  return {
    url: user && /^[A-Za-z0-9_-]{1,60}$/.test(user) ? 'https://soundcloud.com/' + user : '',
    avatar: m ? m[1].replace(/-(t\d+x\d+|large|small|badge|tiny|crop)\./, '-t200x200.') : '',
  };
}

function myStats() {
  const t = STATS.total();
  return {
    songs: t.songs, listen: t.listen, app: t.app, likes: t.likes, reposts: t.reposts,
    comments: t.comments || 0, follows: t.follows || 0, games: t.games, best: S.game.best,
  };
}

// open a SoundCloud page inside SCX without reloading (SoundCloud's own router handles the link)
function goSoundCloud(url) {
  if (!/^https:\/\/soundcloud\.com\//.test(url || '')) return;
  const a = document.createElement('a');
  a.href = new URL(url).pathname;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  togglePanel(false);
}
async function listenToo(url) {
  if (!url) return;
  goSoundCloud(url);
  const path = new URL(url).pathname;
  await waitFor(() => location.pathname === path, 6000);
  const play = await waitFor(() => document.querySelector('.l-listen-hero .sc-button-play, .fullHero__playButton .sc-button-play, .listenHero .sc-button-play'), 6000);
  if (play && !play.classList.contains('sc-button-pause') && !/pause/i.test(play.title || '')) play.click();
}

// ---- background work: presence every 30 s, coins + stats every minute
let onSyncT = 0;
async function startOnline() {
  try {
    const r = await onlineCall('init');
    ON.uid = r.uid;
    ON.me = r.profile;
    ON.ready = true;
    ON.err = '';
    if (ON.me) { COINS.raiseTo(ON.me.coins); COINS.ping(); onlineHeartbeat(); onlineSync(); loadCounts(); setTimeout(checkMessages, 3000); }
    refreshPanel();
  } catch (e) {
    ON.err = e.message;
  }
  renderOnline();
}
async function onlineHeartbeat() {
  if (!ON.me) return;
  const tr = lastTrackInfo || {};
  try {
    await onlineCall('presence', {
      show: !!S.online.show,
      track: tr.title ? { title: tr.title, artist: tr.artist, url: tr.url, art: tr.art, playing: tr.playing } : null,
    });
  } catch {}
}
let sentBest = '';
async function onlineSync() {
  if (!ON.me) return;
  try {
    const p = await onlineCall('sync', { coins: COINS.total(), stats: myStats(), version: appVersion });
    if (p && p.id) { ON.me = p; COINS.ping(); }
    ON.err = '';
    const b = JSON.stringify(S.game.best || {});
    if (b !== sentBest) {
      sentBest = b;
      for (const [diff, best] of Object.entries(S.game.best || {})) if (best > 0) await onlineCall('score', { diff, best });
    }
  } catch (e) { ON.err = e.message; }
}
async function loadCounts() {
  try { ON.counts = await onlineCall('counts'); } catch {}
  renderOnline();
}
setInterval(onlineHeartbeat, 30000);
setInterval(onlineSync, 60000);
COINS.onChange(() => { clearTimeout(onSyncT); onSyncT = setTimeout(onlineSync, 15000); });
let lastPresKey = '';
setInterval(() => { // send right away when the song or play/pause changes
  const tr = lastTrackInfo || {};
  const k = tr.title + '|' + tr.playing;
  if (k !== lastPresKey) { lastPresKey = k; if (ON.me) onlineHeartbeat(); }
}, 3000);

async function refreshLists() {
  if (!ON.me) return;
  const [on, fo, top] = await Promise.allSettled([
    onlineCall('online'), onlineCall('following'), onlineCall('top', { kind: ON.topKind }),
  ]);
  if (on.status === 'fulfilled') ON.online = (on.value || []).filter((p) => p.profiles);
  if (fo.status === 'fulfilled') ON.following = fo.value || [];
  if (top.status === 'fulfilled') ON.top = top.value || [];
  const bad = [on, fo, top].find((x) => x.status === 'rejected');
  ON.err = bad ? bad.reason.message : '';
  renderOnline();
}
setInterval(() => {
  if (panel && panel.classList.contains('cc-open') && activeTab === 'Online' && !ON.view) refreshLists();
}, 15000);

async function openProfile(id) {
  ON.view = { loading: true, id };
  renderOnline();
  try { ON.view = Object.assign({ id }, await onlineCall('profile', { id })); } catch (e) { ON.view = { id, error: e.message }; }
  renderOnline();
}

// ---- UI
function personRow(p, sub, extra, onClick) {
  const row = el('button', 'cc-person');
  const txt = el('div', 'cc-ptxt');
  txt.append(nickLine(p), el('span', null, sub || ''));
  row.append(avatarEl(p, 34), txt);
  if (extra) row.append(extra);
  row.addEventListener('click', onClick || (() => openProfile(p.id)));
  return row;
}
function pillBtn(label, fn, cls) {
  const b = el('button', 'cc-sbtn' + (cls ? ' ' + cls : ''), label);
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}
const nowLine = (pr) => (pr && pr.title ? (pr.playing ? '🎵 ' : '⏸ ') + pr.title + (pr.artist ? ' — ' + pr.artist : '') : 'online');

function joinForm(box, editing) {
  const sc = mySoundCloud();
  const nick = el('input', 'cc-text');
  nick.placeholder = 'Your nick (3–20: letters, numbers, _ . -)';
  nick.maxLength = 20;
  nick.value = (ON.me && ON.me.nick) || '';
  const link = el('input', 'cc-text');
  link.placeholder = 'https://soundcloud.com/your-name';
  link.value = (ON.me && ON.me.sc_url) || sc.url;
  let useAv = !!(sc.avatar || (ON.me && ON.me.avatar));
  const avRow = toggleRow('Use my SoundCloud picture', () => useAv, (v) => { useAv = v; avRow.querySelector('.cc-switch').classList.toggle('cc-on', v); });
  avRow.querySelector('.cc-switch').classList.toggle('cc-on', useAv);
  const msg = el('div', 'cc-status');
  const save = wideBtn(editing ? 'Save' : 'Join SCX Online', async () => {
    msg.textContent = '';
    save.textContent = '…';
    try {
      ON.me = await onlineCall('saveProfile', {
        nick: nick.value.trim(),
        sc_url: link.value.trim().replace(/\/+$/, ''),
        avatar: useAv ? (sc.avatar || (ON.me && ON.me.avatar) || null) : null,
        version: appVersion,
      });
      ON.editing = false;
      onlineSync();
      onlineHeartbeat();
      loadCounts();
      refreshLists();
    } catch (e) {
      msg.textContent = e.message;
      save.textContent = editing ? 'Save' : 'Join SCX Online';
      return;
    }
    renderOnline();
  });
  box.append(sectionTitle(editing ? 'Edit profile' : 'Join SCX Online'));
  if (!editing) box.append(note('See who listens with SCX right now, follow people and compete for coins and SCX Beat scores.'));
  box.append(nick, el('div', 'cc-gap'), link, avRow, msg, save);
  if (editing) box.append(wideBtn('Cancel', () => { ON.editing = false; renderOnline(); }, 'cc-ghost'));
  else box.append(note('Only your nick, picture, what you play, coins and stats are shared. No e-mail, no password.'));
}

function renderProfileView(box) {
  const v = ON.view;
  box.append(wideBtn('←  Back', () => { ON.view = null; renderOnline(); refreshLists(); }, 'cc-ghost'));
  if (v.loading) { box.append(note('Loading…')); return; }
  if (v.error) { box.append(el('div', 'cc-status', v.error)); return; }
  const p = v.profile;
  if (p.profile_bg && safeImg(p.profile_bg)) {
    const ban = el('div', 'cc-pbanner');
    ban.style.backgroundImage = cssUrl(p.profile_bg);
    box.append(ban);
  }
  const head = el('div', 'cc-prof' + (p.profile_bg ? ' cc-prof-onbanner' : ''));
  head.append(avatarEl(p, 74));
  const nm = el('div', 'cc-prof-name');
  nm.append(nickLine(p), el('span', null, v.followers + ' followers · ' + v.following + ' following'));
  head.append(nm);
  box.append(head);

  const chips = el('div', 'cc-chips');
  chips.append(el('span', 'cc-chip cc-chip-scx', 'SCX' + (p.scx_version ? ' v' + p.scx_version : '')));
  if (p.sc_url) {
    const l = el('button', 'cc-chip cc-chip-link', '🔗 SoundCloud');
    l.title = p.sc_url;
    l.addEventListener('click', () => goSoundCloud(p.sc_url));
    chips.append(l);
  }
  chips.append(el('span', 'cc-chip cc-chip-coins', '🪙 ' + bal(p).toLocaleString('en-US')));
  if (p.tag_text) chips.append(tagEl(p));
  box.append(chips);
  if (v.gifts && v.gifts.length) box.append(pinnedGiftsEl(v.gifts, 54));

  if (!v.isMe) {
    const fb = wideBtn(v.iFollow ? 'Following ✓' : 'Follow', async () => {
      fb.textContent = '…';
      try {
        await onlineCall(v.iFollow ? 'unfollow' : 'follow', { id: p.id });
        v.iFollow = !v.iFollow;
        v.followers += v.iFollow ? 1 : -1;
        loadCounts();
      } catch (e) { toast(e.message); }
      renderOnline();
    }, v.iFollow ? 'cc-ghost' : '');
    const gb = wideBtn('🎁 Gift', () => giftDialog({ to: p }), 'cc-ghost');
    const r2 = el('div', 'cc-btnrow');
    r2.append(fb, gb);
    box.append(r2);
  } else {
    box.append(sectionTitle('🎁 My gifts'));
    const gbox = el('div', 'cc-mygifts');
    box.append(gbox, note('📌 Pin up to 3 gifts — everybody sees them on your profile (in SCX and on your SoundCloud page).'));
    renderMyGifts(gbox);
  }

  if (v.presence && v.presence.title) {
    box.append(sectionTitle('Now playing'));
    const np = el('div', 'cc-np');
    const art = el('i');
    if (safeAvatar(v.presence.art)) art.style.backgroundImage = cssUrl(v.presence.art);
    const tx = el('div');
    tx.append(el('b', null, v.presence.title), el('span', null, v.presence.artist || ''));
    np.append(art, tx);
    if (v.presence.url) np.append(pillBtn('▶ Listen too', () => listenToo(v.presence.url)));
    box.append(np);
  }

  const st = p.stats || {};
  box.append(sectionTitle('Stats'));
  const grid = el('div', 'cc-pstats');
  for (const [k, val] of [['🎵 Songs', st.songs || 0], ['🎧 Listening', fmtDur(st.listen)], ['⏱️ In SCX', fmtDur(st.app)],
    ['❤️ Likes', st.likes || 0], ['🔁 Reposts', st.reposts || 0], ['💬 Comments', st.comments || 0],
    ['👤 Follows', st.follows || 0], ['🎮 Games', st.games || 0]]) {
    const c = el('div');
    c.append(el('small', null, k), el('b', null, String(val)));
    grid.append(c);
  }
  box.append(grid);
  const best = {};
  (v.scores || []).forEach((s2) => { best[s2.diff] = s2.best; });
  box.append(sectionTitle('SCX Beat best'));
  const bg = el('div', 'cc-gamebest');
  for (const k of ['easy', 'normal', 'hard']) {
    const c = el('div');
    c.append(el('small', null, GAME_DIFF[k].label), el('b', null, (best[k] || 0).toLocaleString('en-US')));
    bg.append(c);
  }
  box.append(bg);
}

const MYG = { list: null, at: 0 };
async function renderMyGifts(box, force) {
  if (!MYG.list || force || Date.now() - MYG.at > 30000) {
    box.textContent = '';
    box.append(note('Loading…'));
    try { MYG.list = (await onlineCall('myGifts')) || []; MYG.at = Date.now(); } catch (e) { box.textContent = ''; box.append(el('div', 'cc-status', e.message)); return; }
  }
  box.textContent = '';
  const list = MYG.list;
  if (!list.length) { box.append(note('No gifts yet. Friends can send you gifts from your profile or the Shop.')); return; }
  const gifts = list.filter((g) => g.kind === 'gift');
  if (gifts.length) {
    const grid = el('div', 'cc-giftgrid');
    for (const g of gifts) {
      const c = el('div', 'cc-giftcell' + (g.pinned ? ' cc-pinned' : ''));
      c.style.setProperty('--rc', RARITY[rarityOf(g.data)][1]);
      c.append(giftEl(g.data, 46), el('b', null, g.name), el('small', null, (g.num ? '#' + g.num + ' · ' : '') + (g.from && g.from.nick ? 'from ' + g.from.nick : 'bought')));
      if (g.note) c.title = '"' + g.note + '"';
      const pin = el('button', 'cc-sbtn' + (g.pinned ? ' cc-ghostbtn' : ''), g.pinned ? 'Unpin' : '📌 Pin');
      pin.addEventListener('click', async () => {
        let slot = null;
        if (!g.pinned) {
          const used = new Set(gifts.filter((x) => x.pinned).map((x) => x.pinned));
          slot = [1, 2, 3].find((n) => !used.has(n));
          if (!slot) return toast('Max 3 on the profile — unpin one first');
        }
        pin.textContent = '…';
        try { await onlineCall('pinGift', { gift: g.id, slot }); g.pinned = slot; badgeCache.clear(); } catch (e) { toast(e.message); }
        if (ON.view && ON.view.isMe) ON.view.gifts = gifts.filter((x) => x.pinned).sort((a, b) => a.pinned - b.pinned);
        renderOnline();
      });
      c.append(pin);
      grid.append(c);
    }
    box.append(grid);
  }
  const other = list.filter((g) => g.kind !== 'gift');
  for (const g of other.slice(0, 20)) {
    const r = el('div', 'cc-giftline');
    r.append(el('span', null, (g.kind === 'coins' ? '🪙 ' + Number(g.amount || 0).toLocaleString('en-US') + ' coins' : (g.kind === 'tag' ? '🏷️ ' : '⭕ ') + g.name)),
      el('small', null, 'from ' + ((g.from && g.from.nick) || '?') + (g.note ? ' — "' + g.note + '"' : '')));
    box.append(r);
  }
}

// ---- gift dialog: pick person → pick coins / gift / tag / frame → note → send
const GD = { el: null };
function giftDialog(opts) {
  if (!ON.me) return toast('Join SCX Online first (Online tab)');
  const st = { to: opts.to || null, item: opts.item || null, coins: opts.coins || 0, tab: opts.item ? opts.item.kind : 'gift', q: '', res: [], note: '' };
  if (GD.el) GD.el.remove();
  const wrap = el('div', 'cc-gdlg');
  const card = el('div', 'cc-gcard');
  wrap.append(card);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  togglePanel(true);
  panel.append(wrap); // inside the menu, so it uses the menu's look
  GD.el = wrap;
  function close() { wrap.remove(); if (GD.el === wrap) GD.el = null; }
  if (!SHOP.items.length) onlineCall('shop').then((r) => { SHOP.items = r.items || []; SHOP.owned = new Set(r.owned || []); paint(); }).catch(() => {});

  function paint() {
    card.textContent = '';
    const head = el('div', 'cc-ghead');
    const x = el('button', 'cc-gx', '✕');
    x.addEventListener('click', close);
    head.append(el('b', null, '🎁 Send a gift'), x);
    card.append(head);
    // 1) who
    if (!st.to) {
      card.append(el('small', 'cc-gstep', 'Who gets it?'));
      const q = el('input', 'cc-text');
      q.placeholder = 'Search SCX nick…';
      q.value = st.q;
      let t;
      q.addEventListener('input', () => {
        st.q = q.value;
        clearTimeout(t);
        t = setTimeout(async () => { try { st.res = st.q.trim() ? await onlineCall('search', { q: st.q }) : []; } catch { st.res = []; } paintPeople(); }, 300);
      });
      const people = el('div', 'cc-gpeople');
      const paintPeople = () => {
        people.textContent = '';
        const list = (st.q.trim() ? st.res : ON.following).filter((p) => p && p.id && p.id !== ON.uid);
        if (!list.length) people.append(note(st.q.trim() ? 'Nobody found' : 'Search a nick (people you follow show here)'));
        list.slice(0, 12).forEach((p) => {
          const b = el('button', 'cc-person');
          const tx = el('div', 'cc-ptxt');
          tx.append(nickLine(p), el('span', null, '🪙 ' + bal(p).toLocaleString('en-US')));
          b.append(avatarEl(p, 30), tx);
          b.addEventListener('click', () => { st.to = p; paint(); });
          people.append(b);
        });
      };
      card.append(q, people);
      paintPeople();
      setTimeout(() => q.focus());
      return;
    }
    const who = el('div', 'cc-gwho');
    who.append(avatarEl(st.to, 34), el('span', null, st.to.id === ON.uid ? 'For you' : 'To ' + (st.to.nick || '?')));
    if (!opts.to) { const ch = el('button', 'cc-sbtn cc-ghostbtn', 'Change'); ch.addEventListener('click', () => { st.to = null; paint(); }); who.append(ch); }
    card.append(who);
    // 2) what
    const self = st.to.id === ON.uid;
    if (!opts.item) {
      const tabs = self ? [['gift', '🎁 Gifts']] : [['coins', '🪙 Coins'], ['gift', '🎁 Gifts'], ['tag', '🏷️ Tags'], ['frame', '⭕ Frames']];
      if (!tabs.some((t2) => t2[0] === st.tab)) st.tab = 'gift';
      const seg = el('div', 'cc-gtabs');
      tabs.forEach(([k, l]) => { const b = el('button', st.tab === k ? 'cc-on' : '', l); b.addEventListener('click', () => { st.tab = k; st.item = null; paint(); }); seg.append(b); });
      card.append(seg);
      if (st.tab === 'coins') {
        const amt = el('input', 'cc-text');
        amt.inputMode = 'numeric';
        amt.placeholder = 'How many coins?';
        amt.value = st.coins || '';
        amt.addEventListener('input', () => { st.coins = Math.max(0, Math.floor(Number(amt.value.replace(/\D/g, '')) || 0)); sendB.textContent = sendLabel(); });
        const quick = el('div', 'cc-gquick');
        [100, 500, 1000, 5000].forEach((n) => { const b = el('button', 'cc-sbtn cc-ghostbtn', '+' + n); b.addEventListener('click', () => { st.coins += n; amt.value = st.coins; sendB.textContent = sendLabel(); }); quick.append(b); });
        card.append(amt, quick, el('small', 'cc-gstep', 'You have 🪙 ' + coinBalance().toLocaleString('en-US')));
      } else {
        const grid = el('div', 'cc-gitems');
        const items = SHOP.items.filter((it) => it.kind === st.tab && it.active !== false);
        if (st.tab === 'gift') items.sort((a, b) => RARITY_ORDER.indexOf(rarityOf(a.data)) - RARITY_ORDER.indexOf(rarityOf(b.data)) || a.price - b.price);
        if (!items.length) grid.append(note(SHOP.items.length ? 'Nothing here yet' : 'Loading…'));
        items.forEach((it) => {
          const b = el('button', 'cc-gitem' + (st.item && st.item.id === it.id ? ' cc-on' : ''));
          const d = it.data || {};
          if (it.kind === 'gift') { b.append(giftEl(d, 40)); b.style.setProperty('--rc', RARITY[rarityOf(d)][1]); }
          else if (it.kind === 'tag') b.append(tagEl({ tag_text: d.text || it.name, tag_color: d.color }));
          else b.append(avatarEl({ nick: st.to.nick, avatar: st.to.avatar, frame: d }, 32));
          b.append(el('small', null, '🪙 ' + it.price.toLocaleString('en-US')));
          b.title = it.name;
          b.addEventListener('click', () => { st.item = it; paint(); });
          grid.append(b);
        });
        card.append(grid);
      }
    }
    if (st.item) {
      const sel = el('div', 'cc-gsel');
      const d = st.item.data || {};
      if (st.item.kind === 'gift') sel.append(giftEl(d, 64));
      else if (st.item.kind === 'tag') sel.append(tagEl({ tag_text: d.text || st.item.name, tag_color: d.color }));
      else sel.append(avatarEl({ nick: st.to.nick, avatar: st.to.avatar, frame: d }, 56));
      const tx = el('div');
      tx.append(el('b', null, st.item.name));
      if (st.item.kind === 'gift') tx.append(rarityChip(d));
      if (st.item.supply) tx.append(el('small', null, Math.max(0, st.item.supply - (st.item.sold || 0)) + ' / ' + st.item.supply + ' left'));
      sel.append(tx);
      card.append(sel);
    }
    // 3) note + send
    const msg = el('input', 'cc-text');
    msg.placeholder = self ? 'Note (optional)' : 'Message (optional)';
    msg.maxLength = 200;
    msg.value = st.note;
    msg.addEventListener('input', () => { st.note = msg.value; });
    const status = el('div', 'cc-status');
    const price = () => (st.tab === 'coins' && !opts.item ? st.coins : st.item ? st.item.price : 0);
    const sendLabel = () => (st.tab === 'coins' && !opts.item ? (st.coins ? 'Send 🪙 ' + st.coins.toLocaleString('en-US') : 'Send coins')
      : st.item ? (self ? 'Buy' : 'Send') + ' for 🪙 ' + st.item.price.toLocaleString('en-US') : 'Pick something');
    let armed = 0;
    const sendB = wideBtn(sendLabel(), async () => {
      const coinsMode = st.tab === 'coins' && !opts.item;
      if (coinsMode ? !st.coins : !st.item) return;
      if (coinBalance() < price()) { status.textContent = 'Not enough coins'; return; }
      if (Date.now() - armed > 4000) { armed = Date.now(); sendB.textContent = 'Sure? ' + sendLabel(); sendB.classList.add('cc-armed'); return; }
      sendB.textContent = '…';
      await onlineSync();
      try {
        if (coinsMode) await onlineCall('sendCoins', { id: st.to.id, amount: st.coins, note: st.note });
        else await onlineCall('gift', { id: st.to.id, item: st.item.id, note: st.note });
        await refreshMe();
        MYG.list = null;
        badgeCache.clear();
        if (st.item) { st.item.sold = (st.item.sold || 0) + 1; }
        toast(self ? '🎁 ' + st.item.name + ' is yours — pin it in My gifts' : '🎁 Sent to ' + st.to.nick + '!');
        close();
        renderShop();
        if (ON.view) openProfile(ON.view.id);
      } catch (e) { status.textContent = e.message; sendB.textContent = sendLabel(); sendB.classList.remove('cc-armed'); }
    });
    card.append(msg, status, sendB);
  }
  paint();
}

function renderOnline() {
  const box = ON.root;
  if (!box) return;
  const mark = refreshers.length;
  try { renderOnlineInto(box); } finally {
    // the switches / buttons made here only need one paint; don't keep them in the global list
    refreshers.splice(mark).forEach((f) => f());
  }
}

function renderOnlineInto(box) {
  box.textContent = '';
  if (!ON.ready) {
    box.append(sectionTitle('SCX Online'), note(ON.err ? '' : 'Connecting…'));
    if (ON.err) box.append(el('div', 'cc-status', ON.err), wideBtn('Try again', startOnline, 'cc-ghost'));
    return;
  }
  if (ON.view) return renderProfileView(box);
  if (!ON.me || ON.editing) return joinForm(box, !!ON.me);

  // me
  const me = el('div', 'cc-prof cc-prof-me');
  if (ON.me.profile_bg && safeImg(ON.me.profile_bg)) {
    me.classList.add('cc-prof-bg');
    me.style.setProperty('--pbg', cssUrl(ON.me.profile_bg));
  }
  me.append(avatarEl(ON.me, 52));
  const nm = el('div', 'cc-prof-name');
  nm.append(nickLine(ON.me), el('span', null, '🪙 ' + coinBalance().toLocaleString('en-US') + '  ·  ' + ON.counts.followers + ' followers · ' + ON.counts.following + ' following'));
  me.append(nm);
  me.addEventListener('click', () => openProfile(ON.uid));
  box.append(me);
  const row = el('div', 'cc-btnrow');
  row.append(wideBtn('My profile', () => openProfile(ON.uid), 'cc-ghost'), wideBtn('Edit', () => { ON.editing = true; renderOnline(); }, 'cc-ghost'));
  box.append(row, toggleRow('Show me online', () => S.online.show, (v) => { S.online.show = v; saveAll(); onlineHeartbeat(); renderOnline(); }));
  if (ON.err) box.append(el('div', 'cc-status', ON.err));

  // online now
  const others = ON.online.filter((p) => p.user_id !== ON.uid);
  box.append(sectionTitle('Online now · ' + others.length));
  if (!others.length) box.append(note('Nobody else is online right now. Send SCX to your friends!'));
  for (const p of others) {
    const extra = p.url ? pillBtn('▶', () => listenToo(p.url)) : null;
    if (extra) extra.title = 'Listen too';
    box.append(personRow(p.profiles, nowLine(p), extra));
  }

  // following
  box.append(sectionTitle('Following · ' + ON.following.length));
  if (!ON.following.length) box.append(note('Open someone\'s profile and press Follow.'));
  for (const p of ON.following) {
    const dot = el('i', 'cc-dot' + (p.presence ? ' cc-dot-on' : ''));
    box.append(personRow(p, p.presence ? nowLine(p.presence) : 'offline', dot));
  }

  // leaderboard
  box.append(sectionTitle('Leaderboard'));
  box.append(segmented([['coins', '🪙 Coins'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], () => ON.topKind,
    (v) => { ON.topKind = v; ON.top = []; renderOnline(); onlineCall('top', { kind: v }).then((r) => { ON.top = r || []; renderOnline(); }).catch(() => {}); }));
  ON.top.forEach((p, i) => {
    const val = ON.topKind === 'coins' ? '🪙 ' + bal(p).toLocaleString('en-US') : (p.best || 0).toLocaleString('en-US');
    const r = personRow(p, val, el('span', 'cc-rank', '#' + (i + 1)));
    if (p.id === ON.uid) r.classList.add('cc-person-me');
    box.append(r);
  });

  // search
  box.append(sectionTitle('Find people'));
  const q = el('input', 'cc-text');
  q.placeholder = 'Search by nick';
  q.value = ON.q;
  let qt;
  q.addEventListener('input', () => {
    ON.q = q.value;
    clearTimeout(qt);
    qt = setTimeout(async () => {
      try { ON.results = ON.q.trim() ? await onlineCall('search', { q: ON.q }) : []; } catch { ON.results = []; }
      const list = box.querySelector('.cc-results');
      if (list) { list.textContent = ''; ON.results.forEach((p) => list.append(personRow(p, '🪙 ' + bal(p).toLocaleString('en-US')))); }
    }, 350);
  });
  const results = el('div', 'cc-results');
  ON.results.forEach((p) => results.append(personRow(p, '🪙 ' + bal(p).toLocaleString('en-US'))));
  box.append(q, results);
}

function buildOnlineTab() {
  const t = el('div', 'cc-tab');
  ON.root = t;
  let wasActive = false;
  refreshers.push(() => {
    const active = activeTab === 'Online' && panel && panel.classList.contains('cc-open');
    if (active && !wasActive) { renderOnline(); if (ON.me && !ON.view) refreshLists(); }
    wasActive = active;
  });
  renderOnline();
  return t;
}

// ================================================================ SHOP 🛒 (spend coins: tags, pictures, GIFs, themes)
const SHOP = { items: [], owned: new Set(), loading: false, err: '', armed: 0, armedId: null, root: null };

async function loadShop() {
  if (!ON.me) return;
  SHOP.loading = true;
  renderShop();
  try {
    const r = await onlineCall('shop');
    SHOP.items = r.items || [];
    SHOP.owned = new Set(r.owned || []);
    SHOP.err = '';
  } catch (e) { SHOP.err = e.message; }
  SHOP.loading = false;
  renderShop();
}

async function refreshMe() {
  try {
    const r = await onlineCall('init');
    if (r.profile) { ON.me = r.profile; COINS.ping(); }
  } catch {}
}

async function buyItem(it, btn) {
  // second click confirms
  if (SHOP.armedId !== it.id || Date.now() - SHOP.armed > 4000) {
    SHOP.armedId = it.id;
    SHOP.armed = Date.now();
    btn.textContent = 'Buy for 🪙 ' + it.price.toLocaleString('en-US') + '?';
    btn.classList.add('cc-armed');
    return;
  }
  SHOP.armedId = null;
  btn.textContent = '…';
  await onlineSync(); // make sure the server knows all your coins first
  try {
    await onlineCall('buy', { item: it.id });
    SHOP.owned.add(it.id);
    toast('Bought ' + it.name + ' 🎉');
    await refreshMe();
    useItem(it);
  } catch (e) {
    toast(e.message);
  }
  renderShop();
}

function applyShopTheme(d) {
  const col = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  S.theme.accent = col(d.accent) || S.theme.accent;
  S.theme.slider = col(d.slider) || S.theme.slider;
  S.theme.bg = col(d.panel) || S.theme.bg;
  S.menu.bg = col(d.menu) || S.menu.bg;
  const cyc = (Array.isArray(d.cycle) ? d.cycle : []).map(col).filter(Boolean).slice(0, 6);
  if (cyc.length >= 2) { S.viz.cycle = cyc; S.viz.color = 'cycle'; }
  if (d.scene && SCENES[d.scene]) S.bg = Object.assign({}, S.bg, { mode: 'scene', scene: d.scene, blur: 0, dim: 0.05, glass: true });
  saveAll(); applyCSS(); applyBg(); refreshPanel();
}

async function useItem(it, where) {
  const d = it.data || {};
  if (it.kind === 'tag') {
    try { await onlineCall('equip', { item: it.id }); await refreshMe(); toast('Tag on: ' + (d.text || it.name)); } catch (e) { toast(e.message); }
  } else if (it.kind === 'theme') {
    applyShopTheme(d);
    toast(it.name + ' theme on');
  } else if (safeImg(d.url)) {
    if (where === 'menu') { setSlotUrl('menu', d.url); applyMenu(); }
    else { setSlotUrl('bg', d.url); S.bg.mode = 'custom'; saveAll(); applyBg(); }
    toast(it.name + (where === 'menu' ? ' → menu' : ' → background'));
  }
  renderShop();
}

function shopCard(it) {
  const d = it.data || {};
  const owned = SHOP.owned.has(it.id);
  const card = el('div', 'cc-shopcard cc-shop-' + it.kind);
  const pic = el('div', 'cc-shoppic');
  if (it.kind === 'gift') {
    pic.append(giftEl(d, 52));
    card.classList.add('cc-r-' + rarityOf(d));
    card.style.setProperty('--rc', RARITY[rarityOf(d)][1]);
  } else if (it.kind === 'tag') {
    pic.append(tagEl({ tag_text: d.text || it.name, tag_color: d.color }));
  } else if (it.kind === 'frame') {
    pic.append(avatarEl({ nick: (ON.me && ON.me.nick) || 'S', avatar: ON.me && ON.me.avatar, frame: d }, 40));
  } else if (it.kind === 'theme') {
    const cols = (Array.isArray(d.cycle) && d.cycle.length ? d.cycle : [d.accent, d.slider, d.menu]).filter(Boolean);
    pic.style.background = 'linear-gradient(135deg,' + cols.join(',') + ')';
    if (d.scene && SCENES[d.scene]) pic.append(el('small', null, SCENES[d.scene].emoji + ' ' + SCENES[d.scene].name));
  } else if (safeImg(d.url)) {
    pic.style.backgroundImage = cssUrl(d.url);
    if (it.kind === 'gif') pic.append(el('small', null, 'GIF'));
  }
  const info = el('div', 'cc-shopinfo');
  info.append(el('b', null, it.name));
  if (it.kind === 'gift') {
    const left = it.supply ? Math.max(0, it.supply - (it.sold || 0)) : null;
    const sub = el('span', null, '🪙 ' + it.price.toLocaleString('en-US'));
    info.append(rarityChip(d), sub);
    if (left != null) info.append(el('small', 'cc-supply' + (left ? '' : ' cc-soldout'), left ? left.toLocaleString('en-US') + ' / ' + it.supply.toLocaleString('en-US') + ' left' : 'Sold out'));
  } else info.append(el('span', null, owned ? 'Owned' : '🪙 ' + it.price.toLocaleString('en-US')));
  card.append(pic, info);
  const row = el('div', 'cc-shopbtns');
  if (it.kind === 'gift') {
    const soldOut = it.supply && (it.sold || 0) >= it.supply;
    const send = el('button', 'cc-sbtn' + (soldOut ? ' cc-dim' : ''), '🎁 Send');
    send.addEventListener('click', () => (soldOut ? toast('Sold out') : giftDialog({ item: it })));
    const mine = el('button', 'cc-sbtn cc-ghostbtn' + (soldOut ? ' cc-dim' : ''), 'For me');
    mine.title = 'Buy it for yourself and pin it on your profile';
    mine.addEventListener('click', () => (soldOut ? toast('Sold out') : giftDialog({ item: it, to: ON.me })));
    row.append(send, mine);
    card.append(row);
    return card;
  }
  if (it.kind === 'tag' || it.kind === 'frame') {
    const gb = el('button', 'cc-sbtn cc-ghostbtn cc-giftbtn', '🎁');
    gb.title = 'Send it to someone as a gift';
    gb.addEventListener('click', () => giftDialog({ item: it }));
    card.append(gb);
  }
  if (!owned) {
    const b = el('button', 'cc-sbtn' + (coinBalance() < it.price ? ' cc-dim' : ''), coinBalance() < it.price ? 'Need 🪙 ' + (it.price - coinBalance()).toLocaleString('en-US') : 'Buy');
    b.addEventListener('click', () => { if (coinBalance() >= it.price) buyItem(it, b); else toast('Not enough coins yet'); });
    row.append(b);
  } else if (it.kind === 'tag') {
    const on = ON.me && ON.me.tag_text && ON.me.tag_text === (d.text || it.name);
    const b = el('button', 'cc-sbtn' + (on ? ' cc-ghostbtn' : ''), on ? 'Take off' : 'Wear');
    b.addEventListener('click', async () => {
      if (on) { try { await onlineCall('equip', { item: null }); await refreshMe(); } catch (e) { toast(e.message); } renderShop(); }
      else useItem(it);
    });
    row.append(b);
  } else if (it.kind === 'frame') {
    const on = ON.me && ON.me.frame && ON.me.frame.name === it.name;
    const b = el('button', 'cc-sbtn' + (on ? ' cc-ghostbtn' : ''), on ? 'Take off' : 'Wear');
    b.addEventListener('click', async () => {
      try { await onlineCall('equipFrame', { item: on ? null : it.id }); await refreshMe(); if (!on) toast('Frame on: ' + it.name); } catch (e) { toast(e.message); }
      renderShop();
    });
    row.append(b);
  } else if (it.kind === 'theme') {
    const b = el('button', 'cc-sbtn', 'Apply');
    b.addEventListener('click', () => useItem(it));
    row.append(b);
  } else {
    const b1 = el('button', 'cc-sbtn', 'Screen');
    b1.title = 'Background of SCX';
    b1.addEventListener('click', () => useItem(it, 'bg'));
    const b2 = el('button', 'cc-sbtn cc-ghostbtn', 'Menu');
    b2.addEventListener('click', () => useItem(it, 'menu'));
    const onP = ON.me && ON.me.profile_bg === d.url;
    const b3 = el('button', 'cc-sbtn' + (onP ? ' cc-ghostbtn' : ''), onP ? 'Off' : 'Profile');
    b3.title = onP ? 'Remove from your profile' : 'Background of your profile (SCX + your SoundCloud page)';
    b3.addEventListener('click', async () => {
      try { await onlineCall('equipBg', { item: onP ? null : it.id }); await refreshMe(); if (!onP) toast(it.name + ' → your profile'); } catch (e) { toast(e.message); }
      renderShop();
    });
    row.append(b1, b2, b3);
  }
  card.append(row);
  return card;
}

function renderShop() {
  const box = SHOP.root;
  if (!box) return;
  const mark = refreshers.length;
  box.textContent = '';
  const head = el('div', 'cc-shophead');
  head.append(el('b', null, '🪙 ' + coinBalance().toLocaleString('en-US')), el('span', null, 'your coins'));
  box.append(head);
  if (!ON.me) {
    box.append(note('Join SCX Online (Online tab) to use the shop — your purchases are saved to your profile.'));
    return;
  }
  if (SHOP.err) box.append(el('div', 'cc-status', SHOP.err));
  if (SHOP.loading && !SHOP.items.length) box.append(note('Loading the shop…'));
  box.append(wideBtn('🎁  Send a gift / coins to someone', () => giftDialog({}), 'cc-ghost'));
  for (const [kind, title] of [['gift', '🎁 Gifts'], ['tag', '🏷️ Tags'], ['frame', '⭕ Frames'], ['theme', '🎨 Themes'], ['gif', '🎞️ GIFs'], ['image', '🖼️ Pictures']]) {
    const list = SHOP.items.filter((x) => x.kind === kind && x.active !== false);
    if (kind === 'gift') list.sort((a, b) => RARITY_ORDER.indexOf(rarityOf(a.data)) - RARITY_ORDER.indexOf(rarityOf(b.data)) || a.price - b.price);
    if (!list.length) continue;
    box.append(sectionTitle(title));
    const grid = el('div', 'cc-shopgrid');
    list.forEach((it) => grid.append(shopCard(it)));
    box.append(grid);
  }
  if (!SHOP.loading && !SHOP.items.length && !SHOP.err) box.append(note('The shop is empty for now.'));
  box.append(note('Tags, frames and profile pictures / GIFs show on your SCX profile and on your SoundCloud page (for everyone who uses SCX).'));
  refreshers.splice(mark).forEach((f) => f());
}

function buildShopTab() {
  const t = el('div', 'cc-tab');
  SHOP.root = t;
  let was = false;
  refreshers.push(() => {
    const active = activeTab === 'Shop' && panel && panel.classList.contains('cc-open');
    if (active && !was) loadShop();
    was = active;
  });
  COINS.onChange(() => { if (activeTab === 'Shop') renderShop(); });
  renderShop();
  return t;
}

// ================================================================ SCX ADMIN 🛡️
const ADM = { items: [], kind: 'tag', root: null, msg: '' };
const isAdmin = () => !!(ON.me && ON.me.is_admin);

async function loadAdminItems() {
  try { const r = await onlineCall('adminItems'); ADM.items = Array.isArray(r) ? r : []; } catch (e) { ADM.msg = e.message; }
  renderAdmin();
}

function field(label, input) {
  const w = el('div', 'cc-field');
  w.append(el('small', null, label), input);
  return w;
}
function textInput(ph, val) {
  const i = el('input', 'cc-text');
  i.placeholder = ph;
  if (val != null) i.value = val;
  return i;
}
function colorInput(val) {
  const i = el('input', 'cc-color');
  i.type = 'color';
  i.value = val;
  return i;
}

function renderAdmin() {
  const box = ADM.root;
  if (!box) return;
  const mark = refreshers.length;
  box.textContent = '';
  if (!isAdmin()) {
    box.append(note('Only SCX ADMIN can open this.'));
    return;
  }
  const status = el('div', 'cc-status');
  const done = (m, good) => { status.textContent = m; status.classList.toggle('cc-good', !!good); };

  // ---- add to shop
  box.append(sectionTitle('🛒 Add to the shop'));
  box.append(segmented([['gift', 'Gift'], ['tag', 'Tag'], ['frame', 'Frame'], ['image', 'Picture'], ['gif', 'GIF'], ['theme', 'Theme']], () => ADM.kind, (v) => { ADM.kind = v; renderAdmin(); }));
  const name = textInput('Name in the shop');
  const price = textInput('Price in coins');
  price.inputMode = 'numeric';
  box.append(field('Name', name), field('Price 🪙', price));
  let getData = () => ({});
  let supplyIn = null;
  // upload helper (picture / GIF → Supabase storage)
  const uploader = (accept, onUrl) => {
    const file = el('input');
    file.type = 'file';
    file.accept = accept;
    file.className = 'cc-hidden-color';
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) toast('Tip: files over 3 MB use a lot of free Supabase traffic');
      done('Uploading…');
      try {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        onUrl(await onlineCall('adminUpload', { mime: f.type, base64 }));
        done('Uploaded ✓', true);
      } catch (e) { done(e.message); }
    });
    return file;
  };
  if (ADM.kind === 'gift') {
    let look = 'emoji';
    const emo = textInput('Emoji, e.g. 🐉');
    emo.maxLength = 8;
    const url = textInput('https://… (or upload)');
    const rar = el('select', 'cc-text');
    RARITY_ORDER.forEach((k) => { const o = el('option', null, RARITY[k][0]); o.value = k; rar.append(o); });
    supplyIn = textInput('Empty = unlimited');
    supplyIn.inputMode = 'numeric';
    const prev = el('div', 'cc-shoppic cc-admprev');
    const paint = () => { prev.textContent = ''; prev.append(giftEl(getData(), 56)); };
    const file = uploader('image/png,image/gif,image/webp,image/jpeg', (u) => { url.value = u; paint(); });
    const lookSeg = el('div', 'cc-gtabs');
    const lookBox = el('div');
    const paintLook = () => {
      lookSeg.textContent = '';
      [['emoji', '😀 Emoji'], ['pic', '🖼️ Picture / GIF']].forEach(([k, l]) => { const b = el('button', look === k ? 'cc-on' : '', l); b.addEventListener('click', () => { look = k; paintLook(); paint(); }); lookSeg.append(b); });
      lookBox.textContent = '';
      if (look === 'emoji') lookBox.append(field('Emoji', emo));
      else lookBox.append(field('Picture', url), wideBtn('Upload picture / GIF…', () => file.click(), 'cc-ghost'), file);
    };
    [emo, url].forEach((i) => i.addEventListener('input', paint));
    rar.addEventListener('change', paint);
    box.append(lookSeg, lookBox, field('Rarity', rar), field('How many exist (limited)', supplyIn), prev);
    getData = () => (look === 'emoji' ? { emoji: emo.value.trim() || '🎁', rarity: rar.value } : { url: url.value.trim(), rarity: rar.value });
    paintLook();
    setTimeout(paint);
  } else if (ADM.kind === 'tag') {
    const txt = textInput('Tag text, e.g. 🔥 FIRE');
    txt.maxLength = 24;
    const c = colorInput('#ff5500');
    box.append(field('Tag text', txt), field('Tag color', c));
    getData = () => ({ text: txt.value.trim() || name.value.trim(), color: c.value });
  } else if (ADM.kind === 'frame') {
    const cols = ['#ff5500', '#ffd000', '#ff1e00'].map(colorInput);
    const style = el('select', 'cc-text');
    [['gradient', 'Gradient'], ['spin', 'Spinning'], ['glow', 'Glowing'], ['image', 'Picture / GIF (like Discord)']].forEach(([v, l]) => { const o = el('option', null, l); o.value = v; style.append(o); });
    const row = el('div', 'cc-colrow');
    cols.forEach((c) => row.append(c));
    const url = textInput('https://… (or upload)');
    const layer = el('select', 'cc-text');
    [['behind', 'Behind the profile picture'], ['over', 'Over the profile picture (transparent PNG / GIF)']].forEach(([v, l]) => { const o = el('option', null, l); o.value = v; layer.append(o); });
    const scale = el('input', 'cc-range');
    scale.type = 'range'; scale.min = '100'; scale.max = '180'; scale.step = '5'; scale.value = '130';
    const prev = el('div', 'cc-shoppic cc-admprev cc-admprev-big');
    const paint = () => { prev.textContent = ''; prev.append(avatarEl({ nick: (ON.me && ON.me.nick) || 'S', avatar: ON.me && ON.me.avatar, frame: getData() }, 56)); };
    const file = uploader('image/png,image/gif,image/webp', (u) => { url.value = u; paint(); });
    const colBox = field('Frame colors', row);
    const picBox = el('div');
    picBox.append(field('Picture', url), wideBtn('Upload picture / GIF…', () => file.click(), 'cc-ghost'), file, field('Where', layer), field('Size', scale));
    const sync = () => { const pic = style.value === 'image'; colBox.style.display = pic ? 'none' : ''; picBox.style.display = pic ? '' : 'none'; paint(); };
    cols.forEach((c) => c.addEventListener('input', paint));
    [layer, scale, url].forEach((i) => i.addEventListener('input', paint));
    layer.addEventListener('change', paint);
    style.addEventListener('change', sync);
    box.append(field('Style', style), colBox, picBox, prev);
    getData = () => (style.value === 'image'
      ? { style: 'image', url: url.value.trim(), layer: layer.value, scale: Number(scale.value) / 100 }
      : { style: style.value, colors: cols.map((c) => c.value) });
    setTimeout(sync);
  } else if (ADM.kind === 'theme') {
    const cols = ['#ff2a6d', '#d300c5', '#7a04eb'].map(colorInput);
    const acc = colorInput('#ff2a6d'), sl = colorInput('#ff2a6d'), menu = colorInput('#12041a');
    const scene = el('select', 'cc-text');
    [['', 'No moving background'], ...SCENE_ORDER.map((k) => [k, SCENES[k].emoji + ' ' + SCENES[k].name])].forEach(([v, l]) => {
      const o = el('option', null, l); o.value = v; scene.append(o);
    });
    const row = el('div', 'cc-colrow');
    cols.forEach((c) => row.append(c));
    box.append(field('Visual colors (like Rainbow, but yours)', row), field('Accent', acc), field('Sliders', sl), field('Menu', menu), field('Background', scene));
    getData = () => ({ cycle: cols.map((c) => c.value), accent: acc.value, slider: sl.value, menu: menu.value, panel: menu.value, scene: scene.value || undefined });
  } else {
    const url = textInput('https://… (or upload)');
    const file = el('input');
    file.type = 'file';
    file.accept = ADM.kind === 'gif' ? 'image/gif' : 'image/png,image/jpeg,image/webp';
    file.className = 'cc-hidden-color';
    const prev = el('div', 'cc-shoppic cc-admprev');
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      done('Uploading…');
      try {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        url.value = await onlineCall('adminUpload', { mime: f.type, base64 });
        prev.style.backgroundImage = cssUrl(url.value);
        done('Uploaded ✓', true);
      } catch (e) { done(e.message); }
    });
    box.append(field('File', url), wideBtn(ADM.kind === 'gif' ? 'Upload GIF…' : 'Upload picture…', () => file.click(), 'cc-ghost'), file, prev);
    getData = () => ({ url: url.value.trim() });
  }
  box.append(wideBtn('Add to shop', async () => {
    const data = getData();
    if ((ADM.kind === 'image' || ADM.kind === 'gif' || data.style === 'image' || (ADM.kind === 'gift' && !data.emoji)) && !/^https:\/\//.test(data.url || '')) return done('Upload a file or paste an https:// link');
    try {
      await onlineCall('adminAdd', { kind: ADM.kind, name: name.value, price: price.value, data, supply: supplyIn ? supplyIn.value : null });
      done('Added ✓', true);
      loadAdminItems();
      SHOP.items = [];
    } catch (e) { done(e.message); }
  }), status);

  // ---- items
  box.append(sectionTitle('Shop items · ' + ADM.items.length));
  for (const it of ADM.items) {
    const r = el('div', 'cc-admitem' + (it.active ? '' : ' cc-off'));
    r.append(el('span', null, it.kind + ' · ' + it.name), el('small', null, '🪙 ' + Number(it.price).toLocaleString('en-US') + (it.supply ? ' · ' + (it.sold || 0) + '/' + it.supply : '')));
    const t = el('button', 'cc-sbtn cc-ghostbtn', it.active ? 'Hide' : 'Show');
    t.addEventListener('click', async () => { try { await onlineCall('adminToggle', { item: it.id, active: !it.active }); loadAdminItems(); } catch (e) { done(e.message); } });
    const x = el('button', 'cc-sbtn cc-redbtn', '🗑');
    let arm = 0;
    x.addEventListener('click', async () => {
      if (Date.now() - arm > 3000) { arm = Date.now(); x.textContent = 'Sure?'; return; }
      try { await onlineCall('adminDelete', { item: it.id }); loadAdminItems(); } catch (e) { done(e.message); }
    });
    r.append(t, x);
    box.append(r);
  }

  // ---- messages
  box.append(sectionTitle('📢 Global message'));
  const gm = el('textarea', 'cc-text cc-area');
  gm.placeholder = 'Everybody with SCX sees this';
  gm.maxLength = 500;
  box.append(gm, wideBtn('Send to everyone', async () => {
    try { await onlineCall('adminMessage', { text: gm.value }); gm.value = ''; done('Sent to everyone ✓', true); } catch (e) { done(e.message); }
  }));

  box.append(sectionTitle('✉️ Personal message'));
  const pw = textInput('SCX nick or SoundCloud link');
  const pm = el('textarea', 'cc-text cc-area');
  pm.placeholder = 'Message';
  pm.maxLength = 500;
  box.append(pw, el('div', 'cc-gap'), pm, wideBtn('Send', async () => {
    try { await onlineCall('adminMessage', { who: pw.value, text: pm.value }); pm.value = ''; done('Sent ✓', true); } catch (e) { done(e.message); }
  }));

  box.append(sectionTitle('🪙 Give coins'));
  const gw = textInput('SCX nick or SoundCloud link');
  const ga = textInput('Amount');
  ga.inputMode = 'numeric';
  const gn = textInput('Note (optional)');
  box.append(gw, el('div', 'cc-gap'), ga, el('div', 'cc-gap'), gn, wideBtn('Give coins', async () => {
    try {
      const u = await onlineCall('adminGive', { who: gw.value, amount: ga.value, note: gn.value });
      done('Gave 🪙 ' + Number(ga.value).toLocaleString('en-US') + ' to ' + u.nick + ' ✓', true);
      ga.value = ''; gn.value = '';
    } catch (e) { done(e.message); }
  }));
  refreshers.splice(mark).forEach((f) => f());
}

function buildAdminTab() {
  const t = el('div', 'cc-tab');
  ADM.root = t;
  let was = false;
  refreshers.push(() => {
    const active = activeTab === 'Admin' && panel && panel.classList.contains('cc-open');
    if (active && !was) { renderAdmin(); loadAdminItems(); }
    was = active;
  });
  return t;
}

// ================================================================ MESSAGES (global + personal) → banner
let msgSeen = 0;
try { msgSeen = Number(localStorage.getItem('ccx_msg_seen')) || 0; } catch {}
const inbox = [];
async function checkMessages() {
  if (!ON.me) return;
  let list;
  try { list = await onlineCall('messages', { since: msgSeen }); } catch { return; }
  if (!list || !list.length) return;
  list.sort((a, b) => a.id - b.id);
  const fresh = msgSeen ? list : list.slice(-2); // first time: only the last ones
  msgSeen = list[list.length - 1].id;
  try { localStorage.setItem('ccx_msg_seen', String(msgSeen)); } catch {}
  fresh.forEach((m) => { inbox.unshift(m); showBanner(m); });
  inbox.splice(20);
  if (fresh.some((m) => /coins/i.test(m.text) || m.kind === 'gift')) { refreshMe(); MYG.list = null; SHOP.items = []; }
  if (fresh.some((m) => m.kind === 'gift')) giftBurst();
}
setInterval(checkMessages, 45000);

// little celebration when a gift arrives
function giftBurst() {
  const b = el('div', 'cc-giftburst');
  for (let i = 0; i < 26; i++) {
    const s = el('i', null, ['🎁', '✨', '🪙', '🎉'][i % 4]);
    s.style.setProperty('--dx', (Math.random() * 2 - 1) * 46 + 'vw');
    s.style.setProperty('--dy', -(20 + Math.random() * 60) + 'vh');
    s.style.animationDelay = Math.random() * 0.25 + 's';
    b.append(s);
  }
  document.documentElement.append(b);
  setTimeout(() => b.remove(), 2200);
}
const bannerQ = [];
let bannerEl = null, bannerBusy = false;
function showBanner(m) {
  bannerQ.push(m);
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const m = bannerQ.shift();
  if (!m) { bannerBusy = false; return; }
  bannerBusy = true;
  if (!bannerEl || !document.body.contains(bannerEl)) {
    bannerEl = el('div');
    bannerEl.id = 'cc-banner';
    document.body.append(bannerEl);
  }
  bannerEl.textContent = '';
  const ic = el('img', 'cc-ico');
  if (iconUrl) ic.src = iconUrl;
  const tx = el('div');
  tx.append(el('b', null, m.kind === 'gift' ? '🎁 Gift for you' : m.to_user ? '✉️ SCX ADMIN → you' : '📢 SCX'), el('span', null, m.text));
  const x = el('button', null, '✕');
  let tm;
  const hide = () => { clearTimeout(tm); bannerEl.classList.remove('cc-show'); setTimeout(nextBanner, 400); };
  x.addEventListener('click', hide);
  bannerEl.append(ic, tx, x);
  bannerEl.classList.remove('cc-show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('cc-show');
  tm = setTimeout(hide, Math.min(15000, 5000 + m.text.length * 60));
}

// ================================================================ SCX BADGE on SoundCloud profiles
const RESERVED = new Set(['discover', 'you', 'stream', 'search', 'upload', 'settings', 'charts', 'pages', 'terms-of-use', 'messages',
  'notifications', 'feed', 'people', 'stations', 'tags', 'popular', 'pro', 'jobs', 'imprint', 'mobile', 'go', 'next', 'artists', 'signin', 'logout', 'home']);
const badgeCache = new Map();
let badgeFor = '';
async function scxBadges() {
  const parts = location.pathname.split('/').filter(Boolean);
  const nameEl = document.querySelector('.profileHeaderInfo__userName');
  const user = parts[0] ? parts[0].toLowerCase() : '';
  const onProfile = nameEl && user && !RESERVED.has(user) && (parts.length === 1 || ['tracks', 'albums', 'sets', 'reposts', 'popular-tracks', 'likes', 'followers', 'following', 'comments'].includes(parts[1]));
  if (!onProfile) { badgeFor = ''; return; }
  if (!ON.ready) return;
  const url = 'https://soundcloud.com/' + user;
  let info = badgeCache.get(url);
  if (!info || Date.now() - info.at > 120000) {
    if (badgeFor === url + ':loading') return;
    badgeFor = url + ':loading';
    try { info = { at: Date.now(), p: await onlineCall('bySoundCloud', { url }) }; } catch { info = { at: Date.now(), p: null }; }
    badgeCache.set(url, info);
    badgeFor = '';
  }
  paintBadges(info.p, url);
}

function paintBadges(p, url) {
  const nameEl = document.querySelector('.profileHeaderInfo__userName');
  const old = document.querySelectorAll('.ccx-scx');
  if (!p) { old.forEach((e) => e.remove()); return; }
  const key = url + '|' + p.id + '|' + bal(p) + '|' + p.tag_text + '|' + !!p.presence + '|' + JSON.stringify(p.frame) + '|' + p.profile_bg + '|' + (p.gifts || []).map((g) => g.id).join();
  if (old.length && old[0].dataset.key === key && document.body.contains(old[0])) return;
  old.forEach((e) => e.remove());

  // under the name, next to ARTIST PRO
  const row = el('div', 'ccx-scx ccx-scx-row');
  row.dataset.key = key;
  const scx = el('button', 'ccx-scxbadge', 'SCX');
  scx.title = 'Open SCX profile';
  scx.addEventListener('click', () => { togglePanel(true); activeTab = 'Online'; refreshPanel(); openProfile(p.id); });
  row.append(scx);
  if (p.tag_text) row.append(tagEl(p));
  row.append(el('span', 'ccx-scxcoins', '🪙 ' + bal(p).toLocaleString('en-US')));
  if (p.presence) row.append(el('span', 'ccx-scxon', '● Online in SCX'));
  if (p.gifts && p.gifts.length) row.append(pinnedGiftsEl(p.gifts, 30));
  const content = nameEl && nameEl.closest('.profileHeaderInfo__content');
  if (content) content.append(row);

  const fc = frameCss(p.frame);
  const av = document.querySelector('.profileHeaderInfo__avatar');
  if (fc && av && fc.style === 'image') {
    const img = el('img', 'ccx-scx ccx-avdeco ccf-' + fc.layer);
    img.dataset.key = key;
    img.src = fc.url;
    img.alt = '';
    img.style.setProperty('--fs', String(fc.scale));
    av.classList.add('ccx-avhost');
    av.append(img);
  } else if (fc && av) {
    const ring = el('i', 'ccx-scx ccx-avring ccf-' + fc.style);
    ring.dataset.key = key;
    ring.style.setProperty('--fb', fc.bg);
    ring.style.setProperty('--fc', fc.c1);
    av.classList.add('ccx-avhost');
    av.append(ring);
  }
  const hero = document.querySelector('.profileHeaderBackground');
  if (p.profile_bg && safeImg(p.profile_bg) && hero) {
    const bgl = el('div', 'ccx-scx ccx-herobg');
    bgl.dataset.key = key;
    bgl.style.backgroundImage = cssUrl(p.profile_bg);
    hero.classList.add('ccx-herohost');
    hero.append(bgl);
  }

  // card above Followers / Following / Tracks
  const side = document.querySelector('.userSidebar .infoStats');
  if (side) {
    const card = el('div', 'ccx-scx ccx-scxcard');
    card.dataset.key = key;
    const top = el('div', 'ccx-scxtop');
    top.append(avatarEl(p, 40));
    const nm = el('div');
    nm.append(nickLine(p), el('small', null, 'SCX' + (p.scx_version ? ' v' + p.scx_version : '') + ' · ' + p.followers + ' followers in SCX'));
    top.append(nm);
    card.append(top);
    const st = p.stats || {};
    const best = Math.max(0, ...(p.scores || []).map((x) => x.best));
    const g = el('div', 'ccx-scxgrid');
    for (const [k, v] of [['🪙', bal(p).toLocaleString('en-US')], ['🎵', (st.songs || 0) + ' songs'], ['🎧', fmtDur(st.listen)], ['🎮', best.toLocaleString('en-US')]]) {
      const c = el('div');
      c.append(el('i', null, k), el('b', null, v));
      g.append(c);
    }
    card.append(g);
    if (p.gifts && p.gifts.length) card.append(pinnedGiftsEl(p.gifts, 44));
    if (p.presence && p.presence.title) {
      const np = el('div', 'ccx-scxnp');
      np.append(el('span', null, (p.presence.playing ? '🎵 ' : '⏸ ') + p.presence.title + (p.presence.artist ? ' — ' + p.presence.artist : '')));
      if (p.presence.url) {
        const b = el('button', null, '▶ Listen too');
        b.addEventListener('click', () => listenToo(p.presence.url));
        np.append(b);
      }
      card.append(np);
    }
    const btns = el('div', 'ccx-scxbtns');
    const open = el('button', null, 'SCX profile');
    open.addEventListener('click', () => { togglePanel(true); activeTab = 'Online'; refreshPanel(); openProfile(p.id); });
    btns.append(open);
    card.append(btns);
    side.parentElement.insertBefore(card, side);
  }
}
setInterval(scxBadges, 1500);

// ================================================================ WINDOW ANIMATIONS + HOTKEYS
ipcRenderer.on('anim', (_e, kind) => {
  const root = document.documentElement;
  const b = document.body;
  if (!b) return;
  b.style.transformOrigin = '50% ' + Math.round(scrollY + innerHeight / 2) + 'px';
  root.classList.remove('ccx-anim-out', 'ccx-anim-in');
  void b.offsetWidth;
  root.classList.add(kind === 'out' ? 'ccx-anim-out' : 'ccx-anim-in');
  clearTimeout(window.__ccxAnimT);
  window.__ccxAnimT = setTimeout(() => root.classList.remove('ccx-anim-in', 'ccx-anim-out'), kind === 'out' ? 1500 : 500);
});

// hold X and press P → mini player, X + O → show / hide SoundCloudX
let xDown = false;
const typing = (e) => {
  const t = e.target;
  return t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
};
document.addEventListener('keydown', (e) => {
  if (!S.keys.on || typing(e)) return;
  const k = (e.key || '').toLowerCase();
  if (k === 'x') { xDown = true; return; }
  if (!xDown || e.repeat) return;
  if (k === 'p' || k === 'o') {
    e.preventDefault();
    e.stopImmediatePropagation();
    ipcRenderer.send('hotkey', k === 'p' ? 'mini' : 'main');
  }
}, true);
document.addEventListener('keyup', (e) => { if ((e.key || '').toLowerCase() === 'x') xDown = false; }, true);
window.addEventListener('blur', () => { xDown = false; });

// ================================================================ START
window.addEventListener('DOMContentLoaded', () => {
  // tell the app when SoundCloud's interface is visible → the loading screen can close
  const readyTimer = setInterval(() => {
    if (document.querySelector('.header, .l-container .l-content, .playControls')) {
      clearInterval(readyTimer);
      setTimeout(() => ipcRenderer.send('page-ready'), 250);
    }
  }, 120);
  injectBar();
  injectPanel();
  applyCSS();
  applyBg();
  sendMiniOpts();
  sendRpcConfig();
  Promise.all([loadSlot('bg'), loadSlot('menu')]).then(() => { applyBg(); applyMenu(); refreshPanel(); });
  setTimeout(startOnline, 2500);
  setInterval(() => {
    injectBar();
    injectPanel();
    if (S.bg.mode !== 'off' && bgEl && !document.body.contains(bgEl)) { bgEl = null; applyBg(); }
  }, 2000);
  setInterval(pollTrack, 700);

  if (S.boost.on) {
    // boost needs a click on the page first (browser rule for audio)
    const kick = () => { document.removeEventListener('pointerdown', kick, true); applyBoost(); };
    document.addEventListener('pointerdown', kick, true);
    setTimeout(applyBoost, 1500);
  }

  if (S.viz.mode !== 'off' || S.viz.bassGlow) {
    setTimeout(async () => {
      if (await ensureAudio()) return startViz();
      const retry = async () => {
        document.removeEventListener('pointerdown', retry, true);
        if ((S.viz.mode !== 'off' || S.viz.bassGlow) && (await ensureAudio())) startViz();
      };
      document.addEventListener('pointerdown', retry, true);
    }, 1200);
  }
});
