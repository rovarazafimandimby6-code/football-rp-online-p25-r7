import { rolePresentation, shapeJoystickVector } from './role-presentation.js';

export class ControlsManager {
  constructor() {
    this.abortController = new AbortController();
    this.listenerOptions = { signal: this.abortController.signal };
    this.stickZone = document.getElementById('stick-zone');
    this.stickBase = document.getElementById('stick-base');
    this.stickKnob = document.getElementById('stick-knob');
    this.joy = { x: 0, z: 0, active: false, pointerId: null, originX: 0, originY: 0 };
    this.keys = new Set();
    this.sprintHeld = false;
    this.passPressAt = 0;
    this.pendingPass = null;
    this.pendingPress = false;
    this.pendingShoot = null; // Bouton A : tir en attaque, tacle en défense.
    this.pendingLob = false;  // Bouton C : ballon lobé.
    this.pendingCallForPass = false;
    this.callPressAt = 0;
    this.role = null;
    this.actionLabels = { shoot: document.querySelector('#shoot small'), pass: document.querySelector('#pass small'), defend: document.querySelector('#defend small') };
    this.bindJoystick();
    this.bindButtons();
    this.bindKeyboard();
  }

  setRole(role) {
    const nextRole = ['GK','DEF','MID','FWD'].includes(role) ? role : 'MID';
    if (nextRole === this.role) return;
    this.role = nextRole;
    const actions = rolePresentation(this.role).actions;
    for (const key of Object.keys(this.actionLabels)) if (this.actionLabels[key]) this.actionLabels[key].textContent = actions[key];
    const buttons = document.getElementById('action-buttons');
    buttons?.setAttribute('data-role', this.role.toLowerCase());
    const labels = { GK: 'Commandes gardien', DEF: 'Commandes défenseur', MID: 'Commandes milieu', FWD: 'Commandes attaquant' };
    buttons?.setAttribute('aria-label', labels[this.role]);
    const sprintLabel = document.querySelector('#sprint');
    if (sprintLabel) sprintLabel.setAttribute('aria-label', this.role === 'GK' ? 'Déplacement rapide du gardien' : 'Maintenir pour sprinter');
  }

  bindJoystick() {
    const maxR = 46;
    const reset = () => {
      this.joy.active = false; this.joy.pointerId = null; this.joy.x = 0; this.joy.z = 0;
      this.stickBase.classList.remove('on');
      this.stickKnob.style.transform = 'translate(0px, 0px)';
    };
    this.stickZone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (this.joy.active) return;
      this.stickZone.setPointerCapture(e.pointerId);
      const r = this.stickBase.getBoundingClientRect();
      this.joy.active = true; this.joy.pointerId = e.pointerId;
      this.joy.originX = r.left + r.width / 2; this.joy.originY = r.top + r.height / 2;
      this.stickBase.classList.add('on'); this.updateStick(e.clientX, e.clientY, maxR);
    }, this.listenerOptions);
    this.stickZone.addEventListener('pointermove', (e) => {
      if (this.joy.active && e.pointerId === this.joy.pointerId) this.updateStick(e.clientX, e.clientY, maxR);
    }, this.listenerOptions);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.stickZone.addEventListener(type, (e) => { if (e.pointerId === this.joy.pointerId) reset(); }, this.listenerOptions);
    }
  }

  updateStick(cx, cy, maxR) {
    let dx = cx - this.joy.originX, dy = cy - this.joy.originY;
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.joy.x = dx / maxR; this.joy.z = dy / maxR;
  }

  bindButtons() {
    const bindTap = (id, onTap) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('active'); }, this.listenerOptions);
      const end = (e) => { if (e) e.preventDefault(); el.classList.remove('active'); onTap(); };
      el.addEventListener('pointerup', end, this.listenerOptions);
      el.addEventListener('pointercancel', () => el.classList.remove('active'), this.listenerOptions);
    };
    const a = document.getElementById('shoot');
    a.addEventListener('pointerdown', (e) => { e.preventDefault(); a.setPointerCapture?.(e.pointerId); a.classList.add('active'); }, this.listenerOptions);
    a.addEventListener('pointerup', (e) => { e.preventDefault(); a.classList.remove('active'); this.pendingShoot = { power: 0.9 }; }, this.listenerOptions);
    a.addEventListener('pointercancel', () => a.classList.remove('active'), this.listenerOptions);

    const b = document.getElementById('pass');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('active'); this.passPressAt = performance.now(); }, this.listenerOptions);
    b.addEventListener('pointerup', (e) => {
      e.preventDefault(); b.classList.remove('active');
      const heldFor = this.passPressAt ? performance.now() - this.passPressAt : 0;
      if (heldFor >= 480) this.pendingCallForPass = true;
      else { this.pendingPass = { lofted: false }; this.pendingPress = true; }
      this.passPressAt = 0;
    }, this.listenerOptions);
    b.addEventListener('pointercancel', () => { b.classList.remove('active'); this.passPressAt = 0; }, this.listenerOptions);

    bindTap('defend', () => { this.pendingLob = true; });

    const sprint = document.getElementById('sprint');
    sprint.addEventListener('pointerdown', (e) => { e.preventDefault(); sprint.setPointerCapture?.(e.pointerId); this.sprintHeld = true; sprint.classList.add('active'); }, this.listenerOptions);
    const stopSprint = () => { this.sprintHeld = false; sprint.classList.remove('active'); };
    sprint.addEventListener('pointerup', stopSprint, this.listenerOptions); sprint.addEventListener('pointercancel', stopSprint, this.listenerOptions); sprint.addEventListener('lostpointercapture', stopSprint, this.listenerOptions);
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') { this.pendingPass = { lofted: false }; this.pendingPress = true; }
      if (e.code === 'Space') { e.preventDefault(); this.pendingShoot = { power: 0.92 }; }
      if (e.code === 'KeyC') this.pendingLob = true;
      if (e.code === 'KeyQ') this.pendingCallForPass = true;
    }, this.listenerOptions);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), this.listenerOptions);
    window.addEventListener('blur', () => {
      this.keys.clear(); this.sprintHeld = false; this.passPressAt = 0;
      this.pendingPass = null; this.pendingPress = false; this.pendingShoot = null; this.pendingLob = false; this.pendingCallForPass = false; this.callPressAt = 0;
      this.joy.active = false; this.joy.pointerId = null; this.joy.x = 0; this.joy.z = 0;
      this.stickBase.classList.remove('on'); this.stickKnob.style.transform = 'translate(0px, 0px)';
      document.querySelectorAll('.control.active').forEach((el) => el.classList.remove('active'));
    }, this.listenerOptions);
  }

  getMoveVector() {
    let x = this.joy.x, z = this.joy.z;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) z -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) z += 1;
    const mag = Math.hypot(x, z);
    if (mag > 1) { x /= mag; z /= mag; }
    return shapeJoystickVector(x, z, this.role);
  }
  isSprinting() { return this.sprintHeld || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  consumePass() { const v = this.pendingPass; this.pendingPass = null; return v; }
  consumePress() { const v = this.pendingPress; this.pendingPress = false; return v; }
  consumeShoot() { const v = this.pendingShoot; this.pendingShoot = null; return v; }
  consumeLob() { const v = this.pendingLob; this.pendingLob = false; return v; }
  consumeCallForPass() { const v = this.pendingCallForPass; this.pendingCallForPass = false; return v; }

  dispose() {
    this.abortController.abort();
    this.keys.clear();
    this.sprintHeld = false;
    this.joy.active = false;
    this.joy.pointerId = null;
    this.joy.x = 0;
    this.joy.z = 0;
    this.stickBase?.classList.remove('on');
    if (this.stickKnob) this.stickKnob.style.transform = 'translate(0px, 0px)';
    document.querySelectorAll('.control.active').forEach((el) => el.classList.remove('active'));
  }
}
