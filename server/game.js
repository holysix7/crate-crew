'use strict';
// Simulasi game authoritative. Semua aturan main ada di sini; client hanya menggambar.

const T = 40, MW = 48, MH = 36, W = MW * T, H = MH * T;
const TICK = 1 / 30;
const TEAM_NAMES = ['Merah', 'Biru', 'Hijau', 'Kuning'];
const TEAM_COLORS = ['#e5484d', '#3e7bfa', '#30a46c', '#f5b400'];
const WEAPONS = {
  pistol:  { rate: 0.28, dmg: 12, speed: 720, spread: 0.05, pellets: 1, ammo: Infinity, life: 0.65 },
  smg:     { rate: 0.09, dmg: 7,  speed: 760, spread: 0.13, pellets: 1, ammo: 70, life: 0.6 },
  shotgun: { rate: 0.85, dmg: 9,  speed: 680, spread: 0.28, pellets: 6, ammo: 14, life: 0.38 },
  bazooka: { rate: 1.2,  dmg: 75, speed: 430, spread: 0,    pellets: 1, ammo: 5,  life: 1.4, rocket: true, splash: 75 },
  // senjata bawaan kendaraan
  cannon:  { rate: 1.6,  dmg: 70, speed: 520, spread: 0,    pellets: 1, ammo: Infinity, life: 1.1, rocket: true, splash: 70 },
  mg:      { rate: 0.1,  dmg: 6,  speed: 800, spread: 0.07, pellets: 1, ammo: Infinity, life: 0.55 },
};
const WLIST = Object.keys(WEAPONS);
const KIND = { human: 0, bot: 1, turret: 2, tank: 3, jeep: 4, monster: 5 };
const UNIT_R = 14, HQ_HP = 3200, UNIT_HP = 100, TURRET_HP = 260, CRATE_H = 24, CARRY_Z = 44;
const MAX_TEAM_UNITS = 8, MAX_TURRETS = 3, MAX_VEHICLES = 2, ROUND_TIME = 600, RESPAWN = 4;
// Kendaraan rakitan 8 peti. r < T/2 supaya muat lewat celah 1 petak; turn = rad/detik; ram = damage tabrak
const VEHICLES = {
  tank: { hp: 650, speed: 100, r: 19, weapon: 'cannon', turn: 2.6, mass: 6, ram: 20, label: 'Tank' },
  jeep: { hp: 280, speed: 250, r: 17, weapon: 'mg', turn: 7, mass: 3, ram: 35, label: 'Jeep' },
};
// Monster penjaga zona jatuh peti (tim -1, netral: menyerang semua tim di zonanya)
const MONSTER = { hp: 1500, r: 30, speed: 85, zone: 9.4 * T, slam: 45, slamR: 80, rock: 40, respawn: 45 };
const ZONE_R = 9.4 * T;
const isInf = u => u.kind === 'human' || u.kind === 'bot';
const mass = u => (u.kind === 'turret' ? Infinity : u.kind === 'monster' ? 30 : VEHICLES[u.kind] ? VEHICLES[u.kind].mass : 1);

// Peta: koordinat dalam petak untuk SATU kuadran (kiri atas), lalu dicerminkan ke 4 kuadran.
// walls [x,y,w,h] · hills [x,y,r,tinggiPx] (bisa dilewati, memperlambat, menambah jarak tembak) · pits [x,y,r] (jatuh = tewas)
// Area markas (x<13 & y<10) dan zona peti di tengah sengaja dikosongkan dari bukit/lubang.
const MAPS = [
  { id: 'lembah', name: 'Lembah Hijau', theme: 'grass',
    walls: [[13, 2, 1, 5], [3, 11, 5, 1], [15, 9, 3, 3], [19, 4, 2, 2], [8, 15, 2, 2], [20, 13, 1, 3], [23, 17, 2, 2], [10, 7, 2, 1]],
    hills: [[5, 15, 2.5, 45], [16.5, 6, 2, 40]], pits: [[11, 11.5, 1.8]] },
  { id: 'kawah', name: 'Kawah Meteor', theme: 'desert',
    walls: [[13, 2, 1, 4], [3, 12, 4, 1], [19, 5, 2, 2], [9, 16, 2, 1], [22, 16, 2, 2]],
    hills: [[10.8, 9.8, 2, 50], [17, 14.5, 1.6, 35]], pits: [[15.5, 9, 2.2], [6, 15, 1.8]] },
  { id: 'salju', name: 'Perbukitan Salju', theme: 'snow',
    walls: [[13, 3, 1, 3], [20, 13, 1, 3], [2, 11, 3, 1], [23, 17, 2, 2]],
    hills: [[8, 13.5, 2.6, 55], [16.8, 5, 2.2, 45], [18, 11, 1.8, 40]], pits: [[11, 9, 1.6]] },
];
const MIRRORS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const hillH = (hl, x, y) => { const t = Math.hypot(x - hl.x, y - hl.y) / hl.r; return t < 1 ? hl.h * (0.5 + 0.5 * Math.cos(Math.PI * t)) : 0; };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Perintah tim. build: apa yang dirakit di pad (bot & tombol Q). mode: tugas bot non-pengumpul.
const BUILD_PLANS = { auto: 0, weapon: 1, buddy: 4, turret: 8, tank: 8, jeep: 8 };
const MODES = ['follow', 'defend', 'attack'];

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
  const walls = [], hills = [], pits = [];
  const add = (x, y, w, h) => walls.push({ x: x * T, y: y * T, w: w * T, h: h * T });
  add(0, 0, MW, 1); add(0, MH - 1, MW, 1); add(0, 1, 1, MH - 2); add(MW - 1, 1, 1, MH - 2);
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
  return { walls, bases, hills, pits };
}

class Game {
  constructor(teams) {
    this.teams = teams;
    this.players = new Map();
    this.conns = new Set();
    this.nextId = 1;
    this.time = 0;
    this.events = [];
    this.cpu = true; // tim tanpa pemain diisi 1 komandan CPU
    this.setMap(0);
    this.toLobby();
  }
  id() { return this.nextId++; }

  setMap(i) {
    this.mapIdx = i;
    const m = buildMap(this.teams, MAPS[i]);
    this.walls = m.walls; this.bases = m.bases; this.hills = m.hills; this.pits = m.pits;
    this.solids = [...this.walls, ...this.bases.map(b => b.hq)];
    // grid pathfinding: tembok + lubang (dengan margin badan unit) tidak bisa dilewati
    this.blocked = new Uint8Array(MW * MH);
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
      if (this.solids.some(s => inRect(cx, cy, s)) || this.inPit(cx, cy, -(UNIT_R + 6))) this.blocked[ty * MW + tx] = 1;
    }
  }
  mapInfo() {
    const d = MAPS[this.mapIdx];
    return { w: W, h: H, tile: T, walls: this.walls, bases: this.bases, crateH: CRATE_H, hills: this.hills, pits: this.pits,
      id: d.id, name: d.name, theme: d.theme, zone: ZONE_R };
  }
  welcome() {
    return JSON.stringify({
      t: 'welcome', teams: this.teams, colors: TEAM_COLORS.slice(0, this.teams), names: TEAM_NAMES.slice(0, this.teams), weapons: WLIST,
      map: this.mapInfo(), maps: MAPS.map(m => ({ id: m.id, name: m.name })), hqMax: HQ_HP,
    });
  }
  // margin > 0 = toleransi di tepi (masih aman), margin < 0 = lubang dianggap lebih besar
  inPit(x, y, margin = 0) {
    for (const p of this.pits) if (Math.hypot(x - p.x, y - p.y) < p.r - margin) return p;
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
    this.meteors = []; this.evtTimer = rand(40, 55); this.monsterTimer = 0;
  }
  // ruang tunggu: dunia kosong, semua pemain harus menekan "Siap" lagi
  toLobby() {
    this.clearWorld();
    this.state = 'lobby';
    for (const p of this.players.values()) { p.ready = false; p.unitId = 0; }
    for (let i = 0; i < 6; i++) this.spawnCrate(true);
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
    for (let i = 0; i < 6; i++) this.spawnCrate(true);
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
    this.events.push({ k: 'leave', n: p.name });
  }
  onMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join' && !c.player) {
      const name = String(m.name || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14) || 'Buddy' + (this.nextId % 100);
      let team = Number.isInteger(m.team) && m.team >= 0 && m.team < this.teams ? m.team : -1;
      if (team < 0) {
        const counts = this.bases.map((b, t) => [...this.players.values()].filter(p => p.team === t).length + (this.alive[t] ? 0 : 100));
        team = counts.indexOf(Math.min(...counts));
      }
      const p = { id: this.id(), name, team, unitId: 0, respawn: 0.3, kills: 0, deaths: 0, ready: false, input: { mx: 0, my: 0, a: 0, fire: false }, acts: [], conn: c };
      this.players.set(p.id, p);
      c.player = p;
      c.send(JSON.stringify({ t: 'joined', id: p.id, team }));
      this.events.push({ k: 'join', n: name, t: team });
      return;
    }
    const p = c.player;
    if (!p) return;
    if (m.t === 'in') {
      p.input = { mx: clamp(+m.mx || 0, -1, 1), my: clamp(+m.my || 0, -1, 1), a: Number.isFinite(+m.a) ? +m.a : 0, fire: !!m.f };
    } else if (m.t === 'act' && ['grab', 'throw', 'build'].includes(m.k) && p.acts.length < 4) {
      p.acts.push(m.k);
    } else if (m.t === 'order') {
      this.setOrder(p, m);
    } else if (this.state === 'lobby' || this.state === 'countdown') {
      // aksi ruang tunggu
      if (m.t === 'ready') p.ready = !!m.v;
      else if (m.t === 'team' && Number.isInteger(m.team) && m.team >= 0 && m.team < this.teams && m.team !== p.team) {
        p.team = m.team; p.ready = false;
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
    if (VEHICLES[u.kind]) {
      const p = u.driver && this.players.get(u.driver.owner);
      return p ? p.name + ' (' + VEHICLES[u.kind].label + ')' : VEHICLES[u.kind].label + ' ' + TEAM_NAMES[u.team];
    }
    return u.kind === 'turret' ? 'Turret ' + TEAM_NAMES[u.team] : 'Bot ' + TEAM_NAMES[u.team];
  }
  removeUnit(u) {
    if (u.carry) {
      const c = this.crates.get(u.carry);
      if (c) { c.state = 'ground'; c.z = 0; c.x = u.x; c.y = u.y; }
      u.carry = 0;
    }
    this.units.delete(u.id);
  }
  // wide = di mana saja di peta (kiriman peti), bukan hanya zona tengah
  spawnCrate(instant = false, wide = false) {
    for (let tries = 0; tries < 30; tries++) {
      const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 9 * T;
      const x = wide ? rand(2 * T, W - 2 * T) : W / 2 + Math.cos(ang) * r, y = wide ? rand(2 * T, H - 2 * T) : H / 2 + Math.sin(ang) * r;
      if (this.solids.some(s => inRect(x, y, s, 24)) || this.inPit(x, y, -30)) continue;
      const c = { id: this.id(), x, y, z: instant ? 0 : 560, vx: 0, vy: 0, vz: 0, state: instant ? 'ground' : 'air', thrown: false, team: -1, by: 0, hit: false };
      this.crates.set(c.id, c);
      return c;
    }
  }
  padCount(t) { let n = 0; for (const id of this.pads[t]) if (id) n++; return n; }
  slotPos(t, i) {
    const b = this.bases[t], k = i % 4;
    return { x: b.pad.x + (k % 2 ? T / 2 : -T / 2), y: b.pad.y + (k < 2 ? -T / 2 : T / 2), z: i >= 4 ? CRATE_H : 0 };
  }

  // ---------------- aksi pemain ----------------
  action(u, k) {
    if (u.kind === 'turret' || !this.units.has(u.id)) return;
    if (VEHICLES[u.kind]) { // pengemudi: E keluar, Q tetap bisa merakit (kecuali senjata)
      if (k === 'grab') this.exitVehicle(u);
      else if (k === 'build') this.build(u);
      return;
    }
    if (k === 'grab') this.grab(u);
    else if (k === 'throw') this.throwCrate(u);
    else if (k === 'build') this.build(u);
  }
  grab(u) {
    const b = this.bases[u.team];
    if (u.carry) {
      const c = this.crates.get(u.carry);
      u.carry = 0;
      if (!c) return;
      const pad = this.pads[u.team];
      const slot = pad.indexOf(0);
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
    if (!best) return;
    best.state = 'carried'; best.by = u.id; best.thrown = false;
    u.carry = best.id;
  }
  // Unit pemain disimpan di kendaraan (keluar dari daftar unit); input pemain diarahkan ke kendaraan
  board(u, v) {
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
  build(u) {
    const b = this.bases[u.team];
    if (dist(u, b.pad) > 84) return;
    const pad = this.pads[u.team];
    const n = this.padCount(u.team);
    if (!n) return;
    const take = k => { for (let i = 7; i >= 0 && k > 0; i--) if (pad[i]) { this.crates.delete(pad[i]); pad[i] = 0; k--; } };
    const want = this.buildWant(u.team);
    if (want && n < want) return; // tunggu sampai peti cukup untuk rakitan yang diperintahkan
    let what;
    if (want) what = this.orders[u.team].build;
    else if (n >= 8 && ['turret', 'tank', 'jeep'].some(k => this.canBuild(u.team, k))) {
      // otomatis: 8 peti jadi turret / tank / jeep acak (yang belum penuh)
      const opts = ['turret', 'tank', 'jeep'].filter(k => this.canBuild(u.team, k));
      what = opts[(Math.random() * opts.length) | 0];
    } else what = n >= 4 && this.canBuild(u.team, 'buddy') ? 'buddy' : 'weapon';
    if (what === 'weapon' && !isInf(u)) return; // pengemudi tidak bisa memakai senjata tangan
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
    } else if (what === 'buddy') {
      take(4);
      this.spawnBot(u.team, b.pad.x + rand(-20, 20), b.pad.y + b.dy * T * 1.6);
      this.events.push({ k: 'build', t: u.team, w: 'Buddy baru!', x: r1(b.pad.x), y: r1(b.pad.y) });
    } else {
      take(1);
      const roll = Math.random();
      const w = roll < 0.45 ? 'smg' : roll < 0.8 ? 'shotgun' : 'bazooka';
      u.weapon = w; u.ammo = WEAPONS[w].ammo;
      this.events.push({ k: 'build', t: u.team, w: w.toUpperCase() + '!', x: r1(b.pad.x), y: r1(b.pad.y) });
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
    const w = WEAPONS[u.weapon];
    const player = u.kind === 'human' || !!u.driver;
    u.cd = w.rate * (u.kind === 'bot' || (VEHICLES[u.kind] && !player) ? 1.6 : 1);
    const err = player ? 0 : (Math.random() - 0.5) * 0.22;
    const high = 1 + Math.min(0.3, this.heightAt(u.x, u.y) / 150); // posisi tinggi: peluru terbang lebih jauh
    for (let i = 0; i < w.pellets; i++) {
      const a = u.a + err + (Math.random() - 0.5) * 2 * w.spread;
      const sp = w.speed * (w.pellets > 1 ? rand(0.85, 1.1) : 1);
      this.bullets.push({ id: this.id(), x: u.x + Math.cos(u.a) * (u.r + 4), y: u.y + Math.sin(u.a) * (u.r + 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, team: u.team, dmg: w.dmg, life: w.life * high, rocket: !!w.rocket, splash: w.splash || 0, owner: u.id });
    }
    if (u.ammo !== Infinity && --u.ammo <= 0) { u.weapon = 'pistol'; u.ammo = Infinity; }
  }
  damage(u, dmg, attackerId) {
    if (!this.units.has(u.id) || u.shield > 0) return;
    if (attackerId) { u.lastHit = attackerId; u.lastHitT = this.time; } // untuk kredit bila nanti jatuh ke lubang
    u.hp -= dmg;
    if (u.hp <= 0) this.kill(u, attackerId);
  }
  kill(u, attackerId, fell = false) {
    if (u.weapon !== 'pistol' && isInf(u) && !fell) {
      this.pickups.set(this.id(), { id: this.nextId - 1, x: u.x, y: u.y, w: u.weapon, ammo: u.ammo, ttl: 20 });
    }
    if (VEHICLES[u.kind]) {
      // kendaraan meledak; pengemudi terlempar keluar dalam keadaan luka (ikut jatuh bila di lubang)
      if (!fell) this.events.push({ k: 'boom', x: r1(u.x), y: r1(u.y), r: 60 });
      const h = this.exitVehicle(u);
      if (h) { h.hp = Math.min(h.hp, 40); if (fell) { h.x = u.x; h.y = u.y; this.kill(h, attackerId, true); } }
    }
    if (u.kind === 'monster') {
      // hadiah: monster menjatuhkan 4 peti, lalu muncul lagi
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const c = { id: this.id(), x: u.x + Math.cos(a) * 45, y: u.y + Math.sin(a) * 45, z: 40, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, vz: 260,
          state: 'air', thrown: false, team: -1, by: 0, hit: true };
        this.crates.set(c.id, c);
      }
      this.monsterTimer = MONSTER.respawn;
      this.events.push({ k: 'evt', name: 'Monster tumbang!', d: `4 peti jatuh · muncul lagi dalam ${MONSTER.respawn} detik` });
    }
    this.removeUnit(u);
    const killer = this.units.get(attackerId);
    this.events.push({ k: 'kill', a: killer ? this.unitName(killer) : '', ta: killer ? killer.team : -1, b: this.unitName(u), tb: u.team, x: r1(u.x), y: r1(u.y), f: fell ? 1 : 0 });
    if (u.kind === 'human') {
      const p = this.players.get(u.owner);
      if (p) { p.deaths++; p.unitId = 0; p.respawn = RESPAWN; }
    }
    if (killer && killer.owner) { const p = this.players.get(killer.owner); if (p) p.kills++; } // termasuk pemain di kendaraan
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
  randomEvent() {
    const mon = this.monster();
    const opts = ['meteor', 'meteor', 'supply', ...(mon ? ['rage'] : [])];
    const k = opts[(Math.random() * opts.length) | 0];
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
  }

  explode(x, y, r, dmg, team, attackerId) {
    this.events.push({ k: 'boom', x: r1(x), y: r1(y), r });
    for (const u of [...this.units.values()]) {
      if (u.team === team) continue;
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
    const prev = new Int32Array(MW * MH).fill(-1), q = new Int32Array(MW * MH);
    let h = 0, tl = 0, found = -1;
    prev[si] = si; q[tl++] = si;
    while (h < tl) {
      const c = q[h++], cx = c % MW, cy = (c / MW) | 0;
      if (c === gi || (gBlocked && Math.max(Math.abs(cx - g.x), Math.abs(cy - g.y)) <= 1)) { found = c; break; }
      for (const [dx, dy] of DIRS4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const ni = ny * MW + nx;
        if (prev[ni] !== -1 || this.blocked[ni]) continue;
        prev[ni] = c; q[tl++] = ni;
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
      if (v.team === u.team) continue;
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
          if (dPad < 46) { this.action(u, 'grab'); goal = null; }
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
        for (const k of p.acts) this.action(u, k);
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
      this.crateTimer = rand(1.6, 2.6);
      let loose = 0;
      for (const c of this.crates.values()) if (c.state === 'ground' || c.state === 'air') loose++;
      if (loose < 8 + 2 * this.teams) this.spawnCrate();
    }

    // event acak, meteor, monster muncul lagi
    if ((this.evtTimer -= dt) <= 0) { this.evtTimer = rand(45, 75); this.randomEvent(); }
    for (const m of this.meteors) if ((m.t -= dt) <= 0) this.explode(m.x, m.y, m.r, 55, -2, 0);
    this.meteors = this.meteors.filter(m => m.t > 0);
    if (!this.monster() && (this.monsterTimer -= dt) <= 0) {
      this.spawnMonster();
      this.events.push({ k: 'evt', name: 'Monster kembali!', d: 'Zona peti kembali dijaga' });
    }

    for (const u of this.units.values()) {
      if (u.kind === 'monster') this.thinkMonster(u, dt);
      else if (u.ai && !u.driver) this.think(u, dt);
    }

    for (const u of this.units.values()) {
      if (u.kind !== 'turret') {
        let { mx, my } = u.in;
        const l = Math.hypot(mx, my);
        if (l > 1) { mx /= l; my /= l; }
        const veh = VEHICLES[u.kind];
        let sp = veh ? veh.speed : u.kind === 'monster' ? MONSTER.speed * u.spd : u.carry ? 112 : 165;
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
      if (u.in.fire && !u.carry && u.cd <= 0) this.fire(u);
      if (isInf(u) && u.weapon === 'pistol') {
        for (const pk of this.pickups.values()) {
          if (Math.hypot(pk.x - u.x, pk.y - u.y) < 26) { u.weapon = pk.w; u.ammo = pk.ammo; this.pickups.delete(pk.id); break; }
        }
      }
    }
    // pemisahan antar unit + tabrakan dinding
    const list = [...this.units.values()];
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
      if (a.team !== b.team) { this.ram(a, b); this.ram(b, a); }
    }
    for (const u of list) {
      for (const s of this.solids) pushOut(u, u.r, s);
      u.x = clamp(u.x, T, W - T); u.y = clamp(u.y, T, H - T);
      if (u.kind === 'monster') {
        // monster terlalu besar untuk jatuh: didorong keluar dari lubang
        for (const p of this.pits) { const d = Math.hypot(u.x - p.x, u.y - p.y) || 1; if (d < p.r + u.r) { u.x = p.x + (u.x - p.x) / d * (p.r + u.r); u.y = p.y + (u.y - p.y) / d * (p.r + u.r); } }
      } else if (u.kind !== 'turret' && this.units.has(u.id) && this.inPit(u.x, u.y, 6)) {
        this.events.push({ k: 'fall', x: r1(u.x), y: r1(u.y) });
        this.kill(u, this.time - (u.lastHitT || -9) < 4 ? u.lastHit : 0, true);
      }
    }

    // fisika peti
    for (const c of this.crates.values()) {
      if (c.state === 'carried') {
        const u = this.units.get(c.by);
        if (!u || u.carry !== c.id) { c.state = 'ground'; c.z = 0; continue; }
        c.x = u.x; c.y = u.y + 1; c.z = CARRY_Z;
      } else if (c.state === 'air') {
        c.vz -= 900 * dt; c.z += c.vz * dt; c.x += c.vx * dt; c.y += c.vy * dt;
        if (this.solids.some(s => inRect(c.x, c.y, s, 10))) { for (const s of this.solids) pushOut(c, 13, s); c.vx = c.vy = 0; }
        if (!c.hit && c.z < 50) {
          for (const u of this.units.values()) {
            if (c.thrown && u.team === c.team) continue;
            if (Math.hypot(u.x - c.x, u.y - c.y) < u.r + 14) {
              c.hit = true; c.vx *= -0.25; c.vy *= -0.25;
              this.events.push({ k: 'bonk', x: r1(u.x), y: r1(u.y) });
              this.damage(u, c.thrown ? 32 : 25, c.thrown ? c.by : 0);
              break;
            }
          }
        }
        if (c.z <= 0) {
          c.z = 0; c.vx = c.vy = c.vz = 0; c.state = 'ground';
          c.x = clamp(c.x, T + 14, W - T - 14); c.y = clamp(c.y, T + 14, H - T - 14);
          if (this.inPit(c.x, c.y)) { this.crates.delete(c.id); continue; } // hilang ke dalam lubang
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
          if (u.team === bl.team) continue;
          if (Math.hypot(u.x - bl.x, u.y - bl.y) < u.r + 3) {
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
    for (const u of this.units.values()) U.push([u.id, u.team, r1(u.x), r1(u.y), +u.a.toFixed(2), Math.ceil(u.hp), u.max, WLIST.indexOf(u.weapon), u.carry ? 1 : 0, KIND[u.kind], u.owner, u.moving ? 1 : 0, u.ammo === Infinity ? -1 : u.ammo, u.shield > 0 ? 1 : 0, +u.hull.toFixed(2), u.anim, u.rage > 0 ? 1 : 0]);
    for (const c of this.crates.values()) C.push([c.id, r1(c.x), r1(c.y), r1(c.z), c.state === 'pad' ? 1 : 0]);
    for (const b of this.bullets) B.push([b.id, r1(b.x), r1(b.y), b.rock ? 2 : b.rocket ? 1 : 0, b.team]);
    for (const p of this.pickups.values()) P.push([p.id, r1(p.x), r1(p.y), WLIST.indexOf(p.w)]);
    for (const p of this.players.values()) PL.push([p.id, p.name, p.team, p.kills, p.deaths, p.unitId, p.unitId ? 0 : Math.ceil(p.respawn), p.ready ? 1 : 0]);
    return JSON.stringify({
      t: 's', tm: +this.time.toFixed(3), st: this.state, win: this.winner, et: Math.ceil(this.endTimer), rl: Math.ceil(this.roundLeft),
      hq: this.hq.map(Math.ceil), al: this.alive, pad: this.pads.map((_, t) => this.padCount(t)), U, C, B, P, PL, ev: this.events,
      or: this.orders.map((o, t) => [o.build, o.mode, o.target, this.buildWant(t)]),
      lb: [this.cpu ? 1 : 0, Math.ceil(this.countdown), this.activeTeams()],
      M: this.meteors.map(m => [m.id, r1(m.x), r1(m.y), +m.t.toFixed(2), m.r]),
    });
  }
  broadcast() {
    const s = this.snapshot();
    this.events = [];
    for (const c of this.conns) if (c.backlog < 512 * 1024) c.send(s);
  }
}

module.exports = { Game, WEAPONS, TEAM_NAMES, TEAM_COLORS };
