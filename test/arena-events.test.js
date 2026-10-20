'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../server/game');
const { EVENT_RULES } = require('../server/arena-events');

function arena(kind) {
  const g = new Game(2);
  g.clearWorld(); g.state = 'playing';
  // Fisika event diuji terpisah dari geometri peta; integrasi peta di bawah.
  g.solids = []; g.walls = []; g.pits = []; g.hills = [];
  assert.equal(g.randomEvent(kind), true);
  return { g, events: g.arenaEvents, e: g.arenaEvents.active };
}
function unit(g, kind, x, y) {
  const u = g.spawnUnit(0, kind, x, y); u.shield = 0; return u;
}
function crate(g, state, x, y) {
  const c = { id: g.id(), state, x, y, z: 0, vx: 0, vy: 0, vz: 0, team: -1, by: 0, hit: false, thrown: false };
  g.crates.set(c.id, c); return c;
}

for (const kind of ['blackhole', 'dragon', 'tsunami']) {
  test(kind + ': warning is harmless, state is serializable, and round reset clears it', () => {
    const { g, events, e } = arena(kind);
    const u = unit(g, 'human', e.x + 50, e.y);
    const c = crate(g, 'ground', e.x + 30, e.y);
    const before = [u.x, u.y, u.hp, c.x, c.y];
    events.tick(e.warn - 0.01);
    assert.deepEqual([u.x, u.y, u.hp, c.x, c.y], before);
    assert.equal(JSON.parse(g.snapshot()).A.kind, kind);
    assert.equal(events.active.started, false);
    assert.equal(g.randomEvent('meteor'), false);
    assert.equal(g.randomEvent('dragon'), false);
    g.toLobby();
    assert.equal(JSON.parse(g.snapshot()).A, null);
  });
}

test('blackhole pulls loose objects, respects mass, and curves bullets without accelerating them', () => {
  const { g, events, e } = arena('blackhole');
  const human = unit(g, 'human', e.x + 150, e.y);
  const tank = unit(g, 'tank', e.x + 150, e.y);
  const turret = unit(g, 'turret', e.x + 150, e.y);
  const loose = crate(g, 'ground', e.x + 150, e.y);
  const stacked = crate(g, 'pad', e.x + 150, e.y);
  const carried = crate(g, 'carried', e.x + 150, e.y);
  const pickup = { id: g.id(), x: e.x + 150, y: e.y }; g.pickups.set(pickup.id, pickup);
  const b = { x: e.x + 150, y: e.y + 50, vx: 0, vy: 400 }; g.bullets.push(b);
  e.age = e.warn; events.tick(1 / 30);
  assert.ok(human.x < tank.x && tank.x < turret.x);
  assert.ok(loose.x < e.x + 150 && pickup.x < e.x + 150);
  assert.equal(stacked.x, e.x + 150); assert.equal(carried.x, e.x + 150);
  assert.ok(b.vx < 0); assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 400) < 1e-8);
});

test('blackhole core damages; collapse ejects crates, leaves pads intact, and gives a reward', () => {
  const { g, events, e } = arena('blackhole');
  const u = unit(g, 'human', e.x + 15, e.y);
  const loose = crate(g, 'ground', e.x + 40, e.y);
  const stacked = crate(g, 'pad', e.x + 40, e.y); g.pads[0][0] = stacked.id;
  const hq = [...g.hq];
  e.age = e.warn; events.tick(0.1); assert.ok(u.hp < 100);
  const before = g.crates.size;
  events.finish();
  assert.equal(events.active, null); assert.equal(loose.state, 'air'); assert.equal(loose.vz, 220);
  assert.equal(stacked.state, 'pad'); assert.equal(g.pads[0][0], stacked.id);
  assert.equal(g.crates.size, before + 4); assert.deepEqual(g.hq, hq);
});

test('dragon only burns the passing fire trail and drops rewards behind expired fire', () => {
  const { g, events, e } = arena('dragon');
  Object.assign(e, { dx: 1, dy: 0, x: 960, y: 720, length: 2080, speed: 2080 / 12 });
  const inFire = unit(g, 'human', e.x - 60, e.y);
  const outside = unit(g, 'human', e.x - 60, e.y + e.width + 30);
  const ahead = unit(g, 'human', e.x + 140, e.y);
  const hq = [...g.hq]; e.age = e.warn + 6; events.tick(0.1);
  assert.ok(inFire.hp < 100); assert.equal(outside.hp, 100); assert.equal(ahead.hp, 100);
  assert.equal(g.crates.size, 1);
  const c = [...g.crates.values()][0], head = (6.1 * e.speed - e.length / 2);
  assert.ok(c.x < e.x + head - e.speed * 2.2);
  assert.equal(c.hit, true); assert.deepEqual(g.hq, hq);
});

test('tsunami pushes, damages only once, respects vehicle mass, and shelters high ground', () => {
  const { g, events, e } = arena('tsunami');
  Object.assign(e, { dx: 1, dy: 0, x: 0, y: 720, speed: 210, length: 2160, duration: 2160 / 210 });
  g.heightAt = (x, y) => y > 900 ? 20 : 0;
  const human = unit(g, 'human', 210, 650), tank = unit(g, 'tank', 210, 750), safe = unit(g, 'human', 210, 1000);
  const loose = crate(g, 'ground', 210, 720), stacked = crate(g, 'pad', 210, 720);
  e.age = e.warn + 1; events.tick(1 / 30);
  assert.ok(human.x > tank.x && tank.x > 210); assert.equal(human.hp, 82);
  assert.equal(safe.x, 210); assert.equal(safe.hp, 100); assert.equal(loose.state, 'washed'); assert.equal(stacked.x, 210);
  events.tick(1 / 30); assert.equal(human.hp, 82);
  const before = g.crates.size; events.finish(); assert.ok(g.crates.size >= before + 8); assert.notEqual(loose.state, 'washed');
});

test('event movement stops at solid walls and map boundaries', () => {
  const { g } = arena('blackhole');
  g.solids = [{ x: 300, y: 300, w: 40, h: 200 }];
  const u = unit(g, 'human', 280, 400);
  g.eventMove(u, 15, 0, u.r); assert.equal(u.x, 286);
  g.eventMove(u, 120, 0, u.r); assert.equal(u.x, 286); // collapse cannot tunnel through thin walls
  g.eventMove(u, -99999, -99999, u.r); assert.ok(Math.abs(u.x - 54) < 1e-8); assert.ok(Math.abs(u.y - 54) < 1e-8);
});

test('bots choose an escape outside blackhole and dragon zones, and climb during tsunami', () => {
  for (const kind of ['blackhole', 'dragon', 'tsunami']) {
    const { g, events, e } = arena(kind);
    const u = unit(g, 'bot', e.x, e.y);
    if (kind === 'tsunami') { u.x = 600; u.y = 600; g.hills = [{ x: 700, y: 600, r: 100, h: 40 }]; }
    const goal = events.escapeGoal(u); assert.ok(goal, kind + ' needs an escape goal');
    if (kind === 'blackhole') assert.ok(Math.hypot(goal.x - e.x, goal.y - e.y) > e.radius);
    if (kind === 'dragon') assert.ok(Math.abs(-(goal.x - e.x) * e.dy + (goal.y - e.y) * e.dx) > e.width);
    if (kind === 'tsunami') assert.deepEqual(goal, { x: 700, y: 600 });
    g.think(u, 1 / 30); assert.deepEqual(u.ai.goal, goal);
  }
});

test('scheduler preserves existing events and prevents overlap with meteors or rage', () => {
  const g = new Game(2); g.startRound();
  assert.equal(g.randomEvent('not-an-event'), false);
  assert.equal(g.randomEvent('meteor'), true); assert.ok(g.meteors.length >= 7);
  assert.equal(g.randomEvent('blackhole'), false);
  g.meteors = []; assert.equal(g.randomEvent('rage'), true);
  assert.equal(g.randomEvent('tsunami'), false);
  g.monster().rage = 0; const n = g.crates.size;
  assert.equal(g.randomEvent('supply'), true); assert.ok(g.crates.size > n);
  assert.equal(g.randomEvent('dragon'), true);
});

test('new clients receive event rules and active state without an announcement replay', () => {
  const { g, e } = arena('blackhole'); e.age = 6;
  const messages = [], connection = { send: s => messages.push(JSON.parse(s)), backlog: 0 };
  g.events = []; g.addConnection(connection); g.broadcast();
  assert.ok(['blackhole', 'dragon', 'tsunami'].every(k => messages[0].arenaEvents[k]));
  assert.equal(messages[1].A.kind, 'blackhole'); assert.equal(messages[1].A.age, 6); assert.deepEqual(messages[1].ev, []);
});

test('all three maps and both team counts simulate every event through completion', () => {
  for (const teams of [2, 4]) for (let map = 0; map < 3; map++) for (const kind of ['blackhole', 'dragon', 'tsunami']) {
    const g = new Game(teams); g.setMap(map); g.startRound(); g.evtTimer = 999;
    assert.equal(g.randomEvent(kind), true, `${teams} teams / map ${map} / ${kind}`);
    let ticks = 0;
    while (g.arenaEvents.active && ticks++ < 900) {
      g.tick();
      for (const u of g.units.values()) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp));
      for (const c of g.crates.values()) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z));
    }
    assert.ok(ticks < 900, 'event should finish without stalling');
    assert.equal(JSON.parse(g.snapshot()).A, null);
  }
});


test('opt-in preview starts the selected first event after 8 seconds; normal timing stays random', () => {
  for (const kind of ['blackhole', 'dragon', 'tsunami']) {
    const g = new Game(2, { firstEvent: kind }); g.startRound();
    assert.equal(g.evtTimer, 8);
    for (let i = 0; i < 239; i++) g.tick();
    assert.equal(g.arenaEvents.active, null);
    for (let i = 0; i < 3; i++) g.tick();
    assert.equal(g.arenaEvents.active.kind, kind); assert.equal(g.pendingFirstEvent, null);
    assert.ok(g.evtTimer >= 44 && g.evtTimer <= 75);
  }
  const normal = new Game(2); normal.startRound();
  assert.ok(normal.evtTimer >= 40 && normal.evtTimer <= 55);
  assert.equal(new Game(2, { firstEvent: 'unknown' }).firstEvent, null);
});
