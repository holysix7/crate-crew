'use strict';
// Crate Crew — server LAN tanpa dependensi (cukup Node.js 18+).
// Jalankan:  node server.js      (opsional: PORT=8080 TEAMS=2..4)
const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Game } = require('./server/game');
const { EVENT_RULES } = require('./server/arena-events');
const { createStaticHandler } = require('./server/static-files');
const PREVIEW_EVENTS = (process.env.EVENT_PREVIEW || '').split(',').map(s => s.trim()).filter(Boolean);
if (PREVIEW_EVENTS.some(k => !Object.hasOwn(EVENT_RULES, k))) {
  throw new Error('EVENT_PREVIEW harus salah satu: ' + Object.keys(EVENT_RULES).join(', '));
}

const PORT = +process.env.PORT || 8080;
const TEAMS = Math.max(2, Math.min(4, +process.env.TEAMS || 2));
const PUB = path.join(__dirname, 'public');
const server = http.createServer(createStaticHandler(PUB));

// ---- WebSocket minimal (RFC 6455, text frame saja) ----
class WSConn {
  constructor(socket) {
    this.s = socket; this.buf = Buffer.alloc(0); this.open = true;
    this.onmessage = null; this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', d => this._data(d));
    socket.on('close', () => this._close());
    socket.on('error', () => this._close());
  }
  get backlog() { return this.s.writableLength; }
  _close() {
    if (!this.open) return;
    this.open = false;
    try { this.s.destroy(); } catch {}
    if (this.onclose) this.onclose();
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return this._close();
      const mOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = this.buf.subarray(off, off + len);
      if (masked) {
        const m = this.buf.subarray(mOff, mOff + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3];
      }
      this.buf = this.buf.subarray(off + len);
      if (op === 1) { if (this.onmessage) this.onmessage(payload.toString('utf8')); }
      else if (op === 8) { this._frame(8, Buffer.alloc(0)); return this._close(); }
      else if (op === 9) this._frame(10, payload);
    }
  }
  _frame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    this.s.write(Buffer.concat([h, payload]));
  }
  send(str) { this._frame(1, Buffer.from(str)); }
  // tutup dari sisi server (mis. dikeluarkan room master): pesan terakhir tetap terkirim dulu
  close() {
    if (!this.open) return;
    this._frame(8, Buffer.alloc(0));
    this.open = false;
    this.s.end();
    setTimeout(() => this.s.destroy(), 1000);
    if (this.onclose) this.onclose();
  }
}

const game = new Game(TEAMS, { firstEvent: PREVIEW_EVENTS });

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  game.addConnection(new WSConn(socket));
});

// Loop simulasi 30 Hz yang mengoreksi drift
const STEP = 1000 / 30;
let next = Date.now();
(function loop() {
  next += STEP;
  try { game.tick(); } catch (e) { console.error(e); }
  setTimeout(loop, Math.max(0, next - Date.now()));
})();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  CRATE CREW server jalan  (' + TEAMS + ' tim)');
  if (PREVIEW_EVENTS.length) console.log('  Preview: ' + PREVIEW_EVENTS.map(k => EVENT_RULES[k].name).join(' → ') + ' (mulai 8 detik setelah ronde dimulai)');
  console.log('  Di komputer ini :  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log('  Teman di LAN    :  http://' + ni.address + ':' + PORT);
    }
  }
  console.log('');
});
