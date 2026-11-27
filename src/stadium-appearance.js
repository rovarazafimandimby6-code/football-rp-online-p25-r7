import * as THREE from 'three';

/** Apply a club stadium tint without compounding color changes across switches. */
export function applyStadiumTint(materials, tintHex = 0xffffff) {
  const tint = new THREE.Color(tintHex);
  for (const material of materials || []) {
    if (!material?.color) continue;
    material.userData ||= {};
    if (!Number.isInteger(material.userData.p27BaseColor)) {
      material.userData.p27BaseColor = material.color.getHex();
    }
    material.color.setHex(material.userData.p27BaseColor).multiply(tint);
  }
}
