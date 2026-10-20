import * as THREE from './vendor/three.module.min.js';

const solid = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true, ...extra });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: THREE.DoubleSide });
const mesh = (parent, geometry, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
};
const box = (parent, material, sx, sy, sz, x = 0, y = 0, z = 0) => mesh(parent, new THREE.BoxGeometry(sx, sy, sz), material, x, y, z);

export function disposeEncounter(root) {
  if (!root?.userData.owned) return;
  const geometries = new Set(), materials = new Set();
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of [].concat(o.material || [])) materials.add(m); });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

export function makeUfo() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const metal = solid('#8b9aa7', { metalness: 0.8, roughness: 0.25 });
  mesh(rig, new THREE.CylinderGeometry(22, 45, 13, 24), metal, 0, 125);
  mesh(rig, new THREE.CylinderGeometry(45, 27, 8, 24), solid('#43546a'), 0, 115);
  const dome = mesh(rig, new THREE.SphereGeometry(20, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), solid('#8affc2', { transparent: true, opacity: 0.6, metalness: 0.4 }), 0, 131);
  const alien = mesh(rig, new THREE.SphereGeometry(9, 10, 8), glow('#a8f27a'), 0, 137);
  alien.scale.set(0.8, 1.2, 1);
  for (const side of [-1, 1]) mesh(rig, new THREE.SphereGeometry(3, 8, 6), glow('#09221d'), 7, 139, side * 4);
  const lights = [];
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; lights.push(mesh(rig, new THREE.SphereGeometry(3, 6, 5), glow(i % 2 ? '#a7ff69' : '#77e7ff'), Math.cos(a) * 35, 120, Math.sin(a) * 35)); }
  root.userData = { owned: true, rig, dome, lights, encounter: 'ufo' }; return root;
}

export function makeChicken() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const white = solid('#fff6df'), red = solid('#e74638'), yellow = solid('#ffbf35'), dark = glow('#151a1b');
  const body = mesh(rig, new THREE.SphereGeometry(1, 10, 8), white, 0, 17); body.scale.set(13, 12, 11);
  const head = mesh(rig, new THREE.SphereGeometry(8, 10, 8), white, 10, 29);
  for (const side of [-1, 1]) mesh(rig, new THREE.SphereGeometry(1.8, 6, 5), dark, 15, 31, side * 5.5);
  const beak = mesh(rig, new THREE.ConeGeometry(4, 9, 4).rotateZ(-Math.PI / 2), yellow, 21, 27);
  for (let i = 0; i < 3; i++) mesh(rig, new THREE.SphereGeometry(3.5, 6, 5), red, 6 + i * 4, 37 + (i === 1 ? 2 : 0));
  mesh(rig, new THREE.SphereGeometry(4, 6, 5), red, 16, 20);
  const wings = [-1, 1].map(side => { const wing = mesh(rig, new THREE.SphereGeometry(1, 8, 6), white, -3, 20, side * 10); wing.scale.set(9, 4, 3); return wing; });
  const legs = [-1, 1].map(side => box(rig, yellow, 3, 9, 3, 0, 6, side * 5));
  const tail = mesh(rig, new THREE.ConeGeometry(7, 18, 5).rotateZ(0.7), white, -13, 23); tail.rotation.x = 0.3;
  root.userData = { owned: true, rig, head, beak, wings, legs, encounter: 'chicken' }; return root;
}

export function makeLord(u, teamColor = '#37c5e8') {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const gold = solid('#d1b960', { metalness: 0.75, roughness: 0.3 });
  const darkGold = solid('#766d42', { metalness: 0.6 });
  const teal = solid('#154b57', { metalness: 0.55 });
  const spirit = glow('#2ce3ff', 0.35), bright = glow('#b9ffff'), color = glow(teamColor, 0.75);
  const torso = mesh(rig, new THREE.SphereGeometry(1, 14, 10), teal, 0, 54); torso.scale.set(25, 30, 20);
  const breast = mesh(rig, new THREE.SphereGeometry(1, 12, 8), gold, 10, 57); breast.scale.set(16, 24, 20);
  for (const side of [-1, 1]) {
    const shoulder = mesh(rig, new THREE.IcosahedronGeometry(20, 0), gold, -1, 72, side * 27); shoulder.scale.set(1.15, 0.8, 1);
    const spike = mesh(rig, new THREE.ConeGeometry(7, 25, 5), darkGold, -2, 93, side * 27); spike.rotation.z = 0.35;
    const arm = mesh(rig, new THREE.CylinderGeometry(9, 12, 32, 8), teal, 8, 49, side * 27); arm.rotation.z = 0.45;
    mesh(rig, new THREE.IcosahedronGeometry(12, 0), gold, 16, 34, side * 27);
  }
  const helm = mesh(rig, new THREE.IcosahedronGeometry(18, 1), gold, 5, 92); helm.scale.set(0.9, 1.15, 1);
  box(rig, teal, 8, 13, 24, 20, 92, 0);
  for (const side of [-1, 1]) box(rig, bright, 1.5, 3, 7, 25, 96, side * 6);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const spike = mesh(rig, new THREE.ConeGeometry(4.5, i === 0 ? 29 : 22, 5), gold, 5 + Math.cos(a) * 12, 115, Math.sin(a) * 12);
    spike.rotation.z = -Math.cos(a) * 0.3;
  }
  const gem = mesh(rig, new THREE.OctahedronGeometry(7), bright, 26, 63, 0); gem.scale.y = 1.6;
  box(rig, color, 3, 8, 28, 26, 52, 0);
  const waterColor = glow('#35d6ff', 0.75);
  const water = [];
  for (let i = 0; i < 5; i++) {
    const whirl = mesh(root, new THREE.TorusGeometry(17 + i * 3, 2.8, 6, 30).rotateX(Math.PI / 2), i % 2 ? spirit : waterColor, 0, 6 + i * 7);
    water.push(whirl);
  }
  const lower = mesh(root, new THREE.ConeGeometry(26, 50, 12, 1, true), spirit, 0, 27); lower.rotation.z = Math.PI;
  const weapon = new THREE.Group(); rig.add(weapon); weapon.position.set(23, 36, 31);
  mesh(weapon, new THREE.CylinderGeometry(2.5, 2.5, 100, 8), darkGold, 0, 29);
  const blade = mesh(weapon, new THREE.OctahedronGeometry(13), gold, 0, 86); blade.scale.set(0.6, 2.5, 1);
  for (const side of [-1, 1]) {
    box(weapon, gold, 3, 23, 3, 0, 78, side * 12);
    mesh(weapon, new THREE.ConeGeometry(4, 18, 5), bright, 0, 96, side * 12);
  }
  const shield = mesh(root, new THREE.SphereGeometry(39, 16, 10), glow('#bcf4ff', 0.16), 0, 56); shield.scale.y = 1.6;
  root.scale.setScalar(u.kind === 8 ? 1.25 : 0.85);
  root.userData = { owned: true, encounter: 'lord', rig, weapon, water, shield }; return root;
}

export function animateEncounter(root, u, angle, time, dt) {
  const d = root.userData;
  if (d.encounter === 'ufo') { d.rig.rotation.y = time * 0.7; d.rig.position.y = 70 + Math.sin(time * 3) * 5; return; }
  d.rig.rotation.y = -angle;
  if (d.encounter === 'chicken') {
    d.rig.position.y = u.moving ? Math.abs(Math.sin(time * 19 + u.id)) * 4 : 0;
    d.wings.forEach((wing, i) => { wing.rotation.x = Math.sin(time * 16) * 0.6 * (i ? 1 : -1); });
    d.legs.forEach((leg, i) => { leg.rotation.z = u.moving ? Math.sin(time * 19 + i * Math.PI) * 0.6 : 0; });
  } else {
    d.rig.position.y = Math.sin(time * 3 + u.id) * 3;
    d.weapon.rotation.z = u.anim > 0 ? -Math.sin((0.3 - u.anim) / 0.3 * Math.PI) * 1.3 : 0;
    d.water.forEach((ring, i) => { ring.rotation.y = time * (i % 2 ? 2 : -2); ring.scale.setScalar(1 + Math.sin(time * 4 + i) * 0.12); });
    d.shield.visible = !!u.shield;
  }
}

export function makeAirdrop() {
  const root = new THREE.Group(), crate = new THREE.Group(); root.add(crate);
  const paint = solid('#929ba7', { metalness: 0.65, roughness: 0.4 });
  box(crate, paint, 42, 36, 42, 0, 18);
  const band = solid('#d7dddf', { metalness: 0.7 });
  box(crate, band, 43, 6, 43, 0, 20); box(crate, band, 7, 37, 43);
  const ring = mesh(root, new THREE.RingGeometry(32, 36, 32).rotateX(-Math.PI / 2), glow('#dedede', 0.65), 0, 2);
  const beacon = mesh(root, new THREE.CylinderGeometry(2, 16, 170, 12, 1, true), glow('#e7ecff', 0.16), 0, 85);
  root.userData = { owned: true, crate, paint, ring, beacon }; return root;
}
export function animateAirdrop(root, drop, heightAt, colors, time) {
  const d = root.userData, color = drop[4] >= 0 ? colors[drop[4]] : '#929ba7';
  root.position.set(drop[1], heightAt(drop[1], drop[2]), drop[2]);
  d.crate.position.y = drop[3]; d.paint.color.set(color); d.ring.material.color.set(color); d.beacon.material.color.set(color);
  d.ring.scale.setScalar(1 + Math.sin(time * 4) * 0.07); d.beacon.visible = drop[4] < 0;
}

export function makeHelicopter() {
  const root = new THREE.Group(), paint = solid('#6d7e75', { metalness: 0.45 }), metal = solid('#303b42'), glass = solid('#8ad6e5', { metalness: 0.6, roughness: 0.2 });
  const hull = mesh(root, new THREE.SphereGeometry(1, 12, 10), paint, 0, 0); hull.scale.set(43, 24, 24);
  const cockpit = mesh(root, new THREE.SphereGeometry(1, 12, 10), glass, 26, 3); cockpit.scale.set(25, 18, 22);
  box(root, paint, 75, 9, 9, -66, 6);
  const tail = box(root, paint, 6, 32, 23, -100, 18);
  const rotor = new THREE.Group(); rotor.position.y = 34; root.add(rotor);
  box(rotor, metal, 160, 3, 7); box(rotor, metal, 7, 3, 160); box(root, metal, 5, 17, 5, 0, 27);
  for (const side of [-1, 1]) { box(root, metal, 77, 4, 4, 0, -29, side * 23); box(root, metal, 4, 20, 4, 10, -19, side * 23); }
  root.userData = { rotor, tail }; return root;
}
