'use strict';

// Every arena is 72 × 54 tiles (2.25× the old area). Quadrant geometry is
// reflected on both axes; terrain channels and bridge decks are symmetric too.
const TILE = 40, COLS = 72, ROWS = 54;
const MAPS = [
  { id: 'lembah', name: 'Lembah Benteng', theme: 'grass', tag: 'Benteng & bukit',
    desc: 'Lembah luas dengan benteng berlapis, rute sayap, dan bukit perlindungan.',
    walls: [[14,3,1,7],[4,13,7,1],[18,10,4,2],[11,20,2,5],[25,4,2,5],[27,15,3,2],[32,8,2,3]],
    hills: [[10,18,3,65],[19,18,3,55],[28,9,2.8,60],[26,24,2.2,44]], pits: [[18,23,1.8]] },
  { id: 'kawah', name: 'Ngarai Raksasa', theme: 'desert', tag: 'Jurang & 3 jembatan',
    desc: 'Jurang dalam membelah arena utara–selatan. Pilih jembatan tengah atau sergap lewat dua jembatan samping.',
    walls: [[14,3,2,6],[4,13,6,1],[19,17,2,5],[25,5,3,2],[28,16,2,2]],
    hills: [[11,19,3.2,70],[24,12,3,65],[25,25,2.5,55]], pits: [[16,22,1.6]],
    channels: [[33,1,6,9],[33,14,6,5],[33,35,6,5],[33,44,6,9]], hazard: 'chasm', depth: 220,
    bridges: [[32.5,10,7,4],[32.5,19,7,16],[32.5,40,7,4]] },
  { id: 'salju', name: 'Punggung Es', theme: 'snow', tag: 'Bukit tinggi & celah es',
    desc: 'Punggung salju tinggi, dinding es, dan celah beku. Rebut ketinggian untuk jarak tembak dan perlindungan tsunami.',
    walls: [[15,3,2,6],[4,14,5,2],[22,11,2,5],[13,23,5,1],[28,5,3,2],[26,18,2,2]],
    hills: [[11,20,3.5,95],[20,20,3.3,85],[29,12,3,90],[26,26,2.5,60]], pits: [[16,10,1.7],[29,19,1.5]] },
  { id: 'sungai', name: 'Sungai Kembar', theme: 'river', tag: 'Sungai & penyeberangan',
    desc: 'Sungai lebar di tengah dengan tiga penyeberangan. Air dalam mematikan; jembatan tengah jadi arena rebutan loot.',
    walls: [[14,3,1,6],[4,13,7,1],[19,10,3,2],[12,19,2,3],[26,5,3,2],[28,16,2,2]],
    hills: [[10,19,3,65],[22,19,2.8,65],[29,11,2.8,55],[27,23,2.2,45]], pits: [[17,16,1.4]],
    channels: [[1,25,9,4],[15,25,11,4],[46,25,11,4],[62,25,9,4]], hazard: 'river', depth: 65,
    bridges: [[10,24.5,5,5],[26,24.5,20,5],[57,24.5,5,5]] },
  { id: 'reruntuhan', name: 'Kota Reruntuhan', theme: 'ruins', tag: 'Blok kota & gang lebar',
    desc: 'Blok kota runtuh dan jalan lingkar memberi banyak cover. Jalan tengah tetap terbuka untuk duel dan kereta.',
    walls: [[14,3,2,6],[4,13,6,2],[18,11,4,2],[11,19,2,5],[22,19,3,2],[27,3,2,6],[28,14,3,2],[33,8,2,3]],
    hills: [[10,21,3,55],[20,24,2.7,55],[27,11,2.7,55],[27,23,2.1,45]], pits: [[18,17,1.5]] },
  { id: 'vulkan', name: 'Kepulauan Vulkanik', theme: 'volcano', tag: 'Lava & pulau tengah',
    desc: 'Kanal lava memisahkan pulau tengah dari jalur luar. Jembatan empat arah dan sayap terbuka memberi pilihan menyerang.',
    walls: [[14,3,1,6],[4,13,6,1],[18,11,3,2],[10,20,2,4],[26,4,3,2]],
    hills: [[10,19,3,75],[20,20,2.8,70],[28,9,3,75],[25,26,2.4,60]], pits: [[16,17,1.6]],
    channels: [[27,17,6,2],[39,17,6,2],[27,35,6,2],[39,35,6,2],[25,19,2,5],[25,30,2,5],[45,19,2,5],[45,30,2,5]],
    hazard: 'lava', depth: 85,
    bridges: [[33,16.5,6,3],[33,34.5,6,3],[24.5,24,3,6],[44.5,24,3,6]] },
];

// A tile mask gives each arena a scalloped/stepped silhouette. Both axes use
// absolute distance from the midpoint, so all four corner bases remain equal.
function outlineFor(def) {
  const land = new Uint8Array(COLS * ROWS);
  const profile = {
    grass: [6, 3], desert: [7, 4], snow: [5, 3], river: [8, 3], ruins: [6, 5], volcano: [8, 4],
  }[def.theme];
  const inset = (t, axis) => {
    const wave = Math.sin(Math.PI*t)**2, ripple = Math.sin(3*Math.PI*t)**2;
    if(def.theme==='ruins')return 1+(wave>0.7?profile[axis]:wave>0.25?1:0);
    return 1+Math.round(profile[axis]*wave+(def.theme==='snow'?1:0.6)*ripple);
  };
  for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++) {
    const ix=inset((y+0.5)/ROWS,0),iy=inset((x+0.5)/COLS,1);
    if(x>=ix&&x<COLS-ix&&y>=iy&&y<ROWS-iy)land[y*COLS+x]=1;
  }
  const mask=new Uint8Array(land);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(!land[y*COLS+x]&&
    [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>a>=0&&a<COLS&&b>=0&&b<ROWS&&land[b*COLS+a]))mask[y*COLS+x]=2;
  return {mask,walls:rectangles(mask,2).map(r=>({...r,boundary:true})),outside:rectangles(mask,0)};
}
function rectangles(mask, value) {
  const result=[],active=new Map();
  for(let y=0;y<ROWS;y++) {
    const next=new Map();
    for(let x=0;x<COLS;) {
      if(mask[y*COLS+x]!==value){x++;continue;}
      const left=x;while(x<COLS&&mask[y*COLS+x]===value)x++;
      const key=left+','+(x-left),previous=active.get(key);
      const r=previous||{x:left*TILE,y:y*TILE,w:(x-left)*TILE,h:0};r.h+=TILE;
      if(!previous)result.push(r);next.set(key,r);
    }
    active.clear();for(const [key,r]of next)active.set(key,r);
  }
  return result;
}
// Wavy river banks widen/narrow symmetrically around the three dry crossings.
const river=MAPS.find(m=>m.id==='sungai');river.channels=[];
for(const [left,right]of [[1,10],[15,26],[46,57],[62,71]])for(let x=left;x<right;x++) {
  const half=2+Math.round(Math.sin((x+0.5-COLS/2)*Math.PI/12)**2);
  const previous=river.channels.at(-1);
  if(previous&&previous[0]+previous[2]===x&&previous[1]===ROWS/2-half&&previous[3]===half*2)previous[2]++;
  else river.channels.push([x,ROWS/2-half,1,half*2]);
}
river.bridges=[[10,23.5,5,7],[26,23.5,20,7],[57,23.5,5,7]];
module.exports = { MAPS, TILE, COLS, ROWS, outlineFor, rectangles };
