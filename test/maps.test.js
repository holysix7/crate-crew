'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Game, EVENT_OPTIONS } = require('../server/game');
const { MAPS, TILE, COLS, ROWS } = require('../server/maps');
const { planTrain, trainPoint } = require('../server/train');
const label = (i, teams) => `${MAPS[i].id}/${teams} teams`;
function arena(i, teams = 4) { const g = new Game(teams); g.setMap(i); g.startRound(); g.evtTimer = 99999; return g; }
const reflectedRect = (p, w, h, mx, my) => ({ ...p, x: mx ? w-p.x-p.w : p.x, y: my ? h-p.y-p.h : p.y });

test('six larger arenas mirror walls, elevations, death zones and bridges for all four corners', () => {
  assert.equal(MAPS.length, 6); assert.equal(new Set(MAPS.map(m=>m.id)).size, 6);
  for (let i=0;i<MAPS.length;i++) {
    const g = arena(i), {w,h} = g.mapInfo();
    assert.equal(w*h/(1920*1440),2.25); assert.equal(g.bases.length,4);
    assert.ok(g.outside.length>4); assert.ok(g.walls.some(p=>p.boundary&&p.x>2*TILE&&p.x<(COLS-3)*TILE));
    for (const list of [g.walls,g.hazards,g.bridges,g.outside]) for (const p of list) for (const [mx,my] of [[1,0],[0,1],[1,1]]) {
      const q=reflectedRect(p,w,h,mx,my);
      assert.ok(list.some(v=>v.x===q.x&&v.y===q.y&&v.w===p.w&&v.h===p.h),label(i,4));
    }
    for (const list of [g.hills,g.pits]) for (const p of list) for (const [mx,my] of [[1,0],[0,1],[1,1]]) {
      assert.ok(list.some(v=>v.x===(mx?w-p.x:p.x)&&v.y===(my?h-p.y:p.y)&&v.r===p.r&&v.h===p.h));
    }
    const distances=g.bases.map(b=>Math.hypot(b.spawn.x-w/2,b.spawn.y-h/2));
    assert.ok(Math.max(...distances)-Math.min(...distances)<1e-8);
  }
});

test('2, 3 and 4 team layouts preserve safe HQ pads, vehicle-wide routes and reachable tsunami refuges', () => {
  for (const teams of [2,3,4]) for(let i=0;i<MAPS.length;i++) {
    const g=arena(i,teams),{w,h}=g.mapInfo(), routes=[];
    for(const b of g.bases) {
      assert.ok(g.encounters.validSpot(b.spawn.x,b.spawn.y,20),label(i,teams));
      assert.ok(g.encounters.validSpot(b.pad.x,b.pad.y,60),label(i,teams));
      const route=g.findPath(b.spawn.x,b.spawn.y,w/2,h/2); assert.ok(route?.length,label(i,teams)); routes.push(route.length);
      for(const p of route) {
        assert.ok(!g.inPit(p.x,p.y,-19));
        assert.ok(!g.solids.some(s=>Math.hypot(p.x-Math.max(s.x,Math.min(s.x+s.w,p.x)),p.y-Math.max(s.y,Math.min(s.y+s.h,p.y)))<19));
      }
      for(const other of g.bases) if(other!==b) assert.ok(g.findPath(b.spawn.x,b.spawn.y,other.pad.x,other.pad.y)?.length);
      assert.ok(g.hills.some(p=>g.heightAt(p.x,p.y)>=18&&g.encounters.validSpot(p.x,p.y,20)&&
        Math.hypot(p.x-b.spawn.x,p.y-b.spawn.y)<650&&g.findPath(b.spawn.x,b.spawn.y,p.x,p.y)?.length));
    }
    assert.ok(Math.max(...routes)-Math.min(...routes)<=1,label(i,teams));
    assert.ok(g.encounters.fairSpot());
  }
});

test('river, lava and chasm kill infantry and a tank with its driver; bridges remain traversable', () => {
  for (const i of [1,3,5]) {
    const g=arena(i),p=g.hazards.find(p=>g.inPit(p.x+p.w/2,p.y-10)===null),x=p.x+p.w/2,y=p.y+p.h/2;
    const soldier=g.spawnUnit(0,'human',x,y),driver=g.spawnUnit(1,'human',x,y),tank=g.spawnUnit(1,'tank',x,y);g.board(driver,tank);
    g.tick(); assert.ok(!g.units.has(soldier.id));assert.ok(!g.units.has(tank.id));assert.ok(!g.units.has(driver.id));
    for(const bridge of g.bridges) {
      const u=g.spawnUnit(0,'human',bridge.x+bridge.w/2,bridge.y+bridge.h/2);
      assert.equal(g.inPit(u.x,u.y,-19),null);g.tick();assert.ok(g.units.has(u.id));
    }
    assert.equal(g.inPit(x,p.y-10),null); assert.ok(g.inPit(x,p.y-10,-20));
  }
});

test('every planned train route clears interior walls, HQs and terrain death zones', () => {
  for(let i=0;i<MAPS.length;i++) {
    const g=arena(i),{w,h}=g.mapInfo();
    // Fixed RNG exercises both axes, travel directions, and route preference reproducibly.
    const random=Math.random;
    try { for(const value of [0.1,0.4,0.6,0.9]) {
      Math.random=()=>value; const e={duration:9};planTrain(g,e);
      for(let n=0;n<=600;n++) {
        const p=trainPoint(e,e.length*n/600);
        if(p.x<TILE||p.y<TILE||p.x>w-TILE||p.y>h-TILE)continue;
        assert.ok(!g.inPit(p.x,p.y,-40) || g.inPit(p.x,p.y,-40).kind==='void',`${MAPS[i].id}: track enters terrain hazard`);
        assert.ok(!g.solids.filter(s=>!s.boundary).some(s=>p.x>s.x-32&&p.x<s.x+s.w+32&&p.y>s.y-32&&p.y<s.y+s.h+32),`${MAPS[i].id}: track enters wall`);
      }
    }} finally { Math.random=random; }
  }
});

test('all twelve events complete on all six arenas with four active teams', () => {
  for(let i=0;i<MAPS.length;i++) for(const {id:kind} of EVENT_OPTIONS) {
    const g=arena(i);
    assert.equal(g.randomEvent(kind),true,`${MAPS[i].id}/${kind}`);
    if(g.arenaEvents.active) {
      const e=g.arenaEvents.active;
      for(let n=0;n<Math.ceil((e.warn+e.duration+0.1)*30);n++) g.tick();
      assert.equal(g.arenaEvents.active,null,`${MAPS[i].id}/${kind} never finishes`);
    } else for(let n=0;n<500;n++)g.tick();
    assert.equal(g.bases.length,4);assert.equal(g.state,'playing');
    for(const p of g.pickups.values())assert.ok(g.encounters.validSpot(p.x,p.y,10),`${MAPS[i].id}/${kind}: unsafe gun`);
    assert.ok([...g.units.values()].every(u=>Number.isFinite(u.x)&&Number.isFinite(u.y)));
    g.toLobby();assert.equal(g.arenaEvents.active,null);
  }
});

test('reused path buffers keep independent searches correct, including unreachable goals and epoch rollover', () => {
  const g=arena(4),b=g.bases[0],target=g.bases[1].spawn;
  const buffers=[g.pathPrev,g.pathQueue,g.pathVisited],first=g.findPath(b.spawn.x,b.spawn.y,target.x,target.y);
  for(let n=0;n<50;n++)assert.deepEqual(g.findPath(b.spawn.x,b.spawn.y,target.x,target.y),first);
  [g.pathPrev,g.pathQueue,g.pathVisited].forEach((buffer,i)=>assert.strictEqual(buffer,buffers[i]));
  const copy=new Uint8Array(g.blocked);g.blocked.fill(1);assert.equal(g.findPath(b.spawn.x,b.spawn.y,target.x,target.y),null);g.blocked.set(copy);
  g.pathEpoch=0xfffffffe;assert.deepEqual(g.findPath(b.spawn.x,b.spawn.y,target.x,target.y),first);assert.equal(g.pathEpoch,1);
  g.setMap(3);assert.equal(g.pathEpoch,0);assert.ok(g.findPath(b.spawn.x,b.spawn.y,target.x,target.y));
});

test('client terrain uses the server hazard geometry and keeps bridge decks level', () => {
  const source=fs.readFileSync(require.resolve('../public/terrain.js'),'utf8').replace(/export /g,'');
  const groundHeight=vm.runInNewContext(source+'; groundHeight');
  for(let i=0;i<MAPS.length;i++) {
    const g=arena(i),map=g.mapInfo();
    for(const p of g.hazards)assert.ok(groundHeight(map,p.x+p.w/2,p.y+p.h/2)<-30);
    for(const p of g.hazards)for(const q of g.hazards)if(p!==q&&p.x+p.w===q.x) {
      const top=Math.max(p.y,q.y),bottom=Math.min(p.y+p.h,q.y+q.h);
      if(top>=bottom)continue;
      const x=q.x,y=(top+bottom)/2;
      assert.equal(g.inPit(x,y).kind,p.kind,'shared channel edges cannot be crossed as dry land');
      assert.equal(g.inPit(x,y,6).kind,p.kind,'physics shore tolerance must not open a seam');
      const u=g.spawnUnit(0,'human',x,y);g.tick();
      assert.ok(!g.units.has(u.id),'a player cannot cross the channel along an internal join');
      assert.ok(groundHeight(map,x,y)<-30,'channel joins must not render raised dry seams');
    }
    for(const p of g.bridges)assert.equal(groundHeight(map,p.x+p.w/2,p.y+p.h/2),g.heightAt(p.x+p.w/2,p.y+p.h/2));
    assert.equal(map.w,COLS*TILE);assert.equal(map.h,ROWS*TILE);
  }
});

test('cached navigation grids stay isolated between rooms and later map selections', () => {
  for(let i=0;i<MAPS.length;i++) {
    const a=arena(i),b=arena(i),target=b.bases[1].spawn;
    a.blocked.fill(1);
    assert.ok(b.findPath(b.bases[0].spawn.x,b.bases[0].spawn.y,target.x,target.y)?.length);
    const c=arena(i);
    assert.ok(c.findPath(c.bases[0].spawn.x,c.bases[0].spawn.y,target.x,target.y)?.length);
    assert.notStrictEqual(a.blocked,b.blocked);assert.notStrictEqual(b.blocked,c.blocked);
    assert.equal(JSON.parse(c.welcome()).maps.length,6);
  }
});
