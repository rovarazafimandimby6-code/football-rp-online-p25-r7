import { chooseRenderProfile, resolveRenderProfile } from './performance-tuning.js';
import * as THREE from 'three';
import { RenderFramePacer } from './render-frame-pacer.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x91b8d0);
    this.scene.fog = new THREE.Fog(0x91b8d0, 105, 230);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 260);

    const deviceProfile = chooseRenderProfile({
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: navigator.deviceMemory || 2,
      pixelRatio: window.devicePixelRatio || 1
    });
    const initialProfile = resolveRenderProfile('auto', {
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: navigator.deviceMemory || 2,
      pixelRatio: window.devicePixelRatio || 1
    });
    this.renderer = new THREE.WebGLRenderer({
      // L'antialiasing est fixé à la création du contexte WebGL : on l'active
      // seulement si le profil matériel autorise raisonnablement son coût.
      antialias: deviceProfile.antialias,
      powerPreference: deviceProfile.tier === 'low' ? 'low-power' : 'high-performance',
      alpha: false,
      stencil: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.sortObjects = true;
    this.renderer.useLegacyLights = false;
    this.renderer.setSize(w, h);
    this.renderer.domElement.setAttribute('aria-label', 'Vue 3D du match de football');
    container.appendChild(this.renderer.domElement);
    this.contextLost = false;
    this._onContextLost = (event) => { event.preventDefault(); this.contextLost = true; };
    this._onContextRestored = () => { this.contextLost = false; this.resize(); };
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored, false);

    // Éclairage lumineux garantissant une pelouse claire dès la première frame
    this.hemiLight = new THREE.HemisphereLight(0xeef9ff, 0x2b6e37, 1.1);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7e6, 1.55);
    this.sunLight.position.set(22, 42, 26);
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 115;
    this.sunLight.shadow.camera.left = -35;
    this.sunLight.shadow.camera.right = 35;
    this.sunLight.shadow.camera.top = 25;
    this.sunLight.shadow.camera.bottom = -25;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0xbbe1ff, 0.45);
    this.fillLight.position.set(-24, 20, -18);
    this.scene.add(this.fillLight);

    this.quality = 'auto';
    this.targetFps = initialProfile.targetFps || 30;
    this.framePacer = new RenderFramePacer(this.targetFps);
    this.setQuality('auto');

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });
    this._visualViewport = window.visualViewport || null;
    this._visualViewport?.addEventListener('resize', this._onResize, { passive: true });
    this._resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(this._onResize)
      : null;
    this._resizeObserver?.observe(this.container);
  }

  setQuality(level = 'auto') {
    const profile = resolveRenderProfile(level, {
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: navigator.deviceMemory || 2,
      pixelRatio: window.devicePixelRatio || 1
    });
    this.quality = profile.quality;
    // Stadium construction reads this once to select a crowd budget suited
    // to the device without changing match simulation or player counts.
    this.scene.userData.renderQuality = profile.quality;
    this.requestedQuality = level;
    this.targetFps = profile.targetFps || 30;
    this.framePacer?.setTargetFps(this.targetFps);
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.shadowMap.enabled = profile.shadows;
    this.sunLight.castShadow = profile.shadows;
    if (profile.shadows) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.resize();
    return profile;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const bounds = this.container.getBoundingClientRect?.();
    const w = Math.round(bounds?.width || this.container.clientWidth || window.innerWidth);
    const h = Math.round(bounds?.height || this.container.clientHeight || window.innerHeight);
    // Ignore transient zero-size layouts while the menu and match shell switch visibility.
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(nowMs = performance.now()) {
    if (!this.renderer || this.contextLost || this.renderer.getContext().isContextLost()) return false;
    // Cap GPU work to the selected device profile while simulation/input remain RAF-driven.
    if (this.framePacer && !this.framePacer.shouldRender(nowMs)) return false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this._visualViewport?.removeEventListener('resize', this._onResize);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (!this.renderer) return;
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.renderer.setAnimationLoop(null);
    // Libérer les géométries, matériaux et textures de la scène pour éviter
    // les fuites GPU lors d'un redémarrage ou d'un démontage du jeu.
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value && value.isTexture) textures.add(value);
        }
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.renderer.renderLists?.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.renderer = null;
  }
}