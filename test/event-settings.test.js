'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, EVENT_OPTIONS } = require('../server/game');

function join(g, name, team) {
  const messages = [], c = { backlog: 0, send: s => messages.push(JSON.parse(s)), close: () => g.removeConn(c) };
  g.addConnection(c); g.onMsg(c, { t: 'join', name, team }); return { c, p: c.player, messages };
}
function fixture(preview = []) {
  const g = new Game(2, { firstEvent: preview }), host = join(g, 'Host', 0), guest = join(g, 'Guest', 1);
  const change = (who, update) => g.onMsg(who.c, { t: 'events', ...update });
  return { g, host, guest, change };
}

test('all twelve event options default to enabled and settings/catalog are synchronized to clients', () => {
  const { g, host } = fixture();
  assert.equal(EVENT_OPTIONS.length, 12);
  assert.ok(EVENT_OPTIONS.every(option => g.isEventEnabled(option.id)));
  assert.deepEqual(host.messages[0].eventOptions, EVENT_OPTIONS);
  assert.deepEqual(JSON.parse(g.snapshot()).es, [1, (1 << 12) - 1]);
});

test('only the room master can toggle the global switch and individual event rules', () => {
  const { g, host, guest, change } = fixture();
  change(guest, { enabled: false }); change(guest, { kind: 'train', enabled: false });
  assert.equal(g.eventsEnabled, true); assert.equal(g.isEventEnabled('train'), true);
  assert.ok(guest.messages.some(m => m.sys && m.s.includes('room master')));
  change(host, { kind: 'train', enabled: false }); assert.equal(g.isEventEnabled('train'), false);
  assert.equal(g.isEventEnabled('mbg'), true);
  const mask = g.eventMask;
  change(host, { enabled: false }); assert.equal(g.eventsEnabled, false);
  assert.equal(g.eventMask, mask); assert.ok(EVENT_OPTIONS.every(option => !g.isEventEnabled(option.id)));
  change(host, { enabled: true }); assert.equal(g.isEventEnabled('train'), false); assert.equal(g.isEventEnabled('mbg'), true);
});

test('malformed or unchanged event settings do not mutate state, announcements, or Ready status', () => {
  const { g, host, guest, change } = fixture();
  host.p.ready = guest.p.ready = true;
  const mask = g.eventMask, announcements = g.events.length;
  for (const update of [{ enabled: 'false' }, { enabled: 0 }, { kind: 'unknown', enabled: false }, { kind: '__proto__', enabled: true }, { kind: null, enabled: false }, { kind: 'train', enabled: true }]) change(host, update);
  assert.equal(g.eventMask, mask); assert.equal(g.eventsEnabled, true); assert.equal(g.events.length, announcements);
  assert.equal(host.p.ready, true); assert.equal(guest.p.ready, true);
});

test('changing an event setting cancels countdown and clears every player Ready flag', () => {
  const { g, host, guest, change } = fixture();
  host.p.ready = guest.p.ready = true; g.lobbyTick(0.01); assert.equal(g.state, 'countdown');
  change(host, { kind: 'meteor', enabled: false });
  assert.equal(g.state, 'lobby'); assert.equal(g.countdown, 0); assert.equal(host.p.ready, false); assert.equal(guest.p.ready, false);
  for (const client of [host, guest]) assert.ok(client.messages.filter(m => m.t === 's').at(-1).ev.some(e => e.k === 'eventcfg' && e.name === 'Hujan Meteor' && e.v === false));
  assert.equal(g.events.length, 0); // delivered immediately, rather than waiting in the queue
});

test('match messages cannot change settings; choices persist through map, rounds, and master handover', () => {
  const { g, host, guest, change } = fixture();
  change(host, { kind: 'tsunami', enabled: false }); const mask = g.eventMask;
  g.onMsg(host.c, { t: 'map', i: 1 }); assert.equal(g.eventMask, mask);
  g.startRound(); change(host, { enabled: false }); assert.equal(g.eventsEnabled, true);
  change(host, { kind: 'tsunami', enabled: true }); assert.equal(g.eventMask, mask);
  g.toLobby(); assert.equal(g.eventMask, mask);
  g.giveMaster(host.p, guest.p); change(host, { kind: 'train', enabled: false }); assert.equal(g.isEventEnabled('train'), true);
  change(guest, { kind: 'train', enabled: false }); assert.equal(g.isEventEnabled('train'), false);
  g.removeConn(guest.c); assert.equal(g.master, host.p.id); assert.equal(g.isEventEnabled('tsunami'), false); assert.equal(g.isEventEnabled('train'), false);
});

test('global off blocks regular/forced events and preview while ordinary crate drops and monster remain', () => {
  const { g, host, change } = fixture(['train', 'mbg']);
  change(host, { enabled: false }); g.startRound();
  assert.equal(g.pendingFirstEvent, null); assert.deepEqual(g.previewQueue, []);
  for (const option of EVENT_OPTIONS) assert.equal(g.randomEvent(option.id), false, option.id);
  assert.equal(g.arenaEvents.start('train'), false);
  assert.equal(g.randomEvent(), false); const mon = g.monster(); assert.ok(mon); assert.equal(mon.rage, 0);
  const initial = g.crates.size; g.crateTimer = 0; g.evtTimer = 0; g.tick();
  assert.ok(g.crates.size > initial); assert.ok(g.evtTimer >= 44); assert.equal(g.arenaEvents.active, null); assert.deepEqual(g.meteors, []);
});

test('an individually disabled event cannot run and the lottery picks only enabled options', () => {
  const { g, host, change } = fixture();
  for (const option of EVENT_OPTIONS) if (option.id !== 'mbg') change(host, { kind: option.id, enabled: false });
  g.startRound();
  assert.equal(g.randomEvent('meteor'), false); assert.equal(g.arenaEvents.start('train'), false);
  for (let i = 0; i < 10; i++) { assert.equal(g.randomEvent(), true); assert.equal(g.arenaEvents.active.kind, 'mbg'); g.arenaEvents.finish(); }
});

test('preview skips disabled entries and zero selected events uses a bounded retry timer', () => {
  const { g, host, change } = fixture(['train', 'mbg']);
  change(host, { kind: 'train', enabled: false }); g.startRound();
  assert.equal(g.pendingFirstEvent, 'mbg'); assert.equal(g.evtTimer, 8);
  g.evtTimer = 0; g.tick(); assert.equal(g.arenaEvents.active.kind, 'mbg');
  g.toLobby(); for (const option of EVENT_OPTIONS) change(host, { kind: option.id, enabled: false });
  g.startRound(); g.evtTimer = 0; g.tick(); assert.equal(g.arenaEvents.active, null); assert.ok(g.evtTimer >= 44);
});
