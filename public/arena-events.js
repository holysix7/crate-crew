import * as THREE from './vendor/three.module.min.js';
import { makeHelicopter } from './encounters.js';

export const EVENT_COLORS = { blackhole: '#c391ff', dragon: '#ff9b48', tsunami: '#68deff', ufo: '#b2ff73', airdrop: '#e7e9ef', chickens: '#ffdc72', lord: '#64eeff' };

// Seluruh mesh milik view ini, sehingga pergantian event/map dapat membuang GPU resources.
export class ArenaEventView {
  constructor(scene, particle, quality, heightAt) {
    this.scene = scene; this.particle = particle; this.quality = quality; this.heightAt = heightAt;
    this.id = null; this.root = null; this.data = null; this.particleClock = 0;
  }
  material(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: THREE.DoubleSide });
  }
  mesh(geometry, material, parent = this.root) {
    const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
  }
  ring(radius, color, opacity, parent = this.root) {
    return this.mesh(new THREE.RingGeometry(radius * 0.97, radius, 80).rotateX(-Math.PI / 2), this.material(color, opacity), parent);
  }
  dispose() {
    if (this.root) {
      this.scene.remove(this.root);
      const geometries = new Set(), materials = new Set();
      this.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of [].concat(o.material || [])) materials.add(m); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    }
    this.root = null; this.data = null; this.id = null;
  }
  make(e, map) {
    this.dispose(); this.id = e.id; this.root = new THREE.Group(); this.scene.add(this.root);
    if (e.kind === 'blackhole') {
      this.root.position.set(e.x, this.heightAt(e.x, e.y) + 4, e.y);
      const edge = this.ring(e.radius, EVENT_COLORS.blackhole, 0.65);
      const field = this.mesh(new THREE.CircleGeometry(e.radius, 80).rotateX(-Math.PI / 2), this.material('#57308c', 0.12));
      const core = this.mesh(new THREE.SphereGeometry(28, 24, 16), this.material('#10051e')); core.position.y = 25;
      const halos = [43, 68, 94].map((r, i) => { const ring = this.ring(r, i === 0 ? '#fff2d2' : '#bb79ff', 0.8); ring.position.y = 6 + i * 3; return ring; });
      const shardGeometry = new THREE.ConeGeometry(4, 15, 3), shardMaterial = this.material('#e2b5ff', 0.8);
      const shards = Array.from({ length: 28 }, () => this.mesh(shardGeometry, shardMaterial));
      this.data = { edge, field, core, halos, shards };
    } else if (e.kind === 'dragon') {
      const angle = -Math.atan2(e.dy, e.dx);
      const lane = this.mesh(new THREE.PlaneGeometry(e.length, e.width * 2).rotateX(-Math.PI / 2), this.material('#ff812e', 0.15));
      lane.position.set(e.x, 3, e.y); lane.rotation.y = angle;
      const edges = [-1, 1].map(side => {
        const line = this.mesh(new THREE.PlaneGeometry(e.length, 3).rotateX(-Math.PI / 2), this.material('#ffc15a', 0.7));
        line.position.set(e.x - e.dy * e.width * side, 4, e.y + e.dx * e.width * side); line.rotation.y = angle; return line;
      });
      const dragon = new THREE.Group(); this.root.add(dragon); dragon.rotation.y = angle;
      const skin = new THREE.MeshStandardMaterial({ color: '#b7382b', roughness: 0.75, flatShading: true });
      const belly = new THREE.MeshStandardMaterial({ color: '#f6bd66', roughness: 0.8, flatShading: true });
      const sphere = new THREE.SphereGeometry(1, 10, 8);
      const body = this.mesh(sphere, skin, dragon); body.scale.set(55, 22, 25);
      const chest = this.mesh(sphere, belly, dragon); chest.scale.set(38, 14, 20); chest.position.set(12, -10, 0);
      const head = this.mesh(sphere, skin, dragon); head.scale.set(28, 19, 18); head.position.set(58, 9, 0);
      const snout = this.mesh(new THREE.BoxGeometry(27, 15, 25), skin, dragon); snout.position.set(78, 4, 0);
      for (const side of [-1, 1]) {
        const eye = this.mesh(new THREE.SphereGeometry(4, 8, 6), this.material('#fff75a'), dragon); eye.position.set(68, 18, side * 16);
        const horn = this.mesh(new THREE.ConeGeometry(5, 26, 6), belly, dragon); horn.position.set(45, 32, side * 13); horn.rotation.z = 0.5;
        const leg = this.mesh(new THREE.ConeGeometry(7, 24, 5), skin, dragon); leg.position.set(-10, -25, side * 22); leg.rotation.z = Math.PI;
      }
      const tail = this.mesh(new THREE.ConeGeometry(15, 95, 7).rotateZ(Math.PI / 2), skin, dragon); tail.position.set(-84, 0, 0);
      const wings = [-1, 1].map(side => {
        const pivot = new THREE.Group(); dragon.add(pivot);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([20, 4, side * 15, -58, 8, side * 135, 62, 18, side * 84], 3)); geometry.computeVertexNormals();
        this.mesh(geometry, new THREE.MeshStandardMaterial({ color: '#dc733e', side: THREE.DoubleSide, flatShading: true }), pivot);
        return pivot;
      });
      const breath = this.mesh(new THREE.ConeGeometry(32, 105, 10), this.material('#ffb02e', 0.65), dragon); breath.position.set(68, -68, 0); breath.rotation.z = Math.PI;
      const shadow = this.mesh(new THREE.CircleGeometry(75, 32).rotateX(-Math.PI / 2), this.material('#160b05', 0.27));
      const flameGeometry = new THREE.ConeGeometry(1, 1, 7), flameMaterial = this.material('#ff8b25', 0.7);
      const flames = Array.from({ length: 26 }, () => this.mesh(flameGeometry, flameMaterial));
      this.data = { lane, edges, dragon, wings, breath, shadow, flames };
    } else if (e.kind === 'tsunami') {
      const wave = new THREE.Group(); this.root.add(wave); wave.rotation.y = -Math.atan2(e.dy, e.dx);
      const cross = e.dx ? map.h + 200 : map.w + 200;
      const geometry = new THREE.PlaneGeometry(1, 1, 12, 48);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) positions.setXYZ(i, positions.getX(i) * e.width * 2, 0, positions.getY(i) * cross);
      const water = this.mesh(geometry, new THREE.MeshStandardMaterial({ color: '#1ea4d1', emissive: '#147098', emissiveIntensity: 0.4, transparent: true, opacity: 0.68, side: THREE.DoubleSide, roughness: 0.23 }), wave);
      const foamGeometry = new THREE.SphereGeometry(1, 8, 5), foamMaterial = this.material('#dcfaff', 0.8);
      const foam = Array.from({ length: 36 }, (_, i) => {
        const f = this.mesh(foamGeometry, foamMaterial, wave); f.position.z = (i / 35 - 0.5) * cross; return f;
      });
      const refuges = map.hills.map(hill => {
        const ring = this.ring(hill.r * 0.45, '#aaffaa', 0.65); ring.position.set(hill.x, this.heightAt(hill.x + hill.r * 0.45, hill.y) + 3, hill.y); return ring;
      });
      this.data = { wave, water, foam, refuges };
    } else {
      const color = EVENT_COLORS[e.kind];
      const marker = this.ring(e.kind === 'ufo' ? 62 : e.kind === 'chickens' ? 250 : 85, color, 0.7);
      marker.position.set(e.x, this.heightAt(e.x, e.y) + 4, e.y);
      const beam = this.mesh(new THREE.CylinderGeometry(5, e.kind === 'ufo' ? 62 : 20, e.kind === 'ufo' ? 195 : 125, 32, 1, true), this.material(color, 0.16));
      beam.position.set(e.x, 65, e.y);
      const helicopter = e.kind === 'airdrop' ? makeHelicopter() : null;
      if (helicopter) this.root.add(helicopter);
      const pit = e.kind === 'ufo' ? this.ring(80, '#ff7b68', 0.6) : null;
      if (pit) pit.position.set(e.pitX, 4, e.pitY);
      this.data = { marker, beam, helicopter, pit };
    }
  }
  update(e, since, time, dt, map) {
    if (!e) { if (this.root) this.dispose(); return; }
    if (this.id !== e.id) this.make(e, map);
    const age = Math.min(e.warn + e.duration, e.age + since), active = age >= e.warn, t = Math.max(0, age - e.warn), d = this.data;
    const pulse = 0.5 + Math.sin(time * 7) * 0.2;
    this.particleClock -= dt;
    const emit = active && this.particleClock <= 0;
    if (emit) this.particleClock = 0.05 / this.quality().particles;
    if (e.kind === 'blackhole') {
      d.edge.material.opacity = active ? 0.35 : pulse + 0.15;
      d.field.material.opacity = active ? 0.18 : 0.07;
      d.core.scale.setScalar(active ? 1 + Math.sin(time * 4) * 0.08 : 0.3);
      d.halos.forEach((halo, i) => { halo.rotation.z = (active ? 0.14 : 0.04) * Math.sin(time * 2 + i); halo.scale.setScalar(1 + 0.1 * Math.sin(time * 3 + i)); });
      d.shards.forEach((shard, i) => {
        const a = i * 2.4 - time * (active ? 2 : 0.4), r = 50 + (i * 17 % 180);
        shard.position.set(Math.cos(a) * r, 12 + Math.sin(a * 2) * 8, Math.sin(a) * r); shard.rotation.set(0, -a, Math.PI / 2); shard.visible = active || i % 3 === 0;
      });
      if (emit) { const a = Math.random() * Math.PI * 2, r = e.radius * 0.8; this.particle(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 12, -Math.cos(a) * 130, -Math.sin(a) * 130, 10, 0.8, 4, '#bf87ff', 0); }
    } else if (e.kind === 'dragon') {
      const head = -e.length / 2 + t * e.speed, x = e.x + e.dx * head, y = e.y + e.dy * head;
      d.lane.material.opacity = active ? 0.04 : pulse * 0.32;
      d.edges.forEach(edge => { edge.material.opacity = active ? 0.2 : pulse + 0.2; });
      d.dragon.visible = active; d.shadow.visible = active;
      d.dragon.position.set(x, 150 + Math.sin(time * 3) * 9, y);
      d.shadow.position.set(x, this.heightAt(x, y) + 3, y);
      d.wings.forEach((wing, i) => { wing.rotation.x = Math.sin(time * 7) * 0.45 * (i ? 1 : -1); });
      d.breath.scale.setScalar(0.85 + Math.sin(time * 25) * 0.15);
      d.flames.forEach((flame, i) => {
        const behind = (i / 25) * e.speed * 2.2, across = Math.sin(i * 8.4) * e.width * 0.75;
        const fx = x - e.dx * behind - e.dy * across, fy = y - e.dy * behind + e.dx * across;
        flame.visible = active && fx > 40 && fy > 40 && fx < map.w - 40 && fy < map.h - 40;
        const h = (18 + 20 * (1 - i / 26)) * (1 + Math.sin(time * 15 + i) * 0.25);
        flame.scale.set(12 + i % 4, h, 12 + i % 4); flame.position.set(fx, this.heightAt(fx, fy) + h / 2, fy);
      });
      if (emit) this.particle(x, y, 15, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 80, 0.7, 8, '#ffb347', 0);
    } else if (e.kind === 'tsunami') {
      const x = e.x + e.dx * t * e.speed, y = e.y + e.dy * t * e.speed;
      d.wave.position.set(x, 0, y); d.wave.visible = active;
      const positions = d.water.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const depth = positions.getX(i) / e.width;
        positions.setY(i, 5 + Math.max(0, 1 - depth * depth) * (36 + Math.sin(positions.getZ(i) * 0.04 + time * 5) * 7));
      }
      positions.needsUpdate = true; d.water.geometry.computeVertexNormals();
      d.foam.forEach((foam, i) => { foam.position.x = 8 * Math.sin(time * 4 + i); foam.position.y = 40 + 7 * Math.sin(time * 5 + foam.position.z * 0.04); foam.scale.set(7, 4, 13); });
      d.refuges.forEach(refuge => { refuge.material.opacity = active ? 0.35 : pulse + 0.15; });
      if (emit) { const cross = (Math.random() - 0.5) * (e.dx ? map.h : map.w); this.particle(x - e.dy * cross, y + e.dx * cross, 25, -e.dx * 50, -e.dy * 50, 80, 0.65, 7, '#c8f6ff'); }
    } else {
      d.marker.material.opacity = active ? 0.18 : pulse + 0.15;
      d.marker.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
      d.beam.visible = !active || e.kind === 'ufo';
      d.beam.material.opacity = active ? 0.18 : pulse * 0.25;
      if (e.kind === 'ufo') {
        const x = e.shipX ?? e.x, y = e.shipY ?? e.y;
        d.beam.position.set(x, 100, y); d.marker.position.set(x, this.heightAt(x, y) + 4, y);
        d.beam.scale.set(e.captive ? 0.6 : 1, 1, e.captive ? 0.6 : 1);
        if (emit) this.particle(x + (Math.random() - 0.5) * 55, y + (Math.random() - 0.5) * 55, 15, 0, 0, 80, 1, 3, '#b7ff81', 0);
      } else if (d.helicopter) {
        d.helicopter.visible = active;
        d.helicopter.position.set(e.x + (t - 6) * 135, 220 + Math.sin(time * 3) * 4, e.y);
        d.helicopter.userData.rotor.rotation.y = time * 40;
      } else if (e.kind === 'lord') {
        d.beam.visible = !active;
        d.beam.rotation.y = time;
        if (!active && this.particleClock <= 0) { this.particleClock = 0.08; this.particle(e.x + Math.cos(time * 4) * 60, e.y + Math.sin(time * 4) * 60, 10, 0, 0, 60, 1, 5, '#5eeaff', 0); }
      }
    }
  }
}

export function drawArenaMinimap(ctx, e, age, mx, my, k, map) {
  if (!e) return;
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, map.w * k, map.h * k); ctx.clip();
  ctx.strokeStyle = EVENT_COLORS[e.kind]; ctx.fillStyle = EVENT_COLORS[e.kind]; ctx.lineWidth = 2;
  ctx.setLineDash(age < e.warn ? [4, 3] : []);
  if (e.kind === 'blackhole') {
    ctx.beginPath(); ctx.arc(mx + e.x * k, my + e.y * k, e.radius * k, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.15; ctx.fill();
  } else if (e.kind === 'dragon') {
    ctx.globalAlpha = 0.45; ctx.lineWidth = e.width * 2 * k;
    ctx.beginPath(); ctx.moveTo(mx + (e.x - e.dx * e.length / 2) * k, my + (e.y - e.dy * e.length / 2) * k);
    ctx.lineTo(mx + (e.x + e.dx * e.length / 2) * k, my + (e.y + e.dy * e.length / 2) * k); ctx.stroke();
    if (age >= e.warn) { const head = -e.length / 2 + (age - e.warn) * e.speed; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(mx + (e.x + e.dx * head) * k, my + (e.y + e.dy * head) * k, 4, 0, Math.PI * 2); ctx.fill(); }
  } else if (e.kind === 'tsunami') {
    const progress = age < e.warn ? 140 : (age - e.warn) * e.speed, x = e.x + e.dx * progress, y = e.y + e.dy * progress;
    const span = Math.max(map.w, map.h); ctx.lineWidth = age < e.warn ? 3 : e.width * 2 * k; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(mx + (x - e.dy * span) * k, my + (y + e.dx * span) * k);
    ctx.lineTo(mx + (x + e.dy * span) * k, my + (y - e.dx * span) * k); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#aaffaa';
    for (const hill of map.hills) { ctx.beginPath(); ctx.arc(mx + hill.x * k, my + hill.y * k, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = EVENT_COLORS.tsunami;
    ctx.fillText(e.dx === 1 ? '→' : e.dx === -1 ? '←' : e.dy === 1 ? '↓' : '↑', mx + map.w * k / 2, my + map.h * k / 2);
  }
  if (!['blackhole', 'dragon', 'tsunami'].includes(e.kind)) {
    const x = e.shipX ?? e.x, y = e.shipY ?? e.y;
    ctx.beginPath(); ctx.arc(mx + x * k, my + y * k, e.kind === 'chickens' ? 14 : 7, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText({ufo:'U',airdrop:'H',chickens:'!',lord:'L'}[e.kind], mx + x * k, my + y * k + 3);
    if (e.kind === 'ufo') { ctx.strokeStyle = '#ff7b68'; ctx.beginPath(); ctx.moveTo(mx + x * k, my + y * k); ctx.lineTo(mx + e.pitX * k, my + e.pitY * k); ctx.stroke(); }
  }
  ctx.restore();
}
