'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../server/game');

function arena() {
  const g = new Game(2); g.clearWorld(); g.state = 'playing';
  g.solids = []; g.walls = []; g.pits = []; g.hills = [];
  g.evtTimer = g.crateTimer = g.monsterTimer = 99999;
  return g;
}
function human(g, team = 0, x = 700, y = 600, a = 0) {
  const u = g.spawnUnit(team, 'human', x, y); u.shield = 0; u.a = a; return u;
}
// pemain palsu dengan koneksi tiruan untuk uji pesan lobi
function player(g, name) {
  const sent = [], conn = { backlog: 0, send: s => sent.push(s) };
  g.conns.add(conn);
  const p = { id: g.id(), name, team: 0, unitId: 0, respawn: 0, kills: 0, deaths: 0, ready: true, input: { mx: 0, my: 0, a: 0, fire: false }, acts: [], conn };
  g.players.set(p.id, p); conn.player = p;
  return { p, conn, sent };
}
const shoot = (g, shooter, x, y) => {
  g.bullets.push({ id: g.id(), x, y, vx: 0, vy: 0, team: shooter.team, dmg: 20, life: 1, rocket: false, splash: 0, owner: shooter.id, fx: 0, hits: null });
};

test('lobby: only the master toggles friendly fire, readiness resets, and lb[3] reflects it', () => {
  const g = new Game(2);
  const a = player(g, 'A'), b = player(g, 'B'); g.master = a.p.id;
  assert.equal(JSON.parse(g.snapshot()).lb[3], 0);
  g.onMsg(b.conn, { t: 'ff', v: true });
  assert.equal(g.ff, false); assert.equal(b.sent.length, 1); // pesan penolakan
  g.onMsg(a.conn, { t: 'ff', v: true });
  assert.equal(g.ff, true); assert.equal(a.p.ready, false); assert.equal(b.p.ready, false);
  assert.equal(JSON.parse(g.snapshot()).lb[3], 1);
  g.broadcast(true);
  assert.ok(a.sent.some(s => JSON.parse(s).ev?.some(e => e.k === 'ff' && e.v === true)));
});

test('bullets and splash only hurt teammates with friendly fire, never the owner', () => {
  for (const ff of [false, true]) {
    const g = arena(); g.ff = ff;
    const shooter = human(g, 0, 600, 600), mate = human(g, 0, 700, 600);
    shoot(g, shooter, 700, 600); g.tick();
    assert.equal(mate.hp < 100, ff, `bullet ff=${ff}`);
    const mate2 = human(g, 0, 1000, 600);
    g.explode(1000, 600, 60, 50, 0, shooter.id);
    assert.equal(mate2.hp < 100, ff, `splash ff=${ff}`);
    g.explode(shooter.x, shooter.y, 60, 50, 0, shooter.id);
    assert.equal(shooter.hp, 100, 'owner is never hit');
  }
});

test('a thrown crate hits a teammate only with friendly fire and never its thrower', () => {
  for (const ff of [false, true]) {
    const g = arena(); g.ff = ff;
    const a = human(g, 0, 700, 600), mate = human(g, 0, 940, 600); // peti baru turun ke bawah z<50 mendekati x≈915–975
    const c = g.createCrate(a.x, a.y, { state: 'carried', by: a.id }); a.carry = c.id;
    g.throwCrate(a);
    for (let i = 0; i < 30; i++) g.tick();
    assert.equal(a.hp, 100);
    assert.equal(mate.hp < 100, ff);
  }
});

test('grab needs friendly fire, ignores shielded targets, and yields to crates', () => {
  const g = arena(), a = human(g, 0, 700, 600), v = human(g, 1, 722, 600);
  g.grab(a); assert.equal(a.holding, undefined, 'ff off');
  g.ff = true; v.shield = 1; g.grab(a); assert.ok(!a.holding, 'spawn shield');
  v.shield = 0;
  const c = g.createCrate(710, 600, { state: 'ground', z: 0 });
  g.grab(a); assert.equal(a.carry, c.id); assert.ok(!a.holding, 'crate wins');
});

test('held unit follows the holder, is immune, and E puts it down', () => {
  const g = arena(); g.ff = true;
  const a = human(g, 0, 700, 600), v = human(g, 0, 722, 600);
  g.grab(a);
  assert.equal(a.holding, v.id); assert.equal(v.heldBy, a.id);
  a.in = { mx: 1, my: 0, a: 0, fire: true }; v.in = { mx: 0, my: 1, a: 0, fire: true };
  for (let i = 0; i < 10; i++) g.tick();
  assert.ok(a.x > 700 && Math.abs(v.x - a.x - 14) < 1, 'follows holder');
  const before = v.hp; g.damage(v, 50, 0); shoot(g, human(g, 1, 0, 0), v.x + 10, v.y); g.tick(); // 10 px dari korban, 24 px dari pengangkat
  assert.equal(v.hp, before, 'immune while held');
  assert.equal(g.bullets.length, 1, 'bullets pass through held units');
  const snap = JSON.parse(g.snapshot()), row = snap.U.find(r => r[0] === v.id);
  assert.equal(row[21], 1); assert.equal(snap.U.find(r => r[0] === a.id)[22], 1);
  g.grab(a);
  assert.ok(!a.holding && !v.heldBy && !v.abducted && v.lift === 0);
});

test('throw: landing costs 15 HP and hitting another unit costs it 25 HP', () => {
  const g = arena(); g.ff = true;
  const a = human(g, 0, 700, 600), v = human(g, 0, 722, 600), target = human(g, 1, 900, 600);
  g.grab(a); g.throwUnit(a);
  assert.ok(v.flight && v.abducted < 0 && !a.holding);
  for (let i = 0; i < 60; i++) g.tick();
  assert.equal(v.flight, null); assert.equal(v.abducted, 0);
  assert.equal(target.hp, 75, 'collision damage');
  assert.equal(v.hp, 85, 'landing damage');
  assert.equal(a.hp, 100);
});

test('thrown into a pit: victim dies, thrower gets no kill for a teamkill but does for an enemy', () => {
  for (const [team, kills] of [[0, 0], [1, 1]]) {
    const g = arena(); g.ff = true; g.pits = [{ x: 960, y: 600, r: 70 }];
    const { p } = player(g, 'T');
    const a = human(g, 0, 700, 600); a.owner = p.id; a.kind = 'human'; p.unitId = a.id;
    const v = human(g, team, 722, 600);
    g.grab(a); g.throwUnit(a);
    for (let i = 0; i < 60; i++) g.tick();
    assert.equal(g.units.has(v.id), false);
    assert.equal(p.kills, kills);
  }
});

test('holder death or timeout releases the victim', () => {
  const g = arena(); g.ff = true;
  const a = human(g, 0, 700, 600), v = human(g, 0, 722, 600);
  g.grab(a); g.kill(a, 0);
  assert.ok(g.units.has(v.id) && !v.abducted && !v.heldBy);
  const b = human(g, 0, 900, 600), w = human(g, 0, 922, 600);
  g.grab(b);
  for (let i = 0; i < 31 * 5; i++) g.tick();
  assert.ok(!b.holding && !w.heldBy && !w.abducted);
});

test('holder cannot shoot', () => {
  const g = arena(); g.ff = true;
  const a = human(g, 0, 700, 600); human(g, 0, 722, 600);
  g.grab(a); a.in = { mx: 0, my: 0, a: 0, fire: true }; g.tick();
  assert.equal(g.bullets.length, 0);
});

test('a moving vehicle rams teammates only with friendly fire', () => {
  for (const ff of [false, true]) {
    const g = arena(); g.ff = ff; g.time = 10; // ram() punya jeda 0.6 s sejak waktu 0
    const jeep = g.spawnUnit(0, 'jeep', 700, 600), inf = human(g, 0, 720, 600);
    jeep.ai = null; jeep.in = { mx: 1, my: 0, a: 0, fire: false }; jeep.hull = 0; // tanpa AI agar input dipakai
    g.tick();
    assert.equal(inf.hp < 100, ff);
  }
});

test('a thrown player never damages the thrower on landing', () => {
  const g = arena(); g.ff = true;
  const a = human(g, 0, 700, 600), v = human(g, 1, 722, 600);
  g.grab(a); g.throwUnit(a);
  Object.assign(v.flight, { vx: 0, vy: 0, vz: -1 });
  v.x = a.x; v.y = a.y; v.lift = 1;
  g.tickHeld(1 / 30);
  assert.equal(a.hp, 100);
  assert.equal(v.hp, 85);
});

test('a carrier cannot be picked up to form a nested carry chain', () => {
  const g = arena(); g.ff = true;
  const a = human(g, 0, 700, 600), v = human(g, 1, 722, 600);
  g.grab(a);
  const third = human(g, 0, 678, 600);
  g.grab(third);
  assert.ok(!third.holding);
  assert.equal(a.holding, v.id);
  assert.equal(v.heldBy, a.id);
  assert.ok(!a.abducted);
});

test('disconnecting either carried player clears the carry relationship', () => {
  for (const removeHolder of [false, true]) {
    const g = arena(); g.ff = true;
    const a = human(g, 0, 700, 600), v = human(g, 1, 722, 600);
    const h = player(g, 'Holder'), victim = player(g, 'Victim');
    a.owner = h.p.id; h.p.unitId = a.id; v.owner = victim.p.id; victim.p.unitId = v.id;
    g.grab(a); g.removeConn(removeHolder ? h.conn : victim.conn);
    const survivor = removeHolder ? v : a;
    assert.ok(g.units.has(survivor.id));
    assert.ok(!survivor.holding && !survivor.heldBy && !survivor.abducted);
  }
});

test('friendly fire changes cancel countdown immediately and reject invalid or in-match changes', () => {
  const g = new Game(2), a = player(g, 'Host'); g.master = a.p.id;
  g.state = 'countdown'; g.countdown = 0.1;
  g.onMsg(a.conn, { t: 'ff', v: 'true' });
  assert.equal(g.ff, false); assert.equal(a.p.ready, true);
  g.onMsg(a.conn, { t: 'ff', v: true });
  assert.equal(g.state, 'lobby'); assert.equal(g.countdown, 0);
  g.setMap(3); g.toLobby(); assert.equal(g.ff, true);
  g.state = 'playing'; g.onMsg(a.conn, { t: 'ff', v: false }); assert.equal(g.ff, true);
});
