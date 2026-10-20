'use strict';
// Deterministic four-team workload. Optional BASELINE_GAME points to an older
// server/game.js extracted with git show; dependencies resolve from this repo.
const path=require('node:path'),fs=require('node:fs'),Module=require('node:module'),crypto=require('node:crypto');
let Game;
if(process.env.BASELINE_GAME){const filename=path.resolve(__dirname,'../server/game.js'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(fs.readFileSync(process.env.BASELINE_GAME,'utf8'),filename);Game=m.exports.Game;}
else ({Game}=require('../server/game'));
function run(){let seed=1228;const original=Math.random;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
try{
 const g=new Game(4);g.startRound();g.eventsEnabled=false;g.roundLeft=1e6;g.evtTimer=g.monsterTimer=1e6;
 for(const u of g.units.values())g.removeUnit(u);
 for(let team=0;team<4;team++)for(let i=0;i<8;i++){const b=g.bases[team],u=g.spawnUnit(team,'bot',b.spawn.x+(i%4)*45,b.spawn.y+Math.floor(i/4)*45);u.hp=u.max=u.shield=1e6;}
 let bytes=0,packets=0;g.conns.add({backlog:0,send:s=>{bytes+=Buffer.byteLength(s);packets++;}});
 for(let i=0;i<250;i++)g.bullets.push({id:g.id(),x:200+(i%25)*95,y:300+Math.floor(i/25)*100,vx:250,vy:80,team:i%4,dmg:0,life:1000,owner:0});
 const start=performance.now();for(let n=0;n<900;n++)g.tick();const ms=performance.now()-start;
 const state=JSON.parse(g.snapshot());delete state.ev;
 return {ticks:900,ms:+ms.toFixed(2),packets,bytes,units:g.units.size,crates:g.crates.size,stateHash:crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex')};
}finally{Math.random=original;}}
run();const results=Array.from({length:5},run),median=results.map(r=>r.ms).sort((a,b)=>a-b)[2];console.log(JSON.stringify({medianMs:median,runs:results},null,2));
