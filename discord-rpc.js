// Tiny Discord Rich Presence client (talks to the Discord desktop app over its local pipe).
// No extra packages needed.
const net = require('net');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function pipePath(i) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || os.tmpdir();
  return path.join(dir, `discord-ipc-${i}`);
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

class DiscordRPC extends EventEmitter {
  constructor() {
    super();
    this.clientId = '';
    this.enabled = false;
    this.sock = null;
    this.ready = false;
    this.buf = Buffer.alloc(0);
    this.activity = null;      // what we want Discord to show
    this.sentJson = '';        // what Discord shows now
    this.lastSend = 0;
    this.sendTimer = null;
    this.retryTimer = null;
    this.status = { state: 'off', text: '' };
  }

  setStatus(state, text = '') {
    this.status = { state, text };
    this.emit('status', this.status);
  }

  configure({ enabled, clientId }) {
    const id = String(clientId || '').trim();
    const changed = id !== this.clientId || !!enabled !== this.enabled;
    this.enabled = !!enabled;
    this.clientId = id;
    if (!changed) return;
    this.disconnect();
    if (!this.enabled) return this.setStatus('off');
    if (!/^\d{15,22}$/.test(id)) return this.setStatus('error', 'Paste your Application ID (only numbers).');
    this.connect();
  }

  connect(i = 0) {
    clearTimeout(this.retryTimer);
    if (!this.enabled || this.sock) return;
    if (i > 9) {
      this.setStatus('no-discord', 'Discord app is not running. Trying again…');
      this.retryTimer = setTimeout(() => this.connect(0), 15000);
      return;
    }
    if (i === 0) this.setStatus('connecting', 'Connecting to Discord…');
    const sock = net.createConnection(pipePath(i));
    let opened = false;
    sock.once('connect', () => {
      opened = true;
      this.sock = sock;
      this.buf = Buffer.alloc(0);
      sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
    sock.on('data', (d) => this.onData(d));
    sock.on('error', () => {
      if (!opened) this.connect(i + 1);
    });
    sock.on('close', () => {
      if (!opened || this.sock !== sock) return; // closed on purpose by disconnect()
      const wasReady = this.ready;
      this.sock = null;
      this.ready = false;
      this.sentJson = '';
      if (!this.enabled) return;
      if (this.status.state !== 'error') this.setStatus('no-discord', wasReady ? 'Discord closed. Trying again…' : 'Discord refused the connection. Trying again…');
      this.retryTimer = setTimeout(() => this.connect(0), 15000);
    });
  }

  disconnect() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.sendTimer);
    this.ready = false;
    this.sentJson = '';
    if (this.sock) {
      const s = this.sock;
      this.sock = null;
      try { s.end(); s.destroy(); } catch {}
    }
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) return;
      let msg = null;
      try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString('utf8')); } catch {}
      this.buf = this.buf.slice(8 + len);
      this.onMessage(op, msg);
    }
  }

  onMessage(op, msg) {
    if (op === OP.PING && this.sock) return this.sock.write(encode(OP.PONG, msg));
    if (op === OP.CLOSE) {
      const bad = msg && (msg.code === 4000 || /client id/i.test(msg.message || ''));
      this.setStatus('error', bad ? 'Wrong Application ID. Check it in the Developer Portal.' : 'Discord: ' + ((msg && msg.message) || 'connection closed'));
      return;
    }
    if (op !== OP.FRAME || !msg) return;
    if (msg.evt === 'READY') {
      this.ready = true;
      const user = msg.data && msg.data.user;
      this.setStatus('connected', 'Connected' + (user ? ' as ' + (user.global_name || user.username) : ''));
      this.flush(true);
    } else if (msg.evt === 'ERROR') {
      this.setStatus('error', 'Discord: ' + ((msg.data && msg.data.message) || 'error'));
    }
  }

  // Discord allows about 5 updates per 20 seconds, so keep at least 4s between them
  setActivity(activity) {
    this.activity = activity;
    this.flush(false);
  }

  flush(force) {
    if (!this.ready || !this.sock) return;
    const json = JSON.stringify(this.activity);
    if (!force && json === this.sentJson) return;
    const wait = force ? 0 : Math.max(0, this.lastSend + 4000 - Date.now());
    clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => {
      if (!this.ready || !this.sock) return;
      const now = JSON.stringify(this.activity);
      this.sentJson = now;
      this.lastSend = Date.now();
      this.sock.write(encode(OP.FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: this.activity || undefined },
        nonce: String(Date.now()) + Math.random().toString(16).slice(2),
      }));
    }, wait);
  }
}

module.exports = { DiscordRPC, encode, OP };
