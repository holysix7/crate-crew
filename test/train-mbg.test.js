'use strict';

const test = require('node:test');
const { MAPS } = require('../server/maps');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Game, WEAPONS } = require('../server/game');
const { trainPoint, tickTrain } = require('../server/train');

function arena(kind) {
  const g = new Game(2); g.clearWorld(); g.state = 'playing';
  g.solids = []; g.walls = []; g.pits = []; g.hills = [];
  g.evtTimer = g.crateTimer = g.monsterTimer = 99999;
  assert.equal(g.randomEvent(kind), true);
  return { g, e: g.arenaEvents.active };
}
function human(g, team, x = 700, y = 600) {
  const id = g.id(), p = { id, name: 'QA', team, unitId: 0, kills: 0, deaths: 0, input: { mx: 0, my: 0, a: 0, fire: false }, acts: [], respawn: 0 };
  g.players.set(id, p);
  const u = g.spawnUnit(team, 'human', x, y, id); p.unitId = u.id; return u;
}

test('train warning is harmless, serializes the swerving route, and resets with the round', () => {
  const { g, e } = arena('train');
  const p = trainPoint(e, e.length / 2), u = human(g, 0, p.x, p.y);
  g.arenaEvents.tick(e.warn - 0.01); assert.ok(g.units.has(u.id));
  const a = JSON.parse(g.snapshot()).A;
  assert.equal(a.kind, 'train'); assert.equal(a.cars, 3); assert.ok(a.swerve >= 100);
  assert.equal(g.randomEvent('mbg'), false);
  g.toLobby(); assert.equal(JSON.parse(g.snapshot()).A, null);
});

test('train kills either team, shielded humans, and player LORD while missing units outside the route', () => {
  const { g, e } = arena('train'), t = e.duration / 2, p = trainPoint(e, t * e.speed);
  const a = human(g, 0, p.x, p.y), b = human(g, 1, p.x + 2, p.y);
  g.encounters.becomeLord(b); a.shield = 999;
  const safe = human(g, 1, p.x - Math.sin(p.a) * 180, p.y + Math.cos(p.a) * 180);
  tickTrain(g, e, t, 1 / 30);
  assert.equal(g.units.has(a.id), false); assert.equal(g.units.has(b.id), false); assert.equal(g.units.has(safe.id), true);
  assert.equal(g.players.get(a.owner).deaths, 1); assert.equal(g.players.get(b.owner).deaths, 1);
});

test('train sweeps between ticks and wagons are lethal independently of the engine', () => {
  const { g, e } = arena('train'), t = e.duration / 2;
  const wagon = trainPoint(e, t * e.speed - e.spacing * 2), tail = human(g, 0, wagon.x, wagon.y);
  tickTrain(g, e, t, 0); assert.equal(g.units.has(tail.id), false);
  const midway = trainPoint(e, (t + 0.5) * e.speed), u = human(g, 0, midway.x, midway.y);
  tickTrain(g, e, t + 1, 1); assert.equal(g.units.has(u.id), false);
});

test('a train hit destroys the tank and driver; airborne captives and neutral rewards are excluded', () => {
  const { g, e } = arena('train'), t = e.duration / 2, p = trainPoint(e, t * e.speed);
  const driver = human(g, 0, p.x, p.y), tank = g.spawnUnit(0, 'tank', p.x, p.y); g.board(driver, tank);
  const flying = g.spawnUnit(-4, 'ufo', p.x, p.y); flying.fly = true;
  const captive = human(g, 1, p.x, p.y); captive.abducted = flying.id;
  const neutral = g.spawnUnit(-2, 'tank', p.x, p.y); neutral.neutral = true;
  const hq = [...g.hq];
  tickTrain(g, e, t, 1 / 30);
  assert.equal(g.units.has(tank.id), false); assert.equal(g.units.has(driver.id), false);
  assert.equal(g.players.get(driver.owner).deaths, 1);
  assert.ok([flying, captive, neutral].every(u => g.units.has(u.id))); assert.deepEqual(g.hq, hq);
});

test('train bots step off the marked curve, and client/server route calculations agree', () => {
  const { g, e } = arena('train'), p = trainPoint(e, e.length / 2);
  const bot = g.spawnUnit(0, 'bot', p.x, p.y), goal = g.arenaEvents.escapeGoal(bot);
  assert.ok(goal && Math.hypot(goal.x - bot.x, goal.y - bot.y) > 100);
  const source = fs.readFileSync(require.resolve('../public/arena-events.js'), 'utf8');
  const definition = source.match(/export function trainPoint\([\s\S]+?\n}/)[0].replace('export ', '');
  const clientPoint = vm.runInNewContext(definition + '; trainPoint');
  for (let i = 0; i <= 120; i++) {
    const server = trainPoint(e, e.length * i / 120), client = clientPoint(e, e.length * i / 120);
    for (const key of ['x', 'y', 'a']) assert.ok(Math.abs(server[key] - client[key]) < 1e-10);
  }
});

test('MBG drops one random gun per human, bot, driver, and respawning player without replacing equipment', () => {
  const { g, e } = arena('mbg');
  const a = human(g, 0), b = human(g, 1, 800, 600), c = human(g, 0, 900, 600), respawn = human(g, 1, 1000, 600);
  const bot = g.spawnUnit(1, 'bot', 1100, 600), tank = g.spawnUnit(0, 'tank', c.x, c.y); g.board(c, tank);
  g.removeUnit(respawn); g.players.get(respawn.owner).unitId = 0;
  a.weapon = 'laser'; a.ammo = 7; g.encounters.becomeLord(b);
  g.arenaEvents.tick(e.warn - 0.01); assert.equal(g.pickups.size, 0);
  g.arenaEvents.tick(0.02);
  assert.equal(g.pickups.size, 5); assert.equal(e.gifts.length, 5);
  const notices = g.events.filter(ev => ev.k === 'mbg' && ev.stage === 'delivered');
  assert.equal(notices.length, 4);
  assert.deepEqual(new Set(notices.map(ev => ev.p)), new Set([a.owner, b.owner, c.owner, respawn.owner]));
  assert.equal(a.weapon, 'laser'); assert.equal(a.ammo, 7); assert.equal(b.weapon, 'lordblade'); assert.equal(c.weapon, 'pistol');
  for (const gift of g.pickups.values()) {
    assert.ok(!['pistol', 'tank', 'jeep', 'lordblade', 'superbazooka'].includes(gift.w));
    assert.equal(gift.ammo, WEAPONS[gift.w].ammo); assert.equal(gift.ttl, 45);
    assert.ok(g.encounters.validSpot(gift.x, gift.y, 12));
  }
  assert.ok(Math.hypot(e.gifts[0][1] - a.x, e.gifts[0][2] - a.y) >= 45);
  g.arenaEvents.tick(0.1); assert.equal(g.pickups.size, 5); // one delivery per event
  assert.equal(JSON.parse(g.snapshot()).A.gifts.length, 5);
  assert.ok(g.units.has(bot.id));
});

test('MBG pickups can be swapped, stay after the announcement, then expire normally', () => {
  const { g, e } = arena('mbg'), u = human(g, 0); u.weapon = 'minigun'; u.ammo = 23;
  g.arenaEvents.tick(e.warn + 0.01);
  const gift = [...g.pickups.values()][0]; u.x = gift.x; u.y = gift.y; g.grab(u);
  assert.equal(u.weapon, gift.w); assert.equal([...g.pickups.values()][0].ammo, 23);
  assert.ok(g.events.some(ev => ev.k === 'mbg' && ev.p === u.owner && ev.stage === 'received' && ev.w === gift.w));
  g.arenaEvents.finish(); assert.equal(g.pickups.size, 1);
  g.encounters.spawnMbg({}); assert.equal(g.pickups.size, 2);
  for (let i = 0; i < 1400; i++) g.tick();
  assert.equal(g.pickups.size, 0);
});

test('MBG automatic pickup notifies the collector once; ordinary pickups never show the MBG badge', () => {
  const { g, e } = arena('mbg'), u = human(g, 0);
  g.arenaEvents.tick(e.warn + 0.01);
  const gift = [...g.pickups.values()][0], received = [];
  g.events = [];
  g.conns.add({ backlog: 0, send: s => received.push(...JSON.parse(s).ev) });
  u.x = gift.x; u.y = gift.y; g.tick(); g.tick();
  const notices = received.filter(ev => ev.k === 'mbg');
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0], { k: 'mbg', p: u.owner, stage: 'received', w: gift.w });
  g.encounters.dropWeapon(u.x, u.y, 'smg'); g.grab(u); g.broadcast();
  assert.equal(received.filter(ev => ev.k === 'mbg').length, 1);
});

test('train and MBG finish on all maps/team counts and work in the preview queue', () => {
  for (const teams of [2, 3, 4]) for (let map = 0; map < MAPS.length; map++) for (const kind of ['train', 'mbg']) {
    const g = new Game(teams, { firstEvent: [kind, kind === 'train' ? 'mbg' : 'train'] });
    g.setMap(map); g.startRound(); g.evtTimer = 0;
    g.tick(); assert.equal(g.arenaEvents.active.kind, kind);
    if (kind === 'train') {
      const e = g.arenaEvents.active, { w, h, tile } = g.mapInfo();
      const inside = g.solids.filter(s => !s.boundary && s.x > tile && s.y > tile && s.x + s.w < w - tile && s.y + s.h < h - tile);
      for (let i = 0; i <= 150; i++) {
        const p = trainPoint(e, e.length * i / 150);
        assert.ok(!inside.some(s => p.x > s.x - 24 && p.x < s.x + s.w + 24 && p.y > s.y - 24 && p.y < s.y + s.h + 24), 'rails clear interior walls and HQs');
      }
    }
    g.evtTimer = 99999;
    let ticks = 0;
    while (g.arenaEvents.active && ticks++ < 700) {
      g.tick();
      for (const u of g.units.values()) assert.ok([u.x, u.y, u.hp].every(Number.isFinite));
    }
    assert.ok(ticks < 700); g.toLobby(); assert.equal(g.pickups.size, 0);
  }
});
