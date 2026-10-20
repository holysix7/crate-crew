'use strict';

const { RectIndex } = require('./spatial-index');
// Appended after existing guns: old weapon indices and normal loot stay stable.
const MELEE = {
  sword:   { label:'Pedang',   dmg:24, rate:0.62, reach:66,  arc:0.1,  windup:0.14, knock:70,  walk:1,    color:'#cdeaff' },
  spear:   { label:'Tombak',   dmg:28, rate:0.85, reach:108, arc:0.86, windup:0.22, knock:80,  walk:0.95, color:'#f4d58b' },
  axe:     { label:'Kapak',    dmg:39, rate:1.05, reach:72,  arc:-0.05,windup:0.32, knock:130, walk:0.9,  color:'#ff9f7b' },
  hammer:  { label:'Palu',     dmg:48, rate:1.3,  reach:60,  arc:0.2,  windup:0.42, knock:220, walk:0.85, color:'#c8a8ff' },
  dagger:  { label:'Belati',   dmg:13, rate:0.34, reach:42,  arc:0.45, windup:0.08, knock:25,  walk:1.15, color:'#87efc2' },
  halberd: { label:'Halberd',  dmg:33, rate:1.08, reach:100, arc:0.35, windup:0.3,  knock:110, walk:0.92, color:'#ffc86d' },
  katana:  { label:'Katana',   dmg:21, rate:0.56, reach:82,  arc:0.6,  windup:0.16, knock:60,  walk:1.08, color:'#ffb8da' },
};
const RACKS=Object.keys(MELEE).map((w,i)=>({w,x:480,y:162+i*66}));
const walls=[{x:80,y:60,w:800,h:20},{x:80,y:640,w:800,h:20},{x:80,y:80,w:20,h:560},{x:860,y:80,w:20,h:560}];
for(const mx of [false,true])for(const my of [false,true])for(const r of [{x:80,y:80,w:80,h:40},{x:80,y:120,w:40,h:40}])
  walls.push({...r,x:mx?960-r.x-r.w:r.x,y:my?720-r.y-r.h:r.y});
walls.push({x:344,y:320,w:32,h:80},{x:584,y:320,w:32,h:80});
const DUEL_MAP={id:'duel-arena',duel:true,name:'Arena Selang Waktu',desc:'Duel melee 1v1 · semua pemain lain menonton',tag:'Arena 1v1',theme:'ruins',
  w:960,h:720,tile:40,crateH:24,zone:290,walls,bases:[],hills:[],pits:[],hazards:[],bridges:[],outside:[],racks:RACKS};
const neutral=()=>({mx:0,my:0,a:0,fire:false});

class DuelArena {
  constructor(game){this.game=game;this.enabled=false;this.active=false;this.fighters=[0,0];this.result=null;}
  side(id){return this.active?this.fighters.indexOf(id):-1;}
  rosterChanged(){
    if(this.active)return;
    const ids=[...this.game.players.keys()];
    this.fighters=this.fighters.map(id=>ids.includes(id)?id:0);
    for(let i=0;i<2;i++)if(!this.fighters[i])this.fighters[i]=ids.find(id=>!this.fighters.includes(id))||0;
  }
  configure(p,m){
    const g=this.game;
    if(!g.isMaster(p,'mengatur duel 1v1'))return false;
    if(m.abort===true&&this.active){
      this.result={winner:0,reason:'cancelled'};g.toLobby();g.events.push({k:'duelend',winner:0,reason:'cancelled'});g.broadcast(true);return true;
    }
    if(!['lobby','countdown'].includes(g.state))return false;
    if(this.active)return false;
    if(typeof m.enabled==='boolean'){
      if(m.enabled===this.enabled)return false;
      this.enabled=m.enabled;this.result=null;this.rosterChanged();g.toLobby();
    }else if(Array.isArray(m.fighters)){
      if(!this.enabled||m.fighters.length!==2||new Set(m.fighters).size!==2||!m.fighters.every(id=>Number.isSafeInteger(id)&&g.players.has(id)))return false;
      this.fighters=[...m.fighters];this.result=null;
      for(const q of g.players.values())q.ready=false;
    }else if(m.start===true){
      if(!this.enabled||this.fighters.some(id=>!g.players.has(id))||this.fighters[0]===this.fighters[1])return false;
      this.start();return true;
    }else return false;
    g.events.push({k:'duelcfg',n:p.name});g.broadcast(true);return true;
  }
  start(){
    const g=this.game;g.clearWorld();this.active=true;this.result=null;
    g.mapMeta=DUEL_MAP;g.walls=DUEL_MAP.walls;g.solids=g.walls;g.hills=[];g.pits=[];g.hazards=[];g.bridges=[];g.outside=[];
    g.solidIndex=new RectIndex(g.solids,960,720);g.wallIndex=g.solidIndex;
    g.state='countdown';g.countdown=3;g.roundLeft=120;
    for(const p of g.players.values()){p.unitId=0;p.respawn=0;p.ready=false;p.input=neutral();p.acts=[];}
    this.fighters.forEach((id,side)=>{
      const p=g.players.get(id),u=g.spawnUnit(side,'human',side?760:200,360,p.id);
      p.unitId=u.id;p.input.a=u.a=side?Math.PI:0;u.shield=0;u.hp=u.max=120;u.weapon='sword';u.ammo=Infinity;
    });
    for(const rack of RACKS){const id=g.id();g.pickups.set(id,{id,...rack,ammo:Infinity,ttl:Infinity});}
    this.sendWelcome();g.events.push({k:'duelstart'});g.broadcast(true);
  }
  sendWelcome(){const g=this.game,s=g.welcome();for(const c of g.conns)c.send(s);}
  restore(){this.active=false;const g=this.game;g.setMap(g.mapIdx);for(const p of g.players.values()){p.input=neutral();p.acts=[];p.respawn=0;}this.rosterChanged();}
  leave(id){
    if(!this.active){this.rosterChanged();return;}
    if(!this.fighters.includes(id)||this.game.state==='ended')return;
    if(this.game.state==='countdown'){
      this.result={winner:0,reason:'cancelled'};this.game.toLobby();this.game.events.push({k:'duelend',winner:0,reason:'cancelled'});
    }else this.finish(this.fighters.find(q=>q!==id)||0,'disconnect');
    this.game.broadcast(true);
  }
  finish(winner,reason){
    const g=this.game;if(g.state==='ended')return;
    this.result={winner,reason};g.state='ended';g.endTimer=3;g.winner=winner?this.fighters.indexOf(winner):-1;
    for(const p of g.players.values()){p.input=neutral();p.acts=[];}
    g.events.push({k:'duelend',winner,reason});
  }
  killed(u){const p=this.game.players.get(u.owner);if(p){p.unitId=0;p.respawn=0;}this.game.removeUnit(u);}
  equip(u){
    if(u.swing)return;
    const g=this.game;let rack=null,nearest=36;
    for(const p of g.pickups.values())if(MELEE[p.w]){const d=Math.hypot(p.x-u.x,p.y-u.y);if(d<nearest){rack=p;nearest=d;}}
    if(!rack||u.weapon===rack.w)return;
    u.weapon=rack.w;u.cd=Math.max(u.cd,MELEE[rack.w].rate*0.5);g.events.push({k:'duelweapon',p:u.owner,w:rack.w});
  }
  move(u,dx,dy){
    const g=this.game;g.eventMove(u,dx,dy,u.r);
    u.x=Math.max(100+u.r,Math.min(860-u.r,u.x));u.y=Math.max(80+u.r,Math.min(640-u.r,u.y));
  }
  tick(dt){
    const g=this.game;
    if(g.state==='lobby')return;
    if(g.state==='ended'){if((g.endTimer-=dt)<=0)g.toLobby();return;}
    if(g.state==='countdown'){
      for(const p of g.players.values())p.acts=[];
      if((g.countdown-=dt)<=0){g.countdown=0;g.state='playing';}return;
    }
    if((g.roundLeft-=dt)<=0){this.finish(0,'timeout');return;}
    // Resolve both fighters' due attacks before deciding the winner, permitting trades.
    const hits=[];
    for(const u of g.units.values()){
      const p=g.players.get(u.owner);if(!p||!this.fighters.includes(p.id))continue;
      u.cd=Math.max(0,u.cd-dt);u.anim=Math.max(0,u.anim-dt);u.a=p.input.a;
      for(const action of p.acts)if(action.k==='grab')this.equip(u);
      p.acts=[];
      const w=MELEE[u.weapon];let {mx,my}=p.input;const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;}
      this.move(u,mx*165*w.walk*dt,my*165*w.walk*dt);u.moving=len>0.1;
      if(u.swing&&(u.swing.left-=dt)<=0){
        const attack=u.swing;u.swing=null;const def=MELEE[attack.w];
        g.events.push({k:'duelstrike',x:u.x,y:u.y,a:attack.a,r:def.reach,w:attack.w});
        for(const v of g.units.values())if(v.id!==u.id&&Math.hypot(v.x-u.x,v.y-u.y)<=def.reach+v.r&&
          Math.cos(Math.atan2(v.y-u.y,v.x-u.x)-attack.a)>=def.arc&&g.los(u.x,u.y,v.x,v.y))hits.push({u,v,def,a:attack.a});
      }
      if(p.input.fire&&u.cd<=0&&!u.swing){
        u.cd=w.rate;u.anim=w.windup+0.2;u.swing={w:u.weapon,a:u.a,left:w.windup};
        g.events.push({k:'duelswing',id:u.id,x:u.x,y:u.y,a:u.a,r:w.reach,w:u.weapon});
      }
    }
    const units=[...g.units.values()];
    if(units.length===2){const [a,b]=units,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r=a.r+b.r;
      if(d<r){const nx=d?dx/d:1,ny=d?dy/d:0;this.move(a,-nx*(r-d)/2,-ny*(r-d)/2);this.move(b,nx*(r-d)/2,ny*(r-d)/2);}}
    for(const {u,v,def,a} of hits){g.damage(v,def.dmg,u.id);if(g.units.has(v.id))this.move(v,Math.cos(a)*def.knock*0.12,Math.sin(a)*def.knock*0.12);}
    const survivors=this.fighters.filter(id=>g.units.has(g.players.get(id)?.unitId));
    if(survivors.length<2)this.finish(survivors[0]||0,survivors.length?'kill':'trade');
    for(const p of g.players.values())if(!this.fighters.includes(p.id))p.acts=[];
  }
  snapshot(){return {enabled:this.enabled,active:this.active,fighters:this.fighters,result:this.result};}
}
module.exports={DuelArena,MELEE,DUEL_MAP,RACKS};
