const { app, BrowserWindow, ipcMain, shell, screen, desktopCapturer, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { DiscordRPC } = require('./discord-rpc');
const { ScxOnline } = require('./scx-online');

// Look like regular Chrome so Google/Apple sign-in doesn't complain
app.userAgentFallback = app.userAgentFallback
  .replace(/\s?Electron\/\S+/, '')
  .replace(/\s?soundcloud-app\/\S+/, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const BAR_CSS = fs.readFileSync(path.join(__dirname, 'bar.css'), 'utf8');
const ICON_URL = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'icon.png')).toString('base64');
const SMALL = { width: 460, height: 320 };

let win = null;
let miniPlayer = null;
let lastTrack = null;
let miniOpts = { style: 'classic', soundBg: false };
const MINI_SIZE = { full: { width: 420, height: 280 }, ultra: { width: 420, height: 96 } };
const miniSize = () => MINI_SIZE[miniOpts.style === 'ultra' ? 'ultra' : 'full'];
let isSmall = false;
const cssKeys = {};

function downloadsDir() {
  return path.join(app.getPath('downloads'), 'SoundCloudX');
}

function currentMode() {
  if (isSmall) return 'mini';
  return win.isFullScreen() ? 'full' : 'window';
}

function toPage(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function sendMode() {
  if (win && !win.isDestroyed()) toPage('mode', currentMode());
}

// ---------- small always-on-top site window (❐ button) ----------
function toggleSmall() {
  if (!isSmall) {
    isSmall = true;
    win.setFullScreen(false);
    setTimeout(() => {
      const wa = screen.getDisplayMatching(win.getBounds()).workArea;
      win.setBounds({
        x: wa.x + wa.width - SMALL.width - 16,
        y: wa.y + wa.height - SMALL.height - 16,
        width: SMALL.width,
        height: SMALL.height,
      });
      win.setAlwaysOnTop(true, 'floating');
      sendMode();
    }, 120);
  } else {
    isSmall = false;
    win.setAlwaysOnTop(false);
    win.setFullScreen(true);
  }
  sendMode();
}

// ---------- mini player window ----------
function sendMiniState() {
  toPage('mini-player-state', !!miniPlayer);
}

function openMiniPlayer() {
  if (miniPlayer) {
    miniPlayer.show();
    miniPlayer.focus();
    return;
  }
  const { width: W, height: H } = miniSize();
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  miniPlayer = new BrowserWindow({
    width: W,
    height: H,
    x: wa.x + wa.width - W - 6,
    y: wa.y + wa.height - H - 6,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    title: 'SoundCloudX Mini',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'mini-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  miniPlayer.setAlwaysOnTop(true, 'floating');
  miniPlayer.loadFile(path.join(__dirname, 'mini.html'));
  miniPlayer.webContents.on('did-finish-load', () => {
    miniPlayer.webContents.send('opts', miniOpts);
    if (lastTrack) miniPlayer.webContents.send('track', lastTrack);
  });
  miniPlayer.on('closed', () => {
    miniPlayer = null;
    sendMiniState();
  });
  sendMiniState();
  animatedMinimize();
}

function closeMiniPlayer() {
  if (!miniPlayer) return;
  const m = miniPlayer;
  try { m.webContents.send('bye'); } catch {}
  setTimeout(() => { if (!m.isDestroyed()) m.close(); }, 200); // let it play the closing animation
}

function showMain() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function isSoundCloud(url) {
  return /^https:\/\/([a-z0-9-]+\.)*soundcloud\.com(\/|$)/i.test(url);
}

// ---------- animations: page plays "out", then the window minimizes / closes
let animBusy = false;
function animatedMinimize() {
  if (!win || win.isMinimized() || animBusy) return;
  animBusy = true;
  toPage('anim', 'out');
  setTimeout(() => {
    animBusy = false;
    if (!win) return;
    win.minimize();
  }, 240);
}
function animatedClose() {
  if (!win) return;
  toPage('anim', 'out');
  setTimeout(() => { if (win) win.close(); }, 240);
}

// ---------- hotkeys: toggle main window / mini player
function toggleMain() {
  if (!win) return;
  if (win.isVisible() && !win.isMinimized() && win.isFocused()) animatedMinimize();
  else {
    if (miniPlayer) closeMiniPlayer();
    showMain();
  }
}
function toggleMiniHotkey() {
  if (!win) return;
  if (miniPlayer) { closeMiniPlayer(); showMain(); }
  else openMiniPlayer();
}

// ---------- loading screen
let splash = null, splashAt = 0;
function createSplash() {
  splashAt = Date.now();
  splash = new BrowserWindow({
    width: 420, height: 300, frame: false, transparent: true, resizable: false,
    center: true, show: true, skipTaskbar: false, alwaysOnTop: false,
    backgroundColor: '#00000000', title: 'SoundCloudX',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion() } });
  splash.on('closed', () => { splash = null; });
}
let splashDone = false;
function finishSplash() {
  if (!win || splashDone) return;
  splashDone = true;
  const wait = Math.max(0, 900 - (Date.now() - splashAt)); // let the animation play at least once
  setTimeout(() => {
    if (!win) return;
    if (splash) splash.webContents.executeJavaScript('document.body.classList.add("done")').catch(() => {});
    setTimeout(() => {
      if (!win) return;
      win.show();
      if (!win.isFullScreen()) win.setFullScreen(true);
      toPage('anim', 'in');
      if (splash) splash.close();
    }, 260);
  }, wait);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 240,
    frame: false,
    fullscreen: true,
    show: false,
    backgroundColor: '#121212',
    title: 'SoundCloudX',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required', // audio effects never get stuck "suspended"
      partition: 'persist:soundcloud',
    },
  });

  win.setMenu(null);
  const ses = win.webContents.session;

  // Audio capture for the visualizer: system sound (loopback), no picker dialog
  ses.setDisplayMediaRequestHandler((_req, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
      .catch(() => callback({}));
  });

  // Downloads (SoundCloud's own "Download file") → Downloads\SoundCloudX
  ses.on('will-download', (_e, item) => {
    const dir = downloadsDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, item.getFilename());
    item.setSavePath(file);
    toPage('download', { state: 'started', name: item.getFilename() });
    item.on('updated', () => {
      const total = item.getTotalBytes();
      if (total > 0) toPage('download', { state: 'progress', name: item.getFilename(), p: item.getReceivedBytes() / total });
    });
    item.once('done', (_ev, state) => {
      toPage('download', { state: state === 'completed' ? 'done' : 'failed', name: item.getFilename(), file });
    });
  });

  win.loadURL('https://soundcloud.com');

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSoundCloud(url)) {
      win.loadURL(url);
      return { action: 'deny' };
    }
    if (/accounts\.google\.com|facebook\.com|appleid\.apple\.com|secure\.soundcloud\.com/i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, parent: win },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // open as soon as SoundCloud's interface is on screen (the page tells us), not after every ad has loaded
  ipcMain.once('page-ready', finishSplash);
  win.webContents.once('dom-ready', () => setTimeout(finishSplash, 4000));
  win.webContents.once('did-finish-load', finishSplash);
  setTimeout(finishSplash, 9000); // never wait forever
  win.on('restore', () => toPage('anim', 'in'));
  win.webContents.on('dom-ready', () => {
    for (const k of Object.keys(cssKeys)) delete cssKeys[k];
    win.webContents.insertCSS(BAR_CSS);
    toPage('assets', { icon: ICON_URL, version: app.getVersion() });
    sendMode();
    sendMiniState();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      if (isSmall) toggleSmall();
      else win.setFullScreen(!win.isFullScreen());
    }
  });

  win.on('enter-full-screen', sendMode);
  win.on('leave-full-screen', sendMode);
  win.on('closed', () => {
    win = null;
    closeMiniPlayer();
  });
}

// window buttons
ipcMain.on('win', (_e, action) => {
  if (!win) return;
  if (action === 'min') animatedMinimize();
  else if (action === 'mini') toggleSmall();
  else if (action === 'close') animatedClose();
});

// custom CSS from the page settings (theme, player bar)
ipcMain.on('css', async (_e, { key, css }) => {
  if (!win) return;
  const wc = win.webContents;
  const old = cssKeys[key];
  delete cssKeys[key];
  if (old) wc.removeInsertedCSS(old).catch(() => {});
  if (css) {
    try { cssKeys[key] = await wc.insertCSS(css); } catch {}
  }
});

// theme files (.scxtheme)
ipcMain.on('save-theme', async (_e, json) => {
  try {
    const name = (JSON.parse(json).name || 'My theme').replace(/[\\/:*?"<>|]+/g, '').slice(0, 40) || 'My theme';
    const r = await dialog.showSaveDialog(win, {
      title: 'Save SoundCloudX theme',
      defaultPath: path.join(downloadsDir(), name + '.scxtheme'),
      filters: [{ name: 'SoundCloudX theme', extensions: ['scxtheme'] }],
    });
    if (r.canceled || !r.filePath) return;
    fs.mkdirSync(path.dirname(r.filePath), { recursive: true });
    fs.writeFileSync(r.filePath, json, 'utf8');
    toPage('theme-saved', { ok: true, file: r.filePath });
  } catch (err) {
    toPage('theme-saved', { ok: false, error: String(err && err.message || err) });
  }
});
ipcMain.on('show-file', (_e, file) => {
  if (typeof file === 'string' && /\.(scxtheme|scxmap)$/.test(file)) shell.showItemInFolder(file);
});

// beat map files (.scxmap)
ipcMain.on('save-file', async (_e, req) => {
  try {
    if (!req || req.kind !== 'map' || typeof req.json !== 'string' || req.json.length > 5e6) return;
    const name = String(req.name || 'beat map').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'beat map';
    const r = await dialog.showSaveDialog(win, {
      title: 'Save SCX beat map',
      defaultPath: path.join(downloadsDir(), name + '.scxmap'),
      filters: [{ name: 'SCX beat map', extensions: ['scxmap'] }],
    });
    if (r.canceled || !r.filePath) return;
    fs.mkdirSync(path.dirname(r.filePath), { recursive: true });
    fs.writeFileSync(r.filePath, req.json, 'utf8');
    toPage('theme-saved', { ok: true, file: r.filePath, what: 'Beat map' });
  } catch (err) {
    toPage('theme-saved', { ok: false, error: String((err && err.message) || err) });
  }
});

ipcMain.on('open-downloads', () => {
  const dir = downloadsDir();
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

// track → mini player + Discord
ipcMain.on('track', (_e, track) => {
  lastTrack = track;
  if (miniPlayer) miniPlayer.webContents.send('track', track);
  updatePresence(track);
});

// ---------- Discord Rich Presence ----------
const rpc = new DiscordRPC();
let rpcCfg = { enabled: false, clientId: '', showPaused: false };
let presStart = 0, presKey = '';
rpc.on('status', (st) => toPage('rpc-status', st));

function updatePresence(t) {
  if (!rpcCfg.enabled) return;
  if (!t || !t.title) return rpc.setActivity(null);
  if (!t.playing && !rpcCfg.showPaused) {
    presKey = '';
    return rpc.setActivity(null);
  }
  const start = Date.now() - (t.cur || 0) * 1000;
  const key = [t.title, t.artist, t.art, t.playing].join('|');
  // only resend when the song/state changes or the time jumped (seek)
  if (key === presKey && Math.abs(start - presStart) < 3000) return;
  presKey = key;
  presStart = start;
  const pad = (s) => { s = String(s || '').slice(0, 128); return s.length < 2 ? (s + '  ').slice(0, 2) : s; };
  const activity = {
    type: 2, // "Listening to"
    details: pad(t.title),
    state: pad(t.playing ? (t.artist || 'SoundCloud') : 'Paused'),
    assets: {
      large_image: t.bigArt || t.art || 'scx',
      large_text: 'SCX By W1CKIX',
      small_image: 'scx',
      small_text: 'SoundCloudX',
    },
    instance: false,
  };
  if (t.playing && t.dur > 0) {
    activity.timestamps = { start: Math.round(start), end: Math.round(start + t.dur * 1000) };
  }
  if (t.url && /^https:\/\/soundcloud\.com\//.test(t.url)) {
    activity.buttons = [{ label: 'Listen on SoundCloud', url: t.url }];
  }
  rpc.setActivity(activity);
}

ipcMain.on('rpc-config', (_e, cfg) => {
  rpcCfg = Object.assign({}, rpcCfg, cfg);
  presKey = '';
  rpc.configure({ enabled: rpcCfg.enabled, clientId: rpcCfg.clientId });
  toPage('rpc-status', rpc.status);
  if (rpcCfg.enabled) updatePresence(lastTrack);
});

ipcMain.on('rpc-help', (_e, what) => {
  if (what === 'portal') shell.openExternal('https://discord.com/developers/applications');
  else if (what === 'icon') {
    // copy the icon out of the app so it can be uploaded to Discord
    const out = path.join(app.getPath('userData'), 'SoundCloudX-discord-icon.png');
    try { fs.copyFileSync(path.join(__dirname, 'icon-512.png'), out); shell.showItemInFolder(out); } catch {}
  }
});

// audio bands → mini player (Ball / Wave styles)
ipcMain.on('bands', (_e, data) => {
  if (miniPlayer) miniPlayer.webContents.send('bands', data);
});

ipcMain.on('mini-opts', (_e, opts) => {
  miniOpts = Object.assign({}, miniOpts, opts);
  if (!miniPlayer) return;
  // resize but keep the bottom-right corner where it was
  const b = miniPlayer.getBounds();
  const { width, height } = miniSize();
  if (b.width !== width || b.height !== height) {
    miniPlayer.setBounds({ x: b.x + b.width - width, y: b.y + b.height - height, width, height });
  }
  miniPlayer.webContents.send('opts', miniOpts);
});

// mini player buttons → SoundCloud
ipcMain.on('control', (_e, action) => toPage('control', action));

ipcMain.on('mini-player', (_e, action) => {
  if (action === 'open') openMiniPlayer();
  else if (action === 'close') closeMiniPlayer();
  else if (action === 'toggle') miniPlayer ? closeMiniPlayer() : openMiniPlayer();
  else if (action === 'main') {
    closeMiniPlayer();
    showMain();
  }
});

app.on('second-instance', showMain);
// ---------- SCX Online (Supabase)
let online = null;
ipcMain.handle('online', async (e, req) => {
  if (!win || e.sender !== win.webContents) throw new Error('Not allowed');
  if (!online) online = new ScxOnline(path.join(app.getPath('userData'), 'scx-online.json'));
  return online.handle(req || {});
});

ipcMain.on('hotkey', (_e, k) => {
  if (k === 'main') toggleMain();
  else if (k === 'mini') toggleMiniHotkey();
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
  // work everywhere in Windows, even when SoundCloudX is in the background
  try {
    globalShortcut.register('CommandOrControl+Alt+P', toggleMiniHotkey);
    globalShortcut.register('CommandOrControl+Alt+O', toggleMain);
  } catch {}
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => rpc.disconnect());
