'use strict';
const { planTrain, tickTrain, trainEscape } = require('./train');

// Semua efek dihitung server. Client hanya menerima geometri dan jam event.
const EVENT_RULES = {
  blackhole: { name: 'Blackhole', warn: 4, duration: 11, hint: 'Keluar dari lingkaran ungu! Peluru ikut melengkung.', reward: 'Peti bonus di bekas pusaran.' },
  dragon: { name: 'Naga', warn: 5, duration: 12, hint: 'Keluar dari jalur oranye! Tunggu api padam sebelum mengambil peti.', reward: 'Naga menjatuhkan peti di belakang jalur api.' },
  tsunami: { name: 'Tsunami', warn: 7, hint: 'Naik ke puncak bukit hijau! Peti hanyut kembali merata di tengah.', reward: 'Peti hanyut + bonus tersebar simetris di tengah arena.' },
  ufo: { name: 'UFO Penculik', warn: 5, duration: 12, hint: 'Keluar dari sorotan hijau! Tembak UFO untuk menyelamatkan korban.', reward: 'UFO pergi. Korban yang selamat kembali bertempur.' },
  airdrop: { name: 'Helikopter Airdrop', warn: 5, duration: 14, hint: 'Rebut peti/tank abu-abu: Super Bazooka + tank untuk tim pertama!', reward: 'Airdrop masih bisa diklaim sampai batas waktunya habis.' },
  chickens: { name: 'Invasi Ayam', warn: 4, duration: 25, hint: 'Ayam mencuri peti lepas! Kejar atau tembak untuk merebut loot.', reward: 'Ayam kabur; peti yang dibawanya tertinggal.' },
  lord: { name: 'LORD', warn: 6, duration: 18, hint: 'Boss melee netral! Pembunuhnya menjadi LORD sampai mati.', reward: 'Boss LORD berkeliaran sampai dikalahkan. Buff pemain hilang saat mati.' },
  train: { name: 'Kereta Ngepot', warn: 6, duration: 9, hint: 'MENJAUH DARI REL MERAH! Lokomotif dan gerbong menabrak = langsung tewas.', reward: 'Kereta lewat. Jalur aman kembali.' },
  mbg: { name: 'Bansos MBG', warn: 4, duration: 7, hint: 'Senjata acak dibagikan di depan setiap pemain. Dekati atau tekan E untuk mengambil!', reward: 'Bansos dibagikan! Senjata yang belum diambil bertahan 45 detik sejak dibagikan.' },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const weight = u => u.kind === 'monster' ? 0.12 : u.lord || u.lordBoss ? 0.65 : u.kind === 'tank' || u.kind === 'jeep' ? 0.45 : 1;

class ArenaEvents {
  constructor(game) { this.game = game; this.active = null; }

  start(kind) {
    const g = this.game, rule = EVENT_RULES[kind];
    if (!rule || this.active || g.state !== 'playing') return false;
    const { w, h, tile } = g.mapInfo();
    const e = { id: g.id(), kind, age: 0, warn: rule.warn, duration: rule.duration || 0, x: w / 2, y: h / 2,
      dx: 1, dy: 0, radius: 250, width: 90, length: 0, speed: 0, started: false, drops: 0, hit: new Set() };
    if (kind === 'train') planTrain(g, e);
    else if (kind === 'ufo') {
      const candidates = [...g.units.values()].filter(u => !u.lord && !u.abducted && u.team >= 0 && u.kind === 'human');
      if (!candidates.length) candidates.push(...[...g.units.values()].filter(u => u.kind === 'bot' && !u.lord));
      if (!candidates.length || !g.pits.length) return false;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const pit = [...g.pits].sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
      Object.assign(e, { x: target.x, y: target.y, target: target.id, pitX: pit.x, pitY: pit.y, stage: 'warning', captive: 0 });
    } else if (['airdrop', 'chickens', 'lord'].includes(kind)) {
      if (kind === 'lord' && [...g.units.values()].some(u => u.lord || u.lordBoss)) return false;
      const spot = g.encounters.fairSpot(); if (!spot) return false;
      e.x = spot.x; e.y = spot.y;
    } else if (kind === 'blackhole') {
      // Jauh dari HQ, dengan pusat yang tidak tertanam di tembok atau lubang.
      const candidates = [{ x: w / 2, y: h / 2 }];
      for (let i = 0; i < 40; i++) candidates.push({ x: rand(w * 0.35, w * 0.65), y: rand(h * 0.35, h * 0.65) });
      const center = candidates.find(p => !g.inPit(p.x, p.y, -55) && !g.solids.some(s =>
        p.x > s.x - 55 && p.x < s.x + s.w + 55 && p.y > s.y - 55 && p.y < s.y + s.h + 55));
      if (!center) return false;
      e.x = center.x; e.y = center.y;
    } else if (kind === 'dragon') {
      const angle = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4][Math.floor(Math.random() * 4)];
      e.dx = Math.cos(angle); e.dy = Math.sin(angle);
      if (Math.random() < 0.5) { e.dx *= -1; e.dy *= -1; }
      e.length = Math.abs(e.dx) * w + Math.abs(e.dy) * h + tile * 4;
      e.speed = e.length / e.duration;
    } else if (kind === 'tsunami') {
      e.swept = new Set();
      const direction = Math.floor(Math.random() * 4);
      e.dx = direction === 0 ? 1 : direction === 1 ? -1 : 0;
      e.dy = direction === 2 ? 1 : direction === 3 ? -1 : 0;
      e.length = (e.dx ? w : h) + 240;
      e.width = 90; e.speed = 210; e.duration = e.length / e.speed;
      e.x = e.dx === 1 ? -120 : e.dx === -1 ? w + 120 : w / 2;
      e.y = e.dy === 1 ? -120 : e.dy === -1 ? h + 120 : h / 2;
    }
    this.active = e;
    g.events.push({ k: 'evt', name: rule.name + ' mendekat!', d: rule.warn + ' detik · ' + rule.hint });
    return true;
  }

  // Pindah dengan tabrakan normal; dorongan tetap dapat menjatuhkan unit ke lubang.
  move(body, dx, dy, radius = 14) { this.game.eventMove(body, dx, dy, radius); }

  dropCrates(x, y, count) {
    const g = this.game, { w, h, tile } = g.mapInfo();
    for (let i = 0; i < count; i++) {
      let spot = null;
      for (let n = 0; n < 30; n++) {
        const a = rand(0, Math.PI * 2), r = rand(30, 120);
        const px = clamp(x + Math.cos(a) * r, tile + 20, w - tile - 20);
        const py = clamp(y + Math.sin(a) * r, tile + 20, h - tile - 20);
        if (g.inPit(px, py, -20) || g.solids.some(s => px > s.x - 20 && px < s.x + s.w + 20 && py > s.y - 20 && py < s.y + s.h + 20)) continue;
        spot = { x: px, y: py }; break;
      }
      if (!spot) continue;
      const c = { id: g.id(), ...spot, z: 110, vx: 0, vy: 0, vz: 0, state: 'air', thrown: false, team: -1, by: 0, hit: true };
      g.crates.set(c.id, c);
    }
  }

  tick(dt) {
    const e = this.active;
    if (!e) return;
    e.age += dt;
    if (e.age < e.warn) return;
    const g = this.game, rule = EVENT_RULES[e.kind], t = e.age - e.warn;
    if (!e.started) {
      e.started = true;
      g.events.push({ k: 'evt', name: rule.name + '!', d: rule.hint });
      if (e.kind === 'ufo' && !g.encounters.spawnUfo(e)) { this.finish(); return; }
      if (e.kind === 'chickens') g.encounters.spawnChickens(e);
      if (e.kind === 'lord' && !g.encounters.spawnLord(e)) { this.finish(); return; }
      if (e.kind === 'mbg') g.encounters.spawnMbg(e);
    }
    if (e.kind === 'train') tickTrain(g, e, Math.min(t, e.duration), Math.min(dt, Math.max(0, e.duration - (t - dt))));
    if (t >= e.duration) { this.finish(); return; }
    if (e.kind === 'blackhole') this.blackhole(e, dt);
    else if (e.kind === 'dragon') this.dragon(e, t, dt);
    else if (e.kind === 'tsunami') this.tsunami(e, t, dt);
    else if (e.kind === 'ufo' && !g.encounters.tickUfo(e, t, dt)) this.finish();
    else if (e.kind === 'airdrop' && t >= 6 && !e.delivered) { e.delivered = true; g.encounters.spawnDrop(e); }
    else if (e.kind === 'lord' && !g.units.has(e.boss)) this.finish();
  }

  blackhole(e, dt) {
    const g = this.game;
    const pull = (body, factor, radius) => {
      const dx = e.x - body.x, dy = e.y - body.y, d = Math.hypot(dx, dy);
      if (d >= e.radius || d < 12) return;
      const step = Math.min(d - 12, (80 + 260 * (1 - d / e.radius)) * factor * dt);
      this.move(body, dx / d * step, dy / d * step, radius);
    };
    for (const u of [...g.units.values()]) {
      if (u.kind === 'turret' || u.neutral || u.abducted || u.fly) continue;
      pull(u, weight(u), u.r);
      if (Math.hypot(u.x - e.x, u.y - e.y) < 32) g.damage(u, 12 * dt, 0);
    }
    for (const c of g.crates.values()) if ((c.state === 'ground' || c.state === 'air') && c.z < 140) {
      pull(c, 1.25, 14);
      if (g.inPit(c.x, c.y)) g.crates.delete(c.id);
    }
    for (const p of g.pickups.values()) pull(p, 1.1, 10);
    for (const b of g.bullets) {
      const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy);
      if (d < 1 || d > e.radius) continue;
      const speed = Math.hypot(b.vx, b.vy);
      b.vx += dx / d * 2300 * (1 - d / e.radius) * dt;
      b.vy += dy / d * 2300 * (1 - d / e.radius) * dt;
      const curved = Math.hypot(b.vx, b.vy) || 1;
      b.vx *= speed / curved; b.vy *= speed / curved;
    }
  }

  dragon(e, t, dt) {
    const g = this.game, head = -e.length / 2 + t * e.speed;
    for (const u of [...g.units.values()]) {
      const along = (u.x - e.x) * e.dx + (u.y - e.y) * e.dy;
      const across = Math.abs(-(u.x - e.x) * e.dy + (u.y - e.y) * e.dx);
      if (across < e.width + u.r && along < head + 20 && along > head - e.speed * 2.2) g.damage(u, 24 * dt, 0);
    }
    // Hadiah tertinggal di belakang api yang telah padam, bukan tepat di dalamnya.
    const due = Math.min(4, Math.floor(t / 2.4));
    if (due > e.drops) {
      e.drops = due;
      const back = head - e.speed * 2.2 - 150;
      this.dropCrates(e.x + e.dx * back, e.y + e.dy * back, 1);
    }
  }

  tsunami(e, t, dt) {
    const g = this.game, front = t * e.speed;
    const affected = body => Math.abs((body.x - e.x) * e.dx + (body.y - e.y) * e.dy - front) < e.width;
    for (const u of [...g.units.values()]) {
      if (u.kind === 'turret' || u.kind === 'monster' || u.neutral || u.abducted || u.fly || !affected(u) || g.heightAt(u.x, u.y) >= 18) continue;
      this.move(u, e.dx * 245 * weight(u) * dt, e.dy * 245 * weight(u) * dt, u.r);
      if (!e.hit.has(u.id)) { e.hit.add(u.id); g.damage(u, 18, 0); }
    }
    for (const c of g.crates.values()) if ((c.state === 'ground' || c.state === 'air') && c.z < 80 && affected(c) && g.heightAt(c.x, c.y) < 18) {
      c.state = 'washed'; c.thrown = false; c.hit = true; e.swept.add(c.id);
    }
    for (const id of e.swept) {
      const c = g.crates.get(id); if (!c) continue;
      if (c.waveAcross === undefined) c.waveAcross = -(c.x - e.x) * e.dy + (c.y - e.y) * e.dx;
      const across = c.waveAcross;
      c.x = e.x + e.dx * front - e.dy * across; c.y = e.y + e.dy * front + e.dx * across; c.z = 24;
    }
    // Weapon pickups stay anchored: the wave must not funnel rare guns to one team.
  }

  redistributeTsunami(e) {
    const g = this.game, { w, h } = g.mapInfo();
    const cargo = [...e.swept].map(id => g.crates.get(id)).filter(Boolean);
    // Rounding each material to groups of four also balances the more valuable metal.
    const pools = [cargo.filter(c => !c.metal), cargo.filter(c => c.metal)];
    for (let type = 0; type < 2; type++) {
      const pool = pools[type], count = Math.ceil((pool.length + (type ? 0 : 8)) / 4) * 4;
      for (let n = 0; n < count; n += 4) {
        let spots = null;
        for (let attempt = 0; attempt < 180; attempt++) {
          const dx = attempt < 100 ? rand(75, 330) : 70 + ((attempt - 100) % 10) * 30;
          const dy = attempt < 100 ? rand(65, 280) : 60 + Math.floor((attempt - 100) / 10) * 30;
          const orbit = [[dx, dy], [-dx, -dy], [-dx, dy], [dx, -dy]].map(([x, y]) => ({ x: w / 2 + x, y: h / 2 + y }));
          if (orbit.every(p => g.encounters.validSpot(p.x, p.y))) { spots = orbit; break; }
        }
        if (!spots) continue;
        spots.forEach(p => {
          const c = pool.shift() || g.createCrate(p.x, p.y, { metal: !!type });
          Object.assign(c, p, { state: 'air', z: 110, vx: 0, vy: 0, vz: 0, team: -1, by: 0, thrown: false, hit: true });
          delete c.waveAcross;
        });
      }
      for (const c of pool) {
        const p = g.encounters.safeSpot(w / 2, h / 2, 350);
        if (p) Object.assign(c, p, { state: 'air', z: 110, vx: 0, vy: 0, vz: 0 });
        else g.crates.delete(c.id);
      }
    }
  }

  finish() {
    const e = this.active, g = this.game;
    if (!e) return;
    if (e.kind === 'blackhole') {
      for (const u of g.units.values()) {
        if (u.kind === 'turret' || u.neutral || u.abducted || u.fly) continue;
        const dx = u.x - e.x, dy = u.y - e.y, d = Math.hypot(dx, dy);
        if (d < e.radius * 0.8) this.move(u, (d ? dx / d : 1) * 100 * weight(u), (d ? dy / d : 0) * 100 * weight(u), u.r);
      }
      for (const c of g.crates.values()) if ((c.state === 'ground' || c.state === 'air') && Math.hypot(c.x - e.x, c.y - e.y) < e.radius) {
        const a = Math.atan2(c.y - e.y, c.x - e.x) + rand(-0.5, 0.5);
        Object.assign(c, { state: 'air', z: Math.max(c.z, 20), vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, vz: 220, thrown: false, hit: true });
      }
      this.dropCrates(e.x, e.y, 4);
    } else if (e.kind === 'tsunami') this.redistributeTsunami(e);
    else if (e.kind === 'ufo') { g.encounters.releaseUfo(e); const ship = g.units.get(e.ufo); if (ship) g.removeUnit(ship); }
    else if (e.kind === 'chickens') {
      for (const id of e.chickens || []) { const u = g.units.get(id); if (u) g.removeUnit(u); }
    }
    if (e.kind === 'lord') {
      const alive = g.units.has(e.boss);
      g.events.push({ k: 'evt', name: alive ? 'LORD berkeliaran!' : 'Boss LORD dikalahkan!', d: alive ? 'Kalahkan boss untuk memperoleh wujud LORD.' : 'Buff pemenang hilang saat mati dan tidak berpindah.' });
    } else g.events.push({ k: 'evt', name: EVENT_RULES[e.kind].name + ' berlalu', d: EVENT_RULES[e.kind].reward });
    this.active = null;
  }

  escapeGoal(u) {
    const e = this.active, g = this.game;
    if (!e || u.kind === 'turret' || u.kind === 'monster' || u.abducted || u.neutral) return null;
    let target = null;
    if (e.kind === 'train') target = trainEscape(e, u);
    else if (e.kind === 'blackhole') {
      const dx = u.x - e.x, dy = u.y - e.y, d = Math.hypot(dx, dy);
      if (d < e.radius + 55) {
        const a = d ? Math.atan2(dy, dx) : u.a;
        target = { x: e.x + Math.cos(a) * (e.radius + 95), y: e.y + Math.sin(a) * (e.radius + 95) };
      }
    } else if (e.kind === 'dragon') {
      const cross = -(u.x - e.x) * e.dy + (u.y - e.y) * e.dx;
      if (Math.abs(cross) < e.width + 45) {
        const side = cross >= 0 ? 1 : -1;
        target = { x: u.x - e.dy * side * (e.width + 80), y: u.y + e.dx * side * (e.width + 80) };
      }
    } else if (e.kind === 'ufo' && e.target === u.id && e.stage !== 'carry') {
      const a = Math.atan2(u.y - e.y, u.x - e.x) || u.a;
      target = { x: e.x + Math.cos(a) * 150, y: e.y + Math.sin(a) * 150 };
    } else if (e.kind === 'tsunami') {
      const t = Math.max(0, e.age - e.warn), along = (u.x - e.x) * e.dx + (u.y - e.y) * e.dy - t * e.speed;
      if (g.heightAt(u.x, u.y) < 18 && along > -e.width && along < (e.age < e.warn ? e.length : 750)) {
        let best = Infinity;
        for (const hill of g.hills) {
          const d = Math.hypot(hill.x - u.x, hill.y - u.y);
          // Pilih bagian dalam bukit yang tidak berada di tembok atau lubang.
          if (d < best && !g.inPit(hill.x, hill.y, -u.r) && !g.solids.some(s => hill.x > s.x - u.r && hill.x < s.x + s.w + u.r && hill.y > s.y - u.r && hill.y < s.y + s.h + u.r)) {
            best = d; target = { x: hill.x, y: hill.y };
          }
        }
      }
    }
    if (!target) return null;
    const { w, h, tile } = g.mapInfo();
    target.x = clamp(target.x, tile * 1.5, w - tile * 1.5); target.y = clamp(target.y, tile * 1.5, h - tile * 1.5);
    return target;
  }

  snapshot() {
    const e = this.active;
    if (!e) return null;
    const { id, kind, age, warn, duration, x, y, dx, dy, radius, width, length, speed } = e;
    const ship = this.game.units.get(e.ufo);
    return { id, kind, age: +age.toFixed(3), warn, duration, x, y, dx, dy, radius, width, length, speed,
      target: e.target, stage: e.stage, captive: e.captive, shipX: ship?.x, shipY: ship?.y, pitX: e.pitX, pitY: e.pitY, boss: e.boss, delivered: !!e.delivered,
      ...(e.kind === 'train' ? { swerve: e.swerve, phase: e.phase, cars: e.cars, spacing: e.spacing } : {}),
      ...(e.kind === 'mbg' ? { gifts: e.gifts || [] } : {}) };
  }
}

module.exports = { ArenaEvents, EVENT_RULES };
