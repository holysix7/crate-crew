'use strict';

// Same curve as trainPoint in public/arena-events.js; distance is measured along the main axis.
function trainPoint(e, distance) {
  const along = distance - e.length / 2, phase = along / e.length * Math.PI * 2 + e.phase;
  const bend = Math.sin(phase) * e.swerve, slope = Math.cos(phase) * e.swerve * Math.PI * 2 / e.length;
  return { x: e.x + e.dx * along - e.dy * bend, y: e.y + e.dy * along + e.dx * bend,
    a: Math.atan2(e.dy + e.dx * slope, e.dx - e.dy * slope) };
}

function planTrain(game, event) {
  const { w, h, tile } = game.mapInfo();
  const obstacles = game.solids.filter(s => s.x > tile && s.y > tile && s.x + s.w < w - tile && s.y + s.h < h - tile);
  let best = null, bestScore = Infinity;
  const verticalFirst = Math.random() < 0.5, direction = Math.random() < 0.5 ? -1 : 1;
  search: for (const vertical of [verticalFirst, !verticalFirst]) for (const offset of [0, -80, 80, -160, 160, -240, 240]) {
    for (const swerve of [100, 180, 220, 240, 260, 280, 320]) for (const phase of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
      const route = { x: w / 2 + (vertical ? offset : 0), y: h / 2 + (vertical ? 0 : offset),
        dx: vertical ? 0 : direction, dy: vertical ? direction : 0, length: (vertical ? h : w) + 900, swerve, phase };
      let score = Math.abs(offset) * 0.0001;
      for (let i = 0; i <= 200; i++) {
        const p = trainPoint(route, route.length * i / 200);
        if (obstacles.some(s => p.x > s.x - 32 && p.x < s.x + s.w + 32 && p.y > s.y - 32 && p.y < s.y + s.h + 32)) score += 10;
        if (game.inPit(p.x, p.y, -40)) score += 6;
      }
      if (score < bestScore) { best = route; bestScore = score; }
      if (score === 0) break search;
    }
  }
  Object.assign(event, best, { width: 24, cars: 3, spacing: 110, speed: best.length / event.duration });
}

function tickTrain(game, event, t, dt) {
  // Sweep the complete car bodies, including between ticks: a fast train cannot tunnel through players.
  const from = Math.max(0, t - dt) * event.speed, to = t * event.speed;
  const steps = Math.max(1, Math.ceil((to - from) / 14));
  for (let step = 0; step <= steps; step++) for (let car = 0; car < event.cars; car++) {
    const p = trainPoint(event, from + (to - from) * step / steps - car * event.spacing);
    const dx = Math.cos(p.a), dy = Math.sin(p.a);
    for (const u of [...game.units.values()]) {
      if (u.fly || u.abducted || u.neutral || event.hit.has(u.id) || !game.units.has(u.id)) continue;
      const along = Math.max(-43, Math.min(43, (u.x - p.x) * dx + (u.y - p.y) * dy));
      if (Math.hypot(u.x - p.x - along * dx, u.y - p.y - along * dy) >= event.width + u.r) continue;
      event.hit.add(u.id);
      const driver = u.driver;
      game.kill(u, 0); // Deliberately lethal, including spawn shields and player LORD.
      if (driver && game.units.has(driver.id)) { event.hit.add(driver.id); game.kill(driver, 0); }
      game.events.push({ k: 'trainhit', x: u.x, y: u.y });
    }
  }
}

function trainEscape(event, unit) {
  let nearest = null, best = Infinity;
  for (let i = 0; i <= 80; i++) {
    const p = trainPoint(event, event.length * i / 80), d = Math.hypot(unit.x - p.x, unit.y - p.y);
    if (d < best) { nearest = p; best = d; }
  }
  if (best > event.width + unit.r + 65) return null;
  const nx = -Math.sin(nearest.a), ny = Math.cos(nearest.a);
  const side = (unit.x - nearest.x) * nx + (unit.y - nearest.y) * ny >= 0 ? 1 : -1;
  return { x: nearest.x + nx * side * 145, y: nearest.y + ny * side * 145 };
}

module.exports = { trainPoint, planTrain, tickTrain, trainEscape };
