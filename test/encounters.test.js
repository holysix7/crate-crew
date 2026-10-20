'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../server/game');
const { LORD } = require('../server/encounters');

function arena() {
  const g = new Game(2); g.clearWorld(); g.state = 'playing';
  g.solids = []; g.walls = []; g.pits = []; g.hills = [];
  g.evtTimer = g.crateTimer = g.monsterTimer = 99999;
  return g;
}
function human(g, team = 0, x = 700, y = 600) {
  const u = g.spawnUnit(team, 'human', x, y); u.shield = 0; return u;
}
function startUfo(g, victim) {
  g.pits = [{ x: 1000, y: 800, r: 60 }];
  assert.equal(g.randomEvent('ufo'), true);
  const e = g.arenaEvents.active; assert.equal(e.target, victim.id);
  e.age = e.warn; g.arenaEvents.tick(0.01); return e;
}

test('metal crates split once into exactly two wooden crates after a thrown landing', () => {
  const g = arena(), u = human(g);
  const metal = g.createCrate(u.x, u.y, { metal: true, state: 'carried', by: u.id }); u.carry = metal.id;
  g.throwCrate(u);
  for (let i = 0; i < 100; i++) g.tick();
  assert.equal(g.crates.has(metal.id), false); assert.equal(g.crates.size, 2);
  assert.ok([...g.crates.values()].every(c => !c.metal && c.state === 'ground'));
  assert.equal(g.encounters.splitMetal(metal), false); assert.equal(g.crates.size, 2);
});
test('ambient metal landing stays metal, and pad placement keeps it carried until thrown', () => {
  const g = arena();
  const c = g.createCrate(700, 600, { metal: true, z: 50 });
  for (let i = 0; i < 30; i++) g.tick();
  assert.equal(g.crates.get(c.id).metal, true); assert.equal(g.crates.size, 1);
  const b = g.bases[0], u = human(g, 0, b.pad.x, b.pad.y);
  Object.assign(c, { state: 'carried', by: u.id }); u.carry = c.id;
  g.grab(u); assert.equal(u.carry, c.id); assert.equal(g.padCount(0), 0);
});
test('a metal wall impact shatters without waiting for landing', () => {
  const g = arena(), u = human(g, 0, 700, 600);
  g.solids = [{ x: 745, y: 500, w: 40, h: 200 }];
  const c = g.createCrate(700, 600, { metal: true, state: 'carried', by: u.id }); u.carry = c.id;
  g.throwCrate(u); g.tick(); g.tick(); g.tick();
  assert.equal(g.crates.has(c.id), false); assert.equal(g.crates.size, 2);
});
test('monster drops eight crates, two metal, and three useful weapon pickups', () => {
  const g = arena(), attacker = human(g), monster = g.spawnMonster();
  g.damage(monster, 9999, attacker.id);
  assert.equal(g.crates.size, 8); assert.equal([...g.crates.values()].filter(c => c.metal).length, 2);
  assert.deepEqual([...g.pickups.values()].map(p => p.w).sort(), ['bazooka', 'laser', 'minigun']);
  assert.ok([...g.pickups.values()].every(p => p.ammo === WEAPONS[p.w].ammo && p.ttl === 50));
  g.kill(monster, attacker.id); assert.equal(g.crates.size, 8);
});
test('E swaps a non-empty equipped gun for a loot pickup and drops the old gun', () => {
  const g = arena(), u = human(g); u.weapon = 'smg'; u.ammo = 30;
  g.encounters.dropWeapon(u.x, u.y, 'laser'); g.grab(u);
  assert.equal(u.weapon, 'laser');
  assert.equal([...g.pickups.values()].find(p => p.w === 'smg').ammo, 30);
});
test('helicopter supplies are neutral until landed and first contact claims both rewards atomically', () => {
  const g = arena(); g.encounters.spawnDrop({ x: 700, y: 600 });
  const drop = [...g.encounters.airdrops.values()][0], tank = g.units.get(drop.tankId);
  const first = human(g), second = human(g, 1, 710, 600);
  assert.equal(tank.team, -2); assert.equal(tank.neutral, true);
  assert.equal(g.encounters.claimDrop(drop, first), false);
  drop.z = 0; assert.equal(g.encounters.claimDrop(drop, first), true);
  assert.equal(first.weapon, 'superbazooka'); assert.equal(first.ammo, 6);
  assert.equal(drop.team, 0); assert.equal(tank.team, 0); assert.equal(tank.neutral, false);
  assert.equal(g.encounters.claimDrop(drop, second), false); assert.equal(second.weapon, 'pistol');
  const wire = JSON.parse(g.snapshot()).D[0]; assert.equal(wire[4], 0);
});
test('touching the neutral tank claims the bundle, and a LORD cannot claim it', () => {
  const g = arena(); g.encounters.spawnDrop({ x: 700, y: 600 });
  const drop = [...g.encounters.airdrops.values()][0], tank = g.units.get(drop.tankId); drop.z = 0;
  const lord = human(g, 0, tank.x, tank.y); g.encounters.becomeLord(lord);
  assert.equal(g.encounters.claimDrop(drop, lord), false);
  const u = human(g, 1, tank.x, tank.y); g.encounters.tickDrops(0.01);
  assert.equal(tank.team, 1); assert.equal(u.weapon, 'superbazooka');
});
test('unclaimed supplies expire cleanly; a claimed tank persists', () => {
  const g = arena(); g.encounters.spawnDrop({ x: 700, y: 600 });
  const d = [...g.encounters.airdrops.values()][0], id = d.tankId;
  g.encounters.tickDrops(80); assert.equal(g.units.has(id), false); assert.equal(g.encounters.airdrops.size, 0);
  g.encounters.spawnDrop({ x: 700, y: 600 }); const claimed = [...g.encounters.airdrops.values()][0]; claimed.z = 0;
  const u = human(g); g.encounters.claimDrop(claimed, u); g.encounters.tickDrops(7);
  assert.equal(g.units.has(claimed.tankId), true);
});

test('UFO captures one target, blocks actions while airborne, and drops them in a pit', () => {
  const g = arena(), victim = human(g), e = startUfo(g, victim);
  const other = human(g, 1, victim.x + 10, victim.y);
  g.arenaEvents.tick(2.5);
  assert.equal(e.captive, victim.id); assert.equal(victim.abducted, e.ufo); assert.equal(other.abducted, undefined);
  const gun = victim.weapon; g.action(victim, 'grab'); g.fire(victim);
  assert.equal(victim.weapon, gun); assert.equal(g.bullets.length, 0);
  g.arenaEvents.tick(7);
  assert.equal(g.units.has(victim.id), false); assert.equal(g.units.has(other.id), true); assert.equal(g.arenaEvents.active, null);
});
test('shooting the UFO frees the captive safely and drops a laser', () => {
  const g = arena(), victim = human(g), e = startUfo(g, victim);
  g.arenaEvents.tick(2.5); const rescuer = human(g, 1, 800, 650);
  g.damage(g.units.get(e.ufo), 9999, rescuer.id); g.arenaEvents.tick(0.01);
  assert.equal(victim.abducted, 0); assert.equal(victim.lift, 0); assert.equal(g.units.has(victim.id), true);
  assert.equal(g.inPit(victim.x, victim.y), null); assert.ok([...g.pickups.values()].some(p => p.w === 'laser'));
});
test('a target that escapes the beam is never abducted; no retarget to nearby players', () => {
  const g = arena(), target = human(g), e = startUfo(g, target), other = human(g, 1, target.x, target.y);
  target.x += 160; g.arenaEvents.tick(2.5);
  assert.equal(g.arenaEvents.active, null); assert.equal(other.abducted, undefined); assert.equal(target.abducted, undefined);
  assert.equal(g.units.has(e.ufo), false);
});
test('chickens steal loose crates, leave pads untouched, and return carried loot on death', () => {
  const g = arena(); assert.equal(g.randomEvent('chickens'), true);
  const e = g.arenaEvents.active; e.age = e.warn; g.arenaEvents.tick(0.01);
  const bird = g.units.get(e.chickens[0]); assert.equal(e.chickens.length, 10);
  const loose = g.createCrate(bird.x, bird.y, { state: 'ground', z: 0 });
  const pad = g.createCrate(bird.x, bird.y, { state: 'pad', z: 0 }); g.pads[0][0] = pad.id;
  g.encounters.thinkChicken(bird, 0.1); assert.equal(bird.carry, loose.id); assert.equal(pad.state, 'pad');
  const stolenCount = g.crates.size;
  g.kill(bird, 0); assert.equal(loose.state, 'ground'); assert.equal(g.pads[0][0], pad.id);
  assert.equal(g.crates.size, stolenCount); // Return the stolen crate without duplicating it.
  const emptyBird = g.units.get(e.chickens[1]); const before = g.crates.size;
  g.kill(emptyBird, 0); assert.equal(g.crates.size, before + 1);
  g.arenaEvents.finish(); assert.ok(![...g.units.values()].some(u => u.kind === 'chicken'));
});

test('killing LORD grants a weaker melee form that cannot carry crates or claim vehicles', () => {
  const g = arena(), u = human(g); assert.equal(g.randomEvent('lord'), true);
  const e = g.arenaEvents.active; e.age = e.warn; g.arenaEvents.tick(0.01);
  const boss = g.units.get(e.boss); assert.equal(boss.hp, LORD.bossHP);
  const c = g.createCrate(u.x, u.y, { state: 'carried', by: u.id }); u.carry = c.id;
  g.damage(boss, 9999, u.id); g.arenaEvents.tick(0.01);
  assert.equal(u.lord, true); assert.equal(u.max, LORD.playerHP); assert.ok(u.max < LORD.bossHP);
  assert.equal(u.weapon, 'lordblade'); assert.equal(c.state, 'ground'); assert.equal(u.carry, 0);
  g.action(u, 'grab'); g.grab(u); assert.equal(u.carry, 0);
  const tank = g.spawnUnit(0, 'tank', u.x, u.y); g.board(u, tank); assert.equal(tank.driver, null);
  const enemy = human(g, 1, u.x + 45, u.y); u.a = 0; g.fire(u);
  assert.equal(enemy.hp, 100 - LORD.playerDamage); assert.equal(g.bullets.length, 0);
});
test('player LORD death removes the buff; it does not transfer or survive respawn', () => {
  const g = arena(), u = human(g), killer = human(g, 1, 800, 600);
  const id = 123; u.owner = id;
  const p = { id, team: 0, name: 'Lord QA', unitId: u.id, input: { mx: 0, my: 0, a: 0, fire: false }, acts: [], deaths: 0, kills: 0, respawn: 0 };
  g.players.set(id, p); g.encounters.becomeLord(u); g.kill(u, killer.id);
  assert.equal(killer.lord, undefined); assert.ok(![...g.pickups.values()].some(p => p.w === 'lordblade'));
  for (let i = 0; i < 125; i++) g.tick();
  const respawned = g.units.get(p.unitId); assert.ok(respawned); assert.equal(respawned.lord, undefined); assert.equal(respawned.max, 100);
});
test('a driver that defeats LORD exits the tank and becomes LORD; environmental kills grant no buff', () => {
  const g = arena(), driver = human(g), tank = g.spawnUnit(0, 'tank', driver.x, driver.y);
  g.board(driver, tank); const boss = g.spawnUnit(-3, 'lord', 900, 700); boss.lordBoss = true;
  g.kill(boss, tank.id); assert.equal(tank.driver, null); assert.equal(driver.lord, true); assert.equal(g.units.has(driver.id), true);
  const secondBoss = g.spawnUnit(-3, 'lord', 900, 700); secondBoss.lordBoss = true;
  g.kill(secondBoss, 0); assert.equal([...g.units.values()].filter(u => u.lord).length, 1);
});
test('LORD remains after its arrival announcement, and another cannot spawn while one exists', () => {
  const g = arena(); g.randomEvent('lord'); const e = g.arenaEvents.active; e.age = e.warn; g.arenaEvents.tick(0.01);
  const boss = g.units.get(e.boss); g.arenaEvents.finish();
  assert.equal(g.units.has(boss.id), true); assert.equal(g.randomEvent('lord'), false);
});

test('tsunami redistributes swept wood and metal in symmetric, safe groups on every map', () => {
  for (const teams of [2, 4]) for (let map = 0; map < 3; map++) {
    const g = new Game(teams); g.setMap(map); g.clearWorld(); g.state = 'playing'; g.randomEvent('tsunami');
    const e = g.arenaEvents.active;
    for (let i = 0; i < 8; i++) { const c = g.createCrate(900, 700, { state: 'washed', metal: i < 3 }); e.swept.add(c.id); }
    const pad = g.createCrate(200, 200, { state: 'pad' }); g.pads[0][0] = pad.id;
    g.arenaEvents.finish(); const crates = [...g.crates.values()].filter(c => c.id !== pad.id);
    const quadrants = [0, 0, 0, 0], metal = [0, 0, 0, 0];
    for (const c of crates) {
      assert.equal(c.state, 'air'); assert.ok(g.encounters.validSpot(c.x, c.y));
      const q = (c.x > 960 ? 1 : 0) + (c.y > 720 ? 2 : 0); quadrants[q]++; if (c.metal) metal[q]++;
      assert.ok(crates.some(other => Math.abs(other.x - (1920 - c.x)) < 1e-6 && Math.abs(other.y - (1440 - c.y)) < 1e-6 && !!other.metal === !!c.metal));
    }
    assert.equal(new Set(quadrants).size, 1); assert.equal(new Set(metal).size, 1); assert.equal(pad.state, 'pad');
  }
});
test('encounter snapshots and round reset preserve no dangling abducted players or drops', () => {
  const g = arena(), target = human(g); const e = startUfo(g, target); g.arenaEvents.tick(2.5);
  assert.equal(JSON.parse(g.snapshot()).U.find(u => u[0] === target.id)[19], 70);
  assert.equal(JSON.parse(g.snapshot()).A.captive, target.id);
  g.encounters.spawnDrop({ x: 800, y: 600 }); g.toLobby();
  const snapshot = JSON.parse(g.snapshot()); assert.equal(snapshot.A, null); assert.deepEqual(snapshot.D, []); assert.deepEqual(snapshot.U, []);
});
test('all new events simulate to completion in all maps and team counts', () => {
  for (const teams of [2, 4]) for (let map = 0; map < 3; map++) for (const kind of ['ufo', 'airdrop', 'chickens', 'lord']) {
    const g = new Game(teams); g.setMap(map); g.startRound(); g.evtTimer = 99999;
    assert.equal(g.randomEvent(kind), true);
    let ticks = 0;
    while (g.arenaEvents.active && ticks++ < 1200) {
      g.tick();
      for (const u of g.units.values()) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp));
    }
    assert.ok(ticks < 1200); assert.ok(![...g.units.values()].some(u => u.abducted));
  }
});


test('preview queue runs new events in order and then returns to normal scheduling', () => {
  const g = new Game(2, { firstEvent: ['airdrop', 'chickens', 'lord'] }); g.startRound();
  assert.equal(g.pendingFirstEvent, 'airdrop');
  for (const kind of ['airdrop', 'chickens', 'lord']) {
    g.evtTimer = 0; g.tick(); assert.equal(g.arenaEvents.active.kind, kind);
    g.arenaEvents.finish();
  }
  assert.equal(g.pendingFirstEvent, null); assert.ok(g.evtTimer >= 45 && g.evtTimer <= 75);
});

test('bots actively contest an unclaimed airdrop instead of leaving it unused', () => {
  const g = arena(); g.encounters.spawnDrop({ x: 700, y: 600 });
  const bot = g.spawnBot(0, 620, 600); bot.ai.t = 0;
  g.think(bot, 1 / 30);
  assert.equal(bot.ai.goal.id, [...g.encounters.airdrops.values()][0].id);
});
