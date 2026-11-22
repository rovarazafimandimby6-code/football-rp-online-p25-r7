import * as THREE from 'three';

export class WeatherManager {
  constructor(sceneMgr) {
    this.sceneMgr = sceneMgr;
    this.mode = 'day';
    this.rainFrictionFactor = 1.0;

    // Système de pluie léger en 3D (Points)
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 48;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd9eeff,
      size: 0.22,
      transparent: true,
      opacity: 0.62
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.sceneMgr.scene.add(this.rain);
  }

  setWeather(mode) {
    this.mode = mode;
    const { scene, hemiLight, sunLight, fillLight, renderer } = this.sceneMgr;

    if (mode === 'day') {
      scene.background.setHex(0x6ec3f4);
      scene.fog.color.setHex(0x6ec3f4);
      scene.fog.near = 75;
      scene.fog.far = 170;
      hemiLight.color.setHex(0xf2fbff);
      hemiLight.groundColor.setHex(0x2f753b);
      hemiLight.intensity = 1.15;
      sunLight.color.setHex(0xfff7e6);
      sunLight.intensity = 1.55;
      fillLight.intensity = 0.45;
      renderer.toneMappingExposure = 1.15;
      this.rain.visible = false;
      this.rainFrictionFactor = 1.0;
    } else if (mode === 'cloudy') {
      scene.background.setHex(0x8da4b8);
      scene.fog.color.setHex(0x8da4b8);
      scene.fog.near = 65;
      scene.fog.far = 150;
      hemiLight.color.setHex(0xdde8f2);
      hemiLight.groundColor.setHex(0x295e32);
      hemiLight.intensity = 1.3;
      sunLight.color.setHex(0xeaf0f6);
      sunLight.intensity = 0.85;
      fillLight.intensity = 0.55;
      renderer.toneMappingExposure = 1.12;
      this.rain.visible = false;
      this.rainFrictionFactor = 1.0;
    } else if (mode === 'night') {
      // Ciel nocturne mais pelouse parfaitement éclairée par les projecteurs
      scene.background.setHex(0x101d34);
      scene.fog.color.setHex(0x101d34);
      scene.fog.near = 72;
      scene.fog.far = 160;
      hemiLight.color.setHex(0x9fc2ff);
      hemiLight.groundColor.setHex(0x28663a);
      hemiLight.intensity = 1.1;
      sunLight.color.setHex(0xf5f8ff);
      sunLight.intensity = 1.45;
      fillLight.intensity = 0.7;
      renderer.toneMappingExposure = 1.22;
      this.rain.visible = false;
      this.rainFrictionFactor = 1.0;
    } else if (mode === 'rain') {
      scene.background.setHex(0x5b6e80);
      scene.fog.color.setHex(0x5b6e80);
      scene.fog.near = 55;
      scene.fog.far = 135;
      hemiLight.color.setHex(0xcbe0f0);
      hemiLight.groundColor.setHex(0x265931);
      hemiLight.intensity = 1.25;
      sunLight.color.setHex(0xdce8f5);
      sunLight.intensity = 0.95;
      fillLight.intensity = 0.55;
      renderer.toneMappingExposure = 1.14;
      this.rain.visible = true;
      this.rainFrictionFactor = 0.96; // Ballon glisse un peu plus sur pelouse mouillée
    }
  }

  update(dt, focusX) {
    if (!this.rain.visible) return;
    const pos = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] -= 26 * dt;
      pos[i] -= 3.2 * dt;
      if (pos[i + 1] < 0) {
        pos[i + 1] = 22 + Math.random() * 4;
        pos[i] = focusX + (Math.random() - 0.5) * 66;
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.sceneMgr.scene.remove(this.rain);
  }
}