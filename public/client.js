// Crate Crew — client. Menggambar snapshot dari server dengan interpolasi; tidak ada logika game di sini.
// Dunia dirender 3D (WebGL / three.js, ada di public/vendor); HUD & label digambar di kanvas 2D di atasnya.
// Semua tekstur digambar lewat kode (canvas), tanpa file gambar.
import * as THREE from './vendor/three.module.min.js';
import { HAZARD_COLORS, groundHeight, drawMapPreview } from './terrain.js';
import { ArenaEventView, EVENT_COLORS, drawArenaMinimap } from './arena-events.js';
import { makeUfo, makeChicken, makeLord, animateEncounter, makeAirdrop, animateAirdrop, disposeEncounter } from './encounters.js';

const cv = document.getElementById('game');
const hud = document.getElementById('hud');
const ctx = hud.getContext('2d');
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, f) => a + (b - a) * f;
const lerpAng = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * f; };

// urutan sama dengan WEAPONS di server (nama dari server menimpa saat welcome)
let WNAME = ['Pistol', 'SMG', 'Shotgun', 'Bazooka', 'Meriam tank', 'Senapan mesin', 'Sniper', 'Pelontar api', 'Pelontar granat', 'Minigun', 'Laser'];
const WCOL = ['#d8d8d8', '#4fc3f7', '#ff8a65', '#9ccc65', '#c9b458', '#e0e0e0', '#b388ff', '#ff7043', '#c0ca33', '#ffd54f', '#ff4081', '#ffb74d', '#58e5ff'];
const GUN_LEN = [14, 18, 20, 26, 26, 20, 30, 20, 18, 22, 24, 34, 22], GUN_TH = [4.5, 4.5, 4.5, 7, 7, 4.5, 4, 7, 6.5, 6.5, 5, 8, 5];
// jenis unit dari server: 0 pemain, 1 bot, 2 turret, 3 tank, 4 jeep
const K_TANK = 3, K_JEEP = 4, K_MON = 5, K_UFO = 6, K_CHICKEN = 7, K_LORD = 8, VNAME = { 3: 'Tank', 4: 'Jeep' };
const MON_COL = '#c77dff';
const isVeh = u => u.kind === K_TANK || u.kind === K_JEEP;
const WALL_H = 44, HQ_H = 64, CRATE = 30, GUN_H = 16;
const FOV = 36, PITCH = 56 * Math.PI / 180;

// ---------------- kualitas grafis ----------------
// ratio = batas resolusi render terhadap piksel CSS (0.75 = dirender lebih kecil lalu diperbesar)
const QUALITY = {
  rendah: { ratio: 0.75, shadows: 0, soft: false, particles: 0.4, aa: false, aniso: 1 },
  sedang: { ratio: 1, shadows: 1024, soft: false, particles: 0.7, aa: false, aniso: 4 },
  tinggi: { ratio: 2, shadows: 2048, soft: true, particles: 1, aa: true, aniso: 16 },
};
const QNAMES = Object.keys(QUALITY);
let qName = 'rendah';
try { const s = localStorage.getItem('cc-q'); if (s in QUALITY) qName = s; } catch (e) {}
let Q = QUALITY[qName];

// ---------------- renderer 3D ----------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: Q.aa, powerPreference: 'high-performance' });
} catch (e) {
  $('status').textContent = 'Browser ini tidak mendukung WebGL — game 3D tidak bisa jalan.';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const ANISO = Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const SKY = new THREE.Color('#a9cbe0');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 1500, 3400);
const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 6000);

scene.add(new THREE.HemisphereLight('#dceeff', '#4d5a33', 1.1));
const sun = new THREE.DirectionalLight('#fff0d4', 2.6);
const SUN_DIR = new THREE.Vector3(-0.45, 1, 0.55).normalize();
Object.assign(sun.shadow.camera, { left: -520, right: 520, top: 520, bottom: -520, near: 10, far: 2400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const flash = new THREE.PointLight('#ffa040', 0, 420, 0);
scene.add(flash);

let DPR = 1, IW = 0, IH = 0;
function resize() {
  const dev = window.devicePixelRatio || 1;
  DPR = Math.min(dev, Q.ratio < 1 ? 1 : 2); // HUD tetap tajam, cukup murah
  IW = innerWidth; IH = innerHeight;
  hud.width = IW * DPR; hud.height = IH * DPR;
  hud.style.width = IW + 'px'; hud.style.height = IH + 'px';
  renderer.setPixelRatio(Math.min(dev, Q.ratio));
  renderer.setSize(IW, IH);
  camera.aspect = IW / IH;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function applyShadows() {
  const on = Q.shadows > 0;
  renderer.shadowMap.enabled = on;
  renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = on;
  if (on && sun.shadow.mapSize.x !== Q.shadows) {
    sun.shadow.mapSize.set(Q.shadows, Q.shadows);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  if (world) world.mat.blob.visible = !on; // bayangan bulat murah saat bayangan asli mati
}
function setQuality(name) {
  if (!(name in QUALITY) || name === qName) return;
  const aaChanged = QUALITY[name].aa !== Q.aa;
  qName = name; Q = QUALITY[name];
  try { localStorage.setItem('cc-q', name); } catch (e) {}
  resize(); applyShadows();
  renderQualityButtons();
  pushFeed('Grafis: <b style="color:#f6c453">' + name + '</b>' + (aaChanged ? ' (antialias berubah setelah muat ulang)' : ''));
}
function renderQualityButtons() {
  const box = $('quality');
  box.innerHTML = '';
  for (const n of QNAMES) {
    const b = document.createElement('button');
    b.textContent = n[0].toUpperCase() + n.slice(1);
    if (n === qName) b.classList.add('sel');
    b.onclick = () => setQuality(n);
    box.appendChild(b);
  }
}

// jarak kamera supaya terlihat ±760×420 unit dunia di layar berapa pun
function camDist() {
  const t = Math.tan(FOV * Math.PI / 360);
  return Math.max(420 / (2 * t), 760 / (2 * t * (IW / IH)));
}

// ---------------- state ----------------
let meta = null, world = null, myId = 0, myTeam = -1, joined = false, selTeam = -1;
const snaps = [];
let latest = null, prevBullets = new Set();
const particles = [], feed = [], floaters = [], booms = [];
const cam = { x: 960, y: 720 };
let shake = 0, aim = 0, time = 0, lastT = performance.now();
const mouse = { x: 0, y: 0, down: false };
const keys = {};
let showScore = false, muted = false;
// sumber bidikan: 'mouse' (raycast kursor) atau 'stick' (stik sentuh / gamepad, arah langsung)
let aimMode = 'mouse', cursor = null;
let kicked = '';
let fps = 0, fpsN = 0, fpsT = 0, fpsLast = performance.now();
let actionTipTimer;
let mbgToastTimer;
let banner = null; // pengumuman event besar di tengah atas layar
renderQualityButtons();
applyShadows();

// ---------------- audio (disintesis, tanpa file) ----------------
let AC = null, noiseBuf = null;
function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.8, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function noise(dur, freq, vol, type = 'lowpass') {
  if (!AC || muted || vol <= 0.01) return;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = AC.createGain(); const t = AC.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(AC.destination); s.start(t); s.stop(t + dur);
}
function tone(freq, dur, vol, type = 'square', slide = 0, delay = 0) {
  if (!AC || muted) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
const near = (x, y) => clamp(1 - Math.hypot(x - cam.x, y - cam.y) / 900, 0, 1);
const sfx = {
  shot: v => noise(0.06, 2600, 0.10 * v, 'highpass'),
  rocket: v => noise(0.25, 900, 0.18 * v),
  flame: v => noise(0.12, 700, 0.05 * v),
  laser: v => tone(1500, 0.14, 0.05 * v, 'sawtooth', -1000),
  boom: v => { noise(0.7, 380, 0.55 * v); tone(90, 0.4, 0.2 * v, 'sine', -50); },
  thud: v => noise(0.14, 260, 0.35 * v),
  bonk: v => tone(420, 0.12, 0.12 * v, 'square', -250),
  build: () => { tone(523, 0.09, 0.07); tone(659, 0.09, 0.07, 'square', 0, 0.07); tone(784, 0.16, 0.07, 'square', 0, 0.14); },
  pick: () => tone(300, 0.06, 0.05, 'triangle', 200),
  die: v => tone(300, 0.35, 0.12 * v, 'sawtooth', -230),
};

// ---------------- jaringan ----------------
const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
const send = o => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
ws.onopen = () => { $('status').textContent = 'Terhubung ke ' + location.host; };
ws.onclose = () => {
  $('status').textContent = kicked ? `Kamu dikeluarkan dari ruangan oleh room master (${kicked}).` : 'Terputus dari server. Muat ulang halaman.';
  $('join').disabled = true; joined = false;
  closeChat(); updateRoom(); updateOrders(); updateTouch();
  $('arena-status').hidden = true;
  hideMbgToast();
};
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') onWelcome(m);
  else if (m.t === 'joined') { myId = m.id; myTeam = m.team; joined = true; updateRoom(); }
  else if (m.t === 's') onSnap(m);
  else if (m.t === 'chat') onChat(m);
  else if (m.t === 'kicked') kicked = m.by;
};

function onWelcome(m) {
  meta = m;
  if (m.wlabels) WNAME = m.wlabels.map((n, i) => (i === 4 ? 'Meriam tank' : n));
  if (world && world.mapId !== m.map.id) disposeWorld(); // server mengganti peta
  if (!world) world = buildWorld();
  roomKey = '';
  $('join').disabled = false;
  renderTeamButtons();
  renderBook();
}
// buku resep pola susunan (data dari server). Grid 2×2: b = peti tingkat 1, t = ditumpuk 2 tingkat
function renderBook() {
  const html = (meta.recipes || []).map(r => `<div class="rcp"><div class="grid">${[0, 1, 2, 3].map(i =>
    `<i class="${(r.hi >> i) & 1 ? 't' : (r.lo >> i) & 1 ? 'b' : ''}"></i>`).join('')}</div><div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></div></div>`).join('');
  $('book-lobby').innerHTML = html; $('book-list').innerHTML = html;
}
const toggleBook = v => $('book').classList.toggle('hidden', v === undefined ? undefined : !v);
$('book-x').onclick = () => toggleBook(false);
$('book').onclick = e => { if (e.target.id === 'book') toggleBook(false); };
function renderTeamButtons() {
  if (!meta) return;
  const box = $('teams');
  const counts = meta.names.map((_, t) => latest ? latest.PL.filter(p => p[2] === t).length : 0);
  const opts = [{ t: -1, name: 'Auto', col: '#55634f' }, ...meta.names.map((n, t) => ({ t, name: n, col: meta.colors[t] }))];
  box.innerHTML = '';
  for (const o of opts) {
    const b = document.createElement('button');
    b.style.background = o.col;
    b.innerHTML = o.name + '<small>' + (o.t < 0 ? 'seimbang' : counts[o.t] + ' pemain') + '</small>';
    if (o.t === selTeam) b.classList.add('sel');
    b.onclick = () => { selTeam = o.t; renderTeamButtons(); };
    box.appendChild(b);
  }
}
// ---------------- ruang tunggu ----------------
const inRoom = () => joined && latest && (latest.st === 'lobby' || latest.st === 'countdown');
let roomKey = '';
function updateRoom() {
  $('join-view').hidden = joined;
  $('room-view').hidden = !joined;
  $('lobby').classList.toggle('hidden', joined && !inRoom());
  if (!inRoom() || !meta || !latest.lb) { roomKey = ''; return; }
  const [cpu, cd, active] = latest.lb;
  const me = latest.PL.find(p => p[0] === myId);
  const master = latest.ms, amMaster = master === myId;
  const key = JSON.stringify([latest.PL.map(p => [p[0], p[1], p[2], p[7]]), latest.lb, latest.es, latest.st, myTeam, meta.map.id, master]);
  if (key === roomKey) return;
  roomKey = key;
  // pilihan peta: hanya room master (status siap semua pemain direset saat diganti)
  const maps = $('maps');
  maps.innerHTML = '';
  (meta.maps || []).forEach((mp, i) => {
    const b = document.createElement('button');
    const preview = document.createElement('canvas'); preview.width = 192; preview.height = 144;
    preview.setAttribute('aria-hidden', 'true');
    drawMapPreview(preview, { ...mp.preview, w: mp.w, h: mp.h, theme: mp.theme }, ['#e5484d','#3e7bfa','#30a46c','#f5b400']);
    const title = document.createElement('strong'); title.textContent = mp.name;
    const tag = document.createElement('small'); tag.textContent = mp.tag;
    b.append(preview, title, tag); b.title = mp.desc;
    b.setAttribute('aria-pressed', String(mp.id === meta.map.id));
    if (mp.id === meta.map.id) b.classList.add('sel');
    b.disabled = !amMaster && mp.id !== meta.map.id;
    b.onclick = () => { if (amMaster) send({ t: 'map', i }); };
    maps.appendChild(b);
  });
  $('map-description').textContent = `${meta.map.desc} · 72 × 54 petak · simetris 4 tim`;
  const mName = (latest.PL.find(p => p[0] === master) || [])[1];
  $('maps-note').textContent = amMaster ? '· kamu room master 👑' : mName ? `· dipilih room master (${mName})` : '';
  const room = $('room');
  room.innerHTML = '';
  meta.names.forEach((n, t) => {
    const col = document.createElement('button');
    col.className = 'col' + (t === myTeam ? ' mine' : '');
    col.style.setProperty('--c', meta.colors[t]);
    const ps = latest.PL.filter(p => p[2] === t);
    // room master melihat tombol keluarkan (✕) & serahkan master (👑) di samping pemain lain
    const tools = p => (amMaster && p[0] !== myId
      ? `<span class="pa"><span data-give="${p[0]}" title="Jadikan room master">👑</span><span class="kick" data-kick="${p[0]}" title="Keluarkan dari ruangan">✕</span></span>` : '');
    col.innerHTML = `<b>${esc(n)}</b>` + (ps.length
      ? ps.map(p => `<div class="${p[7] ? 'ok' : 'wait'}">${tools(p)}${p[7] ? '✓' : '…'} ${esc(p[1])}${p[0] === master ? ' 👑' : ''}${p[0] === myId ? ' (kamu)' : ''}</div>`).join('')
      : `<div class="${cpu ? 'cpu' : 'empty'}">${cpu ? 'CPU' : 'kosong — gugur'}</div>`);
    col.onclick = e => {
      const k = e.target.closest('[data-kick]'), g = e.target.closest('[data-give]');
      if (k) send({ t: 'kick', id: +k.dataset.kick });
      else if (g) send({ t: 'master', id: +g.dataset.give });
      else send({ t: 'team', team: t });
    };
    room.appendChild(col);
  });
  $('cpu').checked = !!cpu;
  $('cpu').disabled = !amMaster;
  updateEventOptions(amMaster, mName);
  const ready = !!(me && me[7]);
  $('ready').textContent = ready ? 'BATAL SIAP' : 'SIAP!';
  $('ready').classList.toggle('on', ready);
  const nReady = latest.PL.filter(p => p[7]).length;
  $('status').textContent = active < 2 ? 'Butuh pemain di minimal 2 tim, atau nyalakan CPU.'
    : latest.st === 'countdown' ? `Semua siap — mulai dalam ${cd}…`
    : `Menunggu semua pemain siap (${nReady}/${latest.PL.length})`;
}
$('ready').onclick = () => {
  const me = latest && latest.PL.find(p => p[0] === myId);
  send({ t: 'ready', v: !(me && me[7]) });
};
$('cpu').onchange = e => send({ t: 'cpu', v: e.target.checked });
$('events-enabled').onchange = e => send({ t: 'events', enabled: e.target.checked });
function updateEventOptions(amMaster, masterName) {
  const options = meta.eventOptions || [], state = latest.es || [1, 0];
  $('room-events').hidden = !options.length;
  const [enabled, mask] = state, box = $('event-options');
  const signature = options.map(option => option.id).join(',');
  if (box.dataset.options !== signature) {
    box.replaceChildren(); box.dataset.options = signature;
    for (const option of options) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.dataset.event = option.id;
      input.onchange = () => send({ t: 'events', kind: option.id, enabled: input.checked });
      label.append(input, document.createTextNode(option.name)); box.append(label);
    }
  }
  $('events-enabled').checked = !!enabled;
  $('events-enabled').disabled = !amMaster;
  box.disabled = !amMaster || !enabled;
  box.querySelectorAll('input').forEach((input, i) => { input.checked = !!(mask & (1 << i)); });
  const count = options.filter((_, i) => mask & (1 << i)).length;
  $('events-count').textContent = enabled ? `${count}/${options.length} aktif` : 'Semua mati';
  $('events-note').textContent = amMaster ? 'Khusus lobby · perubahan membatalkan Siap semua pemain.'
    : `Diatur room master${masterName ? ' (' + masterName + ')' : ''} · hanya bisa diubah di lobby.`;
}

// ---------------- perintah tim ----------------
const BUILD_OPTS = [['auto', 'Otomatis · pola'], ['weapon', 'Senjata · pola/1'], ['buddy', 'Buddy · 4 peti'],
  ['turret', 'Turret · 8 peti'], ['tank', 'Tank · 8 peti'], ['jeep', 'Jeep · 8 peti']];
const PLAN_NAME = { weapon: 'Senjata', buddy: 'Buddy', turret: 'Turret', tank: 'Tank', jeep: 'Jeep' };
const MODE_KEYS = ['Z', 'X', 'C', 'V', 'B', 'N'];
// tombol 1–6 untuk rakitan, Z X C V B N untuk perintah pasukan; 2 tim → cukup satu tombol "serang"
function modeOpts() {
  const enemies = meta.names.map((_, t) => t).filter(t => t !== myTeam);
  const o = [{ mode: 'follow', label: 'Ikuti aku' }, { mode: 'defend', label: 'Bertahan' }];
  if (enemies.length === 1) o.push({ mode: 'attack', target: enemies[0], label: 'Serang ' + meta.names[enemies[0]], col: meta.colors[enemies[0]] });
  else {
    o.push({ mode: 'attack', target: -1, label: 'Serang terdekat' });
    for (const t of enemies) o.push({ mode: 'attack', target: t, label: 'Serang ' + meta.names[t], col: meta.colors[t] });
  }
  return o.map((x, i) => ({ ...x, key: MODE_KEYS[i] }));
}
const sendBuild = b => send({ t: 'order', build: b });
const sendMode = o => send({ t: 'order', mode: o.mode, target: o.target ?? -1 });
let ordersKey = '';
function updateOrders() {
  const panel = $('orders');
  if (!joined || !latest || !latest.or || myTeam < 0 || inRoom()) { panel.classList.add('hidden'); ordersKey = ''; return; }
  const [build, mode, target] = latest.or[myTeam];
  const key = [myTeam, build, mode, target, latest.al.join()].join('|');
  if (key === ordersKey) return;
  ordersKey = key;
  panel.classList.remove('hidden');
  const mk = (box, label, k, sel, onClick, col, disabled) => {
    const b = document.createElement('button');
    b.innerHTML = `<kbd>${k}</kbd>` + (col ? `<span class="dot" style="background:${col}"></span>` : '') + esc(label);
    if (sel) b.classList.add('sel');
    b.disabled = !!disabled;
    b.onmousedown = e => e.preventDefault(); // jangan curi fokus keyboard
    b.onclick = onClick;
    box.appendChild(b);
  };
  const ob = $('ob'), om = $('om');
  ob.innerHTML = ''; om.innerHTML = '';
  BUILD_OPTS.forEach(([b, label], i) => mk(ob, label, i + 1, b === build, () => sendBuild(b)));
  for (const o of modeOpts()) {
    const sel = o.mode === mode && (o.mode !== 'attack' || o.target === target);
    mk(om, o.label, o.key, sel, () => sendMode(o), o.col, o.mode === 'attack' && o.target >= 0 && !latest.al[o.target]);
  }
}
function orderKey(code) {
  if (!joined || !meta || inRoom()) return false;
  const d = /^Digit(\d)$/.exec(code);
  if (d && +d[1] >= 1 && +d[1] <= BUILD_OPTS.length) { sendBuild(BUILD_OPTS[+d[1] - 1][0]); return true; }
  const k = /^Key([A-Z])$/.exec(code);
  const o = k && modeOpts().find(x => x.key === k[1]);
  if (o && !(o.mode === 'attack' && o.target >= 0 && latest && !latest.al[o.target])) { sendMode(o); return true; }
  return false;
}

try { $('name').value = localStorage.getItem('cc-name') || ''; } catch (e) {}
function doJoin() {
  if (!meta || joined) return;
  initAudio();
  const name = $('name').value.trim();
  try { localStorage.setItem('cc-name', name); } catch (e) {}
  send({ t: 'join', name, team: selTeam });
}
$('join').onclick = doJoin;
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

let snapCount = 0;
function onSnap(m) {
  m.rt = performance.now();
  m.Um = new Map(m.U.map(u => [u[0], u]));
  m.Cm = new Map(m.C.map(c => [c[0], c]));
  m.Bm = new Map(m.B.map(b => [b[0], b]));
  snaps.push(m);
  while (snaps.length > 40) snaps.shift();
  // reset bila jam server mundur (server restart)
  if (latest && m.tm < latest.tm) snaps.splice(0, snaps.length - 1);
  latest = m;
  if (m.st !== 'playing') hideMbgToast();
  updateArenaStatus(m.A);
  const me = m.PL.find(p => p[0] === myId);
  if (me) myTeam = me[2];
  // suara tembakan dari peluru baru
  let shots = 0;
  const cur = new Set();
  for (const b of m.B) {
    cur.add(b[0]);
    if (!prevBullets.has(b[0]) && shots < 3) {
      shots++;
      const v = near(b[1], b[2]), ty = b[3];
      if (ty === 3) sfx.flame(v); else if (ty === 5) sfx.laser(v); else if (ty) sfx.rocket(v); else sfx.shot(v);
      if (ty !== 3) spawnP(b[1], b[2], GUN_H, 0, 0, 0, 0.06, 6, ty === 5 ? '#ff9fd0' : '#fff3b0');
    }
  }
  prevBullets = cur;
  for (const e of m.ev) onEvent(e);
  if (!joined && ++snapCount % 30 === 0) renderTeamButtons();
  updateRoom();
  updateOrders();
  updateTouch();
}

// Peringatan tetap terlihat sepanjang event, termasuk pemain yang baru tersambung.
let arenaStatusKey = '';
function prepareMbgLogo() {
  const img = $('mbg-logo');
  if (!img.getAttribute('src')) img.src = 'assets/mbg-logo.png';
}
function hideMbgToast() { clearTimeout(mbgToastTimer); $('mbg-toast').hidden = true; }
function showMbgToast(e) {
  if (e.p !== myId || !joined || latest.st !== 'playing') return;
  prepareMbgLogo();
  $('mbg-toast-title').textContent = e.stage === 'received' ? 'BANSOS DITERIMA!' : 'BANSOS MBG CAIR!';
  const index = meta.weapons.indexOf(e.w);
  $('mbg-toast-weapon').textContent = index >= 0 ? WNAME[index] : 'Senjata acak';
  $('mbg-toast-hint').textContent = e.stage === 'received' ? 'Amunisi penuh. Gaskeun!' : 'Senjata di tanah · dekati / E untuk ambil';
  const box = $('mbg-toast');
  box.hidden = false;
  clearTimeout(mbgToastTimer); mbgToastTimer = setTimeout(hideMbgToast, 3000);
  if (e.stage === 'received') { tone(660, 0.08, 0.06, 'sine'); tone(990, 0.12, 0.06, 'sine', 0, 0.09); }
}
function updateArenaStatus(e) {
  const box = $('arena-status');
  const visible = !!e && latest.st === 'playing' && joined;
  box.hidden = !visible;
  if (!visible) { arenaStatusKey = ''; return; }
  if (e.kind === 'mbg') prepareMbgLogo();
  const warning = e.age < e.warn;
  const seconds = Math.max(0, Math.ceil(warning ? e.warn - e.age : e.warn + e.duration - e.age));
  const key = [e.id, warning, seconds].join(':');
  if (arenaStatusKey === key) return;
  arenaStatusKey = key;
  const rule = meta.arenaEvents[e.kind];
  box.style.setProperty('--event-color', EVENT_COLORS[e.kind]);
  $('arena-name').textContent = rule.name + (warning ? ' mendekat' : ' aktif') + ' · ' + seconds + ' dtk';
  $('arena-hint').textContent = rule.hint;
}

// ---------------- partikel (InstancedMesh, 3D) ----------------
const PMAX = 900;
const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), PMAX);
pMesh.frustumCulled = false;
for (let i = 0; i < PMAX; i++) pMesh.setColorAt(i, new THREE.Color('#ffffff'));
pMesh.count = 0;
scene.add(pMesh);
const _col = new THREE.Color();
// h = tinggi di atas permukaan tanah (bukit ikut dihitung)
function spawnP(x, y, h, vx, vy, vh, life, r, c, g = 0) {
  if (particles.length >= PMAX) particles.shift();
  const floor = meta ? hAt(x, y) : 0;
  particles.push({ x, y, h: h + floor, floor, vx, vy, vh, life, max: life, r, c: new THREE.Color(c), g });
}
// semburan ke segala arah (x,y = posisi tanah, h = tinggi)
function burst(x, y, h, n, col, spd, life, size, up = 0, g = 0) {
  n = Math.max(1, Math.round(n * Q.particles));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
    spawnP(x, y, h, Math.cos(a) * s, Math.sin(a) * s, Math.random() * spd * 0.7 + up, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), col, g);
  }
}
function boom(x, y, r) {
  const ball = new THREE.Mesh(world.geo.sphere, new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, depthWrite: false }));
  const ring = new THREE.Mesh(world.geo.ring, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const g = hAt(x, y);
  ball.position.set(x, g + 14, y); ring.position.set(x, g + 1.5, y); ring.rotation.x = -Math.PI / 2;
  scene.add(ball, ring);
  booms.push({ ball, ring, life: 0.45, max: 0.45, r });
  flash.position.set(x, 60, y); flash.intensity = 5;
}

function pushFeed(html, col) { feed.push({ html, col, t: 6 }); while (feed.length > 6) feed.shift(); }
const tname = t => (meta && t >= 0 ? meta.names[t] : '');
const tcol = t => (meta && t >= 0 ? meta.colors[t] : t === -1 ? MON_COL : '#ccc');

function onEvent(e) {
  if (!world) return;
  switch (e.k) {
    case 'boom':
      boom(e.x, e.y, e.r);
      burst(e.x, e.y, 12, 22, '#ff9a3c', 240, 0.5, 5, 40);
      burst(e.x, e.y, 10, 12, '#5b5550', 70, 1.3, 9, 50);
      burst(e.x, e.y, 6, 10, '#3a2a1a', 200, 0.9, 2.5, 160, 500);
      shake = Math.max(shake, 10 * near(e.x, e.y));
      sfx.boom(near(e.x, e.y));
      break;
    case 'hit': burst(e.x, e.y, GUN_H, 4, '#ffe9a0', 120, 0.18, 1.6); break;
    case 'land': burst(e.x, e.y, 3, 12, '#c9b48a', 120, 0.5, 4, 20); sfx.thud(near(e.x, e.y)); shake = Math.max(shake, 3 * near(e.x, e.y)); break;
    case 'place': burst(e.x, e.y, 8, 6, '#ffffff', 60, 0.3, 2.5, 30); sfx.pick(); break;
    case 'bonk': floaters.push({ x: e.x, y: e.y, h: 50, txt: 'BONK!', col: '#ffd36b', t: 1 }); sfx.bonk(near(e.x, e.y)); break;
    case 'kill': {
      if (!e.f) burst(e.x, e.y, 16, 16, tcol(e.tb), 160, 0.6, 4, 60, 300);
      sfx.die(near(e.x, e.y));
      const b = `<b style="color:${tcol(e.tb)}">${esc(e.b)}</b>`;
      pushFeed(e.a ? `<b style="color:${tcol(e.ta)}">${esc(e.a)}</b> ✕ ${b}${e.f ? ' (lubang)' : ''}` : b + (e.f ? ' jatuh ke lubang' : ' tumbang'));
      break;
    }
    case 'fall':
      burst(e.x, e.y, -10, 14, '#5a4836', 90, 0.8, 4, 40);
      tone(500, 0.5, 0.08 * near(e.x, e.y), 'triangle', -420);
      break;
    case 'slam':
      boom(e.x, e.y, e.r);
      burst(e.x, e.y, 4, 26, theme().zone[2], 260, 0.7, 6, 60, 300);
      shake = Math.max(shake, 12 * near(e.x, e.y));
      sfx.thud(near(e.x, e.y)); tone(70, 0.4, 0.25 * near(e.x, e.y), 'sine', -30);
      break;
    case 'evt':
      banner = latest && latest.A ? null : { name: e.name, d: e.d, t: 4 };
      pushFeed(`<b style="color:#ffb347">${esc(e.name)}</b> ${esc(e.d)}`);
      tone(880, 0.15, 0.08, 'square'); tone(660, 0.15, 0.08, 'square', 0, 0.18); tone(880, 0.25, 0.08, 'square', 0, 0.36);
      break;
    case 'mapset':
      pushFeed(`${esc(e.n)} memilih peta <b style="color:#f6c453">${esc(e.name)}</b>`);
      chatLine(null, `${e.n} memilih peta ${e.name}`);
      break;
    case 'master':
      pushFeed(`<b style="color:#f6c453">${esc(e.n)}</b> sekarang room master`);
      chatLine(null, `👑 ${e.n} sekarang room master`);
      break;
    case 'kick':
      pushFeed(`${esc(e.n)} dikeluarkan oleh ${esc(e.by)}`);
      chatLine(null, `${e.n} dikeluarkan oleh room master ${e.by}`);
      break;
    case 'build':
      floaters.push({ x: e.x, y: e.y, h: 50, txt: e.w, col: tcol(e.t), t: 1.6 });
      burst(e.x, e.y, 14, 18, '#fff6c8', 140, 0.6, 2.5, 80);
      if (e.t === myTeam) sfx.build();
      break;
    case 'shatter': burst(e.x, e.y, 15, 16, '#b9d4df', 160, 0.55, 4, 80); sfx.bonk(near(e.x, e.y)); break;
    case 'mbg': showMbgToast(e); break;
    case 'trainhit': burst(e.x, e.y, 18, 20, '#ffb25d', 190, 0.7, 5, 100); sfx.bonk(near(e.x, e.y)); shake = Math.max(shake, 7 * near(e.x, e.y)); break;
    case 'slash': burst(e.x + Math.cos(e.a) * e.r * 0.6, e.y + Math.sin(e.a) * e.r * 0.6, 30, 16, '#8cffff', 180, 0.3, 4, 80); sfx.shot(near(e.x, e.y)); break;
    case 'claim': pushFeed(`<b style="color:${tcol(e.t)}">${esc(e.n)}</b> merebut airdrop: Super Bazooka + Tank!`); if (e.t === myTeam) sfx.build(); break;
    case 'tip': if (e.p === myId) { pushFeed(esc(e.txt)); $('action-tip').textContent = e.txt; $('action-tip').hidden = false; clearTimeout(actionTipTimer); actionTipTimer = setTimeout(() => { $('action-tip').hidden = true; }, 3500); } break;
    case 'steal': pushFeed(`<b style="color:${tcol(e.by)}">${tname(e.by)}</b> mencuri peti tim <b style="color:${tcol(e.t)}">${tname(e.t)}</b>!`); break;
    case 'hq':
      pushFeed(`Markas <b style="color:${tcol(e.t)}">${tname(e.t)}</b> HANCUR!`);
      for (let i = 0; i < 4; i++) setTimeout(() => onEvent({ k: 'boom', x: e.x + (Math.random() - 0.5) * 100, y: e.y + (Math.random() - 0.5) * 100, r: 90 }), i * 180);
      break;
    case 'board': burst(e.x, e.y, 10, 6, '#cccccc', 50, 0.4, 3, 20); sfx.pick(); break;
    case 'start': pushFeed('<b style="color:#f6c453">Ronde dimulai!</b> Kumpulkan peti untuk merakit Buddy.'); if (joined) sfx.build(); break;
    case 'cpu': pushFeed(`${esc(e.n)} ${e.v ? 'menyalakan' : 'mematikan'} CPU untuk tim kosong`); break;
    case 'eventcfg': pushFeed(`${esc(e.n)} ${e.v ? 'mengaktifkan' : 'mematikan'} ${esc(e.name)}`); break;
    case 'order':
      if (e.t === myTeam) pushFeed(`<b style="color:${tcol(e.t)}">${esc(e.n)}</b>: ${esc(e.txt)}`);
      break;
    case 'join': pushFeed(`${esc(e.n)} bergabung ke tim <b style="color:${tcol(e.t)}">${tname(e.t)}</b>`); chatLine(null, `${e.n} masuk ruangan`); break;
    case 'leave': pushFeed(`${esc(e.n)} keluar`); chatLine(null, `${e.n} keluar`); break;
  }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- pad: petak yang dibidik saat menaruh peti ----------------
let lastMe = null; // unit yang dikendalikan pada frame terakhir
// sama dengan cellOrder di server: petak terurut dari yang terdekat ke kolom yang dibidik
const cellOrder = col => [0, 1, 2, 3].sort((i, j) =>
  Math.abs((i & 1) - (col & 1)) + Math.abs((i >> 1) - (col >> 1)) - Math.abs((j & 1) - (col & 1)) - Math.abs((j >> 1) - (col >> 1)) || i - j);
function slotPos(k) {
  const b = meta.map.bases[myTeam], T = meta.map.tile, c = k % 4;
  return { x: b.pad.x + (c % 2 ? T / 2 : -T / 2), y: b.pad.y + (c < 2 ? -T / 2 : T / 2), z: k >= 4 ? meta.map.crateH : 0 };
}
// { col: kolom yang dibidik, slot: tempat peti akan mendarat (-1 = pad penuh) }, null bila terlalu jauh dari pad
function padTarget(me) {
  if (!me || myTeam < 0 || !latest) return null;
  const b = meta.map.bases[myTeam], T = meta.map.tile;
  if (Math.hypot(me.x - b.pad.x, me.y - b.pad.y) >= 72) return null;
  let px = me.x + Math.cos(aim) * 30, py = me.y + Math.sin(aim) * 30;
  if (aimMode === 'mouse' && cursor && Math.abs(cursor.x - b.pad.x) < T * 1.5 && Math.abs(cursor.y - b.pad.y) < T * 1.5) { px = cursor.x; py = cursor.y; }
  let col = 0, bd = Infinity;
  for (let k = 0; k < 4; k++) { const s = slotPos(k), d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; col = k; } }
  const mask = latest.pm ? latest.pm[myTeam] : 0;
  for (const k of cellOrder(col)) {
    if (!((mask >> k) & 1)) return { col, slot: k };
    if (!((mask >> (k + 4)) & 1)) return { col, slot: k + 4 };
  }
  return { col, slot: -1 };
}
function sendGrab() {
  const t = lastMe && lastMe.carry ? padTarget(lastMe) : null;
  send({ t: 'act', k: 'grab', c: t ? t.col : -1 });
}

// ---------------- input: keyboard & mouse ----------------
const patchNotesOpen = () => $('patch-notes').open;
function openPatchNotes() {
  closeChat(); toggleBook(false); touchReset();
  for (const k in keys) keys[k] = false;
  mouse.down = false; showScore = false;
  $('patch-notes').showModal();
  $('patch-notes').scrollTop = 0;
}
for (const b of document.querySelectorAll('[data-patch-notes]')) b.onclick = openPatchNotes;
$('patch-close').onclick = () => $('patch-notes').close();
const typing = () => { const a = document.activeElement; return a && a.tagName === 'INPUT' && a.type !== 'checkbox'; };
addEventListener('keydown', e => {
  if (patchNotesOpen() || typing()) return;
  if (e.key === 'Enter' && joined && !e.isComposing) { e.preventDefault(); openChat(e.shiftKey); return; }
  if (e.code === 'Tab') { e.preventDefault(); showScore = true; }
  if (e.code === 'Escape') toggleBook(false);
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (e.code === 'KeyG') setQuality(QNAMES[(QNAMES.indexOf(qName) + 1) % QNAMES.length]);
  if (e.code === 'KeyR') toggleBook();
  if (!joined) return;
  if (orderKey(e.code)) return;
  if (e.code === 'KeyE') sendGrab();
  if (e.code === 'KeyF') send({ t: 'act', k: 'throw' });
  if (e.code === 'KeyQ') send({ t: 'act', k: 'build' });
  if (e.code === 'KeyM') muted = !muted;
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') showScore = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  for (const k in keys) keys[k] = false;
  mouse.down = false; touchReset(); gin.mx = gin.my = 0; gin.fire = false;
  if (joined) send({ t: 'in', mx: 0, my: 0, a: +aim.toFixed(3), f: 0 });
});
cv.addEventListener('mousemove', e => { if (useTouch) return; mouse.x = e.clientX; mouse.y = e.clientY; aimMode = 'mouse'; });
cv.addEventListener('mousedown', e => {
  if (useTouch || patchNotesOpen()) return;
  initAudio();
  if (e.button === 0) mouse.down = true;
  if (e.button === 2 && joined) send({ t: 'act', k: 'throw' });
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

// ---------------- chat (Enter = semua, Shift+Enter = tim) ----------------
let chatTeam = false;
const chatOpen = () => !$('chat-form').hidden;
function renderChatCh() { const b = $('chat-ch'); b.textContent = chatTeam ? 'Tim' : 'Semua'; b.classList.toggle('team', chatTeam); }
function openChat(team) {
  if (!joined) return;
  chatTeam = !!team; renderChatCh();
  for (const k in keys) keys[k] = false; // jangan sampai pemain terus berjalan selama mengetik
  mouse.down = false; showScore = false; touchReset();
  $('chat-form').hidden = false; $('chat').classList.add('open');
  $('chat-in').focus();
  const log = $('chat-log'); log.scrollTop = log.scrollHeight;
}
function closeChat() {
  $('chat-form').hidden = true; $('chat').classList.remove('open');
  $('chat-in').value = ''; $('chat-in').blur();
  const log = $('chat-log'); log.scrollTop = log.scrollHeight;
}
$('chat-form').onsubmit = e => e.preventDefault();
$('chat-in').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    const s = e.target.value.trim();
    if (s) send({ t: 'chat', s, team: chatTeam });
    closeChat();
  } else if (e.key === 'Escape') { e.preventDefault(); closeChat(); }
  else if (e.key === 'Tab') { e.preventDefault(); chatTeam = !chatTeam; renderChatCh(); }
});
// klik/tap di luar kolom chat = batal (jeda sebentar supaya tombol Semua/Tim sempat mengembalikan fokus)
$('chat-in').addEventListener('blur', () => setTimeout(() => { if (chatOpen() && document.activeElement !== $('chat-in')) closeChat(); }, 150));
$('chat-ch').onpointerdown = e => e.preventDefault();
$('chat-ch').onclick = () => { chatTeam = !chatTeam; renderChatCh(); $('chat-in').focus(); };
function onChat(m) {
  if (m.sys) { chatLine(null, m.s); return; }
  chatLine(m, m.s);
  if (m.id !== myId) tone(990, 0.05, 0.03, 'sine');
}
function chatLine(m, s) {
  const log = $('chat-log'), d = document.createElement('div');
  d.className = 'ln' + (m ? '' : ' sys');
  if (m) d.innerHTML = `<span class="ch">[${m.team ? 'Tim' : 'Semua'}]</span> <b style="color:${tcol(m.tm)}">${esc(m.n)}</b>: ${esc(s)}`;
  else d.textContent = s;
  log.appendChild(d);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => d.classList.add('old'), 9000);
}

// ---------------- gamepad sentuh (HP / tablet) ----------------
// stik kiri = gerak, stik kanan = bidik (+ tembak bila didorong jauh). Stik muncul di titik sentuhan pertama.
let useTouch = matchMedia('(pointer: coarse)').matches;
const STICK_R = 52;
const sticks = { l: null, r: null };
const tin = { mx: 0, my: 0, fire: false, aiming: false };
addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !useTouch) { useTouch = true; updateTouch(); } }, true);
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && useTouch && !matchMedia('(pointer: coarse)').matches) { useTouch = false; touchReset(); updateTouch(); } });
function updateTouch() {
  const on = useTouch && joined && !inRoom();
  $('touch').classList.toggle('hidden', !on);
  document.body.classList.toggle('touch', useTouch);
  document.body.classList.toggle('playing', joined && !inRoom());
  if (!on && (sticks.l || sticks.r)) touchReset();
}
function placeStick(side, st) {
  const el = $(side === 'l' ? 'stick-l' : 'stick-r'), knob = el.firstElementChild;
  el.classList.toggle('on', !!st);
  el.style.left = (st ? st.ox : side === 'l' ? 100 : IW - 100) + 'px';
  el.style.top = (st ? st.oy : IH - 90) + 'px';
  knob.style.transform = st ? `translate(${st.dx * STICK_R}px, ${st.dy * STICK_R}px)` : '';
}
function applySticks() {
  const l = sticks.l, r = sticks.r;
  const lm = l ? Math.hypot(l.dx, l.dy) : 0, rm = r ? Math.hypot(r.dx, r.dy) : 0;
  tin.mx = lm > 0.15 ? l.dx : 0; tin.my = lm > 0.15 ? l.dy : 0;
  tin.aiming = rm > 0.2;
  if (tin.aiming) aim = Math.atan2(r.dy, r.dx);
  tin.fire = rm > 0.45;
  if (l || r) aimMode = 'stick';
}
function touchReset() { sticks.l = sticks.r = null; placeStick('l', null); placeStick('r', null); applySticks(); }
const tz = $('tzone');
tz.addEventListener('pointerdown', e => {
  e.preventDefault(); initAudio();
  const side = e.clientX < IW / 2 ? 'l' : 'r';
  if (sticks[side]) return;
  sticks[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
  try { tz.setPointerCapture(e.pointerId); } catch (err) {}
  placeStick(side, sticks[side]); applySticks();
});
tz.addEventListener('pointermove', e => {
  for (const side of ['l', 'r']) {
    const st = sticks[side];
    if (!st || st.id !== e.pointerId) continue;
    let dx = (e.clientX - st.ox) / STICK_R, dy = (e.clientY - st.oy) / STICK_R;
    const len = Math.hypot(dx, dy);
    if (len > 1) { // pangkal stik ikut tertarik supaya jari tidak "mentok"
      st.ox = e.clientX - (dx / len) * STICK_R; st.oy = e.clientY - (dy / len) * STICK_R;
      dx /= len; dy /= len;
    }
    st.dx = dx; st.dy = dy;
    placeStick(side, st); applySticks();
  }
});
const endStick = e => {
  for (const side of ['l', 'r']) if (sticks[side] && sticks[side].id === e.pointerId) { sticks[side] = null; placeStick(side, null); }
  applySticks();
};
tz.addEventListener('pointerup', endStick);
tz.addEventListener('pointercancel', endStick);
for (const b of document.querySelectorAll('#touch [data-act]')) {
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); initAudio(); b.classList.add('down');
    if (b.dataset.act === 'grab') sendGrab(); else send({ t: 'act', k: b.dataset.act });
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('down'));
}
function toggleFullscreen() {
  const d = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
  } catch (err) {} // iPhone Safari tidak mendukung layar penuh untuk halaman web
}
for (const b of document.querySelectorAll('#touch [data-ui]')) {
  b.addEventListener('click', () => {
    const k = b.dataset.ui;
    if (k === 'orders') b.classList.toggle('sel', $('orders').classList.toggle('show'));
    else if (k === 'book') toggleBook();
    else if (k === 'score') b.classList.toggle('sel', (showScore = !showScore));
    else if (k === 'chat') openChat(false);
    else if (k === 'patch') openPatchNotes();
    else if (k === 'full') toggleFullscreen();
  });
}
addEventListener('resize', () => { if (!sticks.l) placeStick('l', null); if (!sticks.r) placeStick('r', null); });
placeStick('l', null); placeStick('r', null);

// ---------------- gamepad fisik (Gamepad API, USB / Bluetooth, juga di HP) ----------------
// Tata letak "standard": 0 A, 1 B, 2 X, 3 Y, 5 RB, 7 RT, 8 Back, 9 Start, 12–15 D-pad
const gin = { mx: 0, my: 0, fire: false, aiming: false }, gpPrev = [];
function cycleOrder(dir, build) {
  if (!latest || !latest.or || myTeam < 0 || inRoom()) return;
  const [b, mode, target] = latest.or[myTeam];
  if (build) {
    const i = BUILD_OPTS.findIndex(o => o[0] === b);
    sendBuild(BUILD_OPTS[(i + dir + BUILD_OPTS.length) % BUILD_OPTS.length][0]);
  } else {
    const opts = modeOpts().filter(o => !(o.mode === 'attack' && o.target >= 0 && !latest.al[o.target]));
    const i = opts.findIndex(o => o.mode === mode && (o.mode !== 'attack' || o.target === target));
    sendMode(opts[(i + dir + opts.length) % opts.length]);
  }
}
function pollGamepad() {
  gin.mx = gin.my = 0; gin.fire = gin.aiming = false;
  if (document.hidden || patchNotesOpen()) return;
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
  if (!gp) return;
  const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.2 ? 0 : v; };
  const btn = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
  const press = i => btn(i) && !gpPrev[i];
  gin.mx = ax(0); gin.my = ax(1);
  const rx = ax(2), ry = ax(3);
  if (Math.hypot(rx, ry) > 0.3) { aim = Math.atan2(ry, rx); gin.aiming = true; aimMode = 'stick'; }
  else if (gin.mx || gin.my) aimMode = 'stick';
  gin.fire = btn(7) || btn(5);
  if (!chatOpen()) {
    if (joined && press(0)) sendGrab();
    if (joined && press(1)) send({ t: 'act', k: 'throw' });
    if (joined && press(2)) send({ t: 'act', k: 'build' });
    if (press(3)) toggleBook();
    if (press(9) && inRoom()) $('ready').onclick();
    if (press(14) || press(15)) cycleOrder(press(15) ? 1 : -1, true);
    if (press(12) || press(13)) cycleOrder(press(13) ? 1 : -1, false);
    if (btn(8) !== !!gpPrev[8]) showScore = btn(8);
  }
  for (let i = 0; i < gp.buttons.length; i++) gpPrev[i] = btn(i);
}

setInterval(() => {
  pollGamepad();
  if (!joined) return;
  if (document.hidden || patchNotesOpen()) { send({ t: 'in', mx: 0, my: 0, a: +aim.toFixed(3), f: 0 }); return; }
  const k = c => (keys[c] ? 1 : 0);
  const smx = tin.mx + gin.mx, smy = tin.my + gin.my;
  const mx = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + smx;
  const my = k('KeyS') + k('ArrowDown') - k('KeyW') - k('ArrowUp') + smy;
  // stik tanpa bidikan stik kanan: hadap ke arah jalan
  if (aimMode === 'stick' && !tin.aiming && !gin.aiming && Math.hypot(smx, smy) > 0.3) aim = Math.atan2(smy, smx);
  send({ t: 'in', mx: clamp(mx, -1, 1), my: clamp(my, -1, 1), a: +aim.toFixed(3), f: mouse.down || tin.fire || gin.fire ? 1 : 0 });
}, 33);

// ---------------- interpolasi ----------------
function sampleState() {
  const L = snaps[snaps.length - 1];
  const st = L.tm + (performance.now() - L.rt) / 1000 - 0.075;
  let a = L, b = L, f = 0;
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].tm <= st) { a = snaps[i - 1]; b = snaps[i]; f = clamp((st - a.tm) / Math.max(1e-3, b.tm - a.tm), 0, 1); break; }
  }
  if (a === L && snaps.length > 1 && snaps[0].tm > st) { a = b = snaps[0]; }
  const units = b.U.map(u => {
    const p = a.Um.get(u[0]);
    return { id: u[0], team: u[1], x: p ? lerp(p[2], u[2], f) : u[2], y: p ? lerp(p[3], u[3], f) : u[3], a: p ? lerpAng(p[4], u[4], f) : u[4],
      hp: u[5], max: u[6], w: u[7], carry: u[8], kind: u[9], owner: u[10], moving: u[11], ammo: u[12], shield: u[13],
      hull: p ? lerpAng(p[14], u[14], f) : u[14], anim: u[15], rage: u[16], elite: u[17], lord: u[18], lift: u[19] || 0, neutral: u[20] };
  });
  const crates = b.C.map(c => {
    const p = a.Cm.get(c[0]);
    return { id: c[0], x: p ? lerp(p[1], c[1], f) : c[1], y: p ? lerp(p[2], c[2], f) : c[2], z: p ? lerp(p[3], c[3], f) : c[3], pad: c[4], metal: c[5], washed: c[6] };
  });
  const bullets = b.B.map(bl => {
    const p = a.Bm.get(bl[0]);
    return { id: bl[0], x: p ? lerp(p[1], bl[1], f) : bl[1], y: p ? lerp(p[2], bl[2], f) : bl[2], px: p ? p[1] : bl[1], py: p ? p[2] : bl[2], rocket: bl[3], team: bl[4] };
  });
  return { units, crates, bullets, pickups: b.P };
}

// ---------------- tekstur prosedural ----------------
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function makeTex(w, h, draw, repeat = false, limit = Infinity) {
  const c = document.createElement('canvas'), scale = Math.min(1, limit / Math.max(w, h));
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const context = c.getContext('2d'); context.scale(c.width / w, c.height / h);
  draw(context, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function speckle(c, w, h, n, r, cols, a0 = 0.15, a1 = 0.35, sz = 2) {
  for (let i = 0; i < n; i++) {
    c.globalAlpha = a0 + r() * (a1 - a0);
    c.fillStyle = cols[(r() * cols.length) | 0];
    c.fillRect(r() * w, r() * h, 1 + r() * sz, 1 + r() * sz);
  }
  c.globalAlpha = 1;
}

const texCrate = () => makeTex(128, 128, (c, w, h) => {
  const r = rng(11);
  for (let i = 0; i < 4; i++) {   // papan
    const y = i * 32;
    c.fillStyle = `hsl(${28 + r() * 6},${48 + r() * 10}%,${40 + r() * 8}%)`; c.fillRect(0, y, w, 32);
    for (let k = 0; k < 16; k++) {
      c.strokeStyle = `rgba(70,38,12,${0.12 + r() * 0.25})`; c.lineWidth = 0.6 + r();
      const yy = y + 2 + r() * 28;
      c.beginPath(); c.moveTo(0, yy); c.bezierCurveTo(40, yy + r() * 5 - 2.5, 90, yy + r() * 5 - 2.5, 128, yy + r() * 3 - 1.5); c.stroke();
    }
    c.fillStyle = 'rgba(35,18,6,.85)'; c.fillRect(0, y, w, 2);
    c.fillStyle = 'rgba(255,220,170,.18)'; c.fillRect(0, y + 2, w, 1);
  }
  // penguat diagonal
  c.save(); c.translate(64, 64); c.rotate(-Math.PI / 4);
  c.fillStyle = '#9b6630'; c.fillRect(-90, -9, 180, 18);
  c.fillStyle = 'rgba(35,18,6,.7)'; c.fillRect(-90, -10, 180, 2); c.fillRect(-90, 8, 180, 2);
  c.restore();
  // bingkai
  const fr = 15;
  c.fillStyle = '#8c5a27';
  c.fillRect(0, 0, w, fr); c.fillRect(0, h - fr, w, fr); c.fillRect(0, 0, fr, h); c.fillRect(w - fr, 0, fr, h);
  c.strokeStyle = 'rgba(30,15,5,.85)'; c.lineWidth = 2;
  c.strokeRect(1, 1, w - 2, h - 2); c.strokeRect(fr, fr, w - fr * 2, h - fr * 2);
  c.fillStyle = 'rgba(255,220,170,.22)'; c.fillRect(2, 2, w - 4, 2); c.fillRect(2, 2, 2, h - 4);
  speckle(c, w, h, 500, r, ['#3b200a', '#c08848'], 0.1, 0.3, 1.5);
  // paku
  for (const [x, y] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8], [64, 8], [64, h - 8], [8, 64], [w - 8, 64]]) {
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
    c.fillStyle = '#9a9a9a'; c.beginPath(); c.arc(x - 0.7, y - 0.7, 1.1, 0, 7); c.fill();
  }
});

const texStone = () => makeTex(128, 128, (c, w, h) => {
  const r = rng(5);
  c.fillStyle = '#3d4045'; c.fillRect(0, 0, w, h);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 21 : 0;
    for (let col = -1; col < 4; col++) {
      const x = col * 42 + off, y = row * 32, bw = 40, bh = 30;
      const l = 46 + r() * 16;
      c.fillStyle = `hsl(${200 + r() * 30},${5 + r() * 6}%,${l}%)`; c.fillRect(x + 2, y + 2, bw - 2, bh - 2);
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(x + 2, y + 2, bw - 2, 2);
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 2, y + bh - 2, bw - 2, 2); c.fillRect(x + bw - 2, y + 2, 2, bh - 2);
    }
  }
  speckle(c, w, h, 1400, r, ['#202326', '#8d939b', '#5b6168'], 0.15, 0.4, 2);
  // retakan
  c.strokeStyle = 'rgba(20,20,22,.5)'; c.lineWidth = 1;
  for (let i = 0; i < 5; i++) { let x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += r() * 10 - 5; y += r() * 10 - 5; c.lineTo(x, y); } c.stroke(); }
}, true);

const texBrick = () => makeTex(128, 128, (c, w, h) => {
  const r = rng(9);
  c.fillStyle = '#7d7468'; c.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 4; col++) {
      const x = col * 32 + off, y = row * 16;
      c.fillStyle = `hsl(30,${8 + r() * 10}%,${78 + r() * 14}%)`; c.fillRect(x + 1.5, y + 1.5, 29, 13);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + 1.5, y + 12.5, 29, 2);
    }
  }
  speckle(c, w, h, 900, r, ['#5a5248', '#ffffff'], 0.1, 0.3, 1.5);
}, true);

const texSuit = () => makeTex(64, 64, (c, w, h) => {
  const r = rng(21);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c9c9');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  speckle(c, w, h, 500, r, ['#888', '#fff'], 0.08, 0.2, 1);
  c.fillStyle = '#2b2f36'; c.fillRect(0, 38, w, 6);        // sabuk
  c.fillStyle = '#d6b14a'; c.fillRect(w * 0.25 - 3, 38, 6, 6); // gesper (menghadap depan)
  c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = 1;     // jahitan
  c.beginPath(); c.moveTo(0, 20); c.lineTo(w, 20); c.stroke();
});

const texPanel = () => makeTex(128, 128, (c, w, h) => {
  const r = rng(41);
  c.fillStyle = '#d9d9d2'; c.fillRect(0, 0, w, h);
  speckle(c, w, h, 900, r, ['#9a9a92', '#ffffff'], 0.1, 0.3, 2);
  c.strokeStyle = 'rgba(40,40,36,.55)'; c.lineWidth = 2;  // sambungan pelat
  c.strokeRect(2, 2, 60, 60); c.strokeRect(66, 2, 60, 60); c.strokeRect(2, 66, 124, 60);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(4, 4, 56, 2); c.fillRect(68, 4, 56, 2); c.fillRect(4, 68, 120, 2);
  for (const [x, y] of [[8, 8], [56, 8], [72, 8], [120, 8], [8, 56], [56, 56], [72, 56], [120, 56], [8, 72], [120, 72], [8, 120], [64, 120], [120, 120]]) {
    c.fillStyle = '#55554e'; c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill();       // paku keling
    c.fillStyle = '#f2f2ec'; c.beginPath(); c.arc(x - 0.6, y - 0.6, 1, 0, 7); c.fill();
  }
  c.strokeStyle = 'rgba(60,50,40,.35)'; c.lineWidth = 1;                          // goresan
  for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + r() * 16 - 8, y + r() * 6 - 3); c.stroke(); }
});

const texTread = () => {
  const t = makeTex(64, 16, (c, w, h) => {
    c.fillStyle = '#26282b'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      c.fillStyle = '#3d4044'; c.fillRect(x + 1, 1, 5, h - 2);
      c.fillStyle = '#16181a'; c.fillRect(x + 6, 0, 2, h);
    }
  }, true);
  t.repeat.set(6, 1);
  return t;
};

const texGrassTile = () => makeTex(256, 256, (c, w, h) => {
  const r = rng(13), th = theme();
  c.fillStyle = th.outer; c.fillRect(0, 0, w, h);
  speckle(c, w, h, 5000, r, th.outerSpeck, 0.3, 0.7, 3);
}, true);

// kulit monster: batu gelap dengan retakan lava yang menyala
const texRock = () => makeTex(128, 128, (c, w, h) => {
  const r = rng(55);
  c.fillStyle = '#4a4250'; c.fillRect(0, 0, w, h);
  speckle(c, w, h, 2500, r, ['#2c2732', '#6a6072', '#5a5062', '#3a3340'], 0.3, 0.7, 4);
  c.strokeStyle = '#ff8a2a'; c.lineWidth = 2; c.shadowColor = '#ff6a00'; c.shadowBlur = 6;
  for (let i = 0; i < 9; i++) {
    let x = r() * w, y = r() * h;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += r() * 22 - 11; y += r() * 22 - 11; c.lineTo(x, y); }
    c.stroke();
  }
});

function texPad(col) {
  return makeTex(128, 128, (c, w, h) => {
    const r = rng(17);
    c.fillStyle = '#3a3f45'; c.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10) for (let x = (y / 10) % 2 ? 9 : 4; x < w; x += 10) { // pelat berlian
      c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x, y, 4, 1.5);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, y + 1.5, 4, 1);
    }
    speckle(c, w, h, 600, r, ['#1d2024', '#6c737b'], 0.15, 0.35, 2);
    c.save(); c.beginPath(); c.rect(0, 0, w, 12); c.rect(0, h - 12, w, 12); c.rect(0, 0, 12, h); c.rect(w - 12, 0, 12, h); c.clip();
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.fillStyle = '#16181b';
    for (let i = -h; i < w; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 8, 0); c.lineTo(i + 8 + h, h); c.lineTo(i + h, h); c.fill(); }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.setLineDash([6, 5]);
    c.beginPath(); c.moveTo(64, 14); c.lineTo(64, h - 14); c.moveTo(14, 64); c.lineTo(w - 14, 64); c.stroke();
  });
}

// Tema visual per peta
const THEMES = {
  grass: { stripes: ['#5d9e48', '#559541'], speck: ['#3f7a32', '#6aae52', '#4c8a3a', '#7cbb5c'], blades: ['rgba(52,104,40,.8)', 'rgba(128,190,96,.7)'],
    dirt: '120,96,58', outer: '#4c8a3a', outerSpeck: ['#3e7630', '#5d9c46', '#6aa94f', '#437f34'], outerTint: '#b9c9a5', leaf: [0.27, 0.45, 0.28],
    sky: '#a9cbe0', zone: ['#d9c189', '#cdb178', '#a98f5c'], grain: ['#b39a66', '#ead6a2'] },
  desert: { stripes: ['#d6b677', '#cdab6b'], speck: ['#b8945a', '#e6cc94', '#c9a466', '#a8844e'], blades: ['rgba(140,110,60,.55)', 'rgba(200,175,115,.5)'],
    dirt: '150,100,60', outer: '#c9a86a', outerSpeck: ['#b8945a', '#d8bc84', '#a88450'], outerTint: '#e6d6b6', leaf: [0.16, 0.35, 0.33],
    sky: '#e9d6ae', zone: ['#ecd49e', '#dfc086', '#b48c58'], grain: ['#c4a06a', '#f2e0b0'] },
  snow: { stripes: ['#e9eff5', '#e0e8f0'], speck: ['#c8d4e0', '#ffffff', '#b8c8d8', '#d6e0ea'], blades: ['rgba(150,170,190,.45)', 'rgba(255,255,255,.7)'],
    dirt: '120,130,145', outer: '#dfe7ef', outerSpeck: ['#c8d4e0', '#ffffff', '#b8c8d8'], outerTint: '#ffffff', leaf: [0.4, 0.35, 0.22],
    sky: '#c9d8e6', zone: ['#bcc8d3', '#adbac6', '#8d9aa8'], grain: ['#98a6b4', '#e4ecf2'] },
};
THEMES.river = { ...THEMES.grass, stripes: ['#487e5d','#427557'], sky:'#a8d0d5', outerTint:'#a9cebd' };
THEMES.ruins = { ...THEMES.grass, stripes: ['#777d72','#6c746a'], speck: ['#515952','#9b9f90'], sky:'#c0c6c6', zone:['#c9bda2','#b3a78e','#958b74'], outerTint:'#b3bcb2' };
THEMES.volcano = { ...THEMES.desert, stripes: ['#51484b','#494145'], speck:['#2c292f','#736062','#a06a50'], sky:'#c18c77', zone:['#b99573','#9b7b61','#775d50'], outer:'#4b4142', outerTint:'#9c7c75' };
const theme = () => THEMES[meta.map.theme] || THEMES.grass;

// Tinggi tanah dari bukit (sama dengan rumus server) — dipakai untuk menaruh unit, peti, peluru, label
function hAt(x, y) {
  let h = 0;
  for (const hl of meta.map.hills || []) { const t = Math.hypot(x - hl.x, y - hl.y) / hl.r; if (t < 1) h += hl.h * (0.5 + 0.5 * Math.cos(Math.PI * t)); }
  return h;
}
// Tinggi permukaan mesh tanah: bukit + lubang (dinding curam, dasar gelap)
function groundY(x, y) { return groundHeight(meta.map, x, y); }

// One ground texture with a bounded pixel budget, drawn in world coordinates.
function texGround() {
  const { w, h, tile: T, bases, walls } = meta.map;
  const th = theme();
  return makeTex(w, h, (c) => {
    const r = rng(7);
    // rumput/pasir/salju bergaris
    for (let y = 0; y < h; y += T * 2) {
      c.fillStyle = th.stripes[(y / (T * 2)) % 2];
      c.fillRect(0, y, w, T * 2);
    }
    speckle(c, w, h, 60000, r, th.speck, 0.15, 0.45, 2.5);
    // petak tanah
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rad = 20 + r() * 50;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${th.dirt},.45)`); g.addColorStop(1, `rgba(${th.dirt},0)`);
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // helai rumput
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h;
      c.strokeStyle = r() < 0.5 ? th.blades[0] : th.blades[1]; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1.5 + r() * 3, y - 3 - r() * 4); c.stroke();
    }
    // bukit: bebatuan kecil di lereng
    for (const hl of meta.map.hills || []) {
      for (let i = 0; i < 80; i++) {
        const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * hl.r * 0.9;
        c.globalAlpha = 0.5; c.fillStyle = r() < 0.5 ? 'rgba(90,80,70,.8)' : 'rgba(255,255,255,.35)';
        c.beginPath(); c.ellipse(hl.x + Math.cos(a) * rr, hl.y + Math.sin(a) * rr, 1.5 + r() * 2.5, 1 + r() * 2, r() * 3, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    // lubang: dasar gelap, tepi tanah longsor
    for (const p of meta.map.pits || []) {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r + 12);
      g.addColorStop(0, '#050403'); g.addColorStop(0.7, '#120e0a'); g.addColorStop(0.9, '#3d3024'); g.addColorStop(1, 'rgba(90,70,50,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 60; i++) {
        const a = r() * Math.PI * 2, rr = p.r + 4 + r() * 16;
        c.fillStyle = r() < 0.5 ? '#5a4836' : '#7a6650';
        c.beginPath(); c.ellipse(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 2 + r() * 3, 1.5 + r() * 2, a, 0, 7); c.fill();
      }
    }
    // zona jatuh peti (pasir)
    const R = 9.4 * T, cx = w / 2, cy = h / 2;
    const sg = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    sg.addColorStop(0, th.zone[0]); sg.addColorStop(0.85, th.zone[1]); sg.addColorStop(1, th.zone[2]);
    c.fillStyle = sg; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    for (let i = 0; i < 14000; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * R;
      c.globalAlpha = 0.2 + r() * 0.4;
      c.fillStyle = r() < 0.5 ? th.grain[0] : th.grain[1];
      c.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 120; i++) { // kerikil
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * R, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      c.globalAlpha = 0.9; c.fillStyle = '#8e826d'; c.beginPath(); c.ellipse(x, y, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7); c.fill();
      c.fillStyle = '#c9bea8'; c.beginPath(); c.ellipse(x - 0.8, y - 0.8, 1, 0.8, 0, 0, 7); c.fill();
    }
    c.globalAlpha = 1; c.restore();
    c.setLineDash([14, 10]); c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.45)';
    c.beginPath(); c.arc(cx, cy, R - 6, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    // area markas (beton bertegel)
    for (const b of bases) {
      const minx = Math.min(b.hq.x, b.pad.x - T) - T * 0.8, maxx = Math.max(b.hq.x + b.hq.w, b.pad.x + T) + T * 0.8;
      const miny = Math.min(b.hq.y, b.pad.y - T, b.spawn.y) - T * 0.8, maxy = Math.max(b.hq.y + b.hq.h, b.pad.y + T, b.spawn.y) + T * 0.8;
      c.save();
      c.beginPath(); c.roundRect ? c.roundRect(minx, miny, maxx - minx, maxy - miny, 18) : c.rect(minx, miny, maxx - minx, maxy - miny);
      c.fillStyle = '#9da095'; c.fill(); c.clip();
      for (let y = miny; y < maxy; y += T / 2) for (let x = minx; x < maxx; x += T / 2) {
        c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`; c.fillRect(x, y, T / 2, T / 2);
      }
      c.strokeStyle = 'rgba(60,62,58,.35)'; c.lineWidth = 1.5;
      for (let x = minx; x < maxx; x += T / 2) { c.beginPath(); c.moveTo(x, miny); c.lineTo(x, maxy); c.stroke(); }
      for (let y = miny; y < maxy; y += T / 2) { c.beginPath(); c.moveTo(minx, y); c.lineTo(maxx, y); c.stroke(); }
      speckle(c, maxx, maxy, 4000, r, ['#6e7168', '#c4c7bd'], 0.1, 0.35, 2);
      c.globalAlpha = 0.22; c.fillStyle = meta.colors[b.team]; c.fillRect(minx, miny, maxx - minx, maxy - miny);
      c.globalAlpha = 1;
      c.lineWidth = 8; c.strokeStyle = meta.colors[b.team];
      c.beginPath(); c.roundRect ? c.roundRect(minx, miny, maxx - minx, maxy - miny, 18) : c.rect(minx, miny, maxx - minx, maxy - miny); c.stroke();
      c.restore();
    }
    // bayangan lembut di kaki tembok (ambient occlusion palsu)
    c.fillStyle = 'rgba(0,0,0,.28)';
    if ('filter' in c) c.filter = 'blur(6px)';
    for (const wl of walls) c.fillRect(wl.x - 5, wl.y - 5, wl.w + 10, wl.h + 10);
    for (const b of bases) c.fillRect(b.hq.x - 6, b.hq.y - 6, b.hq.w + 12, b.hq.h + 12);
    c.filter = 'none';
  }, false, 2048);
}

// UV berbasis koordinat dunia supaya tekstur berulang dengan skala tetap di balok ukuran apa pun
function worldUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, z / scale, y / scale);
    else if (ay > 0.5) uv.setXY(i, x / scale, z / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
  return geo;
}
function boxAt(w, h, d, x, y, z, mat, uvScale) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  if (uvScale) worldUV(g, uvScale);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Merge static boxes with matching material. Dispose the temporary geometry immediately.
function mergedBoxes(boxes, material, uvScale = 64) {
  const positions = new Float32Array(boxes.length * 36 * 3), normals = new Float32Array(positions.length), uvs = new Float32Array(boxes.length * 36 * 2);
  boxes.forEach(([w,h,d,x,y,z], i) => {
    const indexed = new THREE.BoxGeometry(w,h,d).translate(x,y,z);
    worldUV(indexed, uvScale); const g = indexed.toNonIndexed(); indexed.dispose();
    positions.set(g.attributes.position.array, i*108); normals.set(g.attributes.normal.array, i*108); uvs.set(g.attributes.uv.array, i*72); g.dispose();
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.BufferAttribute(normals,3)); g.setAttribute('uv',new THREE.BufferAttribute(uvs,2)); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
function addMapTerrain(W) {
  const decks = [], edges = [], surfaces = [], foam = [], hazards = meta.map.hazards || [];
  for (const p of hazards) {
    const lava = p.kind === 'lava', river = p.kind === 'river', y = river ? -18 : -p.depth+4;
    surfaces.push([p.w,1,p.h,p.x+p.w/2,y,p.y+p.h/2]);
    // Static foam/heat lines avoid another water simulation and share one draw call.
    if (river || lava) for (let i=1;i<5;i++) foam.push([p.w*0.8,0.5,2,p.x+p.w/2,y+1,p.y+p.h*i/5]);
    if (p.kind === 'chasm') for (const x of [p.x,p.x+p.w]) edges.push([12,p.depth,p.h,x,-p.depth/2,p.y+p.h/2]);
  }
  if (surfaces.length) {
    const kind=hazards[0].kind, lava=kind==='lava';
    W.root.add(mergedBoxes(surfaces,new THREE.MeshStandardMaterial({color:HAZARD_COLORS[kind],roughness:kind==='river'?0.25:0.95,
      emissive:lava?'#ff4712':'#000000',emissiveIntensity:lava?0.8:0})));
    if (foam.length) W.root.add(mergedBoxes(foam,new THREE.MeshBasicMaterial({color:lava?'#ffc15b':'#82d1dd',transparent:true,opacity:0.4})));
  }
  if (edges.length) W.root.add(mergedBoxes(edges,new THREE.MeshStandardMaterial({color:'#865f46',roughness:1})));
  for (const p of meta.map.bridges || []) {
    const alongX=p.w>p.h, length=alongX?p.w:p.h, count=Math.ceil(length/24);
    for(let i=0;i<count;i++) decks.push(alongX
      ? [length/count-2,8,p.h,p.x+(i+0.5)*length/count,1,p.y+p.h/2]
      : [p.w,8,length/count-2,p.x+p.w/2,1,p.y+(i+0.5)*length/count]);
  }
  if (decks.length) { const deck=mergedBoxes(decks,new THREE.MeshStandardMaterial({color:'#c5a272',roughness:0.85})); deck.name='arena-bridges'; W.root.add(deck); }
}

// ---------------- dunia 3D ----------------
function buildWorld() {
  const { w, h, tile: T, walls, bases } = meta.map;
  const W = {
    geo: {
      crate: new THREE.BoxGeometry(CRATE, meta.map.crateH, CRATE),
      sphere: new THREE.SphereGeometry(1, 16, 10),
      metalBand: new THREE.BoxGeometry(CRATE + 1, 5, CRATE + 1),
      metalCross: new THREE.BoxGeometry(5, meta.map.crateH + 1, CRATE + 1),
      blob: new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      ring: new THREE.RingGeometry(0.82, 1, 48),
      bullet: new THREE.BoxGeometry(1, 1, 1),
      gun: new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0),
      visor: new THREE.BoxGeometry(6, 9, 17),
      antenna: new THREE.CylinderGeometry(0.7, 0.7, 9, 6),
      pickupBox: new THREE.BoxGeometry(16, 12, 16),
      pickupBand: new THREE.BoxGeometry(16.6, 4, 16.6),
      rocket: new THREE.CylinderGeometry(2.2, 2.2, 12, 10).rotateZ(Math.PI / 2),
    },
    mat: {},
    units: new Map(), crates: new Map(), bullets: new Map(), pickups: new Map(), meteors: new Map(), airdrops: new Map(), hq: [],
    root: new THREE.Group(), mapId: meta.map.id,
  };
  W.arenaView = new ArenaEventView(scene, spawnP, () => Q, hAt);
  scene.add(W.root);
  const th = theme();
  SKY.set(th.sky); scene.fog.color.copy(SKY);
  const rockTex = texRock();
  W.mat.monster = new THREE.MeshStandardMaterial({ map: rockTex, emissiveMap: rockTex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.9 });
  W.mat.monEye = new THREE.MeshBasicMaterial({ color: '#ffe14a' });
  W.mat.monEyeRage = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
  W.mat.horn = new THREE.MeshStandardMaterial({ color: '#d9d0bf', roughness: 0.6 });
  W.mat.rock = new THREE.MeshStandardMaterial({ map: rockTex, color: '#a08070', roughness: 1, flatShading: true });
  W.mat.meteor = new THREE.MeshStandardMaterial({ color: '#3a2a22', emissive: '#ff7a1a', emissiveIntensity: 1.2, flatShading: true });
  W.mat.warn = new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  W.geo.rock = new THREE.DodecahedronGeometry(1, 0);
  const crateTex = texCrate();
  W.mat.crate = new THREE.MeshStandardMaterial({ map: crateTex, bumpMap: crateTex, bumpScale: 2, roughness: 0.85 });
  const stone = texStone();
  W.mat.wall = new THREE.MeshStandardMaterial({ map: stone, color: ({desert:'#c8ac8c',snow:'#bbdef1',river:'#a4b8ab',ruins:'#a0a39d',volcano:'#796265'})[meta.map.theme] || '#bac3ae', bumpMap: stone, bumpScale: 2.5, roughness: 0.95 });
  W.mat.suit = texSuit();
  W.mat.dark = new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.7 });
  W.mat.visor = new THREE.MeshStandardMaterial({ color: '#141822', roughness: 0.2, metalness: 0.4 });
  W.mat.white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  W.mat.black = new THREE.MeshBasicMaterial({ color: '#0b0b0b' });
  W.mat.metal = new THREE.MeshStandardMaterial({ color: '#5a616b', roughness: 0.45, metalness: 0.6 });
  W.mat.neutralPaint = new THREE.MeshStandardMaterial({ color: '#8b929b', metalness: 0.6, roughness: 0.5 });
  W.mat.metalCrate = new THREE.MeshStandardMaterial({ color: '#a8b3c1', metalness: 0.8, roughness: 0.35 });
  W.mat.metalLight = new THREE.MeshStandardMaterial({ color: '#7d8590', roughness: 0.4, metalness: 0.6 });
  W.mat.gunBody = new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 0.5, metalness: 0.5 });
  W.mat.guns = WCOL.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3 }));
  W.mat.pickupBody = new THREE.MeshStandardMaterial({ color: '#20242a', roughness: 0.4, metalness: 0.4 });
  W.mat.pickupBands = WCOL.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }));
  W.mat.pickupGlows = WCOL.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  W.mat.shield = new THREE.MeshBasicMaterial({ color: '#bef0ff', transparent: true, opacity: 0.25, depthWrite: false });
  W.mat.bullet = new THREE.MeshBasicMaterial({ color: '#ffe68c' });
  W.mat.blob = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false });
  W.mat.blob.visible = Q.shadows === 0;
  W.mat.rocket = new THREE.MeshStandardMaterial({ color: '#556b2f', emissive: '#ff7a1a', emissiveIntensity: 0.6 });
  W.mat.flame = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.55, depthWrite: false });
  W.mat.grenade = new THREE.MeshStandardMaterial({ color: '#4b5320', roughness: 0.6, metalness: 0.3 });
  W.mat.laser = new THREE.MeshBasicMaterial({ color: '#ff5fb0' });
  W.mat.gold = new THREE.MeshStandardMaterial({ color: '#ffd54f', emissive: '#a06a00', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 });
  W.mat.team = meta.colors.map(c => new THREE.MeshStandardMaterial({ map: W.mat.suit, color: c, roughness: 0.6 }));
  W.mat.teamFlat = meta.colors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  // kendaraan: pelat logam bercat warna tim (dicampur hijau militer), rantai bergerak, kaca gelap
  const panel = texPanel();
  W.mat.vehPaint = meta.colors.map(c => new THREE.MeshStandardMaterial({
    map: panel, bumpMap: panel, bumpScale: 1, color: new THREE.Color(c).lerp(new THREE.Color('#7a8456'), 0.35), roughness: 0.55, metalness: 0.35,
  }));
  W.mat.treadTex = texTread();
  W.mat.tread = new THREE.MeshStandardMaterial({ map: W.mat.treadTex, roughness: 0.9 });
  W.mat.glass = new THREE.MeshStandardMaterial({ color: '#2a3a48', roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.75 });
  W.mat.wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2);

  // tanah
  const outerTex = texGrassTile(); outerTex.repeat.set(40, 40);
  // tanah luar arena = bingkai di sekeliling peta (tidak menutupi lubang yang lebih rendah dari 0)
  const outerMat = new THREE.MeshStandardMaterial({ map: outerTex, color: th.outerTint, roughness: 1 });
  const outer = new THREE.Group(), E = 4000;
  for (const [x0, z0, x1, z1] of [[-E, -E, w + E, 0], [-E, h, w + E, h + E], [-E, 0, 0, h], [w, 0, w + E, h]]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), outerMat);
    pl.position.set((x0 + x1) / 2, -0.5, (z0 + z1) / 2); pl.receiveShadow = true;
    outer.add(pl);
  }
  // tanah peta = bidang bergrid yang dinaikkan (bukit) / diturunkan (lubang)
  const gg = new THREE.PlaneGeometry(w, h, Math.round(w / 24), Math.round(h / 24)).rotateX(-Math.PI / 2).translate(w / 2, 0, h / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, groundY(gp.getX(i), gp.getZ(i)));
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: texGround(), roughness: 1 }));
  ground.receiveShadow = true; ground.castShadow = (meta.map.hills || []).length > 0;
  W.root.add(outer, ground);

  // tembok
  // One static wall mesh preserves world-space UVs while reducing dozens of draw calls.
  const wallMesh = mergedBoxes(walls.map(p => [p.w,WALL_H,p.h,p.x+p.w/2,WALL_H/2,p.y+p.h/2]), W.mat.wall, 64);
  wallMesh.name = 'arena-walls'; W.root.add(wallMesh);
  addMapTerrain(W);

  // markas + pad
  const brick = texBrick();
  const roofMat = new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.8 });
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffcf5a', emissiveIntensity: 0.7 });
  const ruinMat = new THREE.MeshStandardMaterial({ map: brick, color: '#4a4a4a', roughness: 1 });
  for (const b of bases) {
    const r = b.hq, cx = r.x + r.w / 2, cz = r.y + r.h / 2, col = meta.colors[b.team];
    const tint = new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.35);
    const intact = new THREE.Group(), ruin = new THREE.Group();
    intact.add(boxAt(r.w, HQ_H, r.h, cx, HQ_H / 2, cz, new THREE.MeshStandardMaterial({ map: brick, bumpMap: brick, bumpScale: 1.5, color: tint, roughness: 0.9 }), 64));
    intact.add(boxAt(r.w + 10, 7, r.h + 10, cx, HQ_H + 3.5, cz, roofMat));
    intact.add(boxAt(r.w + 2, 9, r.h + 2, cx, HQ_H - 12, cz, W.mat.teamFlat[b.team]));
    intact.add(boxAt(28, 36, 4, cx, 18, r.y + r.h + 1, W.mat.visor));
    for (const s of [-1, 1]) {
      intact.add(boxAt(18, 13, 3, cx + s * (r.w / 2 - 22), HQ_H - 30, r.y + r.h + 0.5, winMat));
      intact.add(boxAt(3, 13, 18, cx + s * (r.w / 2 + 0.5), HQ_H - 30, cz, winMat));
      intact.add(boxAt(18, 13, 3, cx + s * (r.w / 2 - 22), HQ_H - 30, r.y - 0.5, winMat));
    }
    intact.add(boxAt(2.5, 56, 2.5, cx, HQ_H + 28, cz, W.mat.metalLight));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(34, 20, 8, 1).translate(17, 0, 0), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(cx + 1.5, HQ_H + 46, cz); flag.castShadow = true;
    intact.add(flag);
    const rr = rng(31 + b.team);
    for (let i = 0; i < 14; i++) {
      const s = 14 + rr() * 26;
      const m = boxAt(s, s * 0.6, s, 0, 0, 0, ruinMat);
      m.position.set(r.x + 12 + rr() * (r.w - 24), s * 0.25, r.y + 12 + rr() * (r.h - 24));
      m.rotation.set(rr() * 0.6, rr() * 3, rr() * 0.6);
      ruin.add(m);
    }
    ruin.visible = false;
    W.root.add(intact, ruin);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2 * T + 6, 3, 2 * T + 6), [W.mat.metal, W.mat.metal, new THREE.MeshStandardMaterial({ map: texPad(col), roughness: 0.6, metalness: 0.3 }), W.mat.metal, W.mat.metal, W.mat.metal]);
    pad.position.set(b.pad.x, 1.5, b.pad.y); pad.receiveShadow = true;
    W.root.add(pad);
    W.hq.push({ intact, ruin, flag, smokeT: 0 });
  }
  // bayangan peti transparan: petak pad yang akan diisi saat menekan E
  W.ghost = new THREE.Mesh(W.geo.crate, new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.4, depthWrite: false }));
  W.ghost.scale.setScalar(1.08); W.ghost.visible = false;
  W.root.add(W.ghost);

  // pepohonan di luar arena
  const trunkG = new THREE.CylinderGeometry(4, 6, 30, 7).translate(0, 15, 0);
  const leafG = new THREE.IcosahedronGeometry(28, 0).scale(1, 1.25, 1).translate(0, 52, 0);
  const trees = [];
  const tr = rng(99);
  while (trees.length < 140) {
    const x = -700 + tr() * (w + 1400), z = -600 + tr() * (h + 1200);
    if (x > -50 && x < w + 50 && z > -50 && z < h + 50) continue;
    trees.push([x, z, 0.7 + tr() * 0.8, tr() * 6]);
  }
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 }), trees.length);
  const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshStandardMaterial({ color: '#3f7f35', roughness: 0.9, flatShading: true }), trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  trees.forEach(([x, z, s, rot], i) => {
    m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
    leaves.setColorAt(i, _col.setHSL(th.leaf[0] + tr() * 0.06, th.leaf[1], th.leaf[2] + tr() * 0.1));
  });
  trunks.castShadow = leaves.castShadow = true;
  W.root.add(trunks, leaves);
  return W;
}
// buang dunia lama (saat ganti peta) termasuk geometri/tekstur GPU-nya
function disposeWorld() {
  if (!world) return;
  world.arenaView.dispose();
  const geometries = new Set(Object.values(world.geo)), materials = new Set(), textures = new Set();
  for (const asset of Object.values(world.mat).flat()) {
    if (asset.isMaterial) materials.add(asset);
    if (asset.isTexture) textures.add(asset);
  }
  const release = root => {
    root.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [].concat(o.material || [])) materials.add(m);
    });
    scene.remove(root);
  };
  for (const pool of [world.units, world.crates, world.bullets, world.pickups, world.meteors, world.airdrops]) for (const o of pool.values()) release(o);
  for (const B of booms) { release(B.ball); release(B.ring); }
  release(world.root);
  for (const m of materials) { for (const k of ['map', 'bumpMap', 'emissiveMap']) if (m[k]) textures.add(m[k]); m.dispose(); }
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
  booms.length = 0; particles.length = 0;
  world = null;
}

// ---------------- model unit ----------------
function blob(r) {
  const m = new THREE.Mesh(world.geo.blob, world.mat.blob);
  m.scale.setScalar(r); m.position.y = 0.8; m.renderOrder = 1;
  return m;
}
function makeGun() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(world.geo.gun, world.mat.gunBody);
  const stripe = new THREE.Mesh(world.geo.gun, world.mat.guns[0]);
  body.castShadow = stripe.castShadow = true;
  g.add(body, stripe);
  g.userData = { body, stripe, w: -1 };
  return g;
}
function setGun(g, w) {
  if (g.userData.w === w) return;
  g.userData.w = w;
  const len = GUN_LEN[w] || 18, th = GUN_TH[w] || 4.5;
  g.userData.body.scale.set(len, th, th);
  g.userData.stripe.scale.set(len * 0.6, th + 0.6, th * 0.5);
  g.userData.stripe.position.set(len * 0.25, 0.4, 0);
  g.userData.stripe.material = world.mat.guns[w];
}
function makeBuddy(u) {
  const M = world.mat, root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig);
  const body = new THREE.Mesh(world.geo.sphere, M.team[u.team]);
  body.scale.set(12, 14, 12); body.position.y = 18; body.castShadow = true;
  // kepala & badan satu bulatan (ala Buddy); tekstur gesper menghadap +X
  body.rotation.y = -Math.PI / 2;
  const visor = new THREE.Mesh(world.geo.visor, M.visor);
  visor.position.set(9.5, 22, 0);
  const eyes = [-4, 4].map(z => {
    const e = new THREE.Mesh(world.geo.sphere, M.white); e.scale.setScalar(2.4); e.position.set(12.6, 22.5, z);
    const p = new THREE.Mesh(world.geo.sphere, M.black); p.scale.setScalar(1.2); p.position.set(14.4, 22.5, z);
    return [e, p];
  }).flat();
  const feet = [-6, 6].map(z => {
    const f = new THREE.Mesh(world.geo.sphere, M.dark); f.scale.set(6.5, 3.6, 5); f.position.set(0, 3, z); f.castShadow = true;
    return f;
  });
  const gun = makeGun(); gun.position.set(2, 13, 10);
  rig.add(body, visor, ...eyes, ...feet, gun);
  if (u.kind === 1) {
    const ant = new THREE.Mesh(world.geo.antenna, M.metalLight); ant.position.set(-2, 35, 0);
    const tip = new THREE.Mesh(world.geo.sphere, u.elite ? M.gold : M.teamFlat[u.team]); tip.scale.setScalar(u.elite ? 3.4 : 2.6); tip.position.set(-2, 40, 0);
    rig.add(ant, tip);
    if (u.elite) { // Buddy Elit: helm emas
      const helm = new THREE.Mesh(world.geo.sphere, M.gold); helm.scale.set(12.6, 6, 12.6); helm.position.y = 28; helm.castShadow = true;
      rig.add(helm);
    }
  }
  const shield = new THREE.Mesh(world.geo.sphere, M.shield);
  shield.scale.set(22, 24, 22); shield.position.y = 17;
  root.add(shield, blob(11));
  root.scale.setScalar(u.elite ? 1.45 : 1.25); // sedikit lebih besar dari radius tabrakan supaya terbaca jelas
  root.userData = { rig, feet, gun, shield };
  return root;
}
function makeTurret(u) {
  const M = world.mat, root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(15, 18, 10, 16), M.metal); base.position.y = 5;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 15.5, 4, 16), M.teamFlat[u.team]); ring.position.y = 10;
  const head = new THREE.Group(); head.position.y = 18;
  const hb = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 18), M.metalLight);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 18.5), M.teamFlat[u.team]); plate.position.y = 4;
  const barrels = [-4, 4].map(z => { const b = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 22, 8).rotateZ(Math.PI / 2), M.gunBody); b.position.set(18, 0, z); return b; });
  head.add(hb, plate, ...barrels);
  root.add(base, ring, head);
  root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  root.add(blob(20));
  root.userData = { head };
  return root;
}

// Kendaraan: badan (hull) berputar ke arah gerak, kepala/senjata (head) ke arah bidikan
function makeVehicle(u) {
  const M = world.mat, root = new THREE.Group(), hull = new THREE.Group(), head = new THREE.Group();
  const paint = u.team < 0 ? M.neutralPaint : M.vehPaint[u.team];
  const d = { hull, head, wheels: [], treads: null, spin: 0 };
  if (u.kind === K_TANK) {
    const t1 = M.tread.clone(), t2 = M.tread.clone(); // tiap rantai punya offset UV sendiri
    t1.map = M.treadTex.clone(); t2.map = M.treadTex.clone();
    t1.map.needsUpdate = t2.map.needsUpdate = true;
    hull.add(boxAt(46, 11, 30, 0, 11, 0, paint));
    hull.add(boxAt(10, 4, 26, 20, 14.5, 0, paint)); // pelat depan
    for (const [z, m] of [[-15.5, t1], [15.5, t2]]) {
      hull.add(boxAt(50, 12, 8, 0, 7, z, m));
      for (let i = -2; i <= 2; i++) { // roda dalam rantai
        const w = new THREE.Mesh(M.wheelGeo, M.dark); w.scale.set(4.4, 4.4, 8.4); w.position.set(i * 9.5, 5, z); hull.add(w); d.wheels.push(w);
      }
    }
    d.treads = [t1.map, t2.map];
    head.position.y = 21;
    head.add(boxAt(24, 9, 20, -2, 0, 0, paint));
    head.add(boxAt(10, 3, 8, -6, 6, 0, M.dark)); // palka
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 30, 10).rotateZ(Math.PI / 2), M.gunBody);
    barrel.position.set(24, 1, 0); barrel.castShadow = true;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5, 10).rotateZ(Math.PI / 2), M.gunBody);
    muzzle.position.set(38, 1, 0);
    head.add(barrel, muzzle);
    root.add(blob(28));
  } else {
    hull.add(boxAt(38, 8, 22, 0, 11, 0, paint));
    hull.add(boxAt(13, 5, 21, 13, 17, 0, paint));                 // kap mesin
    hull.add(boxAt(2, 8, 20, 6, 21, 0, M.glass));                  // kaca depan
    hull.add(boxAt(2, 12, 2, -12, 21, -10, M.metalLight), boxAt(2, 12, 2, -12, 21, 10, M.metalLight), boxAt(2, 2, 22, -12, 27, 0, M.metalLight));
    hull.add(boxAt(6, 4, 22, 20, 9, 0, M.dark));                   // bemper
    for (const [x, z] of [[12, -12], [12, 12], [-12, -12], [-12, 12]]) {
      const w = new THREE.Mesh(M.wheelGeo, M.dark); w.scale.set(6.5, 6.5, 6); w.position.set(x, 6.5, z); w.castShadow = true;
      hull.add(w); d.wheels.push(w);
    }
    head.position.set(-3, 22, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 8, 8), M.metalLight); post.position.y = -2;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(22, 3.5, 3.5).translate(9, 0, 0), M.gunBody); gun.position.y = 3; gun.castShadow = true;
    const box = boxAt(6, 5, 5, 0, 3, 0, M.metal);
    head.add(post, gun, box);
    root.add(blob(24));
  }
  // kepala ikut sumbu tengah root (tidak ikut berputar dengan badan)
  root.add(hull, head);
  root.userData = d;
  return root;
}

// Monster: golem batu raksasa bermata menyala; lengan diangkat saat ancang-ancang menghantam / melempar batu
function makeMonster() {
  const M = world.mat, root = new THREE.Group(), rig = new THREE.Group();
  const sph = (mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(world.geo.sphere, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; return m; };
  rig.add(sph(M.monster, 26, 28, 25, 0, 38, 0));          // badan
  rig.add(sph(M.monster, 14, 13, 14, 15, 62, 0));         // kepala
  const eyes = [-5.5, 5.5].map(z => sph(M.monEye, 3.2, 3.2, 3.2, 27, 65, z));
  rig.add(...eyes);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 8), M.horn);
    horn.position.set(12, 76, s * 9); horn.rotation.set(s * -0.5, 0, -0.3); horn.castShadow = true;
    rig.add(horn);
  }
  const arms = [-1, 1].map(s => {
    const arm = new THREE.Group(); arm.position.set(4, 52, s * 29);
    arm.add(sph(M.monster, 9, 16, 9, 0, -12, 0), sph(M.monster, 12, 11, 12, 0, -32, 0));
    rig.add(arm); return arm;
  });
  const legs = [-1, 1].map(s => {
    const leg = new THREE.Group(); leg.position.set(0, 20, s * 13);
    leg.add(sph(M.monster, 10, 13, 10, 0, -10, 0));
    rig.add(leg); return leg;
  });
  root.add(rig, blob(40));
  root.scale.setScalar(1.1);
  root.userData = { rig, arms, legs, eyes, walk: 0 };
  return root;
}
function animMonster(d, u, a, dt) {
  d.rig.rotation.y = -a;
  if (u.moving) d.walk += dt * 6;
  const sw = u.moving ? Math.sin(d.walk) : 0;
  d.legs[0].rotation.z = sw * 0.45; d.legs[1].rotation.z = -sw * 0.45;
  d.rig.position.y = u.moving ? Math.abs(sw) * 3 : Math.sin(time * 2) * 1;
  // anim 1 = angkat dua lengan (hantaman), 2 = lengan kanan (lempar batu); lepas = ayunan cepat ke bawah
  const tgt = [u.anim === 1 || u.anim === 2 ? 2.7 : 0.25 + sw * 0.3, u.anim === 1 ? 2.7 : 0.25 - sw * 0.3];
  d.arms.forEach((arm, i) => { arm.rotation.z += (tgt[i] - arm.rotation.z) * Math.min(1, dt * (u.anim ? 6 : 14)); });
  for (const e of d.eyes) e.material = u.rage ? world.mat.monEyeRage : world.mat.monEye;
  if (u.rage && Math.random() < 0.3 * Q.particles) spawnP(u.x, u.y, 80, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 40, 0.8, 5, '#ff6a3a');
}

// sinkronkan Map id → mesh dengan daftar dari snapshot
function sync(pool, list, keyOf, make, update) {
  const seen = new Set();
  for (const it of list) {
    const k = keyOf(it);
    seen.add(k);
    let o = pool.get(k);
    if (!o) { o = make(it); pool.set(k, o); scene.add(o); }
    update(o, it);
  }
  for (const [k, o] of pool) if (!seen.has(k)) {
    scene.remove(o);
    disposeEncounter(o);
    pool.delete(k);
  }
}

function updateWorld(S, me, dt) {
  const W = world;
  W.arenaView.update(latest.A, Math.max(0, (performance.now() - latest.rt) / 1000), time, dt, meta.map);
  // markas
  meta.map.bases.forEach((b, t) => {
    const H = W.hq[t], alive = latest.al[t];
    H.intact.visible = alive; H.ruin.visible = !alive;
    if (alive) {
      const p = H.flag.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(time * 6 + p.getX(i) * 0.25) * p.getX(i) * 0.12);
      p.needsUpdate = true;
    } else if ((H.smokeT -= dt) < 0) {
      H.smokeT = 0.08 / Q.particles;
      spawnP(b.hq.x + Math.random() * b.hq.w, b.hq.y + Math.random() * b.hq.h, 20, 0, 0, 40 + Math.random() * 30, 2.2, 8 + Math.random() * 8, Math.random() < 0.3 ? '#4a4440' : '#2d2a28');
    }
  });
  // unit
  sync(W.units, S.units, u => [u.id, u.kind, u.team, u.lord || 0].join(':'),
    u => (u.kind === K_UFO ? makeUfo() : u.kind === K_CHICKEN ? makeChicken() : u.kind === K_LORD || u.lord ? makeLord(u, u.kind === K_LORD ? '#37d9ed' : tcol(u.team)) : u.kind === 2 ? makeTurret(u) : u.kind === K_MON ? makeMonster() : isVeh(u) ? makeVehicle(u) : makeBuddy(u)), (o, u) => {
    const a = me && u.id === me.id ? aim : u.a;
    o.position.set(u.x, hAt(u.x, u.y) + u.lift, u.y);
    if (u.kind === K_UFO || u.kind === K_CHICKEN || u.kind === K_LORD || u.lord) { animateEncounter(o, u, a, time, dt); return; }
    if (u.kind === 2) { o.userData.head.rotation.y = -a; return; }
    if (u.kind === K_MON) { animMonster(o.userData, u, a, dt); return; }
    if (isVeh(u)) {
      const d = o.userData;
      d.hull.rotation.y = -u.hull;
      d.head.rotation.y = -a;
      d.hull.position.y = u.moving ? Math.sin(time * 30 + u.id) * 0.4 : 0; // getaran mesin
      if (u.moving) { d.spin += dt * (u.kind === K_JEEP ? 18 : 8); for (const w of d.wheels) w.rotation.z = -d.spin; }
      if (d.treads) for (const t of d.treads) t.offset.x = -d.spin * 0.05;
      return;
    }
    const d = o.userData, ph = time * 13 + u.id;
    d.rig.rotation.y = -a;
    d.rig.position.y = u.moving ? Math.abs(Math.sin(ph)) * 2.5 : 0;
    d.rig.rotation.z = u.moving ? -0.08 : 0;
    const st = u.moving ? Math.sin(ph) * 5 : 0;
    d.feet[0].position.x = st; d.feet[1].position.x = -st;
    setGun(d.gun, u.w);
    d.gun.visible = !u.carry;
    d.shield.visible = !!u.shield;
    if (u.shield) W.mat.shield.opacity = 0.2 + Math.sin(time * 20) * 0.1;
  });
  // peti
  sync(W.crates, S.crates, c => c.id + (c.metal ? ":metal" : ":wood"), c => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(W.geo.crate, c.metal ? W.mat.metalCrate : W.mat.crate); m.castShadow = m.receiveShadow = true;
    const s = blob(20);
    if (c.metal) {
      const band = new THREE.Mesh(W.geo.metalBand, W.mat.metal); m.add(band);
      const cross = new THREE.Mesh(W.geo.metalCross, W.mat.metal); m.add(cross);
    }
    g.add(m, s); g.userData = { m, s };
    return g;
  }, (g, c) => {
    const { m, s } = g.userData;
    g.position.set(c.x, hAt(c.x, c.y), c.y);
    m.position.y = c.z + meta.map.crateH / 2;
    s.visible = !c.pad || c.z < 1; // peti tingkat 2 di pad tidak butuh bayangan sendiri
    s.scale.setScalar(20 * (1 - Math.min(c.z, 560) / 900));
    const fall = !c.pad && c.z > 60;
    m.rotation.set(fall ? Math.sin(c.id) * 0.3 : 0, fall ? c.z * 0.01 + c.id : 0, fall ? Math.cos(c.id) * 0.3 : 0);
  });
  sync(W.airdrops, latest.D || [], d => d[0], makeAirdrop, (o, d) => animateAirdrop(o, d, hAt, meta.colors, time));
  // senjata tergeletak
  sync(W.pickups, S.pickups, p => p[0], p => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(W.geo.pickupBox, W.mat.pickupBody);
    const band = new THREE.Mesh(W.geo.pickupBand, W.mat.pickupBands[p[3]]);
    box.castShadow = true;
    const glow = new THREE.Mesh(W.geo.ring, W.mat.pickupGlows[p[3]]);
    glow.rotation.x = -Math.PI / 2; glow.scale.setScalar(14); glow.position.y = 1;
    const spin = new THREE.Group(); spin.add(box, band);
    g.add(spin, glow); g.userData = { spin };
    return g;
  }, (g, p) => {
    g.position.set(p[1], hAt(p[1], p[2]), p[2]);
    g.userData.spin.position.y = 18 + Math.sin(time * 4 + p[0]) * 3;
    g.userData.spin.rotation.y = time * 1.8;
  });
  // peluru
  sync(W.bullets, S.bullets, b => b.id + ':' + b.rocket, b => {
    // rocket = jenis: 0 peluru, 1 roket/meriam, 2 batu lemparan monster, 3 api, 4 granat, 5 laser
    const ty = b.rocket;
    const m = ty === 2 ? new THREE.Mesh(W.geo.rock, W.mat.rock)
      : ty === 3 ? new THREE.Mesh(W.geo.sphere, W.mat.flame)
      : ty === 4 ? new THREE.Mesh(W.geo.sphere, W.mat.grenade)
      : ty === 5 ? new THREE.Mesh(W.geo.bullet, W.mat.laser)
      : new THREE.Mesh(ty ? W.geo.rocket : W.geo.bullet, ty ? W.mat.rocket : W.mat.bullet);
    if (ty === 2) m.scale.setScalar(9);
    if (ty === 4) m.scale.setScalar(4);
    if (ty === 1 || ty === 2 || ty === 4) m.castShadow = true;
    m.userData.t0 = time;
    return m;
  }, (m, b) => {
    const dx = b.x - b.px, dy = b.y - b.py, gh = hAt(b.x, b.y) + GUN_H, age = time - m.userData.t0;
    if (b.rocket === 3) { // semburan api: membesar & memudar, meninggalkan bara
      m.position.set(b.x, gh, b.y);
      m.scale.setScalar(3 + Math.min(1, age / 0.45) * 10);
      if (Math.random() < 0.5 * Q.particles) spawnP(b.x, b.y, GUN_H, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 30, 0.35, 3 + Math.random() * 3, Math.random() < 0.5 ? '#ffb347' : '#ff5a1f');
      return;
    }
    if (b.rocket === 4) { // granat: melambung (lengkung visual saja, server tetap 2D)
      m.position.set(b.x, gh + Math.sin(Math.min(1, age / 0.9) * Math.PI) * 45, b.y);
      m.rotation.set(time * 9, time * 6, 0);
      return;
    }
    if (b.rocket === 5) {
      const l = Math.hypot(dx, dy) || 1, len = Math.max(20, Math.min(60, l));
      m.rotation.y = -Math.atan2(dy, dx);
      m.scale.set(len, 2.6, 2.6);
      m.position.set(b.x - dx / l * len / 2, gh, b.y - dy / l * len / 2);
      return;
    }
    if (b.rocket === 2) {
      m.position.set(b.x, gh + 26, b.y);
      m.rotation.set(time * 7, time * 5, 0);
      if (Math.random() < 0.4 * Q.particles) spawnP(b.x, b.y, GUN_H + 26, 0, 0, 5, 0.5, 4, '#6a5a50');
      return;
    }
    m.rotation.y = -Math.atan2(dy, dx);
    if (b.rocket) {
      m.position.set(b.x, gh, b.y);
      if (Math.random() < 0.7 * Q.particles) spawnP(b.x, b.y, GUN_H, 0, 0, 12, 0.6, 3 + Math.random() * 2, Math.random() < 0.5 ? '#9a9590' : '#ffb347');
    } else {
      const l = Math.hypot(dx, dy) || 1, len = Math.max(6, Math.min(30, l));
      m.scale.set(len, 1.8, 1.8);
      m.position.set(b.x - dx / l * len / 2, gh, b.y - dy / l * len / 2);
    }
  });
  // meteor: lingkaran peringatan di tanah + batu membara yang turun miring dari langit
  const since = (performance.now() - latest.rt) / 1000;
  sync(W.meteors, latest.M || [], m => m[0], m => {
    const g = new THREE.Group();
    const warn = new THREE.Mesh(W.geo.ring, W.mat.warn.clone());
    warn.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(W.geo.blob, W.mat.warn.clone());
    fill.material.opacity = 0.15;
    const rock = new THREE.Mesh(W.geo.rock, W.mat.meteor);
    rock.scale.setScalar(16);
    g.add(warn, fill, rock);
    g.userData = { warn, fill, rock };
    return g;
  }, (g, m) => {
    const { warn, fill, rock } = g.userData, tt = Math.max(0, m[3] - since), gy = hAt(m[1], m[2]);
    g.position.set(m[1], 0, m[2]);
    warn.position.y = gy + 2; fill.position.y = gy + 1.5;
    warn.scale.setScalar(m[4] * (1 + Math.sin(time * (8 + 12 / (tt + 0.3))) * 0.05));
    fill.scale.setScalar(m[4] * (1 - Math.min(1, tt / 2.5)));
    warn.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(time * 10));
    rock.visible = tt < 2.2;
    rock.position.set(-tt * 180, gy + 30 + tt * 560, -tt * 100);
    rock.rotation.set(time * 3, time * 4, 0);
    if (rock.visible && Math.random() < 0.8 * Q.particles) spawnP(m[1] - tt * 180, m[2] - tt * 100, 30 + tt * 560, 0, 0, 20, 0.6, 7 + Math.random() * 5, Math.random() < 0.5 ? '#ff9a3c' : '#5b5550');
  });
  // ledakan
  for (let i = booms.length - 1; i >= 0; i--) {
    const B = booms[i];
    B.life -= dt;
    if (B.life <= 0) { scene.remove(B.ball, B.ring); B.ball.material.dispose(); B.ring.material.dispose(); booms.splice(i, 1); continue; }
    const k = B.life / B.max;
    B.ball.scale.setScalar(B.r * (0.25 + 0.55 * (1 - k)));
    B.ball.material.opacity = k;
    B.ball.material.color.setHSL(0.08 + 0.05 * k, 1, 0.45 + 0.25 * k);
    B.ring.scale.setScalar(B.r * (1.15 - k));
    B.ring.material.opacity = k;
  }
  flash.intensity *= Math.pow(0.002, dt);
  // partikel
  let n = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vh -= p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt;
    if (p.h < p.floor + 0.5) { p.h = p.floor + 0.5; p.vh = 0; }
    p.vx *= 0.92; p.vy *= 0.92;
    const k = p.life / p.max;
    m4p.makeScale(p.r * (0.4 + k * 0.6), p.r * (0.4 + k * 0.6), p.r * (0.4 + k * 0.6)).setPosition(p.x, p.h, p.y);
    pMesh.setMatrixAt(n, m4p);
    pMesh.setColorAt(n, p.c);
    n++;
  }
  pMesh.count = n;
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}
const m4p = new THREE.Matrix4();

// ---------------- gambar HUD: helper ----------------
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function hpBar(x, y, w, frac, col) {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = frac > 0.5 ? '#6bdc6b' : frac > 0.25 ? '#f6c453' : '#ff5a5a';
  if (col) ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 4);
}
const _v = new THREE.Vector3();
function toScreen(x, h, y) {
  _v.set(x, h, y).project(camera);
  if (_v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) return null;
  return { x: (_v.x + 1) / 2 * IW, y: (1 - _v.y) / 2 * IH };
}

// ---------------- frame ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  if (document.hidden || ((!joined || inRoom() || patchNotesOpen()) && now - lastT < 1000 / 30)) return;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now; time += dt;
  fpsN++; fpsT += (now - fpsLast) / 1000; fpsLast = now;
  if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, hud.width, hud.height);
  if (!meta || !latest || !world) { renderer.render(scene, camera); return; }

  const S = sampleState();
  const map = meta.map;
  // unit yang dikendalikan: badan pemain, atau kendaraan yang sedang dikemudikan
  const me = S.units.find(u => u.owner === myId && (u.kind === 0 || isVeh(u))) || null;
  lastMe = me;
  const names = new Map(latest.PL.map(p => [p[0], p[1]]));

  // kamera: mengikuti pemain, sedikit condong ke arah bidikan (mouse atau stik)
  let tx = map.w / 2, ty = map.h / 2;
  const lead = 1000 / Math.max(1, IW);
  if (me && aimMode === 'stick') {
    tx = me.x + Math.cos(aim) * 50; ty = me.y + Math.sin(aim) * 45;
  } else if (me) {
    tx = me.x + clamp((mouse.x - IW / 2) * lead, -300, 300) * 0.18;
    ty = me.y + clamp((mouse.y - IH / 2) * lead, -300, 300) * 0.22;
  } else if (myTeam >= 0) {
    const b = map.bases[myTeam]; tx = b.spawn.x; ty = b.spawn.y;
  }
  cam.x += (tx - cam.x) * Math.min(1, dt * 8);
  cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  shake *= Math.pow(0.02, dt);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  const D = camDist();
  camera.position.set(cam.x + sx, Math.sin(PITCH) * D, cam.y + sy + Math.cos(PITCH) * D);
  camera.lookAt(cam.x + sx, 0, cam.y + sy);
  camera.updateMatrixWorld();
  sun.position.set(cam.x + SUN_DIR.x * 1000, SUN_DIR.y * 1000, cam.y + SUN_DIR.z * 1000);
  sun.target.position.set(cam.x, 0, cam.y);

  // bidikan mouse: sinar dari kursor ke bidang setinggi senjata (stik sentuh / gamepad mengatur `aim` langsung)
  if (me && aimMode === 'mouse') {
    ndc.set(mouse.x / IW * 2 - 1, -(mouse.y / IH) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y < -1e-3) {
      const t = (GUN_H - o.y) / d.y;
      aim = Math.atan2(o.z + d.z * t - me.y, o.x + d.x * t - me.x);
      const tp = (3 - o.y) / d.y; // titik di permukaan pad, untuk memilih petak
      cursor = { x: o.x + d.x * tp, y: o.z + d.z * tp };
    }
  }

  updateWorld(S, me, dt);
  // bayangan peti di petak pad yang akan diisi
  const pt = me && me.carry ? padTarget(me) : null;
  world.ghost.visible = !!(pt && pt.slot >= 0);
  if (world.ghost.visible) {
    const s = slotPos(pt.slot);
    world.ghost.position.set(s.x, s.z + map.crateH / 2 + 3.5, s.y);
    world.ghost.material.opacity = 0.3 + 0.15 * Math.sin(time * 8);
  }
  renderer.render(scene, camera);

  // label dunia (diproyeksikan ke layar)
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  map.bases.forEach((b, t) => {
    const p = toScreen(b.pad.x, 0, b.pad.y + map.tile + 14);
    if (p) {
      // pad sendiri menampilkan target rakitan dari perintah tim
      const want = t === myTeam && latest.or ? latest.or[t][3] : 0, pr = t === myTeam && latest.pr ? latest.pr[t] : '';
      const s = pr ? `${latest.pad[t]} → ${pr}` : want ? `${latest.pad[t]}/${want} → ${PLAN_NAME[latest.or[t][0]]}` : latest.pad[t] + '/8';
      ctx.font = '800 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(s, p.x + 1, p.y + 1);
      ctx.fillStyle = '#fff'; ctx.fillText(s, p.x, p.y);
    }
    const q = latest.al[t] && toScreen(b.hq.x + b.hq.w / 2, HQ_H + 70, b.hq.y + b.hq.h / 2);
    if (q) hpBar(q.x, q.y, 90, latest.hq[t] / (meta.hqMax || 3200));
  });
  for (const u of S.units) {
    const isMe = me && u.id === me.id;
    const mon = u.kind === K_MON, lord = u.kind === K_LORD || u.lord;
    const p = toScreen(u.x, hAt(u.x, u.y) + u.lift + (u.kind === K_UFO ? 250 : lord ? (u.kind === K_LORD ? 170 : 115) : mon ? 100 : u.kind === 2 ? 36 : isVeh(u) ? 44 : u.carry ? 82 : 56), u.y);
    if (!p) continue;
    if (lord || u.kind === K_UFO) hpBar(p.x, p.y + 6, 85, u.hp / u.max, lord ? '#58e5ff' : '#a7ff69');
    else if (mon) hpBar(p.x, p.y + 6, 80, u.hp / u.max, u.rage ? '#ff5a3a' : MON_COL);
    else if (u.hp < u.max) hpBar(p.x, p.y + 6, 30, u.hp / u.max);
    const name = u.kind === K_UFO ? 'UFO · TEMBAK UNTUK MENOLONG' : lord ? (u.kind === K_LORD ? 'LORD' : (names.get(u.owner) || 'Buddy') + ' · LORD') : u.neutral ? 'TANK NETRAL · SENTUH UNTUK KLAIM' : mon ? (u.rage ? 'MONSTER (MENGAMUK)' : 'MONSTER') : u.kind === 0 || (isVeh(u) && u.owner) ? names.get(u.owner) : '';
    if (name) {
      ctx.font = `${mon ? 900 : 700} ${mon ? 13 : 11}px system-ui`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(name, p.x, p.y);
      ctx.fillStyle = mon ? MON_COL : isMe ? '#fff6c8' : '#fff'; ctx.fillText(name, p.x, p.y);
    }
    if (isMe) {
      ctx.fillStyle = '#fff6c8';
      const ay = p.y - 16 + Math.sin(time * 5) * 2;
      ctx.beginPath(); ctx.moveTo(p.x - 5, ay); ctx.lineTo(p.x + 5, ay); ctx.lineTo(p.x, ay + 6); ctx.fill();
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t -= dt; f.h += 26 * dt;
    if (f.t <= 0) { floaters.splice(i, 1); continue; }
    const p = toScreen(f.x, f.h + hAt(f.x, f.y), f.y);
    if (!p) continue;
    ctx.globalAlpha = Math.min(1, f.t * 2);
    ctx.font = '900 18px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#1a1a1a'; ctx.strokeText(f.txt, p.x, p.y);
    ctx.fillStyle = f.col; ctx.fillText(f.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  // bidikan: arah stik ditandai lingkaran di depan pemain, mouse memakai crosshair
  if (joined && aimMode === 'stick' && me) {
    const R = isVeh(me) ? 90 : 70, g = hAt(me.x, me.y) + GUN_H;
    const p = toScreen(me.x + Math.cos(aim) * R, g, me.y + Math.sin(aim) * R), q = toScreen(me.x + Math.cos(aim) * 26, g, me.y + Math.sin(aim) * 26);
    if (p && q) {
      ctx.strokeStyle = 'rgba(255,246,200,.6)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,246,200,.9)'; ellipse(p.x, p.y, 7, 7); ctx.stroke();
    }
  } else if (joined && !useTouch) {
    ctx.strokeStyle = 'rgba(255,246,200,.85)'; ctx.lineWidth = 2;
    ellipse(mouse.x, mouse.y, 9, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke();
  }

  drawHUD(S, me, dt);
}

// ---------------- HUD ----------------
function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(14,20,12,.78)'; rrect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.stroke();
}
function text(s, x, y, size, col, align = 'left', weight = 800) {
  ctx.font = `${weight} ${size}px system-ui`; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function drawHUD(S, me, dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const map = meta.map, T = map.tile;
  const small = IW < 700 || useTouch;

  // status markas tiap tim
  const n = meta.teams, bw = small ? 104 : 150, gap = 8, total = n * bw + (n - 1) * gap;
  let x0 = IW / 2 - total / 2;
  for (let t = 0; t < n; t++) {
    const x = x0 + t * (bw + gap);
    panel(x, 10, bw, 44);
    ctx.fillStyle = meta.colors[t]; rrect(x + 8, 18, 10, 10, 3); ctx.fill();
    text(meta.names[t] + (t === myTeam ? (small ? ' ★' : ' (kamu)') : ''), x + 24, 28, 12, '#fff');
    text('📦 ' + latest.pad[t], x + bw - 8, 28, 11, '#d9c9a3', 'right', 700);
    if (latest.al[t]) hpBar(x + bw / 2, 38, bw - 16, latest.hq[t] / (meta.hqMax || 3200), meta.colors[t]);
    else text('HANCUR', x + bw / 2, 46, 12, '#ff6b6b', 'center', 900);
  }
  const rl = latest.rl, mm = Math.floor(rl / 60), ss = String(rl % 60).padStart(2, '0');
  text(latest.st === 'playing' ? `${mm}:${ss}` : '', IW / 2, 72, 13, '#ffffff', 'center', 800);

  // status pemain
  if (me) {
    // di HP panel status pindah ke kiri atas (bawah kiri dipakai stik gerak)
    const pw = small ? 170 : 220, py = useTouch ? 50 : IH - 74;
    panel(10, py, pw, 64);
    text('HP', 20, py + 22, 11, '#a9b8a0');
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(44, py + 12, pw - 54, 12);
    ctx.fillStyle = me.hp > 50 ? '#6bdc6b' : me.hp > 25 ? '#f6c453' : '#ff5a5a';
    ctx.fillRect(44, py + 12, (pw - 54) * clamp(me.hp / me.max, 0, 1), 12);
    ctx.fillStyle = WCOL[me.w]; rrect(20, py + 32, 10, 10, 3); ctx.fill();
    text(WNAME[me.w] + (me.ammo >= 0 ? '  ' + me.ammo : '  ∞'), 36, py + 42, 14, '#fff');
    const mp = latest.PL.find(p => p[0] === myId);
    if (mp) text(`K ${mp[3]} · M ${mp[4]}`, pw, py + 42, 11, '#a9b8a0', 'right', 700);
  }

  // petunjuk kontekstual
  let hint = '';
  if (me && myTeam >= 0) {
    const b = map.bases[myTeam];
    const dPad = Math.hypot(me.x - b.pad.x, me.y - b.pad.y);
    const padN = latest.pad[myTeam];
    const loose = S.crates.some(c => !c.pad && c.z < 5 && Math.hypot(c.x - me.x, c.y - me.y) < 44);
    const enemyPad = map.bases.some((o, t) => t !== myTeam && latest.pad[t] > 0 && Math.hypot(me.x - o.pad.x, me.y - o.pad.y) < 72);
    // kendaraan kosong milik tim di dekat pemain
    const ride = me.kind === 0 && S.units.find(v => isVeh(v) && v.team === myTeam && !v.owner && Math.hypot(v.x - me.x, v.y - me.y) < 46);
    if (me.lift) hint = 'DICULIK UFO! Temanmu bisa menembak piring terbang untuk menolong.';
    else if (me.lord) hint = 'LORD · Klik / RT = tebas · tidak bisa ambil peti · buff hilang saat mati';
    else if (me.carry && S.crates.find(c => c.metal && c.z > 35 && c.z < 55 && Math.hypot(c.x - me.x, c.y - me.y) < 10)) hint = 'PETI METAL · F / klik kanan = lempar, pecah jadi 2 peti kayu';
    else if (me.carry) hint = dPad < 72 ? 'E  taruh peti di petak yang dibidik   ·   R  buku resep' : 'E  jatuhkan   ·   F / klik kanan  lempar   ·   bawa ke pad markasmu';
    else if (dPad < 84 && padN > 0) {
      const want = latest.or ? latest.or[myTeam][3] : 0, plan = latest.or ? PLAN_NAME[latest.or[myTeam][0]] : '';
      const pr = latest.pr ? latest.pr[myTeam] : '';
      hint = pr ? `Q  rakit ${pr} (${padN} peti)   ·   R  buku resep`
        : `Perintah: ${plan} — butuh ${want} peti (${padN}/${want})   ·   1 = otomatis`;
    }
    else if (isVeh(me)) hint = `E  keluar dari ${VNAME[me.kind]}`;
    else if (ride) hint = `E  naik ${VNAME[ride.kind]}`;
    else if (S.pickups.some(p => Math.hypot(p[1] - me.x, p[2] - me.y) < 27)) hint = 'E  ambil / tukar senjata';
    else if (loose) hint = 'E  angkat peti';
    else if (enemyPad) hint = 'E  curi peti musuh!';
  }
  if (hint) {
    ctx.font = '800 14px system-ui';
    const w = ctx.measureText(hint).width + 28;
    panel(IW / 2 - w / 2, IH - 52, w, 34);
    text(hint, IW / 2, IH - 30, 14, '#fff6c8', 'center');
  }

  // minimap
  const mw = small ? 120 : 180, mh = mw * map.h / map.w, mx = IW - mw - 10, my = 10, k = mw / map.w;
  panel(mx - 4, my - 4, mw + 8, mh + 8);
  const th = theme();
  ctx.fillStyle = th.stripes[1]; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#182b30'; for (const p of map.outside || []) ctx.fillRect(mx+p.x*k,my+p.y*k,p.w*k,p.h*k);
  ctx.fillStyle = th.zone[2]; ellipse(mx + mw / 2, my + mh / 2, 9.4 * T * k, 9.4 * T * k); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  for (const hl of map.hills || []) { ellipse(mx + hl.x * k, my + hl.y * k, hl.r * k, hl.r * k); ctx.fill(); }
  ctx.fillStyle = '#0b0806';
  for (const p of map.pits || []) { ellipse(mx + p.x * k, my + p.y * k, p.r * k, p.r * k); ctx.fill(); }
  for (const p of map.hazards || []) { ctx.fillStyle = HAZARD_COLORS[p.kind]; ctx.fillRect(mx+p.x*k,my+p.y*k,p.w*k,p.h*k); }
  ctx.fillStyle = '#dfbe84';
  for (const p of map.bridges || []) ctx.fillRect(mx+p.x*k,my+p.y*k,p.w*k,p.h*k);
  ctx.fillStyle = '#9aa0a8';
  for (const w of map.walls) ctx.fillRect(mx + w.x * k, my + w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
  map.bases.forEach((b, t) => {
    ctx.fillStyle = latest.al[t] ? meta.colors[t] : '#333';
    ctx.fillRect(mx + b.hq.x * k, my + b.hq.y * k, b.hq.w * k, b.hq.h * k);
  });
  ctx.fillStyle = '#e0c48a';
  for (const c of S.crates) if (!c.pad) ctx.fillRect(mx + c.x * k - 1, my + c.y * k - 1, 2.5, 2.5);
  for (const u of S.units) {
    ctx.fillStyle = tcol(u.team);
    if (isVeh(u)) ctx.fillRect(mx + u.x * k - 3, my + u.y * k - 3, 6, 6);
    else { const r = u.kind === K_MON ? 5 : u.kind === 0 ? 3 : 2; ellipse(mx + u.x * k, my + u.y * k, r, r); ctx.fill(); }
    if (me && u.id === me.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  for (const d of latest.D || []) { ctx.fillStyle = d[4] >= 0 ? meta.colors[d[4]] : '#eee'; ctx.fillRect(mx + d[1] * k - 3, my + d[2] * k - 3, 6, 6); }
  ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 1.5;
  for (const m of latest.M || []) { ellipse(mx + m[1] * k, my + m[2] * k, Math.max(2.5, m[4] * k), Math.max(2.5, m[4] * k)); ctx.stroke(); }

  if (latest.A) drawArenaMinimap(ctx, latest.A, latest.A.age + Math.max(0, (performance.now() - latest.rt) / 1000), mx, my, k, map);

  // feed
  let fy = my + mh + 20;
  for (let i = feed.length - 1; i >= 0; i--) {
    const f = feed[i];
    f.t -= dt;
    if (f.t <= 0) { feed.splice(i, 1); continue; }
  }
  ctx.globalAlpha = 1;
  for (const f of feed) {
    ctx.globalAlpha = Math.min(1, f.t);
    drawRich(f.html, IW - 14, fy);
    fy += 18;
  }
  ctx.globalAlpha = 1;

  // respawn / spectate
  const mp = latest.PL.find(p => p[0] === myId);
  if (joined && !me && latest.st === 'playing') {
    const msg = mp && latest.al[mp[2]] ? `Muncul lagi dalam ${mp[6]}…` : 'Markasmu hancur — menonton sampai ronde berikutnya';
    ctx.font = '900 22px system-ui';
    const w = ctx.measureText(msg).width + 40;
    panel(IW / 2 - w / 2, IH / 2 - 30, w, 50);
    text(msg, IW / 2, IH / 2 + 3, 22, '#fff', 'center', 900);
  }
  if (latest.st === 'ended') {
    const wt = latest.win;
    panel(IW / 2 - 220, IH / 2 - 70, 440, 120);
    text(wt >= 0 ? `TIM ${meta.names[wt].toUpperCase()} MENANG!` : 'SERI!', IW / 2, IH / 2 - 15, 34, wt >= 0 ? meta.colors[wt] : '#fff', 'center', 900);
    text(`Kembali ke ruang tunggu dalam ${latest.et}…`, IW / 2, IH / 2 + 25, 15, '#cfd8c8', 'center', 700);
  }
  text(`${fps} fps · grafis ${qName} (G)`, IW - 10, IH - 10, 10, 'rgba(255,255,255,.7)', 'right', 700);
  // pengumuman event (meteor, kiriman peti, monster)
  if (banner && (banner.t -= dt) > 0) {
    ctx.globalAlpha = Math.min(1, banner.t * 1.5, (4 - banner.t) * 4);
    const by = 112 + Math.max(0, banner.t - 3.6) * -60;
    ctx.font = '900 30px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = '#1a1208'; ctx.strokeText(banner.name.toUpperCase(), IW / 2, by);
    ctx.fillStyle = '#ffb347'; ctx.fillText(banner.name.toUpperCase(), IW / 2, by);
    ctx.font = '800 14px system-ui'; ctx.lineWidth = 4; ctx.strokeText(banner.d, IW / 2, by + 24);
    ctx.fillStyle = '#fff6c8'; ctx.fillText(banner.d, IW / 2, by + 24);
    ctx.globalAlpha = 1;
  }
  if (showScore) drawScore();
  if (!joined) return;
  if (muted) text('🔇 M', 16, 28, 13, '#ffffff');
}
// teks dengan <b style=color> sederhana untuk feed
function drawRich(html, xr, y) {
  const parts = [];
  const re = /<b style="color:([^"]+)">(.*?)<\/b>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) parts.push(m[3] !== undefined ? { s: unesc(m[3]), c: '#e8ece4' } : { s: unesc(m[2]), c: m[1] });
  ctx.font = '700 12px system-ui'; ctx.textAlign = 'left';
  const w = parts.reduce((a, p) => a + ctx.measureText(p.s).width, 0);
  ctx.fillStyle = 'rgba(14,20,12,.7)'; rrect(xr - w - 10, y - 13, w + 12, 17, 5); ctx.fill();
  let x = xr - w - 4;
  for (const p of parts) { ctx.fillStyle = p.c; ctx.fillText(p.s, x, y); x += ctx.measureText(p.s).width; }
}
const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function drawScore() {
  const rows = [...latest.PL].sort((a, b) => a[2] - b[2] || b[3] - a[3]);
  const w = Math.min(420, IW - 32), h = 60 + rows.length * 24;
  const x = IW / 2 - w / 2, y = Math.max(90, IH / 2 - h / 2);
  panel(x, y, w, h);
  text('SKOR', x + 16, y + 28, 16, '#fff', 'left', 900);
  text('Bunuh', x + w - 80, y + 28, 11, '#a9b8a0', 'right'); text('Mati', x + w - 16, y + 28, 11, '#a9b8a0', 'right');
  rows.forEach((p, i) => {
    const yy = y + 54 + i * 24;
    ctx.fillStyle = meta.colors[p[2]]; rrect(x + 16, yy - 11, 10, 12, 3); ctx.fill();
    text(p[1] + (p[0] === myId ? '  ←' : ''), x + 34, yy, 13, '#fff', 'left', 700);
    text(String(p[3]), x + w - 80, yy, 13, '#fff', 'right', 700);
    text(String(p[4]), x + w - 16, yy, 13, '#fff', 'right', 700);
  });
}

requestAnimationFrame(frame);
