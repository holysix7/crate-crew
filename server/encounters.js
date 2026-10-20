'use strict';

const LORD = { bossHP: 2200, playerHP: 420, bossDamage: 52, playerDamage: 32, bossRange: 90, playerRange: 68 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const isVehicle = u => u.kind === 'tank' || u.kind === 'jeep';

class Encounters {
  constructor(game, weapons) { this.game = game; this.weapons = weapons; this.airdrops = new Map(); }

  validSpot(x, y, r = 22) {
    const g = this.game, { w, h, tile } = g.mapInfo();
    return x > tile + r && x < w - tile - r && y > tile + r && y < h - tile - r &&
      !g.inPit(x, y, -r) && !g.solids.some(s => x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r);
  }
  safeSpot(x, y, radius = 120, r = 22) {
    if (this.validSpot(x, y, r)) return { x, y };
    for (let i = 0; i < 60; i++) {
      const a = i * 2.39996, d = 15 + radius * Math.sqrt((i + 1) / 60);
      const p = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
      if (this.validSpot(p.x, p.y, r)) return p;
    }
    return null;
  }
  fairSpot() {
    const g = this.game, { w, h } = g.mapInfo();
    let best = null, score = Infinity;
    for (let dx = -280; dx <= 280; dx += 40) for (let dy = -240; dy <= 240; dy += 40) {
      const p = { x: w / 2 + dx, y: h / 2 + dy };
      if (!this.validSpot(p.x, p.y, 45)) continue;
      const distances = g.bases.map(b => distance(p, b.spawn));
      const s = Math.max(...distances) - Math.min(...distances) + Math.hypot(dx, dy) * 0.15;
      if (s < score) { score = s; best = p; }
    }
    return best;
  }

  dropWeapon(x, y, w, ttl = 50, special = false) {
    const g = this.game, p = this.safeSpot(x, y, 120, 12);
    if (!p || !this.weapons[w]) return null;
    const pickup = { id: g.id(), ...p, w, ammo: this.weapons[w].ammo, ttl, special };
    g.pickups.set(pickup.id, pickup); return pickup;
  }
  monsterLoot(u) {
    const g = this.game;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, p = this.safeSpot(u.x + Math.cos(a) * 90, u.y + Math.sin(a) * 90);
      if (p) g.createCrate(p.x, p.y, { metal: i < 2, z: 70, vz: 180 });
    }
    const guns = ['bazooka', 'minigun', 'laser'];
    guns.forEach((w, i) => { const a = i * Math.PI * 2 / 3; this.dropWeapon(u.x + Math.cos(a) * 130, u.y + Math.sin(a) * 130, w); });
  }
  splitMetal(c) {
    const g = this.game;
    if (!c.metal || !g.crates.delete(c.id)) return false;
    for (let i = 0; i < 2; i++) {
      const p = this.safeSpot(c.x + (i ? 22 : -22), c.y, 100, 14);
      if (p) g.createCrate(p.x, p.y, { z: 30, vx: i ? 70 : -70, vz: 110 });
    }
    g.events.push({ k: 'shatter', x: c.x, y: c.y }); return true;
  }

  spawnDrop(e) {
    const g = this.game, spot = this.safeSpot(e.x, e.y, 150, 22);
    if (!spot) return;
    const tankSpot = this.safeSpot(spot.x + 85, spot.y + 35, 160, 24);
    if (!tankSpot) return;
    const tank = g.spawnUnit(-2, 'tank', tankSpot.x, tankSpot.y);
    tank.neutral = true; tank.ai = null; tank.in = { mx: 0, my: 0, a: tank.a, fire: false };
    const drop = { id: g.id(), x: spot.x, y: spot.y, z: 240, team: -1, tankId: tank.id, ttl: 75, claimedBy: 0 };
    tank.dropId = drop.id; this.airdrops.set(drop.id, drop);
    g.events.push({ k: 'evt', name: 'Airdrop mendarat!', d: 'Sentuh peti abu-abu atau tank: Super Bazooka + tank untuk timmu!' });
  }
  claimDrop(drop, unit) {
    const g = this.game, tank = g.units.get(drop.tankId), recipient = unit.driver || unit;
    if (drop.team >= 0 || drop.z > 0 || unit.team < 0 || !g.alive[unit.team] || recipient.lord || recipient.abducted || !['human', 'bot'].includes(recipient.kind)) return false;
    drop.team = unit.team; drop.claimedBy = recipient.owner || recipient.id; drop.ttl = 6;
    recipient.weapon = 'superbazooka'; recipient.ammo = this.weapons.superbazooka.ammo;
    if (tank) {
      tank.team = unit.team; tank.neutral = false;
      tank.ai = { t: 0, role: 'escort', path: null, pi: 0, pkey: '', repath: 0, strafe: 1, strafeT: 0, claim: 0, goal: null, aim: null, fire: false };
    }
    g.events.push({ k: 'claim', t: unit.team, n: g.unitName(recipient), x: drop.x, y: drop.y });
    return true;
  }
  tickDrops(dt) {
    const g = this.game;
    for (const drop of this.airdrops.values()) {
      drop.z = Math.max(0, drop.z - 100 * dt); drop.ttl -= dt;
      if (drop.ttl <= 0) {
        const tank = g.units.get(drop.tankId);
        if (tank?.neutral) g.units.delete(tank.id);
        this.airdrops.delete(drop.id); continue;
      }
      if (drop.z || drop.team >= 0) continue;
      const tank = g.units.get(drop.tankId);
      for (const u of g.units.values()) {
        if (u.team < 0 || u.abducted || u.neutral) continue;
        if (distance(u, drop) < u.r + 23 || (tank && distance(u, tank) < u.r + tank.r + 3)) {
          if (this.claimDrop(drop, u)) break;
        }
      }
    }
  }

  spawnUfo(e) {
    const g = this.game, target = g.units.get(e.target);
    if (!target || target.abducted || target.lord) return false;
    const ufo = g.spawnUnit(-4, 'ufo', e.x, e.y); ufo.hp = ufo.max = 320; ufo.r = 30; ufo.ai = null; ufo.fly = true;
    e.ufo = ufo.id; e.stage = 'beam'; e.beamTime = 0; e.captive = 0;
    return true;
  }
  releaseUfo(e, dropped = false) {
    const g = this.game, u = g.units.get(e.captive);
    if (!u) return;
    u.abducted = 0; u.lift = 0;
    if (dropped) { u.x = e.pitX; u.y = e.pitY; g.kill(u, 0, true); }
    else {
      const safe = this.safeSpot(u.x, u.y, 240, u.r) || this.fairSpot();
      if (safe) { u.x = safe.x; u.y = safe.y; }
      u.shield = Math.max(u.shield, 1);
      g.events.push({ k: 'evt', name: 'Penculikan digagalkan!', d: 'Korban selamat. UFO menjatuhkan loot.' });
    }
    e.captive = 0;
  }
  tickUfo(e, t, dt) {
    const g = this.game, ship = g.units.get(e.ufo);
    if (!ship) { this.releaseUfo(e); return false; }
    if (e.stage === 'beam') {
      e.beamTime += dt;
      const target = g.units.get(e.target);
      if (e.beamTime >= 2.5) {
        if (!target || target.abducted || target.lord || target.shield > 0 || distance(target, ship) > 62) return false;
        if (target.carry) { const c = g.crates.get(target.carry); if (c) Object.assign(c, { state: 'ground', x: target.x, y: target.y, z: 0 }); target.carry = 0; }
        target.abducted = ship.id; target.lift = 70; target.in = { mx: 0, my: 0, a: target.a, fire: false };
        e.captive = target.id; e.stage = 'carry'; e.travel = 0; e.fromX = ship.x; e.fromY = ship.y;
        g.events.push({ k: 'evt', name: 'DICULIK UFO!', d: 'Tembak piring terbang untuk menyelamatkan korban sebelum masuk lubang!' });
      }
    } else {
      const victim = g.units.get(e.captive);
      if (!victim) return false;
      e.travel += dt; const f = Math.min(1, e.travel / 7);
      ship.x = e.fromX + (e.pitX - e.fromX) * f; ship.y = e.fromY + (e.pitY - e.fromY) * f;
      victim.x = ship.x; victim.y = ship.y; victim.lift = 70;
      if (f >= 1) { this.releaseUfo(e, true); g.events.push({ k: 'evt', name: 'UFO menjatuhkan korban!', d: 'Lubang menang lagi. Pemain akan respawn seperti biasa.' }); return false; }
    }
    return true;
  }

  spawnChickens(e) {
    const g = this.game;
    e.chickens = [];
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, p = this.safeSpot(e.x + Math.cos(a) * 250, e.y + Math.sin(a) * 210, 150, 12);
      if (!p) continue;
      const u = g.spawnUnit(-5, 'chicken', p.x, p.y); u.hp = u.max = 45; u.r = 10; u.ai = null; u.peck = 0; u.bait = 0;
      e.chickens.push(u.id);
    }
  }
  thinkChicken(u, dt) {
    const g = this.game; u.peck -= dt;
    let goal = null, best = 550;
    if (u.carry) {
      const dx = u.x - g.mapInfo().w / 2, dy = u.y - g.mapInfo().h / 2, d = Math.hypot(dx, dy) || 1;
      goal = this.safeSpot(u.x + dx / d * 100, u.y + dy / d * 100, 150, 12);
    } else {
      for (const c of g.crates.values()) if (c.state === 'ground') {
        const d = distance(c, u); if (d < best) { best = d; goal = c; }
      }
      if (goal && best < 24) { goal.state = 'carried'; goal.by = u.id; u.carry = goal.id; goal = null; }
      if (!goal) {
        for (const v of g.units.values()) if (v.team >= 0 && !v.abducted) {
          const d = distance(v, u) - (v.carry ? 150 : 0); if (d < best) { best = d; goal = v; }
        }
      }
    }
    if (goal) {
      const d = distance(goal, u) || 1;
      u.in = { mx: (goal.x - u.x) / d, my: (goal.y - u.y) / d, a: Math.atan2(goal.y - u.y, goal.x - u.x), fire: false };
      if (goal.team >= 0 && d < 30 && u.peck <= 0) { u.peck = 0.8; g.damage(goal, 8, u.id); }
    } else u.in = { mx: 0, my: 0, a: u.a, fire: false };
    if (g.inPit(u.x + u.in.mx * 35, u.y + u.in.my * 35, -12)) { u.in.mx = 0; u.in.my = 0; }
  }

  spawnLord(e) {
    const g = this.game, p = this.fairSpot();
    if (!p) return false;
    const lord = g.spawnUnit(-3, 'lord', p.x, p.y); lord.hp = lord.max = LORD.bossHP; lord.r = 19; lord.ai = null; lord.lordBoss = true;
    e.boss = lord.id; e.x = p.x; e.y = p.y; return true;
  }
  becomeLord(killer) {
    const g = this.game;
    let u = killer;
    if (killer.driver) u = g.exitVehicle(killer);
    if (!u || !['human', 'bot'].includes(u.kind) || u.abducted || !g.alive[u.team]) return false;
    if (u.carry) { const c = g.crates.get(u.carry); if (c) Object.assign(c, { state: 'ground', x: u.x, y: u.y, z: 0 }); u.carry = 0; }
    u.lord = true; u.hp = u.max = LORD.playerHP; u.r = 18; u.weapon = 'lordblade'; u.ammo = Infinity; u.cd = 0;
    g.events.push({ k: 'evt', name: g.unitName(u) + ' menjadi LORD!', d: 'Versi pemain: melee, HP 420, tidak bisa ambil peti. Buff hilang saat mati.' });
    return true;
  }
  thinkLord(u, dt) {
    const g = this.game;
    let target = null, best = u.lordBoss ? 650 : 700;
    for (const v of g.units.values()) {
      if (v.id === u.id || v.abducted || v.fly || v.neutral || v.team === u.team) continue;
      const d = distance(u, v); if (d < best) { best = d; target = v; }
    }
    if (!target) { u.in = { mx: 0, my: 0, a: u.a, fire: false }; return; }
    const range = u.lordBoss ? LORD.bossRange : LORD.playerRange;
    const d = Math.max(1, distance(target, u));
    let goal = target;
    if (d > range * 0.7 && !g.los(u.x, u.y, target.x, target.y, null, u.r)) {
      if (!u.lordPath || (u.lordRepath = (u.lordRepath || 0) - dt) <= 0) { u.lordPath = g.findPath(u.x, u.y, target.x, target.y); u.lordRepath = 0.8; }
      if (u.lordPath?.length) { while (u.lordPath.length > 1 && distance(u, u.lordPath[0]) < 20) u.lordPath.shift(); goal = u.lordPath[0]; }
    }
    const gd = distance(u, goal) || 1;
    u.in = { mx: d > range * 0.65 ? (goal.x - u.x) / gd : 0, my: d > range * 0.65 ? (goal.y - u.y) / gd : 0,
      a: Math.atan2(target.y - u.y, target.x - u.x), fire: d < range + target.r };
    if (g.inPit(u.x + u.in.mx * 40, u.y + u.in.my * 40, -u.r)) { u.in.mx = 0; u.in.my = 0; }
  }
  melee(u) {
    const g = this.game, boss = u.lordBoss, range = boss ? LORD.bossRange : LORD.playerRange;
    u.cd = boss ? 1 : 0.7; u.anim = 0.3;
    g.events.push({ k: 'slash', x: u.x, y: u.y, a: u.a, r: range, t: u.team });
    for (const v of [...g.units.values()]) {
      if (v.id === u.id || v.team === u.team || v.abducted || v.fly || v.neutral || distance(u, v) > range + v.r) continue;
      const angle = Math.atan2(v.y - u.y, v.x - u.x) - u.a;
      if (Math.cos(angle) < 0.2 || !g.los(u.x, u.y, v.x, v.y)) continue;
      g.damage(v, boss ? LORD.bossDamage : LORD.playerDamage, u.id);
    }
    if (!boss) for (const b of g.bases) if (b.team !== u.team && g.alive[b.team]) {
      const nearest = { x: Math.max(b.hq.x, Math.min(b.hq.x + b.hq.w, u.x)), y: Math.max(b.hq.y, Math.min(b.hq.y + b.hq.h, u.y)) };
      if (distance(u, nearest) < range && Math.cos(Math.atan2(nearest.y - u.y, nearest.x - u.x) - u.a) > 0.2) g.damageHQ(b.team, LORD.playerDamage * 0.5);
    }
  }

  onKill(u, killer, fell, carriedCrate) {
    const g = this.game;
    if (u.kind === 'monster') this.monsterLoot(u);
    if (u.kind === 'ufo' && !fell) this.dropWeapon(u.x, u.y, 'laser');
    if (u.kind === 'chicken' && !fell && !carriedCrate) {
      const p = this.safeSpot(u.x, u.y, 100, 14); if (p) g.createCrate(p.x, p.y, { z: 35 });
    }
    if (u.lordBoss && killer && !killer.neutral && killer.team >= 0 && !fell) this.becomeLord(killer);
    // Player LORD intentionally does not transfer: a fresh boss must be defeated.
  }
  snapshot() {
    return [...this.airdrops.values()].map(d => [d.id, d.x, d.y, Math.round(d.z), d.team, d.tankId, Math.ceil(d.ttl)]);
  }
}

module.exports = { Encounters, LORD };
