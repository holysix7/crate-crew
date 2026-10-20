'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../server/game');
const {MAPS}=require('../server/maps');
const {RectIndex}=require('../server/spatial-index');
function join(g,name,team){const messages=[],c={backlog:0,send:s=>messages.push(JSON.parse(s)),close:()=>g.removeConn(c)};g.addConnection(c);g.onMsg(c,{t:'join',name,team});return {c,p:c.player,messages};}
function room(){const g=new Game(4),host=join(g,'Host',0),guest=join(g,'Guest',3),third=join(g,'Third',2);return {g,host,guest,third};}

test('master chooses 2–4 teams, safely reassigns closed-team players and preserves room settings',()=>{
 const {g,host,guest,third}=room();g.configureEvents(host.p,{kind:'train',enabled:false});g.setMap(3);g.toLobby();g.cpu=false;
 g.onMsg(guest.c,{t:'teams',count:2});assert.equal(g.teams,4);
 host.p.ready=guest.p.ready=third.p.ready=true;g.state='countdown';g.countdown=1;
 g.onMsg(host.c,{t:'teams',count:2});assert.equal(g.teams,2);assert.equal(g.bases.length,2);assert.equal(g.state,'lobby');assert.equal(g.countdown,0);
 assert.deepEqual([...g.players.values()].map(p=>p.team),[0,1,0]);assert.ok([...g.players.values()].every(p=>!p.ready));
 assert.equal(g.mapInfo().id,'sungai');assert.equal(g.cpu,false);assert.equal(g.isEventEnabled('train'),false);
 const welcome=guest.messages.filter(m=>m.t==='welcome').at(-1);assert.equal(welcome.teams,2);assert.equal(welcome.map.bases.length,2);
 assert.equal(guest.messages.filter(m=>m.t==='joined').at(-1).team,1);
 assert.equal(guest.messages.filter(m=>m.t==='s').at(-1).hq.length,2);
 g.onMsg(host.c,{t:'teams',count:3});assert.equal(g.teams,3);assert.equal(g.bases.length,3);
 g.onMsg(host.c,{t:'teams',count:4});g.startRound();assert.equal(g.teams,4);assert.equal(g.bases.length,4);assert.equal(g.isEventEnabled('train'),false);
});
test('invalid, unchanged and in-match team counts leave the room unchanged',()=>{
 const {g,host,guest}=room();host.p.ready=guest.p.ready=true;
 for(const count of [1,5,2.5,'2',null,4]){g.onMsg(host.c,{t:'teams',count});assert.equal(g.teams,4);assert.equal(host.p.ready,true);assert.equal(guest.p.ready,true);}
 g.startRound();g.onMsg(host.c,{t:'teams',count:2});assert.equal(g.teams,4);assert.equal(g.state,'playing');
 g.toLobby();g.giveMaster(host.p,guest.p);g.onMsg(host.c,{t:'teams',count:2});assert.equal(g.teams,4);
 g.onMsg(guest.c,{t:'teams',count:3});assert.equal(g.teams,3);g.setMap(1);g.toLobby();assert.equal(g.teams,3);
});
test('15 Hz snapshots preserve the 30 Hz simulation and retain every queued event exactly once',()=>{
 const g=new Game(4),messages=[],c={backlog:0,send:s=>messages.push(JSON.parse(s))};g.conns.add(c);g.clearWorld();g.state='playing';g.evtTimer=g.crateTimer=g.monsterTimer=99999;
 for(let n=0;n<900;n++)g.tick();assert.equal(messages.length,450);assert.ok(Math.abs(g.time-30)<1e-8);
 g.broadcast(true);messages.length=0;g.events.push({k:'probe',seq:1});g.tick();assert.equal(messages.length,0);assert.equal(g.events.length,1);
 g.events.push({k:'probe',seq:2});g.tick();assert.deepEqual(messages[0].ev.map(e=>e.seq),[1,2]);
 g.tick();g.tick();assert.equal(messages[1].ev.length,0);
 g.toLobby();g.broadcast(true);messages.length=0;for(let n=0;n<180;n++)g.tick();assert.equal(messages.length,30);
 const host=join(g,'Immediate',0);let count=messages.length;
 g.onMsg(host.c,{t:'ready',v:true});assert.equal(messages.length,count+1);assert.equal(messages.at(-1).PL[0][7],1);
 count=messages.length;g.onMsg(host.c,{t:'events',enabled:false});assert.equal(messages.length,count+1);assert.equal(messages.at(-1).es[0],0);
 count=messages.length;g.onMsg(host.c,{t:'cpu',v:false});assert.equal(messages.length,count+1);assert.equal(messages.at(-1).lb[0],0);
});
test('state transitions send immediately and snapshots are skipped without writable clients',()=>{
 const g=new Game(2),messages=[],c={backlog:0,send:s=>messages.push(JSON.parse(s))};g.conns.add(c);g.broadcast(true);messages.length=0;
 g.startRound();g.tick();assert.equal(messages[0].st,'playing');
 const snapshot=g.snapshot;g.snapshot=()=>{throw new Error('must not serialize');};c.backlog=1e6;g.events.push({k:'probe'});assert.doesNotThrow(()=>g.broadcast(true));assert.equal(g.events.length,0);
 g.conns.clear();assert.doesNotThrow(()=>g.tick());g.snapshot=snapshot;c.backlog=0;g.conns.add(c);assert.doesNotThrow(()=>g.broadcast(true));
});
test('spatial index returns every intersecting rectangle at cell edges with no duplicates',()=>{
 for(let map=0;map<MAPS.length;map++){
  const g=new Game(4);g.setMap(map);const {w,h}=g.mapInfo();
  for(const pad of [0,14,32])for(let y=0;y<=h;y+=80)for(let x=0;x<=w;x+=80){
   const candidates=g.nearSolids(x,y,pad);assert.equal(new Set(candidates).size,candidates.length);
   for(const p of g.solids)if(x>=p.x-pad&&x<=p.x+p.w+pad&&y>=p.y-pad&&y<=p.y+p.h+pad)assert.ok(candidates.includes(p));
  }
 }
 const items=[{x:79,y:79,w:90,h:90}],index=new RectIndex(items,320,320);assert.equal(index.near(80,80,32).length,1);index.epoch=0xfffffffe;assert.equal(index.near(80,80).length,1);assert.equal(index.epoch,1);
});
test('indexed line of sight matches a full scan and respects custom test geometry',()=>{
 const g=new Game(4);g.setMap(4);
 const reference=(x1,y1,x2,y2,pad)=>{const d=Math.hypot(x2-x1,y2-y1),n=Math.ceil(d/12);for(let i=1;i<n;i++){
  const x=x1+(x2-x1)*i/n,y=y1+(y2-y1)*i/n;
  if(g.solids.some(s=>x>s.x-pad&&x<s.x+s.w+pad&&y>s.y-pad&&y<s.y+s.h+pad)||(pad&&g.inPit(x,y,-pad-4)))return false;
 }return true;};
 let seed=42;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let n=0;n<400;n++){const args=[random()*2880,random()*2160,random()*2880,random()*2160],pad=n%2?19:0;assert.equal(g.los(...args,null,pad),reference(...args,pad));}
 g.solids=[];assert.equal(g.los(100,100,1500,100),true);
});

test('friendly fire updates immediately at lobby cadence and survives team/map changes',()=>{
 const {g,host,guest}=room();g.broadcast(true);const n=guest.messages.length;
 g.onMsg(host.c,{t:'ff',v:true});
 assert.equal(guest.messages.length,n+1);assert.equal(guest.messages.at(-1).lb[3],1);
 assert.ok(guest.messages.at(-1).ev.some(e=>e.k==='ff'&&e.v));
 g.onMsg(host.c,{t:'events',kind:'train',enabled:false});const mask=g.eventMask;
 g.onMsg(host.c,{t:'teams',count:2});assert.equal(g.ff,true);assert.equal(g.eventMask,mask);
 g.onMsg(host.c,{t:'map',i:3});assert.equal(g.ff,true);assert.equal(g.eventMask,mask);
 g.onMsg(guest.c,{t:'ff',v:false});assert.equal(g.ff,true);
 g.startRound();g.onMsg(host.c,{t:'ff',v:false});assert.equal(g.ff,true);
});
test('grab and throw finish on every arena for each configured team count',()=>{
 for(const count of [2,3,4])for(let map=0;map<MAPS.length;map++){
  const g=new Game(count);g.setMap(map);g.clearWorld();g.state='playing';g.ff=true;
  const spawn=g.bases[0].spawn,a=g.spawnUnit(0,'human',spawn.x,spawn.y);
  a.shield=0;a.a=Math.atan2(1080-a.y,1440-a.x);
  const v=g.spawnUnit(1,'human',a.x+Math.cos(a.a)*29,a.y+Math.sin(a.a)*29);v.shield=0;
  g.grabUnit(a);assert.equal(a.holding,v.id,`map=${map}, teams=${count}`);
  g.throwUnit(a);for(let n=0;n<60;n++)g.tickHeld(1/30);
  assert.ok(!a.holding);assert.ok(!g.units.has(v.id)||(!v.abducted&&!v.flight&&!v.heldBy));
 }
});
