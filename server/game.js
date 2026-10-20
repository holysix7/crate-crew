'use strict';
// Simulasi game authoritative. Semua aturan main ada di sini; client hanya menggambar.

const { ArenaEvents, EVENT_RULES } = require('./arena-events');
const { Encounters } = require('./encounters');

const EVENT_OPTIONS = [
  { id: 'meteor', name: 'Hujan Meteor' }, { id: 'supply', name: 'Kiriman Peti' }, { id: 'rage', name: 'Monster Mengamuk' },
  ...Object.entries(EVENT_RULES).map(([id, rule]) => ({ id, name: rule.name })),
];
const ALL_EVENTS_MASK = (1 << EVENT_OPTIONS.length) - 1;

const { MAPS, TILE: T, COLS: MW, ROWS: MH, outlineFor, rectangles } = require('./maps');
const W = MW * T, H = MH * T;
const VOID_HAZARD = { kind: 'void' };
const TICK = 1 / 30;
const TEAM_NAMES = ['Merah', 'Biru', 'Hijau', 'Kuning'];
const TEAM_COLORS = ['#e5484d', '#3e7bfa', '#30a46c', '#f5b400'];
// fx = jenis tampilan peluru di client (3 api, 4 granat, 5 laser); pierce = menembus unit
const WEAPONS = {
  pistol:  { label: 'Pistol', rate: 0.28, dmg: 12, speed: 720, spread: 0.05, pellets: 1, ammo: Infinity, life: 0.65 },
  smg:     { label: 'SMG', rate: 0.09, dmg: 7,  speed: 760, spread: 0.13, pellets: 1, ammo: 70, life: 0.6 },
  shotgun: { label: 'Shotgun', rate: 0.85, dmg: 9,  speed: 680, spread: 0.28, pellets: 6, ammo: 14, life: 0.38 },
  bazooka: { label: 'Bazooka', rate: 1.2,  dmg: 75, speed: 430, spread: 0,    pellets: 1, ammo: 5,  life: 1.4, rocket: true, splash: 75 },
  // senjata bawaan kendaraan
  cannon:  { label: 'Meriam', rate: 1.6,  dmg: 70, speed: 520, spread: 0,    pellets: 1, ammo: Infinity, life: 1.1, rocket: true, splash: 70 },
  mg:      { label: 'Senapan mesin', rate: 0.1,  dmg: 6,  speed: 800, spread: 0.07, pellets: 1, ammo: Infinity, life: 0.55 },
  // senjata dari resep pola susunan
  sniper:  { label: 'Sniper', rate: 1.1,  dmg: 60, speed: 1400, spread: 0,   pellets: 1, ammo: 8,   life: 0.55 },
  flamer:  { label: 'Pelontar api', rate: 0.05, dmg: 3, speed: 340, spread: 0.22, pellets: 1, ammo: 120, life: 0.45, fx: 3 },
  grenade: { label: 'Pelontar granat', rate: 0.9, dmg: 55, speed: 380, spread: 0.04, pellets: 1, ammo: 8, life: 0.9, rocket: true, splash: 70, fx: 4 },
  minigun: { label: 'Minigun', rate: 0.05, dmg: 5,  speed: 820, spread: 0.16, pellets: 1, ammo: 200, life: 0.55 },
  laser:   { label: 'Laser', rate: 0.45, dmg: 30, speed: 1600, spread: 0,   pellets: 1, ammo: 12,  life: 0.4, pierce: true, fx: 5 },
};
WEAPONS.superbazooka = { label: 'Super Bazooka', rate: 1.4, dmg: 125, speed: 470, spread: 0, pellets: 1, ammo: 6, life: 1.5, rocket: true, splash: 105 };
WEAPONS.lordblade = { label: 'Tebasan LORD', rate: 0.7, dmg: 32, speed: 0, spread: 0, pellets: 0, ammo: Infinity, life: 0 };
const WLIST = Object.keys(WEAPONS);
const KIND = { human: 0, bot: 1, turret: 2, tank: 3, jeep: 4, monster: 5, ufo: 6, chicken: 7, lord: 8 };
const UNIT_R = 14, HQ_HP = 3200, UNIT_HP = 100, TURRET_HP = 260, CRATE_H = 24, CARRY_Z = 44;
const MAX_TEAM_UNITS = 8, MAX_TURRETS = 3, MAX_VEHICLES = 2, ROUND_TIME = 600, RESPAWN = 4;
// Friendly fire: angkat (E) & lempar (F) pemain. Lempar = kecepatan datar, kecepatan naik; damage ke yang dilempar / yang ditabrak
const HOLD_MAX = 5, HOLD_Z = 38, THROW_UNIT = { speed: 380, vz: 240, selfDmg: 15, hitDmg: 25 };
// Kendaraan rakitan 8 peti. r < T/2 supaya muat lewat celah 1 petak; turn = rad/detik; ram = damage tabrak
const VEHICLES = {
  tank: { hp: 650, speed: 100, r: 19, weapon: 'cannon', turn: 2.6, mass: 6, ram: 20, label: 'Tank' },
  jeep: { hp: 280, speed: 250, r: 17, weapon: 'mg', turn: 7, mass: 3, ram: 35, label: 'Jeep' },
};
// Monster penjaga zona jatuh peti (tim -1, netral: menyerang semua tim di zonanya)
const MONSTER = { hp: 1500, r: 30, speed: 85, zone: 9.4 * T, slam: 45, slamR: 80, rock: 40, respawn: 45 };
const ZONE_R = 9.4 * T;
const isInf = u => u.kind === 'human' || u.kind === 'bot';
const mass = u => (u.kind === 'turret' || u.neutral ? Infinity : u.kind === 'monster' ? 30 : u.lord || u.kind === 'lord' ? 4 : VEHICLES[u.kind] ? VEHICLES[u.kind].mass : 1);

const MIRRORS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const hillH = (hl, x, y) => { const t = Math.hypot(x - hl.x, y - hl.y) / hl.r; return t < 1 ? hl.h * (0.5 + 0.5 * Math.cos(Math.PI * t)) : 0; };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Perintah tim. build: apa yang dirakit di pad (bot & tombol Q). mode: tugas bot non-pengumpul.
const BUILD_PLANS = { auto: 0, weapon: 1, buddy: 4, turret: 8, tank: 8, jeep: 8 };
const MODES = ['follow', 'defend', 'attack'];
const BUILD_LABEL = { buddy: 'Buddy', elite: 'Buddy Elit', turret: 'Turret', tank: 'Tank', jeep: 'Jeep' };

// Resep pola susunan pad 2×2. Bit petak: 0 kiri-atas, 1 kanan-atas, 2 kiri-bawah, 3 kanan-bawah (arah layar);
// lo = tingkat 1, hi = tingkat 2 (hanya bisa di atas peti tingkat 1). Daftar ini juga dikirim ke client untuk buku resep.
const RECIPES = [
  { id: 'weapon', name: 'Senjata acak', desc: '1 peti · SMG / Shotgun / Bazooka', lo: 0b0001, hi: 0 },
  { id: 'sniper', name: 'Sniper', desc: '2 peti berjajar kiri–kanan · jarak jauh', lo: 0b0011, hi: 0 },
  { id: 'flamer', name: 'Pelontar api', desc: '2 peti atas–bawah · jarak dekat, deras', lo: 0b0101, hi: 0 },
  { id: 'grenade', name: 'Pelontar granat', desc: '2 peti diagonal · ledakan area', lo: 0b1001, hi: 0 },
  { id: 'laser', name: 'Laser', desc: '1 peti ditumpuk 1 (menara) · menembus musuh', lo: 0b0001, hi: 0b0001 },
  { id: 'minigun', name: 'Minigun', desc: '3 peti bentuk L · 200 peluru', lo: 0b0111, hi: 0 },
  { id: 'buddy', name: 'Buddy', desc: '4 peti rata · rekrut bot', lo: 0b1111, hi: 0 },
  { id: 'elite', name: 'Buddy Elit', desc: '4 rata + 1 di atas · HP 160, senjata khusus', lo: 0b1111, hi: 0b0001 },
  { id: 'big', name: 'Turret / Tank / Jeep', desc: '8 peti, 2 tingkat penuh', lo: 0b1111, hi: 0b1111 },
];
const RECIPE_WEAPON = { sniper: 'sniper', flamer: 'flamer', grenade: 'grenade', laser: 'laser', minigun: 'minigun' };
const ELITE_WEAPONS = ['sniper', 'grenade', 'minigun', 'laser', 'flamer'];
const ELITE_HP = 160;
const bits = m => { let n = 0; for (; m; m &= m - 1) n++; return n; };
function matchRecipe(mask) {
  const lo = mask & 15, hi = mask >> 4, nl = bits(lo), nh = bits(hi);
  if (!nh) return [null, 'weapon', lo === 0b0011 || lo === 0b1100 ? 'sniper' : lo === 0b0101 || lo === 0b1010 ? 'flamer' : 'grenade', 'minigun', 'buddy'][nl];
  if (nl === 1 && hi === lo) return 'laser';
  if (nl === 4 && nh === 1) return 'elite';
  if (nl === 4 && nh === 4) return 'big';
  return null;
}
// urutan petak dari yang paling dekat ke petak `col` (dipakai server & client supaya ramalan petak sama)
const cellOrder = col => [0, 1, 2, 3].sort((i, j) =>
  Math.abs((i & 1) - (col & 1)) + Math.abs((i >> 1) - (col >> 1)) - Math.abs((j & 1) - (col & 1)) - Math.abs((j >> 1) - (col >> 1)) || i - j);
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14);

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
const r1 = v => Math.round(v);
function rectDist(x, y, r) {
  const cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h);
  return Math.hypot(x - cx, y - cy);
}
function pushOut(u, r, rect) {
  const cx = clamp(u.x, rect.x, rect.x + rect.w), cy = clamp(u.y, rect.y, rect.y + rect.h);
  const dx = u.x - cx, dy = u.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 === 0) {
    const l = u.x - rect.x, rr = rect.x + rect.w - u.x, t = u.y - rect.y, b = rect.y + rect.h - u.y;
    const m = Math.min(l, rr, t, b);
    if (m === l) u.x = rect.x - r; else if (m === rr) u.x = rect.x + rect.w + r;
    else if (m === t) u.y = rect.y - r; else u.y = rect.y + rect.h + r;
    return true;
  }
  const d = Math.sqrt(d2);
  u.x = cx + (dx / d) * r; u.y = cy + (dy / d) * r;
  return true;
}

function buildMap(teams, def) {
  const outline = outlineFor(def), hills = [], pits = [], interior = new Uint8Array(MW * MH);
  const add = (x,y,w,h) => { for(let ty=y;ty<y+h;ty++)for(let tx=x;tx<x+w;tx++)
    if(outline.mask[ty*MW+tx]===1)interior[ty*MW+tx]=1; };
  // Rintangan satu kuadran, dicerminkan ke 4 kuadran -> peta simetris & adil
  const seen = new Set();
  for (const [x, y, w, h] of def.walls) {
    for (const [mx, my] of MIRRORS) {
      const nx = mx ? MW - x - w : x, ny = my ? MH - y - h : y;
      const k = nx + ',' + ny + ',' + w + ',' + h;
      if (seen.has(k)) continue;
      seen.add(k); add(nx, ny, w, h);
    }
  }
  for (const [list, src] of [[hills, def.hills], [pits, def.pits]]) {
    for (const [x, y, r, h] of src) for (const [mx, my] of MIRRORS) {
      const p = { x: (mx ? MW - x : x) * T, y: (my ? MH - y : y) * T, r: r * T };
      if (h) p.h = h;
      if (!list.some(q => q.x === p.x && q.y === p.y)) list.push(p);
    }
  }
  const corners = [
    { hx: 3, hy: 3, dx: 1, dy: 1 }, { hx: MW - 6, hy: MH - 6, dx: -1, dy: -1 },
    { hx: MW - 6, hy: 3, dx: -1, dy: 1 }, { hx: 3, hy: MH - 6, dx: 1, dy: -1 },
  ];
  const bases = [];
  for (let t = 0; t < teams; t++) {
    const c = corners[t];
    const hq = { x: c.hx * T, y: c.hy * T, w: 3 * T, h: 3 * T };
    const cx = hq.x + hq.w / 2, cy = hq.y + hq.h / 2;
    bases.push({ team: t, hq, dx: c.dx, dy: c.dy, pad: { x: cx + c.dx * 5 * T, y: cy }, spawn: { x: cx + c.dx * 3 * T, y: cy + c.dy * 2.5 * T } });
  }
  const hazards = (def.channels || []).map(([x,y,w,h]) => ({ x:x*T, y:y*T, w:w*T, h:h*T, kind:def.hazard, depth:def.depth }));
  const bridges = (def.bridges || []).map(([x,y,w,h]) => ({ x:x*T, y:y*T, w:w*T, h:h*T }));
  return { walls: [...outline.walls, ...rectangles(interior,1)], bases, hills, pits, hazards, bridges, outside: outline.outside, arenaMask: outline.mask };
}

// Static geometry is built once; only base selection and mutable simulation state vary per room.
const MAP_GEOMETRY = MAPS.map(def => buildMap(4, def));
const MAP_BLOCKED = new Map();
const MAP_CATALOG = MAPS.map((def, i) => {
  const { arenaMask, ...preview } = MAP_GEOMETRY[i];
  return { id: def.id, name: def.name, theme: def.theme, tag: def.tag, desc: def.desc, w: W, h: H, preview };
});

class Game {
  constructor(teams, { firstEvent = null } = {}) {
    this.previewEvents = (Array.isArray(firstEvent) ? firstEvent : [firstEvent]).filter(k => Object.hasOwn(EVENT_RULES, k));
    this.firstEvent = this.previewEvents[0] || null;
    this.teams = teams;
    this.players = new Map();
    this.conns = new Set();
    this.nextId = 1;
    this.time = 0;
    this.events = [];
    this.cpu = true; // tim tanpa pemain diisi 1 komandan CPU
    this.ff = false; // friendly fire: serangan tim saling melukai + angkat/lempar pemain
    this.eventsEnabled = true;
    this.eventMask = ALL_EVENTS_MASK;
    this.master = 0; // id pemain room master (memilih peta, CPU, bisa mengeluarkan pemain)
    this.setMap(0);
    this.toLobby();
  }
  id() { return this.nextId++; }

  setMap(i) {
    this.mapIdx = i;
    const geometry = MAP_GEOMETRY[i], m = { ...geometry, bases: geometry.bases.slice(0, this.teams) };
    this.walls = m.walls; this.bases = m.bases; this.hills = m.hills; this.pits = m.pits; this.hazards = m.hazards; this.bridges = m.bridges; this.outside = m.outside; this.arenaMask = m.arenaMask;
    this.solids = [...this.walls, ...this.bases.map(b => b.hq)];
    const d = MAPS[i];
    this.mapMeta = { w: W, h: H, tile: T, walls: this.walls, bases: this.bases, crateH: CRATE_H,
      hills: this.hills, pits: this.pits, hazards: this.hazards, bridges: this.bridges, outside: this.outside, desc: d.desc, tag: d.tag,
      id: d.id, name: d.name, theme: d.theme, zone: ZONE_R };
    // grid pathfinding: tembok + lubang (dengan margin badan unit) tidak bisa dilewati
    const blockKey = `${i}:${this.teams}`, cached = MAP_BLOCKED.get(blockKey);
    this.blocked = cached ? new Uint8Array(cached) : new Uint8Array(MW * MH);
    // Scratch memory is reused by sequential bot searches, rather than allocated per path.
    this.pathPrev = new Int32Array(MW * MH);
    this.pathQueue = new Int32Array(MW * MH);
    this.pathVisited = new Uint32Array(MW * MH);
    this.pathEpoch = 0;
    if (!cached) for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
      if (this.solids.some(s => rectDist(cx, cy, s) < 20) || this.inPit(cx, cy, -(UNIT_R + 6))) this.blocked[ty * MW + tx] = 1;
    }
    if (!cached) MAP_BLOCKED.set(blockKey, new Uint8Array(this.blocked));
  }
  mapInfo() { return this.mapMeta; }
  welcome() {
    return JSON.stringify({
      t: 'welcome', teams: this.teams, colors: TEAM_COLORS.slice(0, this.teams), names: TEAM_NAMES.slice(0, this.teams), weapons: WLIST,
      arenaEvents: EVENT_RULES,
      eventOptions: EVENT_OPTIONS,
      map: this.mapInfo(), maps: MAP_CATALOG, hqMax: HQ_HP,
      wlabels: WLIST.map(k => WEAPONS[k].label), recipes: RECIPES.map(({ id, name, desc, lo, hi }) => ({ id, name, desc, lo, hi })),
    });
  }
  // margin > 0 = toleransi di tepi (masih aman), margin < 0 = lubang dianggap lebih besar
  inPit(x, y, margin = 0) {
    for (const p of this.pits) if (Math.hypot(x - p.x, y - p.y) < p.r - margin) return p;
    for (const p of this.hazards || []) if (x >= p.x + margin && x <= p.x + p.w - margin && y >= p.y + margin && y <= p.y + p.h - margin) return p;
    // Shore tolerance shrinks the union, not each segment separately: shared
    // edges must remain lethal even when the physics uses a positive margin.
    if (margin > 0) {
      const contains = (px,py,p) => px >= p.x && px <= p.x+p.w && py >= p.y && py <= p.y+p.h;
      const hit = this.hazards.find(p=>contains(x,y,p));
      if (hit && [[x-margin,y],[x+margin,y],[x,y-margin],[x,y+margin]].every(([px,py])=>this.hazards.some(p=>contains(px,py,p)))) return hit;
    }
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || this.arenaMask[ty*MW+tx] === 0) return VOID_HAZARD;
    return null;
  }
  heightAt(x, y) { let h = 0; for (const hl of this.hills) h += hillH(hl, x, y); return h; }

  clearWorld() {
    this.units = new Map(); this.crates = new Map(); this.bullets = []; this.pickups = new Map();
    this.hq = this.bases.map(() => HQ_HP); this.alive = this.bases.map(() => true);
    this.pads = this.bases.map(() => new Array(8).fill(0));
    // target -1 = markas musuh terdekat
    this.orders = this.bases.map(() => ({ build: 'auto', mode: 'follow', target: -1 }));
    this.cpuTeam = this.bases.map(() => false); this.cpuRespawn = this.bases.map(() => 0);
    this.endTimer = 0; this.winner = -1; this.roundLeft = ROUND_TIME; this.crateTimer = 0.5; this.countdown = 0;
    this.encounters = new Encounters(this, WEAPONS);
    this.arenaEvents = new ArenaEvents(this);
    this.previewQueue = this.previewEvents.filter(kind => this.isEventEnabled(kind));
    this.pendingFirstEvent = this.previewQueue.shift() || null;
    this.meteors = []; this.evtTimer = this.pendingFirstEvent ? 8 : rand(40, 55); this.monsterTimer = 0;
  }
  // ruang tunggu: dunia kosong, semua pemain harus menekan "Siap" lagi
  toLobby() {
    this.clearWorld();
    this.state = 'lobby';
    for (const p of this.players.values()) { p.ready = false; p.unitId = 0; }
    for (let i = 0; i < 10; i++) this.spawnCrate(true);
  }
  humanTeams() { return new Set([...this.players.values()].map(p => p.team)); }
  activeTeams() { return this.cpu ? this.teams : this.humanTeams().size; }
  // ronde dimulai tanpa Buddy: tim berpemain hanya punya pemainnya, tim kosong dapat komandan CPU (atau gugur)
  startRound() {
    this.clearWorld();
    this.state = 'playing';
    const humans = this.humanTeams();
    for (const p of this.players.values()) { p.unitId = 0; p.respawn = 0.5; p.kills = 0; p.deaths = 0; }
    for (let t = 0; t < this.teams; t++) {
      if (humans.has(t)) continue;
      if (this.cpu) { this.cpuTeam[t] = true; this.spawnCpu(t); }
      else { this.alive[t] = false; this.hq[t] = 0; }
    }
    for (let i = 0; i < 10; i++) this.spawnCrate(true);
    this.spawnMonster();
    this.events.push({ k: 'start' });
  }
  spawnMonster() {
    const u = this.spawnUnit(-1, 'monster', W / 2, H / 2);
    u.ai = { slamCd: 1, rockCd: 2, wind: 0, act: 0, goal: null, t: 0, tx: 0, ty: 0 };
    u.anim = 0; u.rage = 0;
    return u;
  }
  monster() { for (const u of this.units.values()) if (u.kind === 'monster') return u; return null; }
  spawnCpu(t) {
    const u = this.spawnBot(t);
    u.cpu = true; u.ai.role = 'gather';
    return u;
  }

  // ---------------- koneksi & pemain ----------------
  addConnection(c) {
    c.player = null;
    c.onmessage = s => { let m; try { m = JSON.parse(s); } catch { return; } this.onMsg(c, m); };
    c.onclose = () => this.removeConn(c);
    this.conns.add(c);
    c.send(this.welcome());
  }
  removeConn(c) {
    this.conns.delete(c);
    const p = c.player;
    if (!p) return;
    const u = this.units.get(p.unitId);
    if (u && VEHICLES[u.kind]) { u.driver = null; u.owner = 0; } // kendaraan tetap ada, kembali dikemudikan AI
    else if (u) this.removeUnit(u);
    this.players.delete(p.id);
    if (!p.kicked) this.events.push({ k: 'leave', n: p.name });
    if (this.master === p.id) {
      // room master keluar → diwariskan ke pemain yang paling lama di ruangan
      const nx = this.players.values().next().value;
      this.master = nx ? nx.id : 0;
      if (nx) this.events.push({ k: 'master', n: nx.name });
    }
  }
  sys(p, s) { p.conn.send(JSON.stringify({ t: 'chat', sys: 1, s })); }
  isMaster(p, what) {
    if (p.id === this.master) return true;
    this.sys(p, 'Hanya room master yang bisa ' + what + '.');
    return false;
  }
  kick(p, target) {
    if (!target || target === p || !this.isMaster(p, 'mengeluarkan pemain')) return;
    target.kicked = true;
    target.conn.send(JSON.stringify({ t: 'kicked', by: p.name }));
    this.events.push({ k: 'kick', n: target.name, by: p.name });
    target.conn.close();
  }
  giveMaster(p, target) {
    if (!target || target === p || !this.isMaster(p, 'memindahkan room master')) return;
    this.master = target.id;
    this.events.push({ k: 'master', n: target.name });
  }
  isEventEnabled(kind) {
    const i = EVENT_OPTIONS.findIndex(option => option.id === kind);
    return this.eventsEnabled && i >= 0 && !!(this.eventMask & (1 << i));
  }
  configureEvents(p, m) {
    if (!['lobby', 'countdown'].includes(this.state) || !this.isMaster(p, 'mengatur event')) return false;
    if (typeof m.enabled !== 'boolean') return false;
    let name = 'Semua event acak';
    if (m.kind === undefined) {
      if (this.eventsEnabled === m.enabled) return false;
      this.eventsEnabled = m.enabled;
    } else {
      const i = EVENT_OPTIONS.findIndex(option => option.id === m.kind);
      if (i < 0 || !!(this.eventMask & (1 << i)) === m.enabled) return false;
      this.eventMask = m.enabled ? this.eventMask | (1 << i) : this.eventMask & ~(1 << i);
      name = EVENT_OPTIONS[i].name;
    }
    for (const player of this.players.values()) player.ready = false;
    this.state = 'lobby'; this.countdown = 0;
    this.events.push({ k: 'eventcfg', n: p.name, name, v: m.enabled });
    return true;
  }
  findPlayer(name) {
    const q = name.trim().toLowerCase(), ps = [...this.players.values()];
    return ps.find(p => p.name.toLowerCase() === q) || ps.find(p => p.name.toLowerCase().startsWith(q)) || null;
  }
  // chat ala Dota: semua / tim, plus perintah "/kick nama", "/master nama"
  chat(p, m) {
    const s = String(m.s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    if (!s) return;
    if (s[0] === '/') {
      const [cmd, ...rest] = s.slice(1).split(' '), arg = rest.join(' ');
      if (cmd === 'kick' || cmd === 'master') {
        const target = arg && this.findPlayer(arg);
        if (!target) return this.sys(p, 'Pemain "' + arg + '" tidak ditemukan.');
        return cmd === 'kick' ? this.kick(p, target) : this.giveMaster(p, target);
      }
      return this.sys(p, 'Perintah: /kick nama · /master nama (khusus room master)');
    }
    const now = Date.now();
    p.chatT = (p.chatT || []).filter(t => now - t < 5000);
    if (p.chatT.length >= 5) return this.sys(p, 'Terlalu cepat, tunggu sebentar.');
    p.chatT.push(now);
    const team = !!m.team, msg = JSON.stringify({ t: 'chat', id: p.id, n: p.name, tm: p.team, team, s });
    for (const q of this.players.values()) if (!team || q.team === p.team) q.conn.send(msg);
  }
  onMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join' && !c.player) {
      const name = cleanName(m.name) || 'Buddy' + (this.nextId % 100);
      let team = Number.isInteger(m.team) && m.team >= 0 && m.team < this.teams ? m.team : -1;
      if (team < 0) {
        const counts = this.bases.map((b, t) => [...this.players.values()].filter(p => p.team === t).length + (this.alive[t] ? 0 : 100));
        team = counts.indexOf(Math.min(...counts));
      }
      const p = { id: this.id(), name, team, unitId: 0, respawn: 0.3, kills: 0, deaths: 0, ready: false, input: { mx: 0, my: 0, a: 0, fire: false }, acts: [], conn: c };
      this.players.set(p.id, p);
      c.player = p;
      if (!this.master) this.master = p.id; // pemain pertama jadi room master
      c.send(JSON.stringify({ t: 'joined', id: p.id, team }));
      this.events.push({ k: 'join', n: name, t: team });
      return;
    }
    const p = c.player;
    if (!p) return;
    if (m.t === 'in') {
      p.input = { mx: clamp(+m.mx || 0, -1, 1), my: clamp(+m.my || 0, -1, 1), a: Number.isFinite(+m.a) ? +m.a : 0, fire: !!m.f };
    } else if (m.t === 'act' && ['grab', 'throw', 'build'].includes(m.k) && p.acts.length < 4) {
      // c = petak pad yang dibidik saat menaruh peti (0–3), -1 = pilih otomatis dari arah hadap
      p.acts.push({ k: m.k, c: Number.isInteger(m.c) && m.c >= 0 && m.c < 4 ? m.c : -1 });
    } else if (m.t === 'order') {
      this.setOrder(p, m);
    } else if (m.t === 'chat') {
      this.chat(p, m);
    } else if (m.t === 'kick') {
      this.kick(p, this.players.get(m.id));
    } else if (m.t === 'master') {
      this.giveMaster(p, this.players.get(m.id));
    } else if (this.state === 'lobby' || this.state === 'countdown') {
      // aksi ruang tunggu
      if (m.t === 'ready') p.ready = !!m.v;
      else if (m.t === 'events') this.configureEvents(p, m);
      else if (m.t === 'team' && Number.isInteger(m.team) && m.team >= 0 && m.team < this.teams && m.team !== p.team) {
        p.team = m.team; p.ready = false;
      } else if ((m.t === 'map' || m.t === 'cpu' || m.t === 'ff') && !this.isMaster(p, m.t === 'map' ? 'memilih peta' : m.t === 'ff' ? 'mengatur friendly fire' : 'mengatur CPU')) {
        // ditolak: bukan room master
      } else if (m.t === 'map' && Number.isInteger(m.i) && m.i >= 0 && m.i < MAPS.length && m.i !== this.mapIdx) {
        // ganti peta: bangun ulang dunia & kirim ulang data peta ke semua client
        this.setMap(m.i);
        this.toLobby();
        const w = this.welcome();
        for (const c of this.conns) c.send(w);
        this.events.push({ k: 'mapset', n: p.name, name: MAPS[m.i].name });
      } else if (m.t === 'cpu' && !!m.v !== this.cpu) {
        this.cpu = !!m.v;
        for (const q of this.players.values()) q.ready = false; // aturan berubah → konfirmasi ulang
        this.events.push({ k: 'cpu', n: p.name, v: this.cpu });
      } else if (m.t === 'ff' && typeof m.v === 'boolean' && m.v !== this.ff) {
        this.ff = m.v;
        for (const q of this.players.values()) q.ready = false;
        this.state = 'lobby'; this.countdown = 0;
        this.events.push({ k: 'ff', n: p.name, v: this.ff });
      }
    }
  }
  lobbyTick(dt) {
    const ps = [...this.players.values()];
    const ok = ps.length > 0 && ps.every(p => p.ready) && this.activeTeams() >= 2;
    if (this.state === 'lobby') { if (ok) { this.state = 'countdown'; this.countdown = 3; } }
    else if (!ok) { this.state = 'lobby'; this.countdown = 0; }
    else if ((this.countdown -= dt) <= 0) this.startRound();
  }
  setOrder(p, m) {
    const o = this.orders[p.team];
    let txt = '';
    if (m.build in BUILD_PLANS && m.build !== o.build) {
      o.build = m.build;
      txt = { auto: 'rakit otomatis', weapon: 'rakit senjata (1 peti)', buddy: 'rakit Buddy (4 peti)', turret: 'rakit Turret (8 peti)',
        tank: 'rakit Tank (8 peti)', jeep: 'rakit Jeep (8 peti)' }[m.build];
    } else if (MODES.includes(m.mode)) {
      const target = m.mode === 'attack' && Number.isInteger(m.target) && m.target >= 0 && m.target < this.teams && m.target !== p.team ? m.target : -1;
      if (m.mode === o.mode && target === o.target) return;
      o.mode = m.mode; o.target = target;
      txt = m.mode === 'follow' ? 'pasukan ikuti aku' : m.mode === 'defend' ? 'pasukan bertahan di markas'
        : 'SERANG markas ' + (target >= 0 ? TEAM_NAMES[target] : 'terdekat') + '!';
    }
    if (txt) this.events.push({ k: 'order', n: p.name, t: p.team, txt });
  }
  // jumlah peti yang ingin dirakit sesuai perintah tim (0 = otomatis); jatuh ke otomatis bila batas sudah penuh
  buildWant(t) {
    const plan = this.orders[t].build, want = BUILD_PLANS[plan];
    return want >= 4 && !this.canBuild(t, plan) ? 0 : want;
  }
  canBuild(t, what) {
    let inf = 0, tur = 0, veh = 0;
    for (const v of this.units.values()) if (v.team === t) { if (isInf(v)) inf++; else if (v.kind === 'turret') tur++; else veh++; }
    // pengemudi tidak ada di daftar unit, tapi tetap dihitung sebagai pasukan
    for (const v of this.units.values()) if (v.team === t && v.driver) inf++;
    if (what === 'buddy') return inf < MAX_TEAM_UNITS;
    if (what === 'turret') return tur < MAX_TURRETS;
    if (what in VEHICLES) return veh < MAX_VEHICLES;
    return true;
  }
  // markas yang diserang: target perintah bila masih hidup, kalau tidak yang terdekat
  targetBase(u) {
    const o = this.orders[u.team];
    if (o.mode === 'attack' && o.target >= 0 && this.alive[o.target]) return this.bases[o.target];
    let eb = null, ed = 1e9;
    for (const b of this.bases) if (b.team !== u.team && this.alive[b.team]) { const d = dist(u, b.pad); if (d < ed) { ed = d; eb = b; } }
    return eb;
  }

  // ---------------- entitas ----------------
  spawnUnit(team, kind, x, y, owner = 0) {
    const veh = VEHICLES[kind], mon = kind === 'monster';
    const hp = veh ? veh.hp : mon ? MONSTER.hp : kind === 'turret' ? TURRET_HP : UNIT_HP;
    const u = {
      id: this.id(), team, kind, x, y, a: 0, hp, max: hp, r: veh ? veh.r : mon ? MONSTER.r : UNIT_R, anim: 0, rage: 0,
      weapon: veh ? veh.weapon : kind === 'turret' ? 'smg' : 'pistol', ammo: Infinity, cd: 0, carry: 0, owner, moving: false, shield: kind === 'human' ? 2 : 0,
      in: { mx: 0, my: 0, a: 0, fire: false }, ai: null, hull: 0, driver: null,
    };
    if (veh) u.a = u.hull = Math.atan2(H / 2 - y, W / 2 - x);
    if (kind !== 'human') {
      const n = [...this.units.values()].filter(v => v.team === team && v.kind === 'bot').length;
      u.ai = { t: 0, role: veh || n % 2 ? 'escort' : 'gather', path: null, pi: 0, pkey: '', repath: 0, strafe: 1, strafeT: 0, claim: 0, target: 0, goal: null, aim: null, fire: false };
    }
    for (const s of this.solids) pushOut(u, u.r, s);
    this.units.set(u.id, u);
    return u;
  }
  spawnBot(t, x, y) {
    const b = this.bases[t];
    return this.spawnUnit(t, 'bot', x ?? b.spawn.x + rand(-40, 40), y ?? b.spawn.y + rand(-20, 20));
  }
  unitName(u) {
    if (u.kind === 'human') { const p = this.players.get(u.owner); return p ? p.name : '?'; }
    if (u.cpu) return 'CPU ' + TEAM_NAMES[u.team];
    if (u.kind === 'monster') return 'Monster';
    if (u.kind === 'lord') return 'LORD';
    if (u.kind === 'chicken') return 'Ayam';
    if (u.kind === 'ufo') return 'UFO';
    if (VEHICLES[u.kind]) {
      const p = u.driver && this.players.get(u.driver.owner);
      return p ? p.name + ' (' + VEHICLES[u.kind].label + ')' : VEHICLES[u.kind].label + ' ' + TEAM_NAMES[u.team];
    }
    return u.kind === 'turret' ? 'Turret ' + TEAM_NAMES[u.team] : 'Bot ' + TEAM_NAMES[u.team];
  }
  removeUnit(u) {
    if (u.carry) {
      const c = this.crates.get(u.carry);
      if (c) {
        if (this.inPit(u.x, u.y)) this.crates.delete(c.id);
        else { c.state = 'ground'; c.z = 0; c.x = u.x; c.y = u.y; }
      }
      u.carry = 0;
    }
    if (u.holding) this.releaseHeld(this.units.get(u.holding));
    if (u.heldBy) { const h = this.units.get(u.heldBy); if (h) h.holding = 0; u.heldBy = 0; }
    this.units.delete(u.id);
  }
  // wide = di mana saja di peta (kiriman peti), bukan hanya zona tengah
  spawnCrate(instant = false, wide = false) {
    for (let tries = 0; tries < 30; tries++) {
      const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 9 * T;
      const x = wide ? rand(2 * T, W - 2 * T) : W / 2 + Math.cos(ang) * r, y = wide ? rand(2 * T, H - 2 * T) : H / 2 + Math.sin(ang) * r;
      if (this.solids.some(s => inRect(x, y, s, 24)) || this.inPit(x, y, -30)) continue;
      return this.createCrate(x, y, { metal: Math.random() < 0.22, z: instant ? 0 : 560, state: instant ? 'ground' : 'air', hit: false });
    }
  }
  createCrate(x, y, options = {}) {
    const c = { id: this.id(), x, y, z: 50, vx: 0, vy: 0, vz: 0, state: 'air', thrown: false, team: -1, by: 0, hit: true, metal: false, ...options };
    this.crates.set(c.id, c); return c;
  }
  tip(u, txt) { if (u.owner) this.events.push({ k: 'tip', p: u.owner, txt }); }
  padCount(t) { let n = 0; for (const id of this.pads[t]) if (id) n++; return n; }
  padMask(t) { return this.pads[t].reduce((m, id, i) => (id ? m | (1 << i) : m), 0); }
  // petak untuk peti yang ditaruh pemain: kolom yang dibidik dulu, lalu kolom terdekat; tingkat 2 hanya di atas peti
  pickSlot(u, col) {
    const pad = this.pads[u.team];
    if (col < 0) {
      const fx = u.x + Math.cos(u.a) * 30, fy = u.y + Math.sin(u.a) * 30;
      let bd = Infinity;
      for (let k = 0; k < 4; k++) { const s = this.slotPos(u.team, k), d = Math.hypot(s.x - fx, s.y - fy); if (d < bd) { bd = d; col = k; } }
    }
    for (const k of cellOrder(col)) { if (!pad[k]) return k; if (!pad[k + 4]) return k + 4; }
    return -1;
  }
  slotPos(t, i) {
    const b = this.bases[t], k = i % 4;
    return { x: b.pad.x + (k % 2 ? T / 2 : -T / 2), y: b.pad.y + (k < 2 ? -T / 2 : T / 2), z: i >= 4 ? CRATE_H : 0 };
  }

  // ---------------- aksi pemain ----------------
  action(u, k, col = -1) {
    if (u.kind === 'turret' || u.abducted || !this.units.has(u.id)) return;
    if (u.lord || u.kind === 'lord') { this.tip(u, 'LORD bertarung melee dan tidak bisa mengambil peti atau naik kendaraan.'); return; }
    if (VEHICLES[u.kind]) { // pengemudi: E keluar, Q tetap bisa merakit (kecuali senjata)
      if (k === 'grab') this.exitVehicle(u);
      else if (k === 'build') this.build(u);
      return;
    }
    if (k === 'grab') this.grab(u, col);
    else if (k === 'throw') u.holding ? this.throwUnit(u) : this.throwCrate(u);
    else if (k === 'build') this.build(u);
  }
  grab(u, col = -1) {
    if (u.lord || u.abducted) return;
    if (u.holding) { this.releaseHeld(this.units.get(u.holding)); return; } // E saat mengangkat teman = turunkan
    const b = this.bases[u.team];
    if (u.carry) {
      const c = this.crates.get(u.carry);
      if (c?.metal && dist(u, b.pad) < 72) { this.tip(u, 'Peti metal: lempar dengan F agar pecah menjadi 2 peti kayu.'); return; }
      u.carry = 0;
      if (!c) return;
      const pad = this.pads[u.team];
      // pemain memilih petak (pola resep); bot cukup mengisi petak kosong pertama (berjajar → L → rata)
      const slot = u.kind === 'human' ? this.pickSlot(u, col) : pad.indexOf(0);
      if (dist(u, b.pad) < 72 && slot >= 0) {
        const sp = this.slotPos(u.team, slot);
        pad[slot] = c.id; c.state = 'pad'; c.team = u.team; c.x = sp.x; c.y = sp.y; c.z = sp.z;
        this.events.push({ k: 'place', x: r1(sp.x), y: r1(sp.y) });
      } else {
        c.state = 'ground'; c.z = 0;
        c.x = u.x + Math.cos(u.a) * 22; c.y = u.y + Math.sin(u.a) * 22;
        for (const s of this.solids) pushOut(c, 14, s);
        if (this.inPit(c.x, c.y)) this.crates.delete(c.id); // jatuh ke lubang
      }
      return;
    }
    // E menukar senjata loot meski senjata lama belum habis.
    for (const pk of this.pickups.values()) if (Math.hypot(pk.x - u.x, pk.y - u.y) < 27) {
      this.pickups.delete(pk.id);
      if (u.weapon !== 'pistol') { const old = this.encounters.dropWeapon(u.x + 32, u.y, u.weapon, 20); if (old) old.ammo = u.ammo; }
      u.weapon = pk.w; u.ammo = pk.ammo; this.encounters.notifyMbgPickup(u, pk); return;
    }
    // ambil peti di tanah terdekat
    let best = null, bd = 44;
    for (const c of this.crates.values()) {
      if (c.state !== 'ground') continue;
      const d = dist(u, c);
      if (d < bd) { bd = d; best = c; }
    }
    // naik kendaraan kosong milik tim bila lebih dekat dari peti
    if (u.kind === 'human') {
      let veh = null, vd = 26;
      for (const v of this.units.values()) {
        if (!VEHICLES[v.kind] || v.team !== u.team || v.driver) continue;
        const d = dist(u, v) - v.r;
        if (d < vd) { vd = d; veh = v; }
      }
      if (veh && (!best || vd < bd)) { this.board(u, veh); return; }
    }
    if (!best) {
      // ambil peti teratas dari pad mana pun (termasuk mencuri dari musuh!)
      for (let t = 0; t < this.teams; t++) {
        if (dist(u, this.bases[t].pad) > 72) continue;
        const pad = this.pads[t];
        for (let i = 7; i >= 0; i--) if (pad[i]) { best = this.crates.get(pad[i]); pad[i] = 0; break; }
        if (best) { if (t !== u.team) this.events.push({ k: 'steal', t, by: u.team }); break; }
      }
    }
    if (!best) { this.grabUnit(u); return; } // terakhir: angkat pemain terdekat (hanya friendly fire)
    best.state = 'carried'; best.by = u.id; best.thrown = false;
    u.carry = best.id;
  }
  // ---------------- angkat & lempar pemain (friendly fire) ----------------
  // Korban memakai abducted < 0 (-id pengangkat): dilewati AI, gerak, tabrakan, lubang, peluru & damage seperti korban UFO.
  grabUnit(u) {
    if (!this.ff || u.kind !== 'human' || u.carry || u.holding) return;
    let v = null, bd = Infinity;
    for (const o of this.units.values()) {
      if (o.id === u.id || !isInf(o) || o.lord || o.abducted || o.holding || o.shield > 0) continue;
      const d = dist(u, o) - o.r - u.r;
      if (d < 8 && d < bd) { bd = d; v = o; }
    }
    if (!v) return;
    if (v.carry) { // peti yang dibawa korban jatuh
      const c = this.crates.get(v.carry);
      if (c) { c.state = 'ground'; c.z = 0; c.x = v.x; c.y = v.y; }
      v.carry = 0;
    }
    u.holding = v.id; v.heldBy = u.id; v.abducted = -u.id; v.holdT = HOLD_MAX;
    v.in = { mx: 0, my: 0, a: v.a, fire: false }; v.moving = false;
    this.events.push({ k: 'board', x: r1(v.x), y: r1(v.y) });
    this.tip(v, this.unitName(u) + ' mengangkatmu!');
  }
  // Lepas korban dengan lembut di depan pengangkat (jatuh ke lubang = tewas, kredit ke pengangkat)
  releaseHeld(v) {
    if (!v) return;
    const h = this.units.get(v.heldBy);
    v.abducted = 0; v.heldBy = 0; v.lift = 0; v.holdT = 0;
    if (!h) return;
    if (h.holding === v.id) h.holding = 0;
    v.x = h.x + Math.cos(h.a) * 22; v.y = h.y + Math.sin(h.a) * 22;
    for (const s of this.solids) pushOut(v, v.r, s);
    v.x = clamp(v.x, T, W - T); v.y = clamp(v.y, T, H - T);
    if (this.inPit(v.x, v.y, 6)) { this.events.push({ k: 'fall', x: r1(v.x), y: r1(v.y) }); this.kill(v, h.id, true); }
  }
  throwUnit(u) {
    const v = this.units.get(u.holding);
    if (!v) { u.holding = 0; return; }
    u.holding = 0; v.heldBy = 0; // abducted tetap < 0 selama terbang
    v.flight = { vx: Math.cos(u.a) * THROW_UNIT.speed, vy: Math.sin(u.a) * THROW_UNIT.speed, vz: THROW_UNIT.vz, by: u.id, hit: false };
    v.lift = CARRY_Z; v.holdT = 0;
    v.x = u.x + Math.cos(u.a) * 14; v.y = u.y + Math.sin(u.a) * 14;
  }
  // Korban yang diangkat mengikuti pengangkat; korban yang dilempar terbang lalu mendarat
  tickHeld(dt) {
    for (const v of [...this.units.values()]) {
      if (!this.units.has(v.id)) continue;
      if (v.heldBy) {
        const h = this.units.get(v.heldBy);
        if (!h || h.holding !== v.id || h.lord || h.abducted > 0 || (v.holdT -= dt) <= 0) { this.releaseHeld(v); continue; }
        v.x = h.x + Math.cos(h.a) * 14; v.y = h.y + Math.sin(h.a) * 14; v.lift = HOLD_Z;
      } else if (v.flight) {
        const f = v.flight;
        f.vz -= 900 * dt; v.lift += f.vz * dt;
        this.eventMove(v, f.vx * dt, f.vy * dt, v.r);
        if (!f.hit && v.lift < 40) {
          for (const o of this.units.values()) {
            if (o.id === v.id || o.id === f.by || o.team < 0 || o.fly || o.neutral || o.abducted || Math.hypot(o.x - v.x, o.y - v.y) >= o.r + v.r) continue;
            f.hit = true; f.vx *= -0.25; f.vy *= -0.25;
            this.events.push({ k: 'bonk', x: r1(o.x), y: r1(o.y) });
            this.damage(o, THROW_UNIT.hitDmg, f.by);
            break;
          }
        }
        if (v.lift > 0) continue;
        v.lift = 0; v.flight = null; v.abducted = 0;
        v.x = clamp(v.x, T, W - T); v.y = clamp(v.y, T, H - T);
        if (this.inPit(v.x, v.y, 6)) { this.events.push({ k: 'fall', x: r1(v.x), y: r1(v.y) }); this.kill(v, f.by, true); continue; }
        this.events.push({ k: 'land', x: r1(v.x), y: r1(v.y) });
        this.damage(v, THROW_UNIT.selfDmg, f.by);
      }
    }
  }
  // Unit pemain disimpan di kendaraan (keluar dari daftar unit); input pemain diarahkan ke kendaraan
  board(u, v) {
    if (u.lord || u.abducted || v.neutral || u.team !== v.team) return;
    this.units.delete(u.id);
    v.driver = u; v.owner = u.owner; v.ai.path = null;
    const p = this.players.get(u.owner);
    if (p) p.unitId = v.id;
    this.events.push({ k: 'board', x: r1(v.x), y: r1(v.y) });
  }
  exitVehicle(v) {
    const h = v.driver;
    if (!h) return;
    v.driver = null; v.owner = 0;
    v.in = { mx: 0, my: 0, a: v.a, fire: false };
    const a = v.hull + Math.PI / 2;
    h.x = v.x + Math.cos(a) * (v.r + 18); h.y = v.y + Math.sin(a) * (v.r + 18);
    for (const s of this.solids) pushOut(h, h.r, s);
    h.x = clamp(h.x, T, W - T); h.y = clamp(h.y, T, H - T);
    h.a = v.a; h.in = { mx: 0, my: 0, a: v.a, fire: false };
    this.units.set(h.id, h);
    const p = this.players.get(h.owner);
    if (p) p.unitId = h.id;
    return h;
  }
  throwCrate(u) {
    if (!u.carry) return;
    const c = this.crates.get(u.carry);
    u.carry = 0;
    if (!c) return;
    Object.assign(c, { state: 'air', thrown: true, team: u.team, by: u.id, hit: false, x: u.x, y: u.y, z: CARRY_Z, vx: Math.cos(u.a) * 430, vy: Math.sin(u.a) * 430, vz: 240 });
  }
  // Apa yang dirakit dari isi pad tim t sekarang (null = belum bisa). Dipakai tombol Q, bot, dan label HUD.
  // what: 'weapon' (w = senjata resep, kosong = acak), 'buddy', 'elite', 'turret'/'tank'/'jeep', atau array = pilih acak.
  plan(t) {
    const n = this.padCount(t);
    if (!n) return null;
    const order = this.orders[t].build, want = this.buildWant(t), pat = matchRecipe(this.padMask(t));
    if (want && n < want) return null; // tunggu sampai peti cukup untuk rakitan yang diperintahkan
    if (want === 8) return { what: order, take: 8 };
    if (want === 4) return pat === 'elite' ? { what: 'elite', take: 5 } : { what: 'buddy', take: 4 };
    if (RECIPE_WEAPON[pat]) return { what: 'weapon', w: RECIPE_WEAPON[pat], take: n }; // pola senjata (otomatis / perintah senjata)
    if (want === 1) return { what: 'weapon', take: 1 };
    // otomatis: 8 peti jadi turret / tank / jeep acak (yang belum penuh)
    const big = ['turret', 'tank', 'jeep'].filter(k => this.canBuild(t, k));
    if (n >= 8 && big.length) return { what: big, take: 8 };
    const buddy = this.canBuild(t, 'buddy');
    if (pat === 'elite' && buddy) return { what: 'elite', take: 5 };
    if (n >= 4 && buddy) return { what: 'buddy', take: 4 };
    return { what: 'weapon', take: 1 };
  }
  planLabel(t) {
    const p = this.plan(t);
    if (!p) return '';
    if (Array.isArray(p.what)) return p.what.map(k => BUILD_LABEL[k]).join('/');
    return p.what === 'weapon' ? (p.w ? WEAPONS[p.w].label : 'Senjata acak') : BUILD_LABEL[p.what];
  }
  build(u) {
    if (u.lord || u.abducted) return;
    const b = this.bases[u.team];
    if (dist(u, b.pad) > 84) return;
    const pad = this.pads[u.team];
    const p = this.plan(u.team);
    if (!p) return;
    let what = p.what;
    if (Array.isArray(what)) what = what[(Math.random() * what.length) | 0];
    if (what === 'weapon' && !isInf(u)) return; // pengemudi tidak bisa memakai senjata tangan
    // ambil peti dari atas dulu (pola resep memakai semua peti di pad)
    const take = k => { for (let i = 7; i >= 0 && k > 0; i--) if (pad[i]) { this.crates.delete(pad[i]); pad[i] = 0; k--; } };
    if (what === 'turret') {
      take(8);
      const turrets = [...this.units.values()].filter(v => v.team === u.team && v.kind === 'turret').length;
      const off = [[2.2, 0], [0, 2.2], [2.2, 2.2]][turrets];
      const tu = this.spawnUnit(u.team, 'turret', b.pad.x + b.dx * off[0] * T, b.pad.y + b.dy * (off[1] * T - T * 0.4));
      this.events.push({ k: 'build', t: u.team, w: 'Turret!', x: r1(tu.x), y: r1(tu.y) });
    } else if (VEHICLES[what]) {
      take(8);
      const v = this.spawnUnit(u.team, what, b.pad.x + rand(-10, 10), b.pad.y + b.dy * T * 2);
      this.events.push({ k: 'build', t: u.team, w: VEHICLES[what].label + '!', x: r1(v.x), y: r1(v.y) });
    } else if (what === 'buddy' || what === 'elite') {
      take(p.take);
      const bot = this.spawnBot(u.team, b.pad.x + rand(-20, 20), b.pad.y + b.dy * T * 1.6);
      if (what === 'elite') {
        const w = ELITE_WEAPONS[(Math.random() * ELITE_WEAPONS.length) | 0];
        bot.elite = true; bot.hp = bot.max = ELITE_HP; bot.weapon = w; bot.ammo = WEAPONS[w].ammo * 2;
      }
      this.events.push({ k: 'build', t: u.team, w: what === 'elite' ? 'Buddy Elit!' : 'Buddy baru!', x: r1(b.pad.x), y: r1(b.pad.y) });
    } else {
      take(p.take);
      const roll = Math.random();
      const w = p.w || (roll < 0.45 ? 'smg' : roll < 0.8 ? 'shotgun' : 'bazooka');
      u.weapon = w; u.ammo = WEAPONS[w].ammo;
      this.events.push({ k: 'build', t: u.team, w: WEAPONS[w].label.toUpperCase() + '!', x: r1(b.pad.x), y: r1(b.pad.y) });
    }
  }

  // kendaraan yang melaju menabrak infanteri musuh
  ram(v, u) {
    const veh = VEHICLES[v.kind];
    if (!veh || !v.moving || !isInf(u) || this.time - (u.ramT || 0) < 0.6) return;
    u.ramT = this.time;
    this.events.push({ k: 'bonk', x: r1(u.x), y: r1(u.y) });
    this.damage(u, veh.ram, v.id);
  }

  // ---------------- tembak & damage ----------------
  fire(u) {
    if (u.abducted || u.neutral) return;
    if (u.lord || u.lordBoss) { this.encounters.melee(u); return; }
    const w = WEAPONS[u.weapon];
    const player = u.kind === 'human' || !!u.driver;
    u.cd = w.rate * (u.kind === 'bot' || (VEHICLES[u.kind] && !player) ? 1.6 : 1);
    const err = player ? 0 : (Math.random() - 0.5) * 0.22;
    const high = 1 + Math.min(0.3, this.heightAt(u.x, u.y) / 150); // posisi tinggi: peluru terbang lebih jauh
    for (let i = 0; i < w.pellets; i++) {
      const a = u.a + err + (Math.random() - 0.5) * 2 * w.spread;
      const sp = w.speed * (w.pellets > 1 ? rand(0.85, 1.1) : 1);
      this.bullets.push({ id: this.id(), x: u.x + Math.cos(u.a) * (u.r + 4), y: u.y + Math.sin(u.a) * (u.r + 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, team: u.team, dmg: w.dmg, life: w.life * high, rocket: !!w.rocket, splash: w.splash || 0, owner: u.id, fx: w.fx || 0, hits: w.pierce ? new Set() : null });
    }
    if (u.ammo !== Infinity && --u.ammo <= 0) { u.weapon = 'pistol'; u.ammo = Infinity; }
  }
  // Friendly fire: true bila serangan tim `team` dari `ownerId` boleh melukai unit `u` yang satu tim (bukan pemiliknya sendiri)
  friendly(team, ownerId, u) { return this.ff && team >= 0 && ownerId !== u.id; }
  damage(u, dmg, attackerId) {
    if (!this.units.has(u.id) || u.shield > 0 || u.neutral || u.abducted) return;
    if (attackerId) { u.lastHit = attackerId; u.lastHitT = this.time; } // untuk kredit bila nanti jatuh ke lubang
    u.hp -= dmg;
    if (u.hp <= 0) this.kill(u, attackerId);
  }
  kill(u, attackerId, fell = false) {
    if (!this.units.has(u.id)) return;
    if (!u.lord && u.weapon !== 'pistol' && isInf(u) && !fell) {
      this.pickups.set(this.id(), { id: this.nextId - 1, x: u.x, y: u.y, w: u.weapon, ammo: u.ammo, ttl: 20 });
    }
    if (VEHICLES[u.kind]) {
      // kendaraan meledak; pengemudi terlempar keluar dalam keadaan luka (ikut jatuh bila di lubang)
      if (!fell) this.events.push({ k: 'boom', x: r1(u.x), y: r1(u.y), r: 60 });
      const h = this.exitVehicle(u);
      if (h) { h.hp = Math.min(h.hp, 40); if (fell) { h.x = u.x; h.y = u.y; this.kill(h, attackerId, true); } }
    }
    if (u.kind === 'monster') {
      this.monsterTimer = MONSTER.respawn;
      this.events.push({ k: 'evt', name: 'Monster tumbang!', d: `8 peti (2 metal) + Bazooka, Minigun, Laser! Kembali dalam ${MONSTER.respawn} detik.` });
    }
    const carriedCrate = u.carry;
    this.removeUnit(u);
    const killer = this.units.get(attackerId);
    this.encounters.onKill(u, killer, fell, carriedCrate);
    this.events.push({ k: 'kill', a: killer ? this.unitName(killer) : '', ta: killer ? killer.team : -1, b: this.unitName(u), tb: u.team, x: r1(u.x), y: r1(u.y), f: fell ? 1 : 0 });
    if (u.kind === 'human') {
      const p = this.players.get(u.owner);
      if (p) { p.deaths++; p.unitId = 0; p.respawn = RESPAWN; }
    }
    // termasuk pemain di kendaraan; teamkill (friendly fire) tidak menambah skor
    if (killer && killer.owner && !(killer.team === u.team && killer !== u)) { const p = this.players.get(killer.owner); if (p) p.kills++; }
  }
  damageHQ(t, dmg) {
    if (!this.alive[t] || this.state !== 'playing') return;
    this.hq[t] -= dmg;
    if (this.hq[t] > 0) return;
    this.hq[t] = 0; this.alive[t] = false;
    const b = this.bases[t];
    this.events.push({ k: 'hq', t, x: r1(b.hq.x + b.hq.w / 2), y: r1(b.hq.y + b.hq.h / 2) });
    // diulang karena kendaraan yang hancur mengeluarkan pengemudinya
    for (let left; (left = [...this.units.values()].filter(u => u.team === t)).length;) for (const u of left) this.kill(u, 0);
    const pad = this.pads[t];
    for (let i = 0; i < 8; i++) if (pad[i]) {
      const c = this.crates.get(pad[i]);
      pad[i] = 0;
      if (c) Object.assign(c, { state: 'air', thrown: false, z: 30, vz: 300, vx: rand(-200, 200), vy: rand(-200, 200) });
    }
    this.checkWin();
  }
  // ---------------- monster & event ----------------
  thinkMonster(u, dt) {
    const ai = u.ai, cx = W / 2, cy = H / 2, rage = u.rage > 0;
    if (rage) u.rage -= dt;
    ai.slamCd -= dt; ai.rockCd -= dt; ai.t -= dt;
    u.spd = 0;
    // ancang-ancang (telegraf) sebelum serangan supaya bisa dihindari
    if (ai.wind > 0) {
      ai.wind -= dt;
      u.in = { mx: 0, my: 0, a: u.a, fire: false };
      if (ai.wind <= 0) {
        if (ai.act === 1) this.slam(u); else this.throwRock(u, ai.tx, ai.ty);
        u.anim = 0;
      }
      return;
    }
    // sasaran: unit tim mana pun yang berada di zona peti
    let tgt = null, bd = 520;
    for (const v of this.units.values()) {
      if (v.team < 0 || Math.hypot(v.x - cx, v.y - cy) > ZONE_R + 60) continue;
      const d = dist(u, v);
      if (d < bd) { bd = d; tgt = v; }
    }
    let mx = 0, my = 0, a = u.a;
    if (tgt) {
      a = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      const reach = u.r + tgt.r + 24;
      if (bd < reach + 12 && ai.slamCd <= 0) {
        ai.wind = rage ? 0.3 : 0.55; ai.act = 1; u.anim = 1; ai.slamCd = rage ? 1 : 1.8;
      } else if (bd > 150 && ai.rockCd <= 0 && this.los(u.x, u.y, tgt.x, tgt.y)) {
        ai.wind = rage ? 0.3 : 0.5; ai.act = 2; u.anim = 2; ai.tx = tgt.x; ai.ty = tgt.y; ai.rockCd = rage ? 1.6 : 3.2;
      } else if (bd > reach) { mx = (tgt.x - u.x) / bd; my = (tgt.y - u.y) / bd; u.spd = rage ? 1.6 : 1; }
    } else {
      // berkeliaran pelan di dalam zona
      if (!ai.goal || dist(u, ai.goal) < 20 || ai.t <= 0) {
        const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ZONE_R * 0.55;
        ai.goal = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }; ai.t = rand(3, 6);
      }
      const d = dist(u, ai.goal) || 1;
      mx = (ai.goal.x - u.x) / d; my = (ai.goal.y - u.y) / d; u.spd = 0.45;
      a = Math.atan2(my, mx);
    }
    // tali kekang: tidak pernah jauh dari zona
    const dc = Math.hypot(u.x - cx, u.y - cy);
    if (dc > ZONE_R + 40) { mx = (cx - u.x) / dc; my = (cy - u.y) / dc; u.spd = 1; }
    if (this.inPit(u.x + mx * 40, u.y + my * 40, -u.r)) { mx = 0; my = 0; }
    u.in = { mx, my, a, fire: false };
  }
  slam(u) {
    this.events.push({ k: 'slam', x: r1(u.x), y: r1(u.y), r: MONSTER.slamR });
    for (const v of [...this.units.values()]) {
      if (v.team < 0 || v.kind === 'turret') continue;
      const d = dist(u, v);
      if (d > MONSTER.slamR + v.r) continue;
      // terpental menjauh — bisa terlempar ke lubang!
      const k = (60 / mass(v)) * (u.rage > 0 ? 1.5 : 1);
      v.x += ((v.x - u.x) / (d || 1)) * k; v.y += ((v.y - u.y) / (d || 1)) * k;
      this.damage(v, MONSTER.slam * (u.rage > 0 ? 1.4 : 1), u.id);
    }
  }
  throwRock(u, tx, ty) {
    const d = Math.hypot(tx - u.x, ty - u.y) || 1, sp = 360;
    this.bullets.push({ id: this.id(), x: u.x + ((tx - u.x) / d) * (u.r + 6), y: u.y + ((ty - u.y) / d) * (u.r + 6), vx: ((tx - u.x) / d) * sp, vy: ((ty - u.y) / d) * sp,
      team: -1, dmg: MONSTER.rock, life: d / sp, rocket: true, rock: true, splash: 55, owner: u.id });
  }
  // Pemilihan paksa hanya untuk tes lokal; tidak ada perintah event dari client.
  randomEvent(forced = null) {
    const mon = this.monster();
    if (this.state !== 'playing' || this.arenaEvents.active || this.meteors.length || (mon && mon.rage > 0)) return false;
    if (forced && !this.isEventEnabled(forced)) return false;
    const opts = ['meteor', 'meteor', 'supply', ...(mon ? ['rage'] : []), ...Object.keys(EVENT_RULES)].filter(kind => this.isEventEnabled(kind));
    if (!opts.length) return false;
    const k = forced || opts[(Math.random() * opts.length) | 0];
    if (Object.hasOwn(EVENT_RULES, k)) return this.arenaEvents.start(k);
    if (!opts.includes(k)) return false;
    if (k === 'meteor') {
      // separuh meteor mengincar posisi unit, separuh acak — semuanya diberi tanda peringatan dulu
      const targets = [...this.units.values()].filter(v => v.team >= 0);
      const n = 7 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) {
        const v = i % 2 === 0 && targets.length ? targets[(Math.random() * targets.length) | 0] : null;
        const x = v ? v.x + rand(-60, 60) : rand(2 * T, W - 2 * T), y = v ? v.y + rand(-60, 60) : rand(2 * T, H - 2 * T);
        this.meteors.push({ id: this.id(), x: clamp(x, T, W - T), y: clamp(y, T, H - T), t: 2 + i * 0.75, r: 70 });
      }
      this.events.push({ k: 'evt', name: 'Hujan meteor!', d: 'Menjauh dari lingkaran merah' });
    } else if (k === 'supply') {
      for (let i = 0; i < 10; i++) this.spawnCrate(false, true);
      this.events.push({ k: 'evt', name: 'Kiriman peti!', d: '10 peti jatuh di seluruh peta' });
    } else {
      mon.rage = 15;
      this.events.push({ k: 'evt', name: 'Monster mengamuk!', d: 'Lebih cepat & lebih kuat selama 15 detik' });
    }
    return true;
  }

  eventMove(body, dx, dy, radius) {
    const tx = clamp(body.x + dx, T + radius, W - T - radius);
    const ty = clamp(body.y + dy, T + radius, H - T - radius);
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - body.x, ty - body.y) / 8));
    const sx = (tx - body.x) / steps, sy = (ty - body.y) / steps;
    for (let i = 0; i < steps; i++) {
      body.x += sx; body.y += sy;
      for (const s of this.solids) pushOut(body, radius, s);
      body.x = clamp(body.x, T + radius, W - T - radius);
      body.y = clamp(body.y, T + radius, H - T - radius);
    }
  }

  explode(x, y, r, dmg, team, attackerId) {
    this.events.push({ k: 'boom', x: r1(x), y: r1(y), r });
    for (const u of [...this.units.values()]) {
      if (u.team === team && !this.friendly(team, attackerId, u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < r + u.r) this.damage(u, dmg * (1 - (d / (r + u.r)) * 0.5), attackerId);
    }
    for (const b of this.bases) if (b.team !== team && rectDist(x, y, b.hq) < r) this.damageHQ(b.team, dmg * 0.8);
  }
  checkWin() {
    if (this.state !== 'playing') return;
    const alive = this.alive.map((a, t) => (a ? t : -1)).filter(t => t >= 0);
    if (alive.length <= 1) this.endRound(alive.length ? alive[0] : -1);
  }
  endRound(winner) {
    this.state = 'ended'; this.winner = winner; this.endTimer = 10;
    this.events.push({ k: 'win', t: winner });
  }

  // ---------------- AI ----------------
  // pad > 0 = cek jalur gerak (badan unit): lubang juga menghalangi; pad 0 = garis pandang/tembak (lubang tidak)
  los(x1, y1, x2, y2, ignore = null, pad = 0) {
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 12);
    for (let i = 1; i < n; i++) {
      const px = x1 + ((x2 - x1) * i) / n, py = y1 + ((y2 - y1) * i) / n;
      for (const s of this.solids) if (s !== ignore && inRect(px, py, s, pad)) return false;
      if (pad && this.inPit(px, py, -pad - 4)) return false;
    }
    return true;
  }
  findPath(sx, sy, gx, gy) {
    const s = { x: clamp((sx / T) | 0, 0, MW - 1), y: clamp((sy / T) | 0, 0, MH - 1) };
    const g = { x: clamp((gx / T) | 0, 0, MW - 1), y: clamp((gy / T) | 0, 0, MH - 1) };
    const si = s.y * MW + s.x, gi = g.y * MW + g.x, gBlocked = this.blocked[gi];
    const prev = this.pathPrev, q = this.pathQueue, visited = this.pathVisited;
    if (++this.pathEpoch >= 0xffffffff) { visited.fill(0); this.pathEpoch = 1; }
    const epoch = this.pathEpoch;
    let h = 0, tl = 0, found = -1;
    prev[si] = si; visited[si] = epoch; q[tl++] = si;
    while (h < tl) {
      const c = q[h++], cx = c % MW, cy = (c / MW) | 0;
      if (c === gi || (gBlocked && Math.max(Math.abs(cx - g.x), Math.abs(cy - g.y)) <= 1)) { found = c; break; }
      for (const [dx, dy] of DIRS4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const ni = ny * MW + nx;
        if (visited[ni] === epoch || this.blocked[ni]) continue;
        prev[ni] = c; visited[ni] = epoch; q[tl++] = ni;
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let c = found; c !== si; c = prev[c]) out.push({ x: ((c % MW) + 0.5) * T, y: (((c / MW) | 0) + 0.5) * T });
    return out.reverse();
  }
  findEnemy(u, range) {
    let best = null, bd = range;
    for (const v of this.units.values()) {
      if (v.team === u.team || v.neutral || v.abducted) continue;
      const d = dist(u, v);
      if (d < bd && this.los(u.x, u.y, v.x, v.y)) { bd = d; best = v; }
    }
    return best;
  }
  think(u, dt) {
    const ai = u.ai, b = this.bases[u.team];
    const w = WEAPONS[u.weapon];
    const range = Math.min(w.speed * w.life * 0.85, 420);
    ai.t -= dt; ai.strafeT -= dt; ai.repath -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rand(0.8, 1.8); ai.strafe = Math.random() < 0.5 ? -1 : 1; }

    if (ai.t <= 0) {
      ai.t = rand(0.22, 0.32);
      if (u.kind === 'bot' && ai.role !== 'gather') {
        let has = false;
        for (const v of this.units.values()) if (v.team === u.team && v.ai && v.ai.role === 'gather') { has = true; break; }
        if (!has) ai.role = 'gather';
      }
      const tgt = this.findEnemy(u, u.kind === 'turret' ? 430 : 400);
      let goal = null, aim = null, fire = false;
      if (tgt) { aim = { x: tgt.x, y: tgt.y }; fire = !u.carry && dist(u, tgt) < (u.kind === 'turret' ? 430 : range); }
      if (u.kind !== 'turret') {
        const padN = this.padCount(u.team);
        const dPad = dist(u, b.pad);
        if (u.carry) {
          goal = b.pad;
          if (dPad < 46) { this.action(u, this.crates.get(u.carry)?.metal ? 'throw' : 'grab'); goal = null; }
        } else if (tgt && (ai.role !== 'gather' || dist(u, tgt) < 230) && !(this.orders[u.team].mode === 'defend' && dist(tgt, b.spawn) > 340)) {
          const d = dist(u, tgt);
          if (d > range * 0.75) goal = tgt;
          else {
            const ang = Math.atan2(tgt.y - u.y, tgt.x - u.x) + (Math.PI / 2) * ai.strafe;
            goal = { x: u.x + Math.cos(ang) * 60, y: u.y + Math.sin(ang) * 60, direct: true };
          }
        } else {
          let done = false;
          const ord = this.orders[u.team], want = this.buildWant(u.team);
          if (ai.role === 'gather') {
            const ready = want ? padN >= want : padN >= 4 || (padN >= 1 && u.weapon === 'pistol' && Math.random() < 0.08);
            if (ready) {
              goal = b.pad; done = true;
              if (dPad < 70) { this.action(u, 'build'); goal = null; }
            } else {
              let best = null, bd = 1e9;
              for (const c of this.crates.values()) {
                if (c.state !== 'ground') continue;
                let claimed = false;
                for (const v of this.units.values()) if (v !== u && v.team === u.team && v.ai && v.ai.claim === c.id) { claimed = true; break; }
                if (claimed) continue;
                const d = dist(u, c);
                if (d < bd) { bd = d; best = c; }
              }
              if (best) {
                ai.claim = best.id; goal = best; done = true;
                if (bd < 32) { this.action(u, 'grab'); goal = b.pad; }
              } else ai.claim = 0;
            }
          }
          if (!done && ai.role === 'escort' && ord.mode === 'follow') {
            let leader = null, ld = 1e9;
            for (const v of this.units.values()) if (v.team === u.team && (v.kind === 'human' || v.driver) && v !== u) { const d = dist(u, v); if (d < ld) { ld = d; leader = v; } }
            if (leader) { done = true; if (ld > 110) goal = leader; }
          }
          if (!done && ord.mode === 'defend') {
            // jaga di depan markas; musuh yang mendekat sudah ditangani cabang "tgt" di atas
            done = true;
            if (!ai.post) ai.post = { x: b.spawn.x + rand(-50, 50), y: b.spawn.y + rand(-40, 40) };
            if (dist(u, ai.post) > 30) goal = ai.post;
          } else ai.post = null;
          if (!done) {
            // serang markas sesuai perintah (atau musuh terdekat yang masih hidup)
            const eb = this.targetBase(u);
            if (eb) {
              const c = { x: eb.hq.x + eb.hq.w / 2, y: eb.hq.y + eb.hq.h / 2 };
              if (rectDist(u.x, u.y, eb.hq) < range && this.los(u.x, u.y, c.x, c.y, eb.hq)) {
                if (!aim) { aim = c; fire = true; }
              } else goal = eb.pad;
            }
          }
        }
      }
      const escape = this.arenaEvents.escapeGoal(u);
      if (!escape && isInf(u) && !u.carry) {
        const drop = [...this.encounters.airdrops.values()].filter(d => d.team < 0 && dist(d, u) < 650).sort((a, b) => dist(a, u) - dist(b, u))[0];
        if (drop) goal = drop;
      }
      if (escape) { goal = escape; fire = false; ai.path = null; }
      ai.goal = goal; ai.aim = aim; ai.fire = fire;
    }

    // gerak mengikuti path
    let mx = 0, my = 0;
    const goal = ai.goal;
    if (goal && u.kind !== 'turret' && dist(u, goal) > 18) {
      let tx = goal.x, ty = goal.y;
      if (!goal.direct && !this.los(u.x, u.y, goal.x, goal.y, null, u.r)) {
        const key = ((goal.x / T) | 0) + ',' + ((goal.y / T) | 0);
        if (!ai.path || ai.pkey !== key || ai.repath <= 0) {
          ai.path = this.findPath(u.x, u.y, goal.x, goal.y); ai.pi = 0; ai.pkey = key; ai.repath = 1;
        }
        if (ai.path && ai.path.length) {
          while (ai.pi < ai.path.length - 1 && dist(u, ai.path[ai.pi]) < 14) ai.pi++;
          for (let k = Math.min(ai.path.length - 1, ai.pi + 5); k > ai.pi; k--) {
            if (this.los(u.x, u.y, ai.path[k].x, ai.path[k].y, null, u.r)) { ai.pi = k; break; }
          }
          tx = ai.path[ai.pi].x; ty = ai.path[ai.pi].y;
        }
      } else ai.path = null;
      const d = Math.hypot(tx - u.x, ty - u.y) || 1;
      mx = (tx - u.x) / d; my = (ty - u.y) / d;
      // pengaman: jangan melangkah ke tepi lubang (mis. saat menghindar ke samping)
      if (this.inPit(u.x + mx * (u.r + 16), u.y + my * (u.r + 16), -6)) { mx = 0; my = 0; ai.path = null; }
    }
    let a = u.a;
    if (ai.aim) a = Math.atan2(ai.aim.y - u.y, ai.aim.x - u.x);
    else if (mx || my) a = Math.atan2(my, mx);
    u.in = { mx, my, a, fire: ai.fire && !!ai.aim };
  }

  // ---------------- loop ----------------
  tick() {
    const dt = TICK;
    this.time += dt;
    if (this.state === 'lobby' || this.state === 'countdown') {
      this.lobbyTick(dt);
      this.broadcast();
      return;
    }
    if (this.state === 'ended') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.toLobby();
      this.broadcast();
      return;
    }
    this.roundLeft -= dt;
    if (this.roundLeft <= 0) {
      let best = -1, bh = -1;
      this.hq.forEach((h, t) => { if (this.alive[t] && h > bh) { bh = h; best = t; } });
      this.endRound(best);
    }

    for (const p of this.players.values()) {
      const u = this.units.get(p.unitId);
      if (!u) {
        p.unitId = 0;
        if (this.alive[p.team] && (p.respawn -= dt) <= 0) {
          const b = this.bases[p.team];
          p.unitId = this.spawnUnit(p.team, 'human', b.spawn.x + rand(-30, 30), b.spawn.y + rand(-15, 15), p.id).id;
        }
      } else {
        u.in = p.input;
        for (const a of p.acts) this.action(u, a.k, a.c);
      }
      p.acts.length = 0;
    }
    // komandan CPU muncul lagi seperti pemain bila tewas
    for (let t = 0; t < this.teams; t++) {
      if (!this.cpuTeam[t] || !this.alive[t]) continue;
      let has = false;
      for (const u of this.units.values()) if (u.cpu && u.team === t) { has = true; break; }
      if (has) this.cpuRespawn[t] = RESPAWN;
      else if ((this.cpuRespawn[t] -= dt) <= 0) this.spawnCpu(t);
    }

    // peti jatuh dari langit
    if ((this.crateTimer -= dt) <= 0) {
      this.crateTimer = rand(1.0, 1.6);
      let loose = 0;
      for (const c of this.crates.values()) if (c.state === 'ground' || c.state === 'air' || c.state === 'washed') loose++;
      if (loose < 18 + 4 * this.teams) this.spawnCrate();
    }

    // event acak, meteor, monster muncul lagi
    if ((this.evtTimer -= dt) <= 0) {
      while (this.pendingFirstEvent && !this.isEventEnabled(this.pendingFirstEvent)) this.pendingFirstEvent = this.previewQueue.shift() || null;
      if (!this.eventsEnabled || !this.eventMask) {
        this.pendingFirstEvent = null; this.previewQueue = []; this.evtTimer = rand(45, 75);
      } else if (this.randomEvent(this.pendingFirstEvent)) {
        this.pendingFirstEvent = this.previewQueue.shift() || null;
        this.evtTimer = this.pendingFirstEvent ? (this.arenaEvents.active.warn + this.arenaEvents.active.duration + 6) : rand(45, 75);
      } else this.evtTimer = 1; // temporarily unavailable (e.g. only rage enabled while monster is dead)
    }
    for (const m of this.meteors) if ((m.t -= dt) <= 0) this.explode(m.x, m.y, m.r, 55, -2, 0);
    this.meteors = this.meteors.filter(m => m.t > 0);
    if (!this.monster() && (this.monsterTimer -= dt) <= 0) {
      this.spawnMonster();
      this.events.push({ k: 'evt', name: 'Monster kembali!', d: 'Zona peti kembali dijaga' });
    }

    for (const u of this.units.values()) {
      if (u.abducted || u.neutral || u.kind === 'ufo') continue;
      if (u.kind === 'monster') this.thinkMonster(u, dt);
      else if (u.kind === 'chicken') this.encounters.thinkChicken(u, dt);
      else if (u.lordBoss || (u.lord && u.ai)) this.encounters.thinkLord(u, dt);
      else if (u.ai && !u.driver) this.think(u, dt);
    }

    this.arenaEvents.tick(dt);
    this.encounters.tickDrops(dt);

    for (const u of this.units.values()) {
      if (u.abducted || u.fly || u.neutral) { u.moving = false; continue; }
      if (u.kind !== 'monster' && u.anim > 0) u.anim = Math.max(0, u.anim - dt);
      if (u.kind !== 'turret') {
        let { mx, my } = u.in;
        const l = Math.hypot(mx, my);
        if (l > 1) { mx /= l; my /= l; }
        const veh = VEHICLES[u.kind];
        let sp = veh ? veh.speed : u.kind === 'monster' ? MONSTER.speed * u.spd : u.lordBoss ? 110 : u.lord ? 185 : u.kind === 'chicken' ? 210 : u.carry || u.holding ? 112 : 165;
        if (u.kind !== 'monster' && this.heightAt(u.x, u.y) > 8) sp *= 0.78; // mendaki bukit lebih lambat
        u.moving = l > 0.1 && sp > 0;
        if (veh && u.moving) {
          // badan kendaraan berputar pelan ke arah gerak; melambat selama belum menghadap
          let d = Math.atan2(my, mx) - u.hull;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          u.hull += clamp(d, -veh.turn * dt, veh.turn * dt);
          sp *= 0.35 + 0.65 * Math.max(0, Math.cos(d));
        }
        u.x += mx * sp * dt; u.y += my * sp * dt;
      }
      u.a = u.in.a;
      u.cd -= dt;
      if (u.shield > 0) u.shield -= dt;
      if (u.in.fire && !u.carry && !u.holding && u.cd <= 0) this.fire(u);
      if (isInf(u) && !u.lord && u.weapon === 'pistol') {
        for (const pk of this.pickups.values()) {
          if (Math.hypot(pk.x - u.x, pk.y - u.y) < 26) { u.weapon = pk.w; u.ammo = pk.ammo; this.pickups.delete(pk.id); this.encounters.notifyMbgPickup(u, pk); break; }
        }
      }
    }
    // pemisahan antar unit + tabrakan dinding
    const list = [...this.units.values()].filter(u => !u.abducted && !u.fly);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), R = a.r + b.r;
      if (d >= R || d === 0) continue;
      const ma = mass(a), mb = mass(b);
      if (ma === Infinity && mb === Infinity) continue;
      // yang lebih berat terdorong lebih sedikit
      const fa = ma === Infinity ? 0 : mb === Infinity ? 1 : mb / (ma + mb), o = R - d, nx = dx / d, ny = dy / d;
      a.x -= nx * o * fa; a.y -= ny * o * fa;
      b.x += nx * o * (1 - fa); b.y += ny * o * (1 - fa);
      if (a.team !== b.team || (this.ff && a.team >= 0)) { this.ram(a, b); this.ram(b, a); }
    }
    for (const u of list) {
      for (const s of this.solids) pushOut(u, u.r, s);
      u.x = clamp(u.x, T, W - T); u.y = clamp(u.y, T, H - T);
      if (u.kind === 'monster') {
        // monster terlalu besar untuk jatuh: didorong keluar dari lubang
        for (const rect of this.hazards) pushOut(u, u.r, rect);
        for (const p of this.pits) { const d = Math.hypot(u.x - p.x, u.y - p.y) || 1; if (d < p.r + u.r) { u.x = p.x + (u.x - p.x) / d * (p.r + u.r); u.y = p.y + (u.y - p.y) / d * (p.r + u.r); } }
      } else if (u.kind !== 'turret' && !u.neutral && this.units.has(u.id) && this.inPit(u.x, u.y, 6)) {
        this.events.push({ k: 'fall', x: r1(u.x), y: r1(u.y) });
        this.kill(u, this.time - (u.lastHitT || -9) < 4 ? u.lastHit : 0, true);
      }
    }

    this.tickHeld(dt);

    // fisika peti
    for (const c of this.crates.values()) {
      if (c.state === 'carried') {
        const u = this.units.get(c.by);
        if (!u || u.carry !== c.id) { c.state = 'ground'; c.z = 0; continue; }
        c.x = u.x; c.y = u.y + 1; c.z = CARRY_Z;
      } else if (c.state === 'air') {
        c.vz -= 900 * dt; c.z += c.vz * dt; c.x += c.vx * dt; c.y += c.vy * dt;
        if (this.solids.some(s => inRect(c.x, c.y, s, 10))) {
          for (const s of this.solids) pushOut(c, 13, s); c.vx = c.vy = 0;
          if (c.metal && c.thrown) { this.encounters.splitMetal(c); continue; }
        }
        if (!c.hit && c.z < 50) {
          for (const u of this.units.values()) {
            if (u.fly || u.abducted || u.neutral || (c.thrown && u.team === c.team && !this.friendly(c.team, c.by, u))) continue;
            if (Math.hypot(u.x - c.x, u.y - c.y) < u.r + 14) {
              c.hit = true; c.vx *= -0.25; c.vy *= -0.25;
              this.events.push({ k: 'bonk', x: r1(u.x), y: r1(u.y) });
              this.damage(u, c.thrown ? (c.metal ? 48 : 32) : 25, c.thrown ? c.by : 0);
              if (c.metal && c.thrown) this.encounters.splitMetal(c);
              break;
            }
          }
        }
        if (!this.crates.has(c.id)) continue;
        if (c.z <= 0) {
          c.z = 0; c.vx = c.vy = c.vz = 0; c.state = 'ground';
          c.x = clamp(c.x, T + 14, W - T - 14); c.y = clamp(c.y, T + 14, H - T - 14);
          if (this.inPit(c.x, c.y)) { this.crates.delete(c.id); continue; } // hilang ke dalam lubang
          if (c.metal && c.thrown) { this.encounters.splitMetal(c); continue; }
          this.events.push({ k: 'land', x: r1(c.x), y: r1(c.y) });
        }
      }
    }

    // peluru (3 sub-step supaya tidak tembus)
    for (const bl of this.bullets) {
      let dead = false;
      for (let s = 0; s < 3 && !dead; s++) {
        bl.x += (bl.vx * dt) / 3; bl.y += (bl.vy * dt) / 3;
        for (const w of this.walls) if (inRect(bl.x, bl.y, w)) { dead = true; break; }
        if (!dead) for (const b of this.bases) if (inRect(bl.x, bl.y, b.hq)) {
          dead = true;
          if (b.team !== bl.team && !bl.rocket) this.damageHQ(b.team, bl.dmg * 0.5);
          break;
        }
        if (!dead) for (const u of this.units.values()) {
          if (u.abducted < 0 || (u.team === bl.team && !this.friendly(bl.team, bl.owner, u)) || (bl.hits && bl.hits.has(u.id))) continue;
          if (Math.hypot(u.x - bl.x, u.y - bl.y) < u.r + 3) {
            if (bl.hits) { // laser menembus: tiap unit hanya kena sekali
              bl.hits.add(u.id);
              this.damage(u, bl.dmg, bl.owner);
              this.events.push({ k: 'hit', x: r1(bl.x), y: r1(bl.y) });
              continue;
            }
            dead = true;
            if (!bl.rocket) this.damage(u, bl.dmg, bl.owner);
            break;
          }
        }
      }
      bl.life -= dt;
      if (dead || bl.life <= 0) {
        bl.dead = true;
        if (bl.rocket) this.explode(bl.x, bl.y, bl.splash, bl.dmg, bl.team, bl.owner);
        else if (dead) this.events.push({ k: 'hit', x: r1(bl.x), y: r1(bl.y) });
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);

    for (const pk of [...this.pickups.values()]) if ((pk.ttl -= dt) <= 0) this.pickups.delete(pk.id);

    this.checkWin();
    this.broadcast();
  }

  snapshot() {
    const U = [], C = [], B = [], P = [], PL = [];
    for (const u of this.units.values()) U.push([u.id, u.team, r1(u.x), r1(u.y), +u.a.toFixed(2), Math.ceil(u.hp), u.max, WLIST.indexOf(u.weapon), u.carry ? 1 : 0, KIND[u.kind], u.owner, u.moving ? 1 : 0, u.ammo === Infinity ? -1 : u.ammo, u.shield > 0 ? 1 : 0, +u.hull.toFixed(2), u.anim, u.rage > 0 ? 1 : 0, u.elite ? 1 : 0, u.lord ? 1 : 0, Math.round(u.lift || 0), u.neutral ? 1 : 0, u.heldBy ? 1 : u.flight ? 2 : 0, u.holding ? 1 : 0]);
    for (const c of this.crates.values()) C.push([c.id, r1(c.x), r1(c.y), r1(c.z), c.state === 'pad' ? 1 : 0, c.metal ? 1 : 0, c.state === 'washed' ? 1 : 0]);
    // jenis peluru: 0 biasa, 1 roket, 2 batu monster, 3 api, 4 granat, 5 laser
    for (const b of this.bullets) B.push([b.id, r1(b.x), r1(b.y), b.rock ? 2 : b.fx || (b.rocket ? 1 : 0), b.team]);
    for (const p of this.pickups.values()) P.push([p.id, r1(p.x), r1(p.y), WLIST.indexOf(p.w)]);
    for (const p of this.players.values()) PL.push([p.id, p.name, p.team, p.kills, p.deaths, p.unitId, p.unitId ? 0 : Math.ceil(p.respawn), p.ready ? 1 : 0]);
    return JSON.stringify({
      t: 's', tm: +this.time.toFixed(3), st: this.state, win: this.winner, et: Math.ceil(this.endTimer), rl: Math.ceil(this.roundLeft),
      hq: this.hq.map(Math.ceil), al: this.alive, pad: this.pads.map((_, t) => this.padCount(t)), U, C, B, P, PL, ev: this.events,
      pm: this.pads.map((_, t) => this.padMask(t)), pr: this.pads.map((_, t) => this.planLabel(t)), ms: this.master,
      or: this.orders.map((o, t) => [o.build, o.mode, o.target, this.buildWant(t)]),
      lb: [this.cpu ? 1 : 0, Math.ceil(this.countdown), this.activeTeams(), this.ff ? 1 : 0],
      es: [this.eventsEnabled ? 1 : 0, this.eventMask],
      A: this.arenaEvents.snapshot(), D: this.encounters.snapshot(),
      M: this.meteors.map(m => [m.id, r1(m.x), r1(m.y), +m.t.toFixed(2), m.r]),
    });
  }
  broadcast() {
    const s = this.snapshot();
    this.events = [];
    for (const c of this.conns) if (c.backlog < 512 * 1024) c.send(s);
  }
}

module.exports = { Game, WEAPONS, TEAM_NAMES, TEAM_COLORS, RECIPES, matchRecipe, EVENT_OPTIONS };
