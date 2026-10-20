import * as THREE from './vendor/three.module.min.js';

// A growing GPU instance buffer: no gameplay items are dropped when it fills.
export class InstanceBatch {
  constructor(parent, geometry, material, capacity = 32, shadows = false) {
    Object.assign(this,{parent,geometry,material,capacity,shadows,used:0});
    this.mesh=this.create(); parent.add(this.mesh);
  }
  create() {
    const mesh=new THREE.InstancedMesh(this.geometry,this.material,this.capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.visible=false;
    mesh.castShadow=this.shadows;mesh.receiveShadow=true;
    // Items span the arena. A single small batch is cheaper than individual
    // per-item traversal; disabling aggregate culling also avoids stale bounds.
    mesh.frustumCulled=false;return mesh;
  }
  reset() { this.used=0; }
  put(matrix) {
    if(this.used===this.capacity) {
      const old=this.mesh;this.capacity*=2;this.mesh=this.create();
      this.mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0,this.used*16));
      this.parent.remove(old);old.dispose();this.parent.add(this.mesh);
    }
    this.mesh.setMatrixAt(this.used++,matrix);
  }
  finish() {
    this.mesh.count=this.used;this.mesh.visible=this.used>0;
    if(this.used)this.mesh.instanceMatrix.needsUpdate=true;
  }
}
