'use strict';

// Static rectangles are indexed once. Queries reuse their result array and visit
// stamps; callers finish consuming a result before making another query.
class RectIndex {
  constructor(items, width, height, cell = 80) {
    this.items = items; this.cell = cell; this.cols = Math.ceil(width/cell); this.rows = Math.ceil(height/cell);
    this.buckets = Array.from({length:this.cols*this.rows},()=>[]);
    this.seen = new Uint32Array(items.length); this.epoch=0; this.result=[];
    items.forEach((p,i)=>{
      const x0=Math.max(0,Math.floor(p.x/cell)),x1=Math.min(this.cols-1,Math.floor((p.x+p.w)/cell));
      const y0=Math.max(0,Math.floor(p.y/cell)),y1=Math.min(this.rows-1,Math.floor((p.y+p.h)/cell));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)this.buckets[y*this.cols+x].push(i);
    });
  }
  near(x,y,pad=0) {
    const out=this.result;out.length=0;
    if(++this.epoch>=0xffffffff){this.seen.fill(0);this.epoch=1;}
    const x0=Math.min(this.cols-1,Math.max(0,Math.floor((x-pad)/this.cell))),x1=Math.max(0,Math.min(this.cols-1,Math.floor((x+pad)/this.cell)));
    const y0=Math.min(this.rows-1,Math.max(0,Math.floor((y-pad)/this.cell))),y1=Math.max(0,Math.min(this.rows-1,Math.floor((y+pad)/this.cell)));
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++)for(const i of this.buckets[ty*this.cols+tx]) {
      if(this.seen[i]===this.epoch)continue;this.seen[i]=this.epoch;out.push(this.items[i]);
    }
    return out;
  }
}
module.exports={RectIndex};
