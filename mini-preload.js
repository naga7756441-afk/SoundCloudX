const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  onTrack: (cb) => ipcRenderer.on('track', (_e, t) => cb(t)),
  onBands: (cb) => ipcRenderer.on('bands', (_e, d) => cb(d)),
  onOpts: (cb) => ipcRenderer.on('opts', (_e, o) => cb(o)),
  control: (action, value) => ipcRenderer.send('control', value === undefined ? action : { action, value }),
  openMain: () => ipcRenderer.send('mini-player', 'main'),
  close: () => ipcRenderer.send('mini-player', 'close'),
  onBye: (cb) => ipcRenderer.on('bye', () => cb()),
  hotkey: (k) => ipcRenderer.send('hotkey', k),
});
