// Geometry and minimap share the authoritative rectangles in the welcome packet.
export const HAZARD_COLORS = { river: '#268da9', chasm: '#211b23', lava: '#ff632c' };
export function groundHeight(map, x, y) {
  let h = 0;
  for (const hl of map.hills || []) {
    const t = Math.hypot(x - hl.x, y - hl.y) / hl.r;
    if (t < 1) h += hl.h * (0.5 + 0.5 * Math.cos(Math.PI * t));
  }
  for (const p of map.pits || []) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < p.r - 6) h -= 90;
    else if (d < p.r + 10) h -= 90 * (0.5 + 0.5 * Math.cos(Math.PI * (d - (p.r - 6)) / 16));
  }
  for (const p of map.outside || []) if(x>p.x&&x<p.x+p.w&&y>p.y&&y<p.y+p.h) { h -= 130; break; }
  for (const p of map.hazards || []) {
    // Rectangular channels have steep banks. Inclusive union membership avoids
    // dry ridges (and double depth) where two wavy-bank segments meet.
    if (x >= p.x && x <= p.x+p.w && y >= p.y && y <= p.y+p.h) { h -= p.depth; break; }
  }
  return h;
}
export function drawMapPreview(canvas, map, colors) {
  const c = canvas.getContext('2d'), k = canvas.width / map.w;
  const palette = { grass:'#4d803f', desert:'#b99a65', snow:'#d5e2eb', river:'#467c60', ruins:'#697272', volcano:'#4c4244' };
  c.fillStyle = palette[map.theme] || '#4d803f'; c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle = '#182b30'; for(const p of map.outside || []) c.fillRect(p.x*k,p.y*k,p.w*k,p.h*k);
  c.fillStyle = '#c9b383'; c.beginPath(); c.arc(map.w/2*k,map.h/2*k,376*k,0,Math.PI*2); c.fill();
  c.fillStyle = '#ffffff44';
  for (const p of map.hills) { c.beginPath(); c.arc(p.x*k,p.y*k,p.r*k,0,Math.PI*2); c.fill(); }
  c.fillStyle = '#17121b';
  for (const p of map.pits) { c.beginPath(); c.arc(p.x*k,p.y*k,p.r*k,0,Math.PI*2); c.fill(); }
  for (const p of map.hazards) { c.fillStyle = HAZARD_COLORS[p.kind]; c.fillRect(p.x*k,p.y*k,p.w*k,p.h*k); }
  c.fillStyle = '#dfbe84';
  for (const p of map.bridges) c.fillRect(p.x*k,p.y*k,p.w*k,p.h*k);
  c.fillStyle = '#b2b5b2';
  for (const p of map.walls) c.fillRect(p.x*k,p.y*k,Math.max(1,p.w*k),Math.max(1,p.h*k));
  for (const b of map.bases) { c.fillStyle = colors[b.team]; const p=b.hq; c.fillRect(p.x*k,p.y*k,p.w*k,p.h*k); }
}
