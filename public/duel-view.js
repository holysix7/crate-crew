import * as THREE from './vendor/three.module.min.js';

// Small code-built models: no extra textures or image downloads.
export function makeMeleeModel(id, materials, accent) {
  const group=new THREE.Group();
  const box=(x,y,z,w,h,d,material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;
  };
  const shaft=['spear','halberd'].includes(id)?56:12;
  box(shaft/2,0,0,shaft,3.5,3.5,materials.gunBody);
  if(id==='hammer'){
    box(24,0,0,35,4,4,materials.gunBody);box(40,0,0,15,14,23,accent);
    box(40,0,0,16,7,24,materials.metalLight);
  }else if(id==='axe'||id==='halberd'){
    const x=id==='halberd'?54:30;
    box(x/2,0,0,x,4,4,materials.gunBody);box(x,0,0,13,4,25,accent);
    const edge=box(x+7,0,0,4,3,27,materials.metalLight);edge.rotation.y=0.18;
    if(id==='halberd')box(x+12,0,0,24,3,4,materials.metalLight);
  }else{
    const length=id==='spear'?24:id==='dagger'?20:id==='katana'?42:34,start=id==='spear'?56:12;
    box(start+length/2,0,0,length,2.7,id==='dagger'?5:6,materials.metalLight);
    box(start+length/2,1.5,0,length*0.8,0.7,2,accent);
    if(id!=='spear')box(12,0,0,4,4,id==='dagger'?12:19,accent);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(id==='spear'?5:3.7,10,4).rotateZ(-Math.PI/2),accent);
    tip.position.x=start+length+5;tip.castShadow=true;group.add(tip);
  }
  return group;
}

export function addDuelDecor(world,map,weaponIds) {
  if(!map.duel)return;
  const ring=new THREE.Mesh(new THREE.RingGeometry(255,260,64).rotateX(-Math.PI/2),world.mat.gold);
  ring.position.set(map.w/2,0.6,map.h/2);world.root.add(ring);
  for(const [side,x] of [[0,200],[1,760]]){
    const spawn=new THREE.Mesh(new THREE.RingGeometry(24,28,32).rotateX(-Math.PI/2),world.mat.teamFlat[side]);
    spawn.position.set(x,0.8,360);world.root.add(spawn);
  }
  for(const rack of map.racks){
    const index=weaponIds.indexOf(rack.w),accent=world.mat.guns[index];
    const stand=new THREE.Mesh(new THREE.CylinderGeometry(16,20,7,10),world.mat.dark);
    stand.position.set(rack.x,3.5,rack.y);stand.receiveShadow=true;world.root.add(stand);
    const model=makeMeleeModel(rack.w,world.mat,accent);model.rotation.z=Math.PI/2;
    model.scale.setScalar(0.65);model.position.set(rack.x,12,rack.y);world.root.add(model);
  }
}
