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
const TABS = ['Visual', 'Player', 'Sound', 'Theme', 'Discord'];
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
    if (file) shrinkImage(file, 1920).then(onImage).catch(() => toast('Could not open that image'));
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
  const bgFile = imageInput((data) => {
    if (!storeImage('ccx_bgimg', data)) return;
    customBg = data;
    setBg({ mode: 'custom' });
  });
  const bgBtns = el('div', 'cc-btnrow');
  bgBtns.append(
    wideBtn('Choose image…', () => bgFile.click(), 'cc-ghost'),
    wideBtn('Use this song', () => {
      const art = bigArt(artSrc);
      if (!art) return toast('Play a track first');
      customBg = art;
      storeImage('ccx_bgimg', art);
      setBg({ mode: 'custom' });
      toast('Background set to this song\'s cover');
    }, 'cc-ghost')
  );

  // ---- menu
  const menuFile = imageInput((data) => {
    if (!storeImage('ccx_menuimg', data)) return;
    menuImg = data;
    applyMenu();
    refreshPanel();
  });
  const menuBtns = el('div', 'cc-btnrow');
  const removeMenuImg = wideBtn('Remove image', () => {
    menuImg = '';
    try { localStorage.removeItem('ccx_menuimg'); } catch {}
    applyMenu();
    refreshPanel();
  }, 'cc-ghost');
  refreshers.push(() => { removeMenuImg.style.opacity = menuImg ? '1' : '.4'; });
  menuBtns.append(wideBtn('Menu image…', () => menuFile.click(), 'cc-ghost'), removeMenuImg);

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
        if (v === 'custom' && !customBg) { bgFile.click(); return; }
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
      menuImg = '';
      try { localStorage.removeItem('ccx_menuimg'); } catch {}
      saveAll(); applyCSS(); applyBg(); refreshPanel();
    }, 'cc-ghost')
  );
  return t;
}

// ---------- images, menu look, theme files
let menuImg = '';
try { menuImg = localStorage.getItem('ccx_menuimg') || ''; } catch {}

function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function storeImage(key, data) {
  try { localStorage.setItem(key, data); return true; } catch {}
  toast('Image is too big, try a smaller one');
  return false;
}

const safeImg = (v) => typeof v === 'string' && (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(v) || /^https:\/\/[^\s"'()<>]+$/i.test(v));
const cssUrl = (v) => 'url("' + v.replace(/["\\\n]/g, '') + '")';

function applyMenu() {
  const st = document.documentElement.style;
  const bg = S.menu.bg || '#101010';
  st.setProperty('--ccx-menu-bg', `rgba(${rgbStr(bg)},.96)`);
  st.setProperty('--ccx-menu-img', menuImg && safeImg(menuImg) ? cssUrl(menuImg) : 'none');
  st.setProperty('--ccx-menu-dim', String(menuImg ? S.menu.dim : 0));
}

function exportTheme() {
  const data = {
    app: 'SoundCloudX', type: 'theme', version: 1,
    name: (S.bg.mode === 'scene' && SCENES[S.bg.scene] ? SCENES[S.bg.scene].name : 'My') + ' theme',
    theme: S.theme, menu: S.menu, bg: S.bg,
    viz: { color: S.viz.color, custom: S.viz.custom },
    bar: S.bar,
    images: {
      background: customBg && customBg.startsWith('data:') ? customBg : (customBg || ''),
      menu: menuImg || '',
    },
  };
  ipcRenderer.send('save-theme', JSON.stringify(data));
}
ipcRenderer.on('theme-saved', (_e, r) => {
  if (r && r.ok) toast('Theme saved', 'Show', () => ipcRenderer.send('show-file', r.file), 6000);
  else if (r && r.error) toast('Could not save: ' + r.error);
});

function importTheme(text) {
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
  if (safeImg(imgs.background)) { customBg = imgs.background; storeImage('ccx_bgimg', customBg); }
  else if (S.bg.mode === 'custom' && !customBg) S.bg.mode = 'off';
  menuImg = safeImg(imgs.menu) ? imgs.menu : '';
  if (menuImg) storeImage('ccx_menuimg', menuImg); else { try { localStorage.removeItem('ccx_menuimg'); } catch {} }
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
  head.append(logo, closeB);

  const tabsRow = el('div', 'cc-tabs');
  const body = el('div', 'cc-pbody');
  const pages = {
    Visual: buildVisualTab(),
    Player: buildPlayerTab(),
    Sound: buildSoundTab(),
    Theme: buildThemeTab(),
    Discord: buildDiscordTab(),
  };
  for (const name of TABS) {
    const b = el('button', null, name);
    b.addEventListener('click', () => { activeTab = name; refreshPanel(); });
    refreshers.push(() => {
      b.classList.toggle('cc-active', activeTab === name);
      pages[name].style.display = activeTab === name ? '' : 'none';
    });
    tabsRow.append(b);
    body.append(pages[name]);
  }

  statusEl = el('div', 'cc-status');
  panel.append(head, tabsRow, body, statusEl, el('div', 'cc-foot', 'X+P mini player  •  X+O SoundCloudX  •  F11 full screen'));
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
let audioCtx = null, analyser = null, freq = null, stream = null;

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
  stream = audioCtx = analyser = freq = null;
}

const miniNeedsBands = () => S.mini.soundBg || S.mini.style === 'ball' || S.mini.style === 'wave';
const needAudio = () => S.viz.mode !== 'off' || S.viz.bassGlow || (miniPlayerOpen && miniNeedsBands())
  || (S.bg.mode === 'scene' && SCENES[S.bg.scene] && SCENES[S.bg.scene].needsAudio);
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
  const now = parseFloat(pw.getAttribute('aria-valuenow')) || 0;
  const max = parseFloat(pw.getAttribute('aria-valuemax')) || 0;
  if (!max) return;
  const target = Math.max(0, Math.min(max - 1, now + sec));
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
let customBg = '';
try { customBg = localStorage.getItem('ccx_bgimg') || ''; } catch {}
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
  const url = S.bg.mode === 'song' ? bigArt(artSrc) : S.bg.mode === 'custom' ? customBg : '';
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

function loadCustomImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // shrink big photos so they fit in the app's storage
      const k = Math.min(1, 1920 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let data = c.toDataURL('image/jpeg', 0.86);
      try {
        localStorage.setItem('ccx_bgimg', data);
      } catch {
        data = c.toDataURL('image/jpeg', 0.6);
        try { localStorage.setItem('ccx_bgimg', data); } catch { toast('Image is too big, try a smaller one'); }
      }
      customBg = data;
      S.bg.mode = 'custom';
      saveAll();
      applyBg();
      refreshPanel();
    };
    img.onerror = () => toast('Could not open that image');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
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

document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest && e.target.closest('.sc-button-repost, .sc-button-like');
  if (!t) return;
  const kind = t.classList.contains('sc-button-repost') ? 'repost' : 'like';
  if (!S.fx[kind]) return;
  const was = t.classList.contains('sc-button-selected');
  setTimeout(() => {
    if (!was && t.classList.contains('sc-button-selected')) burst(t, kind);
  }, 180);
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
  injectBar();
  injectPanel();
  applyCSS();
  applyBg();
  sendMiniOpts();
  sendRpcConfig();
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
