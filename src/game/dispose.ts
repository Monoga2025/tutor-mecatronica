import * as THREE from 'three';

export function disposeMaterial(m: THREE.Material): void {
  for (const v of Object.values(m)) {
    if (v instanceof THREE.Texture) v.dispose();
  }
  m.dispose();
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
  root.removeFromParent();
}
