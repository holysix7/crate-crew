'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game,WEAPONS}=require('../server/game');
const {MELEE,DUEL_MAP,RACKS}=require('../server/duel');
function connect(g,name,team=0){const messages=[],c={backlog:0,send:s=>messages.push(JSON.parse(s)),close:()=>g.removeConn(c)};g.addConnection(c);g.onMsg(c,{t:'join',name,team});return {c,p:c.player,messages};}
function room(){const g=new Game(4),host=connect(g,'Host',0),a=connect(g,'Alpha',0),b=connect(g,'Bravo',0),viewer=connect(g,'Viewer',3);return {g,host,a,b,viewer};}
function start(r){const {g,host,a,b}=r;g.onMsg(host.c,{t:'duel',enabled:true});g.onMsg(host.c,{t:'duel',fighters:[a.p.id,b.p.id]});g.onMsg(host.c,{t:'duel',start:true});return r;}
function playing(r){start(r);for(let i=0;i<91;i++)r.g.tick();assert.equal(r.g.state,'playing');return r;}
function pair(r){return [r.g.units.get(r.a.p.unitId),r.g.units.get(r.b.p.unitId)];}
function resetPair(r){const [a,b]=pair(r);Object.assign(a,{x:210,y:220,a:0,cd:0,swing:null,hp:120,anim:0});Object.assign(b,{x:260,y:220,a:Math.PI,cd:0,swing:null,hp:120,anim:0});r.a.p.input={mx:0,my:0,a:0,fire:false};r.b.p.input={mx:0,my:0,a:Math.PI,fire:false};return [a,b];}
function attack(r,u,target,id,{distance=40,angle=0}={}){u.weapon=id;u.cd=0;u.swing=null;u.a=0;u.x=210;u.y=220;target.x=210+Math.cos(angle)*distance;target.y=220+Math.sin(angle)*distance;target.hp=120;
 r.a.p.input.fire=true;r.a.p.input.a=0;r.g.tick();r.a.p.input.fire=false;assert.equal(target.hp,120,'windup has no instant damage');for(let i=0;i<Math.ceil(MELEE[id].windup*30)+1;i++)r.g.tick();return target.hp;}

test('only master enables/selects/starts a duel; rejects invalid and duplicate fighters',()=>{
 const r=room(),{g,host,a,b}=r;
 g.onMsg(a.c,{t:'duel',enabled:true});assert.equal(g.duel.enabled,false);
 g.onMsg(host.c,{t:'duel',enabled:'true'});assert.equal(g.duel.enabled,false);
 g.onMsg(host.c,{t:'duel',enabled:true});assert.equal(g.duel.enabled,true);assert.equal(g.crates.size,0);
 const old=[...g.duel.fighters];for(const fighters of [[a.p.id,a.p.id],[a.p.id,9999],[a.p.id],[String(a.p.id),b.p.id]]){g.onMsg(host.c,{t:'duel',fighters});assert.deepEqual(g.duel.fighters,old);}
 g.onMsg(a.c,{t:'duel',fighters:[a.p.id,b.p.id]});assert.deepEqual(g.duel.fighters,old);
 g.onMsg(host.c,{t:'duel',fighters:[a.p.id,b.p.id]});g.onMsg(a.c,{t:'duel',start:true});assert.equal(g.state,'lobby');
 g.onMsg(host.c,{t:'duel',start:true});assert.equal(g.state,'countdown');assert.equal(g.units.size,2);
});

test('same-team fighters have opposing duel sides while host and all other players spectate',()=>{
 const r=start(room()),{g,host,a,b,viewer}=r;
 assert.equal(a.p.team,b.p.team);assert.equal(g.units.size,2);assert.equal(host.p.unitId,0);assert.equal(viewer.p.unitId,0);
 const [ua,ub]=pair(r);assert.deepEqual([ua.team,ub.team],[0,1]);assert.equal(ua.hp,120);assert.equal(ub.hp,120);assert.equal(ua.weapon,'sword');assert.equal(ub.weapon,'sword');
 assert.equal(g.mapInfo().id,DUEL_MAP.id);assert.deepEqual(g.mapInfo().bases,[]);assert.equal(g.pickups.size,7);
 const snap=JSON.parse(g.snapshot());assert.equal(snap.PL.find(p=>p[0]===host.p.id)[2],-1);assert.equal(snap.PL.find(p=>p[0]===b.p.id)[2],1);
 const late=connect(g,'Late',2);for(let n=0;n<120;n++)g.tick();assert.equal(g.units.size,2);assert.equal(late.p.unitId,0);
 g.onMsg(late.c,{t:'in',mx:1,f:true});g.onMsg(late.c,{t:'act',k:'grab'});assert.equal(late.p.input.fire,false);assert.deepEqual(late.p.acts,[]);
});

test('countdown suppresses combat, movement and queued grabs; normal settings are locked during duel',()=>{
 const r=start(room()),{g,host,a}=r,[u,v]=pair(r),x=u.x;
 a.p.input={mx:1,my:0,a:0,fire:true};g.onMsg(a.c,{t:'act',k:'grab'});
 for(let n=0;n<60;n++)g.tick();assert.equal(u.x,x);assert.equal(v.hp,120);assert.equal(g.bullets.length,0);assert.equal(a.p.acts.length,0);
 for(const m of [{t:'teams',count:2},{t:'map',i:3},{t:'ff',v:true},{t:'events',enabled:false},{t:'duel',enabled:false},{t:'duel',fighters:[host.p.id,a.p.id]}])g.onMsg(host.c,m);
 assert.equal(g.teams,4);assert.equal(g.mapInfo().id,DUEL_MAP.id);assert.equal(g.ff,false);assert.equal(g.eventsEnabled,true);assert.equal(g.duel.enabled,true);
});

test('seven distinct weapons respect windup, damage, reach and facing; no projectiles',()=>{
 assert.equal(Object.keys(MELEE).length,7);assert.ok(MELEE.sword&&MELEE.spear);
 for(const id of Object.keys(MELEE)){
  const r=playing(room()),[u,v]=resetPair(r),w=MELEE[id];
  assert.equal(attack(r,u,v,id,{distance:w.reach-5}),120-w.dmg,id);
  resetPair(r);assert.equal(attack(r,u,v,id,{distance:w.reach+35}),120,id+' out of reach');
  resetPair(r);assert.equal(attack(r,u,v,id,{distance:40,angle:Math.PI}),120,id+' behind');
  assert.equal(r.g.bullets.length,0);assert.equal(WEAPONS[id].melee,true);
 }
});

test('melee line of sight prevents hitting through arena pillars',()=>{
 const r=playing(room()),[u,v]=pair(r);Object.assign(u,{x:320,y:360,weapon:'spear',cd:0});Object.assign(v,{x:410,y:360});
 r.a.p.input={mx:0,my:0,a:0,fire:true};r.g.tick();r.a.p.input.fire=false;for(let i=0;i<9;i++)r.g.tick();assert.equal(v.hp,120);
});

test('all seven shared racks equip without disappearing and swapping cannot cancel an attack or reset cooldown',()=>{
 const r=playing(room()),[u,v]=pair(r);
 for(const rack of RACKS){u.x=rack.x;u.y=rack.y;u.cd=0;r.g.onMsg(r.a.c,{t:'act',k:'grab'});r.g.tick();assert.equal(u.weapon,rack.w);assert.equal(r.g.pickups.size,7);assert.equal(u.ammo,Infinity);}
 const rack=RACKS.find(r=>r.w==='spear');u.x=rack.x;u.y=rack.y;u.weapon='axe';u.cd=0.9;r.g.duel.equip(u);assert.equal(u.weapon,'spear');assert.equal(u.cd,0.9);
 u.swing={w:'spear',a:0,left:0.2};u.x=RACKS[0].x;u.y=RACKS[0].y;r.g.duel.equip(u);assert.equal(u.weapon,'spear');
 v.x=rack.x;v.y=rack.y;r.g.duel.equip(v);assert.equal(v.weapon,'spear');assert.equal(r.g.pickups.size,7);
});

test('first kill ends the duel, no respawn/events/loot, and automatically restores the lobby and settings',()=>{
 const r=room(),{g,host,a,b}=r;g.setMap(3);g.toLobby();g.cpu=false;g.ff=true;g.eventMask&=~1024;a.p.kills=7;b.p.deaths=2;
 playing(r);const [u,v]=resetPair(r);v.hp=1;r.a.p.input.fire=true;
 for(let n=0;n<12;n++)g.tick();assert.equal(g.state,'ended');assert.equal(g.duel.result.winner,a.p.id);assert.equal(g.duel.result.reason,'kill');
 assert.equal(g.units.size,1);assert.equal(g.crates.size,0);assert.equal(g.monster(),null);assert.equal(g.arenaEvents.active,null);assert.equal(g.pickups.size,7);
 for(let n=0;n<100;n++)g.tick();assert.equal(g.state,'lobby');assert.equal(g.duel.active,false);assert.equal(g.duel.enabled,true);assert.equal(g.units.size,0);
 assert.equal(g.mapInfo().id,'sungai');assert.equal(g.teams,4);assert.equal(g.ff,true);assert.equal(g.cpu,false);assert.equal(g.isEventEnabled('train'),false);assert.equal(a.p.team,0);assert.equal(b.p.team,0);assert.equal(a.p.kills,7);assert.equal(b.p.deaths,2);
 assert.equal(host.messages.filter(m=>m.t==='welcome').at(-1).map.id,'sungai');
 g.onMsg(host.c,{t:'duel',enabled:false});assert.equal(g.crates.size,10);g.startRound();assert.ok(g.monster());assert.equal(g.mapInfo().id,'sungai');
});

test('simultaneous lethal swings resolve as a trade rather than favoring iteration order',()=>{
 const r=playing(room()),[u,v]=resetPair(r);u.hp=v.hp=20;
 u.swing={w:'sword',a:0,left:0};v.swing={w:'sword',a:Math.PI,left:0};r.g.tick();
 assert.equal(r.g.units.size,0);assert.equal(r.g.duel.result.winner,0);assert.equal(r.g.duel.result.reason,'trade');
});

test('timeout draws and master can cancel while spectators cannot',()=>{
 const r=playing(room()),{g,host,viewer}=r;g.onMsg(viewer.c,{t:'duel',abort:true});assert.equal(g.state,'playing');
 g.roundLeft=0.01;g.tick();assert.equal(g.duel.result.reason,'timeout');assert.equal(g.duel.result.winner,0);
 g.onMsg(host.c,{t:'duel',abort:true});assert.equal(g.state,'lobby');assert.equal(g.mapInfo().duel,undefined);
 playing(r);g.onMsg(host.c,{t:'duel',abort:true});assert.equal(g.state,'lobby');assert.equal(g.duel.result.reason,'cancelled');
});

test('fighter disconnect cancels countdown or forfeits live duel; spectators and master handover are safe',()=>{
 for(const state of ['countdown','playing']){
  const r=state==='playing'?playing(room()):start(room());r.g.removeConn(r.a.c);
  if(state==='countdown'){assert.equal(r.g.state,'lobby');assert.equal(r.g.duel.active,false);}
  else{assert.equal(r.g.state,'ended');assert.equal(r.g.duel.result.winner,r.b.p.id);assert.equal(r.g.duel.result.reason,'disconnect');}
 }
 const r=playing(room());r.g.removeConn(r.host.c);assert.equal(r.g.state,'playing');assert.equal(r.g.master,r.a.p.id);
 r.g.onMsg(r.a.c,{t:'duel',abort:true});assert.equal(r.g.state,'lobby');
});

test('duels do not auto-start with ready spectators and cannot start with fewer than two players',()=>{
 const g=new Game(2),host=connect(g,'Solo');g.onMsg(host.c,{t:'duel',enabled:true});g.onMsg(host.c,{t:'duel',start:true});
 host.p.ready=true;for(let n=0;n<180;n++)g.tick();assert.equal(g.state,'lobby');assert.equal(g.units.size,0);
 const second=connect(g,'Second');g.onMsg(host.c,{t:'duel',start:true});assert.equal(g.state,'countdown');assert.equal(g.units.size,2);
});


test('arena containment and rack placement are fair from both spawn sides',()=>{
 for(const rack of RACKS)assert.equal(Math.hypot(rack.x-200,rack.y-360),Math.hypot(rack.x-760,rack.y-360));
 for(const [mx,my] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
  const r=playing(room()),[u]=pair(r);r.a.p.input={mx,my,a:0,fire:false};
  for(let n=0;n<300;n++)r.g.tick();
  assert.ok(u.x>=114&&u.x<=846&&u.y>=94&&u.y<=626);
  for(const s of DUEL_MAP.walls){const x=Math.max(s.x,Math.min(s.x+s.w,u.x)),y=Math.max(s.y,Math.min(s.y+s.h,u.y));assert.ok((x-u.x)**2+(y-u.y)**2>=u.r**2-1e-5);}
 }
});

test('nearest rack wins where ranges overlap and repeated duels clear pending inputs and weapons',()=>{
 const r=playing(room()),[u]=pair(r);u.x=480;u.y=RACKS[0].y+35;r.g.duel.equip(u);assert.equal(u.weapon,'spear');
 for(let n=0;n<5;n++){
  r.a.p.acts.push({k:'grab'});r.a.p.input.fire=true;
  r.g.onMsg(r.host.c,{t:'duel',abort:true});assert.deepEqual(r.a.p.acts,[]);assert.equal(r.a.p.input.fire,false);
  r.g.onMsg(r.host.c,{t:'duel',start:true});for(let i=0;i<91;i++)r.g.tick();
  assert.equal(r.g.units.size,2);assert.equal(r.g.pickups.size,7);assert.ok([...r.g.units.values()].every(u=>u.weapon==='sword'&&!u.swing&&u.hp===120));
 }
});
