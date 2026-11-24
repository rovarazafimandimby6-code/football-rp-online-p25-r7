import * as THREE from 'three';
import { PITCH } from './pitch.js';
import { renderClubCrest } from './club-identity.js';
import { resolvePlayerGuidance } from './player-guidance.js';

export class UIManager {
  constructor(players, callbacks) {
    this.abortController = new AbortController();
    this.listenerOptions = { signal: this.abortController.signal };
    this.blueScoreEl = document.getElementById('blue-score');
    this.redScoreEl = document.getElementById('red-score');
    this.periodEl = document.getElementById('period');
    this.clockEl = document.getElementById('clock');
    this.statusEl = document.getElementById('status');
    this.staminaFillEl = document.getElementById('stamina-fill');
    this.activeNameEl = document.getElementById('active-player-name');
    this.playerGuidanceEl = document.getElementById('player-guidance');
    this.benchStatusEl = null;
    this.fpsEl = document.getElementById('fps-badge');

    this.overlay = document.getElementById('overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlayText = document.getElementById('overlay-text');
    this.overlayAction = document.getElementById('overlay-action');
    this.overlayStats = document.getElementById('overlay-stats');
    this.callbacks = callbacks;
    this.players = players;
    this.pauseActionsEl = document.createElement('div');
    this.pauseActionsEl.className = 'pause-actions';
    this.overlay.querySelector('.overlay-card')?.appendChild(this.pauseActionsEl);
    this.durationSelect = document.getElementById('match-duration');

    this.statsPanel = document.getElementById('stats-panel');
    this.statsBody = document.getElementById('stats-body');

    this.labelsLayer = document.getElementById('labels-layer');
    this.minimapEl = document.getElementById('minimap');
    this.statusTimer = 0;
    this.tacticsToggle = document.getElementById('tactics-toggle');
    this.tacticsBar = document.getElementById('tactics-bar');

    this.playerLabels = new Map();
    this.mmDots = new Map();
    this.projVec = new THREE.Vector3();
    this.nameDisplayMode = 'standard';
    this.labelCandidates = [];

    this.initPlayerUI(players);
    this.bindEvents(callbacks);
  }

  initPlayerUI(players) {
    this.labelsLayer.innerHTML = '';
    this.playerLabels.clear();

    // Nettoyer anciens points sans supprimer les lignes du terrain
    this.minimapEl.querySelectorAll('.mm-dot').forEach((el) => el.remove());
    this.mmDots.clear();

    for (const p of players) {
      const label = document.createElement('div');
      label.className = `p-label ${p.team}`;
      label.textContent = `${p.number ? `#${p.number} ` : ''}${p.name}`;
      label.dataset.playerName = p.name;
      label.dataset.aiControlled = 'false';
      this.labelsLayer.appendChild(label);
      this.playerLabels.set(p.id, label);

      const dot = document.createElement('span');
      dot.className = `mm-dot ${p.team}`;
      this.minimapEl.appendChild(dot);
      this.mmDots.set(p.id, dot);
    }

    this.ballDot = document.createElement('span');
    this.ballDot.className = 'mm-dot ball';
    this.minimapEl.appendChild(this.ballDot);
  }

  bindEvents(cb) {
    document.getElementById('pause').addEventListener('click', () => cb.onTogglePause(), this.listenerOptions);
    this.overlayStats.addEventListener('click', () => {
      this.overlay.classList.add('hidden');
      this.statsPanel.classList.remove('hidden');
      cb.onOpenStats?.();
    }, this.listenerOptions);
    document.getElementById('stats-close').addEventListener('click', () => {
      this.statsPanel.classList.add('hidden');
      if (this.pauseMenuOpen) this.overlay.classList.remove('hidden');
    }, this.listenerOptions);
    if (this.tacticsToggle && this.tacticsBar) this.tacticsToggle.addEventListener('click', () => {
      const expanded = this.tacticsBar.classList.toggle('expanded');
      this.tacticsBar.classList.toggle('collapsed', !expanded);
      this.tacticsToggle.setAttribute('aria-expanded', String(expanded));
      this.tacticsToggle.classList.toggle('active', expanded);
    }, this.listenerOptions);

    this.durationSelect?.addEventListener('change', (e) => cb.onDuration?.(Number(e.target.value)), this.listenerOptions);

    this.overlayAction.addEventListener('click', () => cb.onOverlayAction(), this.listenerOptions);
    this.overlay.addEventListener('click', (event) => {
      const action = event.target.closest('[data-pause-action]')?.dataset.pauseAction;
      if (action) this.handlePauseAction(action, event.target.closest('[data-pause-action]'));
    }, this.listenerOptions);
  }

  setBenchStatus(players, localPlayerId, phase = 'playing', rotationRequests = [], rotationAvailable = false) {
    const local = players.find(player => player.id === localPlayerId);
    if (!local) return;
    if (!this.benchStatusEl) {
      const panel = document.createElement('div');
      panel.id = 'bench-status';
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', 'Effectif et remplacements');
      panel.style.cssText = 'position:absolute;left:12px;top:12%;z-index:18;width:min(88vw,330px);max-height:42vh;overflow:auto;padding:10px 12px;border-radius:10px;background:rgba(8,13,20,.94);border:1px solid rgba(255,255,255,.2);color:#fff;font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.03em;pointer-events:auto;';
      const message = document.createElement('div');
      message.dataset.benchMessage = 'true';
      panel.appendChild(message);
      const requestButton = document.createElement('button');
      requestButton.type = 'button';
      requestButton.textContent = 'DEMANDER À ENTRER';
      requestButton.style.cssText = 'margin-top:8px;width:100%;padding:9px 10px;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:#e6b84a;color:#171717;font:800 11px system-ui,sans-serif;';
      requestButton.addEventListener('click', () => this.callbacks.onRequestEntry?.(), this.listenerOptions);
      panel.appendChild(requestButton);
      const rotationBox = document.createElement('div');
      rotationBox.style.cssText = 'display:grid;gap:6px;margin-top:8px;';
      const outgoingSelect = document.createElement('select');
      outgoingSelect.setAttribute('aria-label', 'Joueur sortant');
      const incomingSelect = document.createElement('select');
      incomingSelect.setAttribute('aria-label', 'Joueur entrant');
      for (const select of [outgoingSelect, incomingSelect]) select.style.cssText = 'width:100%;padding:8px;border-radius:7px;background:#17202b;color:#fff;border:1px solid rgba(255,255,255,.22);font:600 11px system-ui,sans-serif;';
      const rotateButton = document.createElement('button');
      rotateButton.type = 'button';
      rotateButton.textContent = 'EFFECTUER LE REMPLACEMENT';
      rotateButton.style.cssText = 'padding:9px 10px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:#2d684b;color:#fff;font:800 10px system-ui,sans-serif;';
      rotateButton.addEventListener('click', async () => {
        const outgoingId = outgoingSelect.value, incomingId = incomingSelect.value;
        if (!outgoingId || !incomingId) return;
        rotateButton.disabled = true;
        try { await this.callbacks.onRotate?.(outgoingId, incomingId); }
        finally { rotateButton.disabled = false; }
      }, this.listenerOptions);
      rotationBox.append(outgoingSelect, incomingSelect, rotateButton);
      panel.appendChild(rotationBox);
      document.querySelector('main')?.appendChild(panel);
      this.benchStatusMessageEl = message;
      this.benchRequestButton = requestButton;
      this.benchRotationBox = rotationBox;
      this.benchOutgoingSelect = outgoingSelect;
      this.benchIncomingSelect = incomingSelect;
      this.benchRotateButton = rotateButton;
      this.benchStatusEl = panel;
    }
    const reserves = players.filter(player => player.team === local.team && player.isOnPitch === false);
    const starters = players.filter(player => player.team === local.team && player.isOnPitch !== false);
    const pending = rotationRequests.some(request => request.playerId === localPlayerId);
    this.benchStatusEl.hidden = phase === 'lobby' || phase === 'fulltime';
    if (local.isOnPitch === false) {
      this.benchStatusMessageEl.textContent = pending
        ? `DEMANDE ENREGISTRÉE · ${reserves.length} RÉSERVISTE(S) · EN ATTENTE D’UN ARRÊT DE JEU`
        : `SUR LE BANC · ${reserves.length} RÉSERVISTE(S) · ${starters.length} SUR LE TERRAIN`;
      this.benchRequestButton.hidden = pending || phase === 'fulltime' || phase === 'lobby';
      this.benchRequestButton.disabled = pending || phase === 'fulltime' || phase === 'lobby';
      this.benchRotationBox.hidden = true;
      return;
    }
    this.benchStatusMessageEl.textContent = `VOTRE ÉQUIPE · ${starters.length}/5 SUR LE TERRAIN · ${reserves.length} RÉSERVISTE(S)`;
    this.benchRequestButton.hidden = true;
    const outgoing = starters.filter(player => player.isBot === true);
    const incoming = reserves.filter(player => player.isBot === true);
    const canRotate = rotationAvailable && outgoing.length > 0 && incoming.length > 0;
    this.benchRotationBox.hidden = !canRotate;
    this.benchOutgoingSelect.replaceChildren();
    this.benchIncomingSelect.replaceChildren();
    const addOptions = (select, rows, emptyLabel) => {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = emptyLabel;
      select.appendChild(placeholder);
      for (const player of rows) {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.name} · ${player.role || 'Joueur'}`;
        select.appendChild(option);
      }
    };
    addOptions(this.benchOutgoingSelect, outgoing, 'Joueur à remplacer');
    addOptions(this.benchIncomingSelect, incoming, 'Réserviste à faire entrer');
    this.benchRotateButton.disabled = !canRotate;
    if (!canRotate && rotationAvailable) this.benchStatusMessageEl.textContent += ' · Aucun remplacement IA disponible';
  }

  setStatus(text) {
    this.statusEl.textContent = text;
    this.statusEl.classList.remove('show');
    void this.statusEl.offsetWidth;
    this.statusEl.classList.add('show');
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => this.statusEl.classList.remove('show'), 2300);
  }

  replacePlayer(previous, next) {
    const oldLabel = this.playerLabels.get(previous.id);
    oldLabel?.remove();
    this.playerLabels.delete(previous.id);
    const oldDot = this.mmDots.get(previous.id);
    oldDot?.remove();
    this.mmDots.delete(previous.id);

    const label = document.createElement('div');
    label.className = `p-label ${next.team}`;
    label.textContent = `${next.number ? `#${next.number} ` : ''}${next.name}`;
    this.labelsLayer.appendChild(label);
    this.playerLabels.set(next.id, label);

    const dot = document.createElement('span');
    dot.className = `mm-dot ${next.team}`;
    this.minimapEl.appendChild(dot);
    this.mmDots.set(next.id, dot);
  }

  updateHUD(match, activePlayer, fps, ball = null) {
    this.blueScoreEl.textContent = String(match.blueScore);
    this.redScoreEl.textContent = String(match.redScore);
    this.periodEl.textContent = match.period === 1 ? '1RE MI-TEMPS' : '2E MI-TEMPS';
    if (this.durationSelect) { this.durationSelect.value = String(match.pendingDurationMinutes || match.durationMinutes); this.durationSelect.disabled = false; }
    this.clockEl.textContent = match.formatClock();

    if (activePlayer) {
      const pct = Math.round(activePlayer.stamina * 100);
      this.staminaFillEl.style.width = `${pct}%`;
      this.staminaFillEl.classList.toggle('low', pct < 28);
      const roleLabels = { GK: 'GARDIEN', DEF: 'DÉFENSEUR', MID: 'MILIEU', FWD: 'ATTAQUANT' };
      this.activeNameEl.textContent = `${activePlayer.name} #${activePlayer.number} · ${roleLabels[activePlayer.role] || 'JOUEUR'}`;
      this.activeNameEl.dataset.role = String(activePlayer.role || 'MID').toLowerCase();
      if (this.playerGuidanceEl) {
        const guidance = resolvePlayerGuidance(activePlayer, ball, match.phase);
        const guidanceText = activePlayer.callTimer > 0 ? 'APPEL DE BALLE · ' + guidance.text : guidance.text;
        if (this.playerGuidanceEl.textContent !== guidanceText) this.playerGuidanceEl.textContent = guidanceText;
        this.playerGuidanceEl.dataset.phase = guidance.phase;
        this.playerGuidanceEl.dataset.role = String(activePlayer.role || 'MID').toLowerCase();
      }
    }

    if (fps > 0) {
      this.fpsEl.textContent = `${fps} FPS`;
    }
  }

  updateMinimapAndLabels(players, ball, camera) {
    const width = this.labelsLayer.clientWidth || window.innerWidth;
    const height = this.labelsLayer.clientHeight || window.innerHeight;
    const candidates = [];

    for (const player of players) {
      const dot = this.mmDots.get(player.id);
      if (dot) {
        dot.style.left = `${Math.max(2, Math.min(98, ((player.pos.x + PITCH.HALF_L) / PITCH.L) * 100))}%`;
        dot.style.top = `${Math.max(3, Math.min(97, ((player.pos.z + PITCH.HALF_W) / PITCH.W) * 100))}%`;
        dot.classList.toggle('active', player.isControlled);
      }

      const label = this.playerLabels.get(player.id);
      if (!label) continue;
      this.projVec.set(player.pos.x, 2.05, player.pos.z).project(camera);
      const inFrustum = Number.isFinite(this.projVec.x) && Number.isFinite(this.projVec.y) && Number.isFinite(this.projVec.z)
        && this.projVec.z >= -1 && this.projVec.z <= 1
        && Math.abs(this.projVec.x) < 0.94 && Math.abs(this.projVec.y) < 0.90;
      if (!inFrustum) continue;

      const screenX = (this.projVec.x * 0.5 + 0.5) * width;
      const screenY = (-this.projVec.y * 0.5 + 0.5) * height;
      const distanceBall = Math.hypot(player.pos.x - ball.pos.x, player.pos.z - ball.pos.z);
      if (player.isControlled || distanceBall < 4.2) {
        candidates.push({ player, label, x: screenX, y: screenY, distanceBall, priority: player.isControlled ? -1 : distanceBall });
      }
    }

    candidates.sort((a, b) => a.priority - b.priority);
    const accepted = [];
    let nearbyCount = 0;
    for (const item of candidates) {
      if (!item.player.isControlled && nearbyCount >= 2) continue;
      const labelWidth = item.player.isControlled ? 148 : 112;
      const labelHeight = item.player.isControlled ? 25 : 21;
      const overlaps = accepted.some((other) => {
        const otherWidth = other.player.isControlled ? 148 : 112;
        const otherHeight = other.player.isControlled ? 25 : 21;
        return Math.abs(item.x - other.x) < (labelWidth + otherWidth) * 0.46
          && Math.abs(item.y - other.y) < (labelHeight + otherHeight) * 0.62;
      });
      if (overlaps && !item.player.isControlled) continue;
      accepted.push(item);
      if (!item.player.isControlled) nearbyCount += 1;
    }

    for (const player of players) {
      const label = this.playerLabels.get(player.id);
      if (!label) continue;
      const item = accepted.find((candidate) => candidate.player.id === player.id);
      label.style.display = item ? 'block' : 'none';
      if (!item) continue;
      label.style.left = `${Math.max(64, Math.min(width - 64, item.x))}px`;
      label.style.top = `${Math.max(28, Math.min(height - 24, item.y))}px`;
      label.classList.toggle('active', player.isControlled);
      const aiControlled = player.aiControlled === true;
      label.classList.toggle('ai-controlled', aiControlled);
      if (label.dataset.aiControlled !== String(aiControlled)) {
        label.dataset.aiControlled = String(aiControlled);
        label.textContent = `${player.number ? `#${player.number} ` : ''}${player.name}${aiControlled ? ' · IA' : ''}`;
        label.title = aiControlled ? 'Contrôlé par l’IA · niveau moyen' : '';
      }
      label.style.setProperty('--label-scale', player.isControlled ? '1' : String(Math.max(0.84, 1 - item.distanceBall * 0.025)));
    }

    if (this.ballDot) {
      this.ballDot.style.left = `${Math.max(1, Math.min(99, ((ball.pos.x + PITCH.HALF_L) / PITCH.L) * 100))}%`;
      this.ballDot.style.top = `${Math.max(2, Math.min(98, ((ball.pos.z + PITCH.HALF_W) / PITCH.W) * 100))}%`;
    }
  }

  renderStats(match) {
    const pos = match.getPossessionPercent();
    const b = match.stats.blue;
    const r = match.stats.red;
    this.statsBody.innerHTML = `
      <div><b>BLEU</b><span>${b.shots}</span><span>${b.onTarget}</span><span>${b.passes}</span><span>${b.interceptions}</span><span>${b.tackles}</span><span>${b.saves}</span><span>${pos.blue}%</span></div>
      <div><b>ROUGE</b><span>${r.shots}</span><span>${r.onTarget}</span><span>${r.passes}</span><span>${r.interceptions}</span><span>${r.tackles}</span><span>${r.saves}</span><span>${pos.red}%</span></div>
    `;
  }

  showMatchReport(result) {
    if (!result || !this.overlay) return false;
    const safe = value => String(value ?? '').replace(/[&<>\"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
    const teams = result.teams || {};
    const teamName = team => teams[team]?.name || (team === 'blue' ? 'ÉQUIPE BLEUE' : 'ÉQUIPE ROUGE');
    const award = result.awards?.playerOfMatch;
    const performers = (result.awards?.topPerformers || []).map((p,index) => '<div class="match-rating-row"><b>'+(index+1)+'</b><span>'+safe(p.name)+'</span><small>'+p.goals+' B · '+p.assists+' PD</small><strong>'+Number(p.rating).toFixed(1)+'</strong></div>').join('');
    const rows = (result.players || []).filter(p => p.rating !== null).sort((a,b)=>(b.rating||0)-(a.rating||0)).map(p => '<div class="match-rating-row"><span>'+safe(p.name)+'<small> · '+(p.team==='blue'?'BLEU':'ROUGE')+' · '+(p.role||'')+'</small></span><small>'+Math.round(p.minutesPlayedMs/60000)+' min · '+p.stats.completedPasses+'/'+p.stats.passes+' passes</small><strong>'+Number(p.rating).toFixed(1)+'</strong></div>').join('');
    const stats = team => result.teamStats?.[team] || {};
    const summary = teamName('blue')+' '+result.score.blue+' – '+result.score.red+' '+teamName('red')+'\n\n'+(award?'HOMME DU MATCH : '+award.name+' · '+award.rating.toFixed(1)+'/10':'Aucune performance individuelle classée')+'\n\nBILAN COLLECTIF\n'+teamName('blue')+' : '+(stats('blue').shots||0)+' tirs · '+(stats('blue').completedPasses||0)+'/'+(stats('blue').passes||0)+' passes réussies · '+(stats('blue').tackles||0)+' tacles\n'+teamName('red')+' : '+(stats('red').shots||0)+' tirs · '+(stats('red').completedPasses||0)+'/'+(stats('red').passes||0)+' passes réussies · '+(stats('red').tackles||0)+' tacles';
    this.showOverlay('Rapport de match',summary,'QUITTER LE MATCH');
    this.pauseActionsEl.innerHTML='<section class="match-report-ratings"><h3>TOP PERFORMANCES</h3>'+(performers||'<p>Aucune performance disponible.</p>')+'<h3>NOTES DES JOUEURS</h3>'+(rows||'<p>Aucun joueur avec du temps de jeu.</p>')+'</section>';
    this.overlay.classList.remove('hidden');
    return true;
  }

  showOverlay(title, text, actionLabel) {
    this.pauseMenuOpen = false;
    this.pauseActionsEl.innerHTML = '';
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    this.overlayAction.textContent = actionLabel;
    this.overlayAction.style.display = 'inline-flex';
    this.overlayStats.style.display = 'none';
    this.overlay.classList.remove('hidden');
  }

  showPauseMenu(match, activePlayer) {
    this.pauseMenuOpen = true;
    this.pauseMatch = match;
    this.pausePlayer = activePlayer;
    this.overlayTitle.textContent = 'Match en pause';
    this.overlayText.textContent = 'La rencontre est suspendue sur cet appareil. Consultez les informations ou reprenez la partie.';
    this.overlayAction.style.display = 'none';
    this.overlayStats.style.display = 'none';
    this.renderPauseActions('home');
    this.overlay.classList.remove('hidden');
  }

  renderPauseActions(section) {
    const button = (action, label, cls = '') => `<button type="button" class="pause-menu-button ${cls}" data-pause-action="${action}">${label}</button>`;
    if (section === 'home') {
      this.overlayTitle.textContent = 'Match en pause';
      const score = this.pauseMatch ? `${this.pauseMatch.blueScore} – ${this.pauseMatch.redScore}` : '0 – 0';
      const homeName = document.getElementById('blue-name')?.textContent || 'Antananarivo FC';
      const awayName = document.getElementById('red-name')?.textContent || 'Toamasina United';
      this.pauseActionsEl.innerHTML = `<div class="pause-score"><div>${renderClubCrest({id:'antananarivo-fc',name:homeName,size:44,compact:true})}<b>${homeName}</b></div><strong>${score}</strong><div>${renderClubCrest({id:'toamasina-united',name:awayName,size:44,compact:true})}<b>${awayName}</b></div></div><div class="pause-menu-grid">${button('resume','▶  REPRENDRE','primary')}${button('stats','▥  STATISTIQUES')}${button('player','◉  MON JOUEUR')}${button('substitutions','⇄  REMPLACEMENTS')}${button('events','☷  ÉVÉNEMENTS')}${button('settings','⚙  PARAMÈTRES')}${button('quit','↩  QUITTER LE MATCH','danger')}</div>`;
      this.overlayText.textContent = 'Score, performances et réglages de la rencontre.';
      return;
    }
    const back = button('back','←  RETOUR AU MENU PAUSE','back');
    if (section === 'player') {
      const p = this.pausePlayer;
      const name = p?.name || 'Joueur';
      const stamina = Math.round((p?.stamina ?? 0) * 100);
      this.overlayTitle.textContent = 'Mon joueur';
      this.overlayText.textContent = `${name} · N°${p?.number ?? 10} · Endurance ${stamina}%
Cette fiche décrit uniquement le footballeur contrôlé par vous.`;
      this.pauseActionsEl.innerHTML = back;
    } else if (section === 'substitutions') {
      const data = this.callbacks.getSubstitutionOptions?.() || { pairs: [], used: 0, limit: 3 };
      const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const role = { GK:'Gardien', DEF:'Défenseur', MID:'Milieu', FWD:'Attaquant' };
      const pairs = data.pairs || [];
      this.overlayTitle.textContent = 'Remplacements';
      this.overlayText.textContent = `Remplacements utilisés : ${data.used}/${data.limit}. Votre joueur de carrière reste toujours sur le terrain. Les remplaçants doivent occuper le même poste.`;
      this.pauseActionsEl.innerHTML = `${pairs.length ? pairs.map(({outgoing,incoming}) => `<button type="button" class="pause-menu-button" data-pause-action="substitute" data-out-id="${safe(outgoing.id)}" data-in-id="${safe(incoming.id)}">${safe(outgoing.name)} #${safe(outgoing.number)} → ${safe(incoming.name)} #${safe(incoming.number)} · ${safe(role[outgoing.role] || outgoing.role)}</button>`).join('') : '<p class="pause-empty">Aucun remplacement disponible pour le moment.</p>'}${back}`;
    } else if (section === 'events') {
      const events = (this.pauseMatch?.events || []).slice().reverse().slice(0, 8);
      const names = { goal:'BUT', 'second-half-start':'COUP D’ENVOI', foul:'FAUTE', yellow_card:'CARTON JAUNE', red_card:'CARTON ROUGE', substitution:'REMPLACEMENT' };
      const lines = events.length ? events.map(ev => {
        const half = this.pauseMatch.halfDuration || 150;
        const elapsed = (ev.period === 2 ? half : 0) + Math.max(0, half - (ev.timeLeft || 0));
        const virtual = Math.floor((elapsed / (half * 2)) * 5400);
        const minute = Math.floor(virtual / 60);
        return `${String(minute).padStart(2,'0')}′  ${names[ev.type] || String(ev.type).replace(/[-_]/g,' ').toUpperCase()}${ev.team ? ` · ${ev.team === 'blue' ? 'BLEU' : 'ROUGE'}` : ''}`;
      }).join('\n') : 'Aucun événement enregistré pour le moment.';
      this.overlayTitle.textContent = 'Événements du match';
      this.overlayText.textContent = lines;
      this.pauseActionsEl.innerHTML = back;
    } else if (section === 'settings') {
      this.overlayTitle.textContent = 'Paramètres du match';
      this.overlayText.textContent = 'Réglez la qualité graphique. La durée choisie s’appliquera au prochain match si la rencontre a déjà commencé.';
      this.pauseActionsEl.innerHTML = `<div class="pause-setting"><label for="pause-camera">Caméra</label><select id="pause-camera"><option value="player">Immersion joueur · adaptée au poste</option><option value="touchline">Ligne de touche</option><option value="broadcast">Diffusion TV · P27</option><option value="close">Rapprochée</option><option value="tactical">Tactique</option><option value="spectator">Spectateur · panoramique</option></select></div><div class="pause-setting"><label for="pause-zoom">Zoom caméra · référence 55 %</label><input id="pause-zoom" type="range" min="0" max="100" value="${this.callbacks.getCameraZoom?.() ?? 55}"></div><div class="pause-setting"><label for="pause-quality">Qualité graphique</label><select id="pause-quality"><option value="auto" selected>Automatique</option><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></div><div class="pause-setting"><label for="pause-duration">Durée du prochain match</label><select id="pause-duration"><option value="3">3 minutes</option><option value="5" selected>5 minutes</option></select></div>${button('apply-settings','APPLIQUER','primary')}${back}`;
      const q = document.getElementById('quality');
      const d = document.getElementById('match-duration');
      if (q) document.getElementById('pause-quality').value = q.value;
      const cameraSelect = document.getElementById('pause-camera');
      if (cameraSelect) cameraSelect.value = this.callbacks.getCameraMode?.() || 'player';
      const zoomInput = document.getElementById('pause-zoom');
      if (zoomInput) zoomInput.value = String(this.callbacks.getCameraZoom?.() ?? 55);
      if (d) document.getElementById('pause-duration').value = d.value;
    } else if (section === 'quit') {
      this.overlayTitle.textContent = 'Quitter le match ?';
      this.overlayText.textContent = 'Vous allez quitter cette rencontre locale. Votre progression de carrière n’est pas enregistrée par ce prototype.';
      this.pauseActionsEl.innerHTML = `${button('confirm-quit','CONFIRMER ET QUITTER','danger')}${button('back','ANNULER','back')}`;
    }
  }

  handlePauseAction(action, button = null) {
    if (action === 'resume') { this.callbacks.onOverlayAction(); return; }
    if (action === 'stats') {
      this.renderStats(this.pauseMatch);
      this.overlay.classList.add('hidden');
      this.statsPanel.classList.remove('hidden');
      return;
    }
    if (action === 'back') { this.renderPauseActions('home'); return; }
    if (action === 'substitutions') { this.renderPauseActions('substitutions'); return; }
    if (action === 'substitute') {
      const result = this.callbacks.onSubstitute?.(button?.dataset.outId, button?.dataset.inId);
      if (result?.ok) { this.renderPauseActions('home'); this.setStatus(result.message); }
      else this.setStatus(result?.message || 'Remplacement impossible.');
      return;
    }
    if (['player','events','settings','quit'].includes(action)) { this.renderPauseActions(action); return; }
    if (action === 'apply-settings') {
      const quality = document.getElementById('pause-quality')?.value || 'auto';
      const duration = Number(document.getElementById('pause-duration')?.value || 5);
      this.callbacks.onQuality?.(quality);
      this.callbacks.onCameraMode?.(document.getElementById('pause-camera')?.value || 'broadcast');
      this.callbacks.onCameraZoom?.(Number(document.getElementById('pause-zoom')?.value ?? 55));
      this.callbacks.onDuration?.(duration);
      this.renderPauseActions('home');
      this.setStatus('PARAMÈTRES APPLIQUÉS');
      return;
    }
    if (action === 'confirm-quit') this.callbacks.onExitMatch?.();
  }

  hideOverlay() {
    this.pauseMenuOpen = false;
    this.pauseActionsEl.innerHTML = '';
    this.overlayAction.style.display = 'inline-flex';
    this.overlayStats.style.display = 'none';
    this.overlay.classList.add('hidden');
  }

  dispose() {
    this.benchStatusEl?.remove();
    this.abortController.abort();
    window.clearTimeout(this.statusTimer);
    this.pauseActionsEl?.remove();
    this.playerLabels?.clear();
    this.mmDots?.clear();
  }

}