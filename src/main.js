import { ClubManager } from './club-manager.js';
import { PlayerProfileStore } from './player-profile.js';
import { LocalPlayerProfile } from './local-player-profile.js';
import { CareerManager } from './career-manager.js';
import { syncCareerPlayerRoster } from './career-roster-sync.js';
import { PlayerSeasonStats } from './player-season-stats.js';
import { resolveOnlinePlayerPerformance } from './online-career-sync.js';
import { renderClubCrest } from './club-identity.js';
import { Player } from './player.js';
import { createMatchSquad } from './match-squad.js';
import { OnlineMatchClient } from './online-client.js';
import { OnlineAccountClient } from './online-account-client.js';
import { PlayerSyncOutbox } from './player-sync-outbox.js';
import { ProfileSyncCoordinator } from './profile-sync-coordinator.js';
import { createAccountRecoveryAdapters, hasAccountRecoveryData } from './account-recovery-adapters.js';
import { restoreAccountSnapshot } from './account-recovery.js';
import { createLegacyProfileBackup, buildLegacyProfileMigrationPayload } from './legacy-profile-migration.js';
import * as THREE from 'three';

const shell = document.getElementById('game-shell');
const menu = document.getElementById('main-menu');
const container = document.getElementById('webgl-container');
const fullscreenButtons = [document.getElementById('menu-fullscreen'), document.getElementById('match-fullscreen')].filter(Boolean);
function refreshFullscreenControls() {
  const active = Boolean(document.fullscreenElement);
  for (const button of fullscreenButtons) {
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Quitter le plein écran' : 'Passer en plein écran');
    const label = button.querySelector('span');
    if (label) label.textContent = active ? 'QUITTER PLEIN ÉCRAN' : 'PLEIN ÉCRAN';
  }
  window.dispatchEvent(new Event('resize'));
}
async function toggleMobileFullscreen() {
  const target = shell.classList.contains('hidden') ? menu : shell;
  if (document.fullscreenElement) {
    if (document.exitFullscreen) await document.exitFullscreen();
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
    return;
  }
  if (!target || !target.requestFullscreen) {
    const message = 'Plein écran non pris en charge. Sur Android, ouvre le menu du navigateur puis choisis « Ajouter à l’écran d’accueil » pour lancer le jeu sans barre de navigation.';
    const status = document.getElementById('menu-page-subtitle');
    if (!shell.classList.contains('hidden')) document.getElementById('status').textContent = 'PLEIN ÉCRAN INDISPONIBLE · OUVREZ LE JEU DEPUIS L’ÉCRAN D’ACCUEIL';
    else if (status) status.textContent = message;
    return;
  }
  try {
    try { await target.requestFullscreen({ navigationUI: 'hide' }); }
    catch (_) { await target.requestFullscreen(); }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) {}
  } catch (_) {
    const status = document.getElementById('menu-page-subtitle');
    if (status && shell.classList.contains('hidden')) status.textContent = 'Le navigateur a refusé le plein écran. Réessaie depuis le bouton après une interaction directe.';
  }
}
for (const button of fullscreenButtons) button.addEventListener('click', () => { toggleMobileFullscreen().catch(() => {}); });
document.addEventListener('fullscreenchange', refreshFullscreenControls);
const clubs = new ClubManager();
let hasSavedPlayerProfile = false;
try { hasSavedPlayerProfile = Boolean(globalThis.localStorage?.getItem('football-rp-online.player-profile.v1')); } catch (_) {}
const profileStore = new PlayerProfileStore();
let localPlayerProfileStore = null;
let localPlayerIdentity = null;
try {
  localPlayerProfileStore = new LocalPlayerProfile();
  localPlayerIdentity = localPlayerProfileStore.load();
  if (!localPlayerIdentity && hasSavedPlayerProfile) localPlayerIdentity = localPlayerProfileStore.create({ displayName: profileStore.profile.identity.displayName });
  else if (localPlayerIdentity && localPlayerIdentity.displayName !== profileStore.profile.identity.displayName) localPlayerIdentity = localPlayerProfileStore.update({ displayName: profileStore.profile.identity.displayName });
} catch (_) {
  // The football career remains playable even if local profile metadata storage is unavailable.
}
const seasonStats = new PlayerSeasonStats();
function buildTransferWindows() {
  const now = new Date(); const windows = [];
  for (let year = now.getFullYear(); year <= now.getFullYear() + 3; year++) {
    for (const month of [0, 6]) windows.push({ start: new Date(Date.UTC(year, month, 1)).toISOString(), end: new Date(Date.UTC(year, month + 1, 1) - 1).toISOString() });
  }
  return windows;
}
const career = new CareerManager({ initialCoins: 2500, transferWindows: buildTransferWindows() });
syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile });
let game = null;
let pendingOnlineMatch = null;
const accountClient = new OnlineAccountClient({ baseUrl: location.origin });
let pendingAccountRecoveryPreview = null;
accountClient.restoreSession();
const profileSyncOutbox = new PlayerSyncOutbox();
const profileSyncCoordinator = new ProfileSyncCoordinator({
  accountClient,
  outbox: profileSyncOutbox,
  getProfile: () => profileStore.profile,
  getLocalIdentity: () => localPlayerIdentity
});
const queueAndSyncCurrentProfile = async () => {
  profileSyncCoordinator.enqueueCurrentProfile();
  return profileSyncCoordinator.flush();
};
void accountClient.resumeCookieSession().then(async () => {
  if (!localPlayerIdentity && localPlayerProfileStore && /^FRP-[0-9]{6}$/.test(accountClient.account?.playerId || '')) {
    try {
      localPlayerIdentity = await accountClient.createLocalReplica(localPlayerProfileStore);
      document.querySelectorAll('[data-player-id]').forEach(node => { node.textContent = localPlayerIdentity.id; });
    } catch (_) {
      // Do not overwrite or fabricate a local identity if safe adoption is unavailable.
    }
  }
  void profileSyncCoordinator.flush();
  const button = document.querySelector('[data-action="account-recovery-preview"]');
  if (button) button.disabled = false;
}).catch(() => {});
window.addEventListener('online', () => { void profileSyncCoordinator.flush().catch(() => {}); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void profileSyncCoordinator.flush().catch(() => {});
});
const onlineClient = new OnlineMatchClient({ baseUrl: location.origin, accountTokenProvider: () => accountClient.token });
let avatarPreview = null;
function disposeAvatarPreview() {
  if (!avatarPreview) return;
  cancelAnimationFrame(avatarPreview.raf);
  avatarPreview.resizeObserver?.disconnect();
  avatarPreview.player.visual.dispose?.();
  avatarPreview.scene.traverse((obj) => { obj.geometry?.dispose?.(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; for (const mat of mats) { if (!mat) continue; for (const value of Object.values(mat)) if (value?.isTexture) value.dispose(); mat.dispose?.(); } });
  avatarPreview.renderer.dispose();
  avatarPreview.renderer.domElement.remove();
  avatarPreview = null;
}
function mountAvatarPreview(profile) {
  const host = document.getElementById('avatar-preview');
  if (!host) return;
  try {
    const width = Math.max(180, host.clientWidth || 280);
    const height = Math.max(220, host.clientHeight || 300);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10251f);
    scene.fog = new THREE.Fog(0x10251f, 7, 15);
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
    camera.position.set(0.15, 2.05, 5.8); camera.lookAt(0, 1.12, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(width, height); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    host.replaceChildren(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe9fff3, 0x26382d, 1.8));
    const key = new THREE.DirectionalLight(0xffe7c5, 2.2); key.position.set(-3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8bd9ff, 1.1); rim.position.set(3, 3, -3); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshStandardMaterial({ color: 0x1b4735, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.015; scene.add(floor);
    const player = new Player({ id: 'avatar-preview', team: 'blue', number: profile.identity.number, name: profile.identity.displayName, role: profile.identity.role, slotIndex: 0, homePos: { x: 0, z: 0 }, appearance: profile.appearance, attributes: profile.progression.attributes, preferredFoot: profile.identity.preferredFoot });
    player.isControlled = true; player.visual.ring.visible = false; player.visual.root.rotation.y = 0.12; scene.add(player.visual.root);
    let last = performance.now();
    const state = { scene, renderer, player, raf: 0, dragging: false, pointerId: null, lastPointerX: 0, resumeAutoAt: 0, resizeObserver: null };
    avatarPreview = state;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    const onPointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      state.dragging = true;
      state.pointerId = event.pointerId;
      state.lastPointerX = event.clientX;
      state.resumeAutoAt = performance.now() + 1800;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event) => {
      if (!state.dragging || event.pointerId !== state.pointerId) return;
      const deltaX = event.clientX - state.lastPointerX;
      state.lastPointerX = event.clientX;
      player.visual.root.rotation.y += deltaX * 0.009;
      state.resumeAutoAt = performance.now() + 1800;
      event.preventDefault();
    };
    const endDrag = (event) => {
      if (!state.dragging || (event && event.pointerId !== state.pointerId)) return;
      state.dragging = false;
      state.pointerId = null;
      state.resumeAutoAt = performance.now() + 1800;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
    const hint = document.createElement('span');
    hint.className = 'avatar-preview-hint';
    hint.textContent = 'FAITES GLISSER POUR TOURNER';
    hint.setAttribute('aria-hidden', 'true');
    host.append(hint);
    if (typeof ResizeObserver !== 'undefined') {
      state.resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect || rect.width < 1 || rect.height < 1 || avatarPreview !== state) return;
        renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
      });
      state.resizeObserver.observe(host);
    }
    const frame = (now) => {
      if (avatarPreview !== state) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      player.updateVisual(dt);
      if (!state.dragging && now >= state.resumeAutoAt) player.visual.root.rotation.y += dt * 0.12;
      renderer.render(scene, camera);
      state.raf = requestAnimationFrame(frame);
    };
    state.raf = requestAnimationFrame(frame);
  } catch (error) { host.textContent = 'Aperçu 3D indisponible sur ce navigateur.'; }
}

let selectedMatchup = { home: 'antananarivo-fc', away: 'toamasina-united' };
let selectedClubId = null;
let playerLibraryLimit = 24;
let playerLibraryProfiles = [];
let selectedPlayerProfile = null;
let playerCareerRequestSequence = 0;
let playerProfileReturnPage = 'players';
let preferences = { duration: 5, quality: 'auto', cameraMode: 'player', cameraZoom: 55, nameDisplay: 'standard' };
try {
  const saved = JSON.parse(localStorage.getItem('fpro-menu-preferences') || '{}');
  preferences.duration = saved.duration === 3 ? 3 : 5;
  preferences.quality = ['auto', 'low', 'medium', 'high'].includes(saved.quality) ? saved.quality : 'auto';
  preferences.cameraMode = ['player','touchline','broadcast','close','tactical','spectator'].includes(saved.cameraMode) ? saved.cameraMode : 'player';
  preferences.cameraZoom = Number.isFinite(Number(saved.cameraZoom)) ? Math.max(0, Math.min(100, Number(saved.cameraZoom))) : 55;
  preferences.nameDisplay = 'standard';
} catch (_) {}

const crest = (club) => renderClubCrest({ id: club.id, name: club.name, size: 58, colors: club.colors });
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function reserveLocalPlayerIdentity() {
  if (!localPlayerProfileStore || !localPlayerIdentity || localPlayerIdentity.identityStatus === 'reserved') return;
  try {
    localPlayerIdentity = await localPlayerProfileStore.reserveWithServer();
    await accountClient.resumeCookieSession().catch(() => null);
    document.querySelectorAll('[data-player-id]').forEach(node => { node.textContent = localPlayerIdentity.id; });
    void profileSyncCoordinator?.flush().catch(() => {});
  } catch (_) {
    // Keep the provisional local FRP number and retry on a later launch.
  }
}

function renderGoogleProtectionCard({ compact = false } = {}) {
  const playerId = localPlayerIdentity?.id || 'FRP en attente';
  return `<section class="competition-panel google-protection-card">
    <div class="panel-heading"><div><span class="eyebrow">IDENTITÉ FOOTBALL RP</span><h2>Protéger votre carrière</h2></div><span class="local-tag">LOCAL</span></div>
    <p class="notice">Identifiant joueur : <strong data-player-id>${escapeHTML(playerId)}</strong></p>
    <p class="notice">${compact
      ? "Votre carrière fonctionne sans compte Google. Associez Google plus tard pour la retrouver sur un autre appareil."
      : "L'association Google est facultative. Elle protégera ce profil et cette carrière existants, sans créer un nouveau joueur."}</p>
    <button class="small-action" type="button" data-action="google-link">ASSOCIER CE PROFIL À GOOGLE</button><button class="small-action" type="button" data-action="google-login">CONTINUER AVEC GOOGLE · RÉCUPÉRER</button>
    <p class="notice">Le parcours Google est intégré au code, mais nécessite encore la configuration OAuth sur le serveur. La synchronisation complète de la carrière est en cours.</p>
  </section>`;
}


async function loadPlayerCareer(player) {
  const target = document.getElementById('player-career-stats');
  if (!target) return;
  const sequence = ++playerCareerRequestSequence;
  const playerId = player?.careerPlayerId;
  if (!playerId) {
    target.innerHTML = '<b>Statistiques non disponibles</b><p>Cette fiche ne possède pas encore d’identifiant sportif relié aux matchs du serveur.</p>';
    return;
  }
  try {
    const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/career`, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (sequence !== playerCareerRequestSequence || selectedPlayerProfile !== player) return;
    if (response.status === 404) {
      target.innerHTML = '<b>Aucun match enregistré</b><p>Ce joueur n’a pas encore participé à un match enregistré sur le serveur.</p>';
      return;
    }
    if (!response.ok) throw new Error('CAREER_UNAVAILABLE');
    const payload = await response.json();
    const career = payload?.career;
    if (!career?.player || sequence !== playerCareerRequestSequence || selectedPlayerProfile !== player) return;
    const clubHistory = Array.isArray(career.clubHistory) ? career.clubHistory : [];
    const timeline = document.getElementById('player-career-club-history');
    if (timeline && clubHistory.length) {
      timeline.innerHTML = clubHistory.slice().reverse().map(item => {
        const firstDate = new Date(Number(item.firstMatchAt) || 0).toLocaleDateString('fr-FR');
        return '<div class="player-career-timeline-item"><i></i><div><b>' + escapeHTML(item.clubName) + '</b><span>Club observé dans les matchs archivés</span><small>Première apparition : ' + firstDate + ' · ' + item.appearances + ' match(s)</small></div><strong>ARCHIVÉ</strong></div>';
      }).join('');
    }
    const totals = career.totals || {};
    const count = key => Math.max(0, Number(totals[key]) || 0);
    const minutes = Math.floor(count('minutesPlayedMs') / 60000);
    const matches = Array.isArray(career.matches) ? career.matches.slice().reverse() : [];
    const resultLabel = value => value === 'win' ? 'Victoire' : value === 'draw' ? 'Nul' : 'Défaite';
    target.innerHTML = `<div class="player-career-stat-grid">
      <span><b>${count('matches')}</b><small>MATCHS</small></span><span><b>${minutes}</b><small>MINUTES</small></span>
      <span><b>${count('goals')}</b><small>BUTS</small></span><span><b>${count('assists')}</b><small>PASSES DÉC.</small></span>
      <span><b>${count('shots')}</b><small>TIRS</small></span><span><b>${count('passes')}</b><small>PASSES</small></span>
      <span><b>${count('wins')}</b><small>VICTOIRES</small></span><span><b>${career.averageRating ?? '—'}</b><small>NOTE MOY.</small></span>
    </div>${matches.length ? `<div class="player-career-match-history"><h3>Derniers matchs enregistrés</h3>${matches.slice(0,8).map(match=>`<article><b>${resultLabel(match.result)}</b><span>${escapeHTML(match.teamName || player.clubName)} · vs ${escapeHTML(match.opponent || 'Adversaire')}</span><small>${Math.floor((Number(match.minutesPlayedMs)||0)/60000)} min · note ${match.rating ?? '—'} · ${Number(match.stats?.goals)||0} but(s)</small></article>`).join('')}</div>` : ''}`;
  } catch (error) {
    if (sequence !== playerCareerRequestSequence || selectedPlayerProfile !== player) return;
    target.innerHTML = '<b>Parcours temporairement indisponible</b><p>Impossible de récupérer les statistiques du serveur. Réessaie lorsque la connexion sera rétablie.</p>';
  }
}


let publicClubDirectoryCache = new Map();
let publicClubDirectoryRequest = 0;
const publicDivisionNames = {D1:'Premier League',D2:'Ligue 2',D3:'National League',D4:'Challenger League',D5:'Regional League'};
async function loadPublicClubDirectory() {
  const requestId=++publicClubDirectoryRequest;
  if(!document.getElementById('club-search')) return;
  const status=document.getElementById('club-directory-status');
  if(status) status.textContent='Synchronisation du catalogue de la saison active…';
  try {
    const fetchPage=async offset=>{
      const response=await fetch('/api/clubs?limit=100&offset='+offset,{headers:{Accept:'application/json'}});
      if(!response.ok) throw new Error('CATALOGUE_HTTP_'+response.status);
      return response.json();
    };
    const pages=await Promise.all([fetchPage(0),fetchPage(100)]);
    if(requestId!==publicClubDirectoryRequest || !document.getElementById('club-search')) return;
    const items=[...(pages[0].clubs||[]),...(pages[1].clubs||[])];
    if(pages[0].total!==156 || items.length!==156 || new Set(items.map(item=>item.id)).size!==156) throw new Error('CATALOGUE_INCOMPLETE');
    publicClubDirectoryCache=new Map(items.map(item=>[item.id,item]));
    const countrySelect=document.getElementById('club-country-filter');
    if(countrySelect) countrySelect.innerHTML='<option value="all">Tous les pays</option>'+[...new Set(items.map(item=>item.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')).map(value=>'<option value="'+escapeHTML(value)+'">'+escapeHTML(value)+'</option>').join('');
    const overview=document.querySelector('.club-overview');
    if(overview) overview.innerHTML='<div><b>156</b><span>CLUBS ACTIFS</span></div><div><b>5</b><span>DIVISIONS</span></div><div><b>9</b><span>GROUPES DE CHAMPIONNAT</span></div>';
    const groups=['D1','D2','D3','D4','D5'].map(division=>({division,clubs:items.filter(item=>item.division===division)}));
    const html=groups.map(group=>{
      const cards=group.clubs.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(club=>{
        const conference=club.conference?'<span class="club-conference-tag">'+escapeHTML(club.conference)+'</span>':'';
        const admission=club.humanAdmission==='system-only'?'RÉSERVÉ AUX JOUEURS DU SYSTÈME':'ADMISSION OUVERTE';
        const managerLabel=club.managementType==='human'?'CLUB DIRIGÉ PAR UN JOUEUR':'CLUB DIRIGÉ PAR LE SYSTÈME';
        const managerClass=club.managementType==='human'?'human':'system';
        return '<article class="club-card" data-club-card data-name="'+escapeHTML(club.name.toLocaleLowerCase('fr'))+'" data-location="'+escapeHTML((club.city+' '+club.country+' '+(club.stadium||'')).toLocaleLowerCase('fr'))+'" data-country="'+escapeHTML(club.country||'')+'" data-division="'+club.division+'" data-conference="'+escapeHTML(club.conference||'')+'" data-rating="'+Number(club.rating||0)+'" data-roster="0" data-reputation="'+Number(club.reputation||0)+'">'+
          renderClubCrest({id:club.id,name:club.name,size:58,colors:club.colors})+
          '<div class="club-card-copy"><div class="club-card-kickers"><span>'+club.division+'</span>'+conference+'</div><span class="club-control-indicator '+managerClass+'"><i></i>'+managerLabel+'</span><h3>'+escapeHTML(club.name)+'</h3><p>'+escapeHTML(club.city)+' · '+escapeHTML(club.country)+'</p><div class="club-meta-line"><span>Niveau '+Number(club.rating||0)+'</span><span>'+Number(club.reputation||0)+' réputation</span></div><small>'+admission+'</small><div class="club-stadium">'+escapeHTML(club.stadium||'Stade non renseigné')+'</div><button class="small-action" data-action="view-roster" data-club="'+escapeHTML(club.id)+'">OUVRIR LA FICHE DU CLUB</button></div></article>';
      }).join('');
      const conferenceSummary=group.division==='D4'?'Conférence A · 16 clubs | Conférence B · 16 clubs':group.division==='D5'?'Conférences A, B, C et D · 16 clubs chacune':'Compétition nationale';
      return '<section class="club-division" data-division="'+group.division+'"><div class="club-division-heading"><div><span class="eyebrow">'+group.division+'</span><h2>'+publicDivisionNames[group.division]+'</h2><small>'+conferenceSummary+'</small></div><span class="division-count">'+group.clubs.length+' CLUBS</span></div><div class="club-grid">'+cards+'</div></section>';
    }).join('');
    document.querySelectorAll('.club-division').forEach(node=>node.remove());
    const toolbar=document.querySelector('.club-discovery-toolbar');
    if(toolbar) toolbar.insertAdjacentHTML('afterend',html);
    if(status) status.textContent='Catalogue serveur synchronisé · divisions et conférences de la saison active.';
    const counter=document.getElementById('club-filter-count');
    if(counter) counter.textContent='156 clubs';
  } catch(error) {
    if(requestId!==publicClubDirectoryRequest) return;
    const note=document.getElementById('club-directory-status');
    if(note) note.textContent='Serveur indisponible : catalogue local de secours affiché. Les affectations peuvent ne pas refléter la saison active.';
  }
}


let publicCompetitionRequest = 0;
async function loadServerCompetitionOverview() {
  const requestId=++publicCompetitionRequest;
  const host=document.getElementById('menu-content');
  if(!host || !host.querySelector('.competition-layout')) return;
  try {
    const response=await fetch('/api/competitions',{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error('COMPETITIONS_HTTP_'+response.status);
    const snapshot=await response.json();
    if(requestId!==publicCompetitionRequest || !document.getElementById('menu-content')?.querySelector('.competition-layout')) return;
    const leagues=(snapshot.competitions||[]).filter(item=>item.type==='league');
    if(leagues.length!==9 || !snapshot.scheduleAudit?.ok || snapshot.scheduleAudit.fixtureCount!==1892) throw new Error('COMPETITION_SNAPSHOT_INCOMPLETE');
    const order={D1:1,D2:2,D3:3,D4:4,D5:5};
    const conferenceOrder={A:1,B:2,C:3,D:4};
    leagues.sort((a,b)=>order[a.division]-order[b.division]||(conferenceOrder[a.conference]||0)-(conferenceOrder[b.conference]||0));
    const groups=leagues.map(competition=>{
      const members=new Map((competition.members||[]).map(member=>[member.id,member.name]));
      const rows=(competition.standings||[]).map((row,index)=>'<tr><td>'+ (index+1) +'</td><td>'+escapeHTML(row.name||members.get(row.id)||row.id)+'</td><td>'+Number(row.played||0)+'</td><td>'+Number(row.wins||0)+'</td><td>'+Number(row.draws||0)+'</td><td>'+Number(row.losses||0)+'</td><td>'+Number(row.goalsFor||0)+'</td><td>'+Number(row.goalsAgainst||0)+'</td><td><b>'+Number(row.points||0)+'</b></td></tr>').join('');
      const recent=(competition.fixtures||[]).filter(item=>item.status==='completed').sort((a,b)=>b.round-a.round).slice(0,3);
      const next=(competition.fixtures||[]).filter(item=>item.status==='scheduled'&&item.homeClubId&&item.awayClubId).sort((a,b)=>a.round-b.round).slice(0,3);
      const fixtures=recent.map(item=>'<div class="fixture-row"><span>'+escapeHTML(members.get(item.homeClubId)||item.homeClubId)+'</span><b>'+Number(item.result?.home||0)+' – '+Number(item.result?.away||0)+'</b><span>'+escapeHTML(members.get(item.awayClubId)||item.awayClubId)+'</span><small>J'+item.round+' · TERMINÉ</small></div>').join('')+
        next.map(item=>'<div class="fixture-row"><span>'+escapeHTML(members.get(item.homeClubId)||item.homeClubId)+'</span><b>VS</b><span>'+escapeHTML(members.get(item.awayClubId)||item.awayClubId)+'</span><small>J'+item.round+' · À JOUER</small></div>').join('');
      const groupName=competition.conference?'CONFÉRENCE '+competition.conference:'CHAMPIONNAT NATIONAL';
      const formatLabel=competition.matchFormat==='home-away'?'ALLER-RETOUR':'ALLER SIMPLE';
      return '<section class="division-table-block"><div class="division-table-title"><b>'+competition.division+'</b><span>'+escapeHTML(competition.name)+' · '+groupName+' · '+formatLabel+'</span><small>'+competition.members.length+' clubs · '+competition.fixtures.length+' matchs</small></div><div class="table-scroll"><table class="standings-table"><thead><tr><th>#</th><th>CLUB</th><th>J</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>PTS</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="server-fixture-preview">'+(fixtures||'<p class="notice">Aucun résultat officiel ni rencontre jouée pour ce groupe.</p>')+'</div></section>';
    }).join('');
    const cup=(snapshot.competitions||[]).find(item=>item.type==='cup');
    const cupAudit=snapshot.cupAudit;
    const cupAuditStatus=cupAudit?.ok?'<p class="notice cup-audit-ok">TABLEAU CONTRÔLÉ · '+Number(cupAudit.completedFixtures||0)+' / 155 rencontres terminées</p>':'<p class="notice cup-audit-warning">ANOMALIE DU TABLEAU · '+escapeHTML(cupAudit?.reason||'contrôle indisponible')+'</p>';
    const cupChampion=cup?.status==='completed'&&cup?.championClubId?'<p class="notice">Vainqueur : '+escapeHTML(cup.members?.find(item=>item.id===cup.championClubId)?.name||cup.championClubId)+'</p>':'';
    const clubNames=new Map((snapshot.competitions||[]).flatMap(item=>(item.members||[]).map(member=>[member.id,member.name])));
    const playoffCompetitions=(snapshot.competitions||[]).filter(item=>item.type==='promotion-playoff');
    const playoffPanels=playoffCompetitions.map(playoff=>{
      const matches=playoff.fixtures.map(fixture=>{
        const home=clubNames.get(fixture.homeClubId)||'À déterminer';
        const away=clubNames.get(fixture.awayClubId)||'À déterminer';
        const score=fixture.result?Number(fixture.result.home)+' – '+Number(fixture.result.away):'VS';
        const status=fixture.status==='completed'?'TERMINÉ':fixture.status==='replay-required'?'REJOUER':fixture.status==='waiting'?'EN ATTENTE':'À JOUER';
        return '<div class="fixture-row"><span>'+escapeHTML(home)+'</span><b>'+score+'</b><span>'+escapeHTML(away)+'</span><small>'+escapeHTML(fixture.stage||'Match')+' · '+status+'</small></div>';
      }).join('');
      return '<section class="division-table-block promotion-playoff-block"><div class="division-table-title"><b>'+escapeHTML(playoff.division)+'</b><span>'+escapeHTML(playoff.name)+'</span><small>'+(playoff.status==='completed'?'Barrages terminés':'Barrages en cours')+'</small></div><div class="server-fixture-preview">'+matches+'</div>'+(playoff.championClubId?'<p class="notice">Qualifié : '+escapeHTML(clubNames.get(playoff.championClubId)||playoff.championClubId)+'</p>':'')+'</section>';
    }).join('');
    const movement=snapshot.movementPreview?.ok?'<section class="competition-panel movement-preview"><div class="panel-heading"><div><span class="eyebrow">FIN DE SAISON · BARÈME APPROUVÉ</span><h2>Mouvements de division</h2></div><span class="local-tag">20 MONTÉES · 20 DESCENTES</span></div><p>'+Number(snapshot.movementPreview.promotions)+' promotions · '+Number(snapshot.movementPreview.relegations)+' relégations. Les promotions issues des barrages sont attribuées aux vainqueurs des finales.</p><div class="movement-list">'+snapshot.movementPreview.movements.map(item=>'<div class="fixture-row"><span>'+escapeHTML(item.clubName||clubNames.get(item.clubId)||item.clubId)+'</span><b>'+(item.type==='promotion'?'↑':'↓')+'</b><span>'+item.fromDivision+(item.fromConference?' · '+item.fromConference:'')+' → '+item.toDivision+(item.toConference?' · '+item.toConference:'')+'</span><small>'+escapeHTML(item.qualificationStage==='playoff'?'BARRAGE GAGNÉ':'CLASSEMENT DIRECT')+' · '+Number(item.finalPosition)+'e</small></div>').join('')+'</div></section>':'<p class="notice">Les mouvements seront calculés après la fin des neuf championnats et la résolution des huit tableaux de barrages.</p>';
    host.innerHTML='<div class="competition-layout"><section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">SAISON SERVEUR · '+escapeHTML(snapshot.season?.id||'')+'</span><h2>Classements officiels</h2></div><span class="local-tag">SYNCHRONISÉ</span></div><div class="server-season-overview"><div><b>156</b><span>CLUBS</span></div><div><b>9</b><span>GROUPES</span></div><div><b>'+Number(snapshot.scheduleAudit.fixtureCount)+'</b><span>RENCONTRES</span></div></div>'+groups+'</section><aside class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">COUPE NATIONALE</span><h2>Coupe des Clubs</h2></div></div><div class="server-season-overview"><div><b>'+Number(cup?.members?.length||0)+'</b><span>PARTICIPANTS</span></div><div><b>'+Number(cup?.fixtures?.length||0)+'</b><span>RENCONTRES DU TABLEAU</span></div></div>'+cupAuditStatus+'<p class="notice">Le tableau progresse uniquement après validation des résultats des matchs.</p>'+cupChampion+'<div class="promotion-playoff-list"><div class="panel-heading"><div><span class="eyebrow">MONTÉES EN DIVISION SUPÉRIEURE</span><h2>BARRAGES DE PROMOTION</h2></div></div>'+ (playoffPanels||'<p class="notice">Les barrages seront créés après la clôture des classements concernés.</p>')+'</div>'+movement+'</aside></div><p class="notice">Classements, calendriers, barrages et résultats chargés depuis le serveur de compétition. Les statistiques ne sont modifiées que par des résultats validés.</p>';
  } catch(error) {
    if(requestId!==publicCompetitionRequest) return;
    const note=host.querySelector('.notice');
    if(note) note.textContent='Serveur de compétition indisponible : le calendrier local de secours reste affiché. Les classements officiels ne sont pas synchronisés.';
  }
}

function renderPage(page = 'home') {
  syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile });
  if (page !== 'results') resultsRequestSequence++;
  disposeAvatarPreview();
  const content = document.getElementById('menu-content');
  const title = document.getElementById('menu-page-title');
  const subtitle = document.getElementById('menu-page-subtitle');
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  if (page === 'onboarding') {
    title.textContent = 'Créer votre footballeur';
    subtitle.textContent = 'Votre aventure commence par votre identité Football RP.';
    content.innerHTML = `<section class="competition-panel onboarding-panel">
      <span class="eyebrow">PREMIÈRE ÉTAPE · PROFIL JOUEUR</span>
      <h2>Bienvenue dans Football RP Online</h2>
      <p>Créez votre footballeur pour recevoir automatiquement votre identifiant joueur au format FRP-000000 et commencer votre carrière.</p>
      <form id="player-onboarding-form" class="career-form">
        <label>Nom de votre footballeur<input name="displayName" maxlength="20" autocomplete="nickname" value="${escapeHTML(profileStore.profile.identity.displayName === 'Nouveau joueur' ? '' : profileStore.profile.identity.displayName)}" placeholder="Votre nom de joueur" required></label>
        <button class="primary-cta" type="submit">CRÉER MON JOUEUR</button>
        <p class="notice onboarding-status" role="status" aria-live="polite"></p>
      </form>
      <p class="notice">Aucun e-mail, mot de passe ou compte Google n'est nécessaire. Google restera facultatif et pourra être associé plus tard pour protéger votre carrière.</p>
    </section>`;
  } else if (page === 'home') {
    const profile = profileStore.profile;
    const season = seasonStats.snapshot().totals;
    const latestMatch = seasonStats.snapshot().matches.slice(-1)[0];
    const careerClub = career.clubId ? clubs.getClub(career.clubId) : null;
    const contractStatus = career.getContractStatus?.();
    const contractLabel = contractStatus?.active ? `Contrat actif · ${contractStatus.daysRemaining} j` : 'Agent libre';
    const clubLabel = careerClub?.name || 'Sans club';
    title.textContent = 'Tableau de bord';
    subtitle.textContent = `Bienvenue, ${profile.identity.displayName}. Votre carrière se construit ici.`;
    content.innerHTML = `
      <div class="home-dashboard">
        <section class="home-feature">
          <div class="feature-copy">
            <span class="eyebrow">FOOTBALL RP ONLINE · SAISON PERSONNELLE</span>
            <h2>Écrivez votre<br>histoire.</h2>
            <p>Entrez sur le terrain, imposez votre style et faites progresser votre footballeur match après match.</p>
            <div class="home-primary-actions">
              <button class="primary-cta" data-action="choose-match">JOUER UN MATCH <span>→</span></button>
              <button class="secondary-cta" data-action="online-menu">MODE EN LIGNE</button>
            </div>
          </div>
          <div class="feature-ball" aria-hidden="true">⚽</div>
          <div class="feature-foot">5 CONTRE 5 · CONTRÔLE INDIVIDUEL · ÉQUIPE DU SYSTÈME</div>
        </section>
        <aside class="home-side-panel">
          <div class="home-player-heading">
            <span class="user-avatar">${escapeHTML(profile.identity.number)}</span>
            <div><small>VOTRE FOOTBALLEUR</small><b>${escapeHTML(profile.identity.displayName)}</b><span>NIVEAU ${profile.progression.level} · ${escapeHTML(profile.identity.role)}</span></div>
          </div>
          <div class="home-career-row"><span>CLUB</span><b>${escapeHTML(clubLabel)}</b></div>
          <div class="home-career-row"><span>CONTRAT</span><b>${escapeHTML(contractLabel)}</b></div>
          <div class="home-stat-grid">
            <div><b>${season.matches}</b><span>MATCHS</span></div>
            <div><b>${season.goals}</b><span>BUTS</span></div>
            <div><b>${season.shots}</b><span>TIRS</span></div>
            <div><b>${season.tackles + season.interceptions}</b><span>RÉCUPÉRATIONS</span></div>
          </div>
          <div class="home-last-match">
            <span class="eyebrow">DERNIÈRE PERFORMANCE</span>
            ${latestMatch ? `<b>${latestMatch.rating.toFixed(1)} <small>/ 10</small></b><span>${latestMatch.result === 'win' ? 'Victoire' : latestMatch.result === 'draw' ? 'Match nul' : 'Défaite'} · ${latestMatch.goals} but(s)</span>` : '<b class="home-no-match">Aucun match joué</b><span>Votre première performance apparaîtra ici.</span>'}
          </div>
        </aside>
        <nav class="quick-grid home-shortcuts" aria-label="Accès rapides">
          <button class="quick-card" data-page="player"><span>01</span><b>Mon joueur</b><small>Profil et progression</small></button>
          <button class="quick-card" data-page="clubs"><span>02</span><b>Clubs & effectifs</b><small>Équipes et joueurs</small></button>
          <button class="quick-card" data-page="players"><span>03</span><b>Bibliothèque joueurs</b><small>Recherche et comparaison</small></button>
          <button class="quick-card" data-page="competitions"><span>03</span><b>Compétitions</b><small>Calendrier et saison</small></button>
          <button class="quick-card" data-page="mercato"><span>04</span><b>Carrière & mercato</b><small>Contrats et transferts</small></button>
        </nav>
      </div>`;
  } else if (page === 'player') {
    const p = profileStore.profile;
    const a = p.progression.attributes;
    const seasonSnapshot = seasonStats.snapshot();
    const season = seasonSnapshot.totals;
    const recent = seasonSnapshot.matches.slice(-8).reverse();
    title.textContent = 'Mon footballeur'; subtitle.textContent = 'Identité, apparence et progression personnelle.';
    content.innerHTML = `<div class="profile-layout"><div class="player-card"><div id="avatar-preview" class="avatar-preview-stage" role="img" aria-label="Aperçu 3D de votre footballeur personnalisé"><span>${escapeHTML(p.identity.number)}</span></div><span class="eyebrow">JOUEUR · NIVEAU ${p.progression.level}</span><h2>${escapeHTML(p.identity.displayName)}</h2><p>${escapeHTML(p.identity.role)} · Pied ${p.identity.preferredFoot === 'left' ? 'gauche' : 'droit'}</p><div class="profile-meta"><span>${p.progression.coins} <small>CRÉDITS</small></span><span>${p.progression.trainingPoints} <small>POINTS D'ENTRAÎNEMENT</small></span></div></div><div class="attribute-list">${Object.entries(a).map(([key,val])=>`<div><span>${({pace:'Vitesse',shooting:'Finition',passing:'Passe',defense:'Défense',stamina:'Endurance',control:'Contrôle'})[key]}</span><b>${val}</b><i><em style="width:${val}%"></em></i></div>`).join('')}</div></div>
${renderGoogleProtectionCard({ compact: true })}
      <section class="competition-panel player-stats-panel"><div class="panel-heading"><div><span class="eyebrow">SAISON EN COURS · SAUVEGARDÉE SUR CET APPAREIL</span><h2>Statistiques personnelles</h2></div></div><div class="quick-grid"><div class="quick-card"><b>${season.matches}</b><small>Matchs</small></div><div class="quick-card"><b>${Math.floor(season.minutesPlayedMs/60000)}</b><small>Minutes</small></div><div class="quick-card"><b>${season.goals}</b><small>Buts</small></div><div class="quick-card"><b>${season.assists}</b><small>Passes décisives</small></div><div class="quick-card"><b>${season.passes ? Math.round(season.completedPasses/season.passes*100) : 0}%</b><small>Précision passes</small></div><div class="quick-card"><b>${season.playerOfMatch}</b><small>Homme du match</small></div><div class="quick-card"><b>${season.tackles}</b><small>Tacles</small></div><div class="quick-card"><b>${season.interceptions}</b><small>Interceptions</small></div></div><div class="career-form"><div class="panel-heading"><div><span class="eyebrow">DYNAMIQUE RÉCENTE</span><h3>Forme · 5 derniers matchs</h3></div><b>${seasonSnapshot.averageRating === null ? '—' : seasonSnapshot.averageRating.toFixed(1)+'/10'} <small>MOYENNE</small></b></div><div class="form-strip">${seasonSnapshot.currentForm.length ? seasonSnapshot.currentForm.map(m=>`<span class="form-chip ${m.result}" title="${new Date(m.date).toLocaleDateString('fr-FR')} · ${m.rating.toFixed(1)}/10">${m.result==='win'?'V':m.result==='draw'?'N':'D'}<small>${m.rating.toFixed(1)}</small></span>`).join('') : '<span class="notice">La forme apparaîtra après vos premiers matchs.</span>'}</div></div>${recent.length ? `<div class="history-list">${recent.map(m=>`<div><b>${m.rating.toFixed(1)} / 10 ${m.playerOfMatch?'★':''}</b><span>${m.result==='win'?'Victoire':m.result==='draw'?'Nul':'Défaite'} · ${m.goals} but(s) · ${m.assists} passe(s) décisive(s)${m.opponent?' · '+escapeHTML(m.opponent):''}</span><small>${Math.floor(m.minutesPlayedMs/60000)} min · ${new Date(m.date).toLocaleDateString('fr-FR')}</small></div>`).join('')}</div>` : '<p class="notice">Aucun match enregistré pour le moment.</p>'}<p class="notice">Historique et statistiques enregistrés sur cet appareil. Les notes en ligne proviennent du rapport autoritaire du serveur.</p></section>
      <form class="profile-editor" id="profile-editor"><h3>Personnaliser mon joueur</h3><div class="editor-grid"><label>Nom affiché<input name="displayName" maxlength="20" value="${escapeHTML(p.identity.displayName)}" required></label><label>Numéro<input name="number" type="number" min="1" max="99" value="${p.identity.number}" required></label><label>Poste<select name="role"><option value="GK" ${p.identity.role==='GK'?'selected':''}>Gardien</option><option value="DEF" ${p.identity.role==='DEF'?'selected':''}>Défenseur</option><option value="MID" ${p.identity.role==='MID'?'selected':''}>Milieu</option><option value="FWD" ${p.identity.role==='FWD'?'selected':''}>Attaquant</option></select></label><label>Pied préféré<select name="preferredFoot"><option value="right" ${p.identity.preferredFoot==='right'?'selected':''}>Droit</option><option value="left" ${p.identity.preferredFoot==='left'?'selected':''}>Gauche</option></select></label><label>Couleur du maillot<select name="kit">${Object.entries({emerald:'Vert émeraude',crimson:'Rouge',gold:'Or',violet:'Violet',monochrome:'Noir et blanc'}).map(([v,l])=>`<option value="${v}" ${p.appearance.kit===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Teint<select name="skinTone"><option value="light" ${p.appearance.skinTone==='light'?'selected':''}>Clair</option><option value="medium" ${p.appearance.skinTone==='medium'?'selected':''}>Moyen</option><option value="dark" ${p.appearance.skinTone==='dark'?'selected':''}>Foncé</option></select></label><label>Coiffure<select name="hairStyle"><option value="short" ${p.appearance.hairStyle==='short'?'selected':''}>Courte</option><option value="curly" ${p.appearance.hairStyle==='curly'?'selected':''}>Bouclée</option><option value="afro" ${p.appearance.hairStyle==='afro'?'selected':''}>Afro</option><option value="fade" ${p.appearance.hairStyle==='fade'?'selected':''}>Dégradé</option><option value="shaved" ${p.appearance.hairStyle==='shaved'?'selected':''}>Rasée</option></select></label><label>Morphologie<select name="bodyBuild"><option value="lean" ${p.appearance.bodyBuild==='lean'?'selected':''}>Fine</option><option value="athletic" ${p.appearance.bodyBuild==='athletic'?'selected':''}>Athlétique</option><option value="strong" ${p.appearance.bodyBuild==='strong'?'selected':''}>Puissante</option></select></label><label>Couleur des cheveux<select name="hairColor"><option value="dark" ${p.appearance.hairColor==='dark'?'selected':''}>Noir</option><option value="brown" ${p.appearance.hairColor==='brown'?'selected':''}>Brun</option><option value="blond" ${p.appearance.hairColor==='blond'?'selected':''}>Blond</option></select></label></div><button class="primary-cta" type="submit">ENREGISTRER MON JOUEUR</button><p class="notice" id="profile-save-status">Personnalisation enregistrée localement sur cet appareil.</p></form>
      <section class="profile-editor training-panel"><h3>Centre d’entraînement</h3><p>Choisis comment financer ta progression : séance individuelle avec crédits et expérience, ou entraînement encadré avec les points gagnés à chaque niveau.</p><div class="training-controls"><label>Capacité<select id="practice-attribute"><option value="pace">Vitesse</option><option value="shooting">Finition</option><option value="passing">Passe</option><option value="defense">Défense</option><option value="stamina">Endurance</option><option value="control">Contrôle</option></select></label><label>Programme<select id="training-method"><option value="practice">Séance individuelle · 80 crédits / point + XP</option><option value="train">Entraînement encadré · 1 point d’entraînement + 40 crédits / point</option></select></label><label>Intensité<select id="practice-amount"><option value="1">Légère · 1 point</option><option value="2">Moyenne · 2 points</option><option value="3">Intense · 3 points</option></select></label><button class="small-action" data-action="practice-player">EFFECTUER LA SÉANCE</button></div><p class="notice">Crédits : ${p.progression.coins} · Points d’entraînement : ${p.progression.trainingPoints} · Attributs plafonnés à 99.</p></section>`;
    mountAvatarPreview(p);
  } else if (page === 'players') {
    const rosterPlayers=clubs.listClubs().flatMap(club=>club.roster.map(player=>({...player,clubId:club.id,clubName:club.name,clubDivision:club.division})));
    playerLibraryProfiles = rosterPlayers.map(player => ({...player,careerPlayerId:`club-${player.clubId}-${player.id}`}));
    const roleNames={GK:'Gardien',DEF:'Défenseur',MID:'Milieu',FWD:'Attaquant'};
    const average=rosterPlayers.length?Math.round(rosterPlayers.reduce((sum,p)=>sum+p.rating,0)/rosterPlayers.length):0;
    playerLibraryLimit=24;
    title.textContent='Bibliothèque des joueurs';
    subtitle.textContent='Explorez les joueurs des effectifs connus, comparez leurs notes et leurs potentiels.';
    content.innerHTML=`<div class="player-library">
      <div class="player-library-overview"><div><b>${rosterPlayers.length}</b><span>JOUEURS RÉPERTORIÉS</span></div><div><b>${clubs.listClubs().length}</b><span>CLUBS COUVERTS</span></div><div><b>${average}</b><span>NOTE MOYENNE</span></div><div><b>${rosterPlayers.filter(p=>p.nationality==='MG').length}</b><span>JOUEURS MALGACHES</span></div></div>
      <div class="player-library-toolbar">
        <label><span>RECHERCHE</span><input id="library-search" type="search" placeholder="Nom, archétype…" autocomplete="off"></label>
        <label><span>CLUB</span><select id="library-club"><option value="all">Tous les clubs</option>${clubs.listClubs().map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('')}</select></label>
        <label><span>POSTE</span><select id="library-role"><option value="all">Tous les postes</option><option value="GK">Gardiens</option><option value="DEF">Défenseurs</option><option value="MID">Milieux</option><option value="FWD">Attaquants</option></select></label>
        <label><span>TRI</span><select id="library-sort"><option value="rating">Note générale</option><option value="potential">Potentiel</option><option value="age">Âge</option><option value="name">Nom A–Z</option></select></label>
        <label><span>NOTE MIN.</span><select id="library-min-rating"><option value="0">Toutes</option><option value="60">60+</option><option value="70">70+</option><option value="80">80+</option></select></label>
      </div>
      <div class="player-library-resultline"><span id="library-count">${rosterPlayers.length} joueurs</span><span>DONNÉES ISSUES DES EFFECTIFS LOCAUX</span></div>
      <div class="player-library-grid" id="player-library-grid">${rosterPlayers.map((player,index)=>`<article class="player-library-card" role="button" tabindex="0" aria-label="Ouvrir le profil de ${escapeHTML(player.name)}" data-player-profile="${index}" data-library-card data-name="${escapeHTML(player.name.toLocaleLowerCase('fr'))}" data-archetype="${escapeHTML(player.archetype.toLocaleLowerCase('fr'))}" data-club="${escapeHTML(player.clubId)}" data-role="${player.role}" data-rating="${player.rating}" data-potential="${player.potential}" data-age="${player.age}" data-index="${index}">
        <div class="player-card-top"><span class="player-card-number">#${player.number}</span><span class="player-card-role">${roleNames[player.role]||player.role}</span><b class="player-card-rating">${player.rating}</b></div>
        <div class="player-card-identity"><span class="player-card-monogram">${escapeHTML(player.name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</span><div><h3>${escapeHTML(player.name)}</h3><p>${escapeHTML(player.clubName)}</p></div></div>
        <div class="player-card-meta"><span>${escapeHTML(player.nationality)}</span><span>${player.age} ans</span><span>Pot. ${player.potential}</span></div>
        <div class="player-card-attributes">${[['pace','VIT'],['shooting','TIR'],['passing','PAS'],['defense','DEF'],['stamina','END'],['control','CTR']].map(([key,label])=>`<span><small>${label}</small><b>${player.attributes?.[key]??player.rating}</b></span>`).join('')}</div>
        <details class="player-card-details"><summary>Profil & archétype</summary><div><b>${escapeHTML(player.archetype)}</b><span>Pied préféré : ${player.preferredFoot==='left'?'Gauche':'Droit'}</span><span>Potentiel : ${player.potential}/99</span><span>Division : ${escapeHTML(player.clubDivision)}</span></div></details>
      </article>`).join('')}</div>
      <div class="player-library-footer"><span id="library-visible-count">0 affiché</span><button class="small-action" data-action="players-load-more" id="library-load-more">CHARGER PLUS DE JOUEURS</button></div>
      <p class="notice">Cette bibliothèque recense les joueurs actuellement présents dans les effectifs locaux connus. Les joueurs libres, les transferts et les prêts ne sont pas inventés : ils seront intégrés quand leurs statuts seront reliés à une source de données fiable.</p>
    </div>`;
    filterPlayerLibrary();
  } else if (page === 'player-detail') {
    const player = selectedPlayerProfile;
    if (!player) { renderPage('players'); return; }
    const roleNames = { GK:'Gardien', DEF:'Défenseur', MID:'Milieu', FWD:'Attaquant' };
    const attributeNames = { pace:'Vitesse', shooting:'Finition', passing:'Passe', defense:'Défense', stamina:'Endurance', control:'Contrôle' };
    const nationalityNames = { MG:'Madagascar', FR:'France', SN:'Sénégal', BR:'Brésil', ES:'Espagne', AR:'Argentine', PT:'Portugal', JP:'Japon', NG:'Nigeria', IT:'Italie', GB:'Angleterre', KE:'Kenya' };
    title.textContent = player.name;
    subtitle.textContent = 'Fiche joueur · identité, club actuel et parcours vérifié.';
    const initials = player.name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
    content.innerHTML = `<button class="text-cta" data-action="back-player-library">← RETOUR À LA BIBLIOTHÈQUE</button>
      <section class="player-career-hero">
        <div class="player-career-avatar"><span>#${player.number}</span><b>${escapeHTML(initials)}</b></div>
        <div class="player-career-identity"><span class="eyebrow">${escapeHTML(player.clubDivision)} · ${escapeHTML(roleNames[player.role]||player.role)}</span><h2>${escapeHTML(player.name)}</h2><p>${escapeHTML(player.clubName)} · ${escapeHTML(nationalityNames[player.nationality]||player.nationality)} · ${player.age} ans</p><div class="player-career-tags"><span>NOTE ${player.rating}</span><span>POTENTIEL ${player.potential}</span><span>PIED ${player.preferredFoot==='left'?'GAUCHE':'DROIT'}</span></div></div>
      </section>
      <div class="player-career-columns">
        <section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">IDENTITÉ SPORTIVE</span><h2>Profil technique</h2></div></div><div class="player-career-attributes">${Object.entries(attributeNames).map(([key,label])=>{const value=Number(player.attributes?.[key]??player.rating);return `<div><span>${label}</span><b>${value}</b><i><em style="width:${Math.max(0,Math.min(99,value))}%"></em></i></div>`;}).join('')}</div><p class="notice">${escapeHTML(player.archetype)} · Les attributs décrivent le joueur dans l'effectif actuel.</p></section>
        <section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">PARCOURS EN CLUB</span><h2>Historique des clubs</h2></div></div><div class="player-career-timeline" id="player-career-club-history"><div class="player-career-timeline-item"><i></i><div><b>${escapeHTML(player.clubName)}</b><span>Club actuel · ${escapeHTML(player.clubDivision)}</span><small>Présence dans l'effectif local</small></div><strong>ACTUEL</strong></div></div><p class="notice">Les anciens clubs et dates de transfert apparaîtront lorsqu'ils seront enregistrés par le système de mercato.</p></section>
      </div>
      <div class="player-career-columns">
        <section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">STATISTIQUES OFFICIELLES</span><h2>Matchs · buts · passes</h2></div></div><div class="player-career-empty" id="player-career-stats"><b>Chargement du parcours sportif…</b><p>Recherche des matchs validés sur le serveur.</p></div></section>
        <section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">PALMARÈS</span><h2>Coupes & trophées</h2></div></div><div class="player-career-empty"><b>Palmarès à construire</b><p>Aucun titre n'est attribué automatiquement. Les coupes et distinctions apparaîtront après les compétitions réellement disputées et leurs résultats validés.</p></div></section>
      </div>`;
    loadPlayerCareer(player);
  } else if (page === 'clubs') {
    const divisionLabels = { D1: 'D1 · PREMIER LEAGUE', D2: 'D2 · LIGUE 2', D3: 'D3 · NATIONAL LEAGUE', D4: 'D4 · CHALLENGER LEAGUE', D5: 'D5 · REGIONAL LEAGUE', AMATEUR: 'AMATEUR' };
    const nationalityNames = { MG:'Madagascar', FR:'France', SN:'Sénégal', BR:'Brésil', ES:'Espagne', AR:'Argentine', PT:'Portugal', JP:'Japon', NG:'Nigeria', IT:'Italie', GB:'Angleterre', KE:'Kenya' };
    const roleNames = { GK:'Gardien', DEF:'Défenseur', MID:'Milieu', FWD:'Attaquant' };
    const allClubs = clubs.listClubs();
    const localSelectedClub = selectedClubId ? clubs.getClub(selectedClubId) : null;
    const selectedClub = selectedClubId ? { ...(localSelectedClub || {}), ...(publicClubDirectoryCache.get(selectedClubId) || {}) } : null;
    title.textContent = selectedClub ? selectedClub.name : 'Clubs & championnats';
    subtitle.textContent = selectedClub ? `${selectedClub.city} · ${selectedClub.country} · ${divisionLabels[selectedClub.division]}${selectedClub.conference ? ' · CONFÉRENCE '+selectedClub.conference : ''}` : 'Clubs fictifs internationaux et malgaches · effectifs des joueurs du système.';
    if (selectedClub) {
      const roster = (selectedClub.roster || []).slice().sort((a,b) => ({GK:0,DEF:1,MID:2,FWD:3}[a.role]-({GK:0,DEF:1,MID:2,FWD:3}[b.role]) || b.rating-a.rating));
      playerLibraryProfiles = roster.map(player => ({...player,clubId:selectedClub.id,clubName:selectedClub.name,clubDivision:selectedClub.division,careerPlayerId:`club-${selectedClub.id}-${player.id}`}));
      const average = roster.length ? Math.round(roster.reduce((sum,p)=>sum+p.rating,0)/roster.length) : 0;
      content.innerHTML = `<button class="text-cta" data-action="back-clubs">← RETOUR AUX CLUBS</button><section class="club-detail-hero">${crest(selectedClub)}<div><span class="eyebrow">${divisionLabels[selectedClub.division]}</span><h2>${escapeHTML(selectedClub.name)}</h2><p>${escapeHTML(selectedClub.city)} · ${escapeHTML(selectedClub.country)}</p><div class="club-detail-stats"><span><b>${selectedClub.rating}</b><small>NOTE CLUB</small></span><span><b>${roster.length}</b><small>JOUEURS</small></span><span><b>${average}</b><small>MOYENNE EFFECTIF</small></span><span><b>${selectedClub.reputation}</b><small>RÉPUTATION</small></span></div></div></section><section class="competition-panel roster-panel"><div class="panel-heading"><div><span class="eyebrow">EFFECTIF COMPLET</span><h2>Effectif · ${roster.length} joueurs</h2></div><span class="club-control-indicator ${selectedClub.control==='player'||selectedClub.managementType==='human'?'human':'system'}"><i></i>${selectedClub.control==='player'||selectedClub.managementType==='human'?'CLUB DIRIGÉ PAR UN JOUEUR':'CLUB DIRIGÉ PAR LE SYSTÈME'}</span></div><div class="roster-filters"><label>Rechercher un joueur<input id="roster-search" type="search" placeholder="Nom du joueur…" autocomplete="off"></label><label>Filtrer par poste<select id="roster-role"><option value="all">Tous les postes</option><option value="GK">Gardiens</option><option value="DEF">Défenseurs</option><option value="MID">Milieux</option><option value="FWD">Attaquants</option></select></label></div><div class="roster-table-wrap"><table class="roster-table"><thead><tr><th>#</th><th>JOUEUR</th><th>NATIONALITÉ</th><th>ÂGE</th><th>POSTE</th><th>NOTE</th><th>POTENTIEL</th><th>VIT.</th><th>TIR</th><th>PAS.</th><th>DÉF.</th><th>END.</th><th>CTR.</th></tr></thead><tbody id="club-roster-rows">${roster.map((player,index)=>`<tr role="button" tabindex="0" aria-label="Ouvrir le profil de ${escapeHTML(player.name)}" data-player-profile="${index}" data-profile-origin="clubs" data-player-row data-name="${escapeHTML(player.name.toLowerCase())}" data-role="${player.role}"><td>${player.number}</td><td><b>${escapeHTML(player.name)}</b><small>${escapeHTML(player.archetype)}</small></td><td><span class="nationality-cell">${escapeHTML(nationalityNames[player.nationality]||player.nationality)}</span></td><td>${player.age}</td><td>${roleNames[player.role]||player.role}</td><td><b class="player-rating">${player.rating}</b></td><td>${player.potential}</td><td>${player.attributes?.pace ?? player.rating}</td><td>${player.attributes?.shooting ?? player.rating}</td><td>${player.attributes?.passing ?? player.rating}</td><td>${player.attributes?.defense ?? player.rating}</td><td>${player.attributes?.stamina ?? player.rating}</td><td>${player.attributes?.control ?? player.rating}</td></tr>`).join('')}</tbody></table><p class="roster-empty hidden" id="roster-empty">Aucun joueur ne correspond à ces filtres.</p></div></section>${selectedClub.control==='open'?`<button class="primary-cta" data-action="take-club" data-club="${escapeHTML(selectedClub.id)}">REPRENDRE CE CLUB</button>`:''}<p class="notice">Les profils et identités sont fictifs. Les notes et potentiels sont des valeurs de jeu, pas des évaluations de personnes réelles.</p>`;
    } else {
      content.innerHTML = `<div class="club-overview"><div><b>${allClubs.length}</b><span>CLUBS FONDATEURS</span></div><div><b>${allClubs.filter(c=>c.country.split('·').some(country=>country.trim()==='Madagascar')).length}</b><span>CLUBS AVEC ANCRAGE MALGACHE</span></div><div><b>${allClubs.reduce((n,c)=>n+c.roster.length,0)}</b><span>JOUEURS DU SYSTÈME</span></div></div><div class="club-discovery-toolbar">
        <label class="club-search-field"><span>RECHERCHER UN CLUB</span><input id="club-search" type="search" placeholder="Nom, ville ou stade…" autocomplete="off"></label>
        <label><span>DIVISION</span><select id="club-division-filter"><option value="all">Toutes les divisions</option>${clubs.listDivisions().map(d=>`<option value="${escapeHTML(d.id)}">${escapeHTML(d.name)}</option>`).join('')}</select></label>
        <label><span>CONFÉRENCE</span><select id="club-conference-filter"><option value="all">Toutes les conférences</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
        <label><span>IDENTITÉ</span><select id="club-country-filter"><option value="all">Tous les pays</option>${[...new Set(allClubs.map(c=>c.country))].sort().map(country=>`<option value="${escapeHTML(country)}">${escapeHTML(country)}</option>`).join('')}</select></label>
        <label><span>TRI</span><select id="club-sort"><option value="rating">Niveau du club</option><option value="name">Nom A–Z</option><option value="roster">Taille de l’effectif</option><option value="reputation">Réputation</option></select></label>
        <span id="club-filter-count" class="club-filter-count">${allClubs.length} clubs</span>
      </div>${clubs.listDivisions().map(division=>`<section class="club-division" data-division="${escapeHTML(division.id)}"><div class="club-division-heading"><div><span class="eyebrow">${divisionLabels[division.id]}</span><h2>${escapeHTML(division.name)}</h2></div><span class="division-count">${division.clubs.length} CLUBS</span></div><div class="club-grid">${division.clubs.map(club=>`<article class="club-card" data-club-card data-name="${escapeHTML(club.name.toLocaleLowerCase('fr'))}" data-location="${escapeHTML(`${club.city} ${club.country} ${club.stadium}`.toLocaleLowerCase('fr'))}" data-country="${escapeHTML(club.country)}" data-division="${escapeHTML(club.division)}" data-rating="${club.rating}" data-roster="${club.roster.length}" data-reputation="${club.reputation}">${crest(club)}<div class="club-card-copy"><h3>${escapeHTML(club.name)}</h3><p>${escapeHTML(club.city)} · ${escapeHTML(club.country)}</p><div class="club-meta-line"><span>Niveau ${club.rating}</span><span>${club.roster.length} joueurs</span><span>${club.reputation} réputation</span></div><small>${club.control === 'open' ? 'OUVERT À LA REPRISE' : club.control === 'player' ? 'CLUB DIRIGÉ PAR UN JOUEUR' : 'CLUB DIRIGÉ PAR LE SYSTÈME'}</small><div class="club-stadium">${escapeHTML(club.stadium)}</div><div class="club-roster-preview"><b>EFFECTIF · ${club.roster.length} JOUEURS</b><span>${club.roster.slice(0,3).map(player=>escapeHTML(player.name)).join(' · ')}${club.roster.length>3?' · …':''}</span></div><button class="small-action" data-action="view-roster" data-club="${escapeHTML(club.id)}">VOIR L’EFFECTIF COMPLET</button>${club.control === 'open' ? `<button class="small-action" data-action="take-club" data-club="${escapeHTML(club.id)}">REPRENDRE CE CLUB</button>` : ''}</div></article>`).join('')}</div></section>`).join('')}<p class="notice">Catalogue local chargé · vérification de la saison active en cours.</p><p class="notice" id="club-directory-status" aria-live="polite">Synchronisation du catalogue…</p><p class="notice">Les identités des clubs et joueurs sont fictives. Les fiches publiques n’exposent pas les contrats privés.</p>`;
      loadPublicClubDirectory();
    }
  } else if (page === 'competitions') {
    const rows = clubs.listDivisions();
    const fixtures = clubs.fixtures.slice().sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
    title.textContent = 'Compétitions'; subtitle.textContent = 'Première base locale de championnat : calendrier et classement.';
    content.innerHTML = `<div class="competition-layout"><section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">CHAMPIONNAT LOCAL</span><h2>Classement</h2></div><span class="local-tag">HORS LIGNE</span></div>${rows.map(division=>`<div class="division-table-block"><div class="division-table-title"><b>${escapeHTML(division.id)}</b><span>${escapeHTML(division.name)}</span></div><div class="table-scroll"><table class="standings-table"><thead><tr><th>#</th><th>CLUB</th><th>J</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>PTS</th></tr></thead><tbody>${clubs.standings(division.id).map((club,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(club.name)}</td><td>${club.played}</td><td>${club.wins}</td><td>${club.draws}</td><td>${club.losses}</td><td>${club.goalsFor}</td><td>${club.goalsAgainst}</td><td><b>${club.points}</b></td></tr>`).join('')}</tbody></table></div></div>`).join('')}<p class="notice">Aucun résultat officiel n'est simulé : les points restent à zéro tant qu'aucun résultat n'est enregistré.</p></section><section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">SAISON DE DÉMONSTRATION</span><h2>Calendrier</h2></div><button class="small-action" data-action="create-schedule">GÉNÉRER</button></div>${fixtures.length ? `<div class="fixture-list">${fixtures.map(f=>{const h=clubs.getClub(f.homeClubId),a=clubs.getClub(f.awayClubId);return `<div class="fixture-row"><span>${escapeHTML(h?.name||'Club')}</span><b>${f.status==='completed'?`${f.result.home} – ${f.result.away}`:'VS'}</b><span>${escapeHTML(a?.name||'Club')}</span><small>${new Date(f.scheduledAt).toLocaleDateString('fr-FR')}</small></div>`}).join('')}</div>` : `<div class="empty-fixtures"><b>Aucun match programmé</b><p>Générez un calendrier aller simple distinct pour chaque division.</p></div>`}</section></div><p class="notice">Calendrier, effectifs et classement sauvegardés localement sur cet appareil. La compétition en ligne, la validation des résultats officiels et la synchronisation serveur ne sont pas encore disponibles.</p>`;
    loadServerCompetitionOverview();
  } else if (page === 'results') {
    title.textContent = 'Résultats des matchs';
    subtitle.textContent = 'Historique officiel des rencontres terminées sur le serveur.';
    renderResultsPage(0);
  } else if (page === 'settings') {
    title.textContent = 'Paramètres'; subtitle.textContent = 'Préparez votre expérience de jeu.';
    content.innerHTML = `<div class="settings-card"><label>Caméra du match<select id="pref-camera"><option value="player" ${preferences.cameraMode==='player'?'selected':''}>Immersion joueur · adaptée au poste</option><option value="touchline" ${preferences.cameraMode==='touchline'?'selected':''}>Ligne de touche · latérale</option><option value="broadcast" ${preferences.cameraMode==='broadcast'?'selected':''}>Retransmission · oblique</option><option value="close" ${preferences.cameraMode==='close'?'selected':''}>Rapprochée · joueurs plus grands</option><option value="tactical" ${preferences.cameraMode==='tactical'?'selected':''}>Tactique · vue large</option><option value="spectator" ${preferences.cameraMode==='spectator'?'selected':''}>Spectateur · panoramique</option></select></label><label>Zoom caméra · référence 55 %<input id="pref-zoom" type="range" min="0" max="100" value="${preferences.cameraZoom}"></label><label>Affichage des noms<select id="pref-names"><option value="standard" selected>Standard · joueur contrôlé + deux proches</option></select></label><label>Durée du match<select id="pref-duration"><option value="5" ${preferences.duration===5?'selected':''}>5 minutes · 2 × 2 min 30</option><option value="3" ${preferences.duration===3?'selected':''}>3 minutes · 2 × 1 min 30</option></select></label><label>Qualité graphique<select id="pref-quality"><option value="auto" ${preferences.quality==='auto'?'selected':''}>Automatique · recommandé</option><option value="low" ${preferences.quality==='low'?'selected':''}>Basse · appareils modestes</option><option value="medium" ${preferences.quality==='medium'?'selected':''}>Moyenne · recommandée</option><option value="high" ${preferences.quality==='high'?'selected':''}>Haute</option></select></label><button class="primary-cta" data-action="save-settings">ENREGISTRER</button></div><section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">PROFIL & SAUVEGARDE</span><h2>Compte et synchronisation</h2></div></div><p class="notice">L'association Google sera facultative et recommandée. Elle permettra de retrouver la carrière sur un autre appareil.</p><button class="small-action" type="button" data-page="account">GÉRER MON PROFIL JOUEUR</button></section><p class="notice">Les réglages graphiques s'appliquent au prochain lancement du match.</p>`;
  } else if (page === 'account') {
    title.textContent = 'Profil et synchronisation';
    subtitle.textContent = 'Jouez librement, puis associez Google si vous souhaitez protéger votre carrière.';
    const profile = profileStore.profile;
    const localId = localPlayerIdentity?.id || 'Profil local';
    content.innerHTML = `<section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">VOTRE IDENTITÉ FOOTBALL RP</span><h2>${escapeHTML(profile.identity.displayName)}</h2></div><span class="local-tag">PROFIL LOCAL ACTIF</span></div>
      <p class="notice">Identifiant joueur : ${escapeHTML(localId)} · Niveau ${profile.progression.level} · Aucun mot de passe requis.</p>
      <p class="notice">Vous pouvez jouer, créer votre footballeur et faire progresser votre carrière sans compte Google. L'association est un choix, pas une condition d'accès au jeu.</p>
    </section>${renderGoogleProtectionCard()}<section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">À SAVOIR</span><h2>Avant d'associer Google</h2></div></div><p class="notice">Une fois la fonction disponible, Google protégera ce profil existant : aucune nouvelle carrière ne sera créée et la synchronisation se fera automatiquement lorsque la connexion Internet sera disponible.</p><p class="notice">Tant que Google n'est pas associé, les données restent sur cet appareil. Un formatage ou une suppression des données de l'application peut les faire perdre.</p></section>
      <section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">SAUVEGARDE CLOUD</span><h2>Vérifier une récupération</h2></div></div>
      <p class="notice">Cette vérification compare l'identité du compte, la sauvegarde serveur et les données locales. Elle ne restaure et ne remplace aucune donnée.</p>
      <button class="small-action" data-action="account-recovery-preview" ${accountClient.hasSession ? '' : 'disabled'}>ANALYSER MA SAUVEGARDE</button>
      <button class="small-action" data-action="account-recovery-restore" disabled>RESTAURER MA CARRIÈRE</button>
      <p class="notice" id="account-recovery-status" aria-live="polite">${accountClient.hasSession ? 'Compte connecté : vérification disponible.' : 'Connectez le compte associé à votre joueur pour vérifier sa sauvegarde.'}</p></section>`;
  } else if (page === 'mercato') {
    career.refreshContractStatus();
    career.refreshOfferStatuses();
    const clubsList = clubs.listClubs();
    const currentClub = career.clubId ? clubs.getClub(career.clubId) : null;
    const hasActiveContract = Boolean(career.contract && !career.getContractStatus()?.expired);
    const pending = [...career.offers.values()].filter(offer => offer.status === 'pending');
    const history = career.history.slice().reverse().slice(0, 8);
    const salaryStatus = career.getSalaryStatus();
    const open = career.isTransferWindowOpen();
    const nextWindow = career.transferWindows.find(window => window.start > Date.now());
    const dateLabel = value => new Date(value).toLocaleDateString('fr-FR');
    title.textContent = 'Mercato & contrats'; subtitle.textContent = 'Votre parcours professionnel, vos offres et vos négociations.';
    content.innerHTML = `<div class="career-summary"><div><span class="eyebrow">BUDGET DE TRANSFERT LOCAL</span><strong>${career.wallet.toLocaleString('fr-FR')} crédits</strong><small>Solde indépendant des crédits d'entraînement.</small></div><div><span class="eyebrow">FENÊTRE DE TRANSFERT</span><strong class="${open?'window-open':'window-closed'}">${open?'OUVERTE':'FERMÉE'}</strong><small>${open?'Les transferts peuvent être conclus.':nextWindow?`Prochaine ouverture : ${dateLabel(nextWindow.start)} au ${dateLabel(nextWindow.end)}.`:'Aucune fenêtre programmée.'}</small></div></div>
      <section class="competition-panel contract-panel"><div class="panel-heading"><div><span class="eyebrow">SITUATION PROFESSIONNELLE</span><h2>Mon contrat</h2></div><span class="local-tag">CARRIÈRE LOCALE</span></div>${hasActiveContract?`<div class="contract-details"><b>${escapeHTML(currentClub?.name || career.contract.clubId)}</b><span>Salaire : ${career.contract.salary.toLocaleString('fr-FR')} crédits / semaine</span><span>Signé le ${dateLabel(career.contract.signedAt)} · Expire le ${dateLabel(career.contract.expiresAt)}</span><small>${salaryStatus?.paymentBeforeExpiry ? 'Prochain versement estimé : ' + dateLabel(salaryStatus.nextPaymentAt) + ' · ' + (salaryStatus.daysUntilPayment === 0 ? 'échéance atteinte' : 'dans ' + salaryStatus.daysUntilPayment + ' jour(s)') : 'Aucun versement hebdomadaire prévu avant la fin du contrat.'}</small><small>Statut : ${escapeHTML(career.getContractStatus()?.status || career.contract.status)} · ${career.getContractStatus()?.daysRemaining || 0} jour(s) restant(s)</small><div class="contract-actions"><label>Nouveau salaire / semaine<input id="renew-contract-salary" type="number" min="0" max="100000" value="${career.contract.salary}"></label><button class="small-action" data-action="renew-contract">RENOUVELER · 180 JOURS</button><button class="text-cta" data-action="terminate-contract">RÉSILIER LE CONTRAT</button></div></div>`:`<p class="notice">Vous n'avez pas encore de contrat. Choisissez un club pour commencer votre carrière.</p><div class="sign-contract-row"><label>Club<select id="contract-club">${clubsList.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)} · niveau ${c.rating}</option>`).join('')}</select></label><label>Salaire / semaine<input id="contract-salary" type="number" min="0" max="100000" value="120"></label><button class="primary-cta" data-action="sign-contract">SIGNER MON PREMIER CONTRAT</button></div>`}</section>
      <section class="competition-panel market-panel"><div class="panel-heading"><div><span class="eyebrow">OFFRES DES CLUBS</span><h2>Table des négociations</h2></div><button class="small-action" data-action="generate-offers" ${hasActiveContract?'':'disabled'}>SOLLICITER DES OFFRES</button></div>${pending.length?`<div class="offer-list">${pending.map(offer=>{const club=clubs.getClub(offer.fromClubId);return `<article class="offer-card"><div class="offer-heading"><b>${escapeHTML(club?.name||offer.fromClubId)}</b><span>OFFRE EN ATTENTE</span></div><div class="offer-terms"><label>Salaire / semaine<input type="number" min="0" max="100000" id="salary-${escapeHTML(offer.id)}" value="${offer.salary}"></label><label>Indemnité de transfert<input type="number" min="0" max="1000000" id="fee-${escapeHTML(offer.id)}" value="${offer.fee}"></label></div><div class="offer-actions"><button class="small-action" data-action="negotiate-offer" data-offer="${escapeHTML(offer.id)}">NÉGOCIER</button><button class="small-action accept-action" data-action="accept-offer" data-offer="${escapeHTML(offer.id)}" ${open?'':'disabled'}>ACCEPTER</button><button class="text-cta" data-action="reject-offer" data-offer="${escapeHTML(offer.id)}">REFUSER</button></div></article>`;}).join('')}</div>`:`<div class="empty-fixtures"><b>Aucune offre en attente</b><p>${hasActiveContract?'Sollicitez les clubs pour recevoir des propositions de démonstration.':'Signez d’abord un contrat pour accéder au marché.'}</p></div>`}</section>
      <section class="competition-panel market-history"><div class="panel-heading"><div><span class="eyebrow">JOURNAL DE CARRIÈRE</span><h2>Historique</h2></div></div>${history.length?`<div class="history-list">${history.map(item=>`<div><b>${item.type==='signing'?'Signature':item.type==='transfer'?'Transfert':item.type==='renewal'?'Renouvellement':item.type==='termination'?'Résiliation':item.type==='contract-expired'?'Fin de contrat':item.type==='salary'?'Salaire':'Match'}</b><span>${item.type==='signing'?`Contrat avec ${escapeHTML(clubs.getClub(item.clubId)?.name||item.clubId)}`:item.type==='transfer'?`${escapeHTML(clubs.getClub(item.from)?.name||item.from||'Sans club')} → ${escapeHTML(clubs.getClub(item.to)?.name||item.to)}`:item.type==='renewal'?`Contrat renouvelé avec ${escapeHTML(clubs.getClub(item.clubId)?.name||item.clubId)} · ${item.salary} crédits / semaine`:item.type==='termination'?`Contrat résilié · ${escapeHTML(clubs.getClub(item.clubId)?.name||item.clubId)}`:item.type==='contract-expired'?`Contrat arrivé à échéance · ${escapeHTML(clubs.getClub(item.clubId)?.name||item.clubId)}`:item.type==='salary'?`${item.periods} semaine(s) payée(s) · +${item.amount.toLocaleString('fr-FR')} crédits`:`${item.result==='win'?'Victoire':item.result==='draw'?'Match nul':'Défaite'} · ${item.goals||0} but(s)`}</span><small>${dateLabel(item.date)}</small></div>`).join('')}</div>`:`<p class="notice">Votre historique apparaîtra ici après vos signatures et transferts.</p>`}</section><p class="notice">Mode prototype hors ligne : les offres sont générées localement à partir des niveaux des clubs. Aucun joueur réel, club réel ou serveur de transfert n'est connecté.</p>`;
  } else {
    const labels = {rankings:['Classements','Les classements seront alimentés par les résultats officiels une fois le système de compétition connecté.'],community:['Communauté','Les profils en ligne, invitations et interactions sociales nécessitent le serveur multijoueur.']};
    const [t,d] = labels[page] || ['Module','Ce module sera disponible dans une prochaine version.'];
    title.textContent = t; subtitle.textContent = d;
    content.innerHTML = `<div class="coming-soon"><span>EN DÉVELOPPEMENT</span><h2>${escapeHTML(t)}</h2><p>${escapeHTML(d)}</p><button class="secondary-cta" data-page="home">RETOUR À L’ACCUEIL</button></div>`;
  }
}

let resultsRequestSequence = 0;
const resultNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

async function renderResultsPage(offset = 0, selectedRoomId = null) {
  const content = document.getElementById('menu-content');
  if (!content) return;
  const requestId = ++resultsRequestSequence;
  content.innerHTML = '<section class="competition-panel results-panel"><p class="notice">Chargement de l’historique des rencontres…</p></section>';
  try {
    const response = await fetch(`/api/results?limit=10&offset=${Math.max(0, Math.min(5000, Math.floor(offset)))}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Le serveur ne propose pas encore l’historique des résultats.' : `Serveur indisponible (${response.status}).`);
    const payload = await response.json();
    if (requestId !== resultsRequestSequence || !document.getElementById('menu-content')) return;
    const rows = Array.isArray(payload.results) ? payload.results : [];
    const page = payload.pagination || { limit: 10, offset, total: rows.length, hasMore: false, nextOffset: null };
    const dateLabel = value => Number.isFinite(Number(value)) ? new Date(Number(value)).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date inconnue';
    const cards = rows.map(result => {
      const blue = result.score?.blue ?? 0, red = result.score?.red ?? 0;
      const outcome = result.outcome === 'draw' ? 'MATCH NUL' : result.outcome === 'blue' ? 'VICTOIRE BLEUE' : result.outcome === 'red' ? 'VICTOIRE ROUGE' : 'TERMINÉ';
      return `<article class="result-card"><div class="result-card-top"><span>${dateLabel(result.finalizedAt)}</span><small>${escapeHTML(result.roomId || 'Rencontre')}</small></div><div class="result-scoreline"><div><b>ÉQUIPE BLEUE</b><strong>${resultNumber(blue)}</strong></div><i>–</i><div><b>ÉQUIPE ROUGE</b><strong>${resultNumber(red)}</strong></div></div><div class="result-card-bottom"><span>${outcome}</span><button class="small-action" data-action="show-result" data-room="${escapeHTML(result.roomId)}">VOIR LA FEUILLE DE MATCH</button></div></article>`;
    }).join('');
    content.innerHTML = `<section class="competition-panel results-panel"><div class="panel-heading"><div><span class="eyebrow">ARCHIVES SERVEUR</span><h2>${resultNumber(page.total)} rencontre(s) enregistrée(s)</h2></div><span class="local-tag">RÉSULTATS VALIDÉS</span></div>${rows.length ? `<div class="results-list">${cards}</div>` : '<div class="empty-fixtures"><b>Aucun résultat disponible</b><p>Les matchs terminés et sauvegardés sur le serveur apparaîtront ici. Les matchs locaux ne sont pas ajoutés à cet historique.</p></div>'}<div class="results-pagination"><span>Page ${Math.floor((page.offset || 0) / Math.max(1, page.limit || 10)) + 1} · ${resultNumber(page.total)} résultat(s)</span><div><button class="small-action" data-action="results-page" data-offset="${Math.max(0, (page.offset || 0) - (page.limit || 10))}" ${!page.offset ? 'disabled' : ''}>← PRÉCÉDENTS</button><button class="small-action" data-action="results-page" data-offset="${page.nextOffset ?? 0}" ${!page.hasMore ? 'disabled' : ''}>SUIVANTS →</button></div></div><p class="notice">Les archives sont partagées par le serveur. Leur conservation après redéploiement dépend du volume persistant configuré côté hébergement.</p><div id="result-detail"></div></section>`;
    if (selectedRoomId) await renderResultDetail(selectedRoomId, requestId);
  } catch (error) {
    if (requestId !== resultsRequestSequence) return;
    content.innerHTML = `<section class="competition-panel results-panel"><span class="eyebrow">HISTORIQUE DES RENCONTRES</span><h2>Connexion au serveur impossible</h2><p class="notice">${escapeHTML(error?.message || 'Erreur de chargement.')}</p><button class="small-action" data-action="retry-results">RÉESSAYER</button><button class="text-cta" data-page="home">RETOUR À L’ACCUEIL</button></section>`;
  }
}

async function renderResultDetail(roomId, requestId = resultsRequestSequence) {
  const host = document.getElementById('result-detail');
  if (!host || !/^[a-f0-9]{12}$/.test(roomId)) return;
  host.innerHTML = '<p class="notice">Chargement de la feuille de match…</p>';
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/result`, { cache: 'no-store' });
    if (!response.ok) throw new Error('La feuille de match n’est plus disponible sur le serveur.');
    const result = await response.json();
    if (requestId !== resultsRequestSequence || !document.getElementById('result-detail')) return;
    const stats = result.teamStats || {};
    const teamPanel = (key, fallback) => { const row = stats[key] || {}; const label = result.teams?.[key]?.name || fallback; return `<div class="result-team-stats"><b>${escapeHTML(label)}</b><span>${resultNumber(row.goals)} but(s)</span><span>${resultNumber(row.shots)} tir(s)</span><span>${resultNumber(row.passes)} passe(s)</span><span>${resultNumber(row.tackles)} tacle(s)</span><span>${resultNumber(row.interceptions)} interception(s)</span><span>${resultNumber(row.saves)} arrêt(s)</span></div>`; };
    const players = Array.isArray(result.players) ? result.players : [];
    const playerRows = players.slice().sort((a,b) => (a.team || '').localeCompare(b.team || '') || (b.stats?.goals || 0) - (a.stats?.goals || 0)).map(player => `<tr><td>${escapeHTML(player.name || 'Joueur')}</td><td>${escapeHTML(result.teams?.[player.team]?.name || (player.team === 'blue' ? 'Bleu' : 'Rouge'))}</td><td>${player.isBot ? 'Joueur du système' : 'Joueur humain'}</td><td>${resultNumber(player.stats?.goals)}</td><td>${resultNumber(player.stats?.assists)}</td><td>${resultNumber(player.stats?.shots)}</td><td>${resultNumber(player.stats?.passes)}</td><td>${resultNumber(player.stats?.tackles)}</td><td>${resultNumber(player.stats?.interceptions)}</td><td>${resultNumber(player.stats?.saves)}</td></tr>`).join('');
    host.innerHTML = `<section class="result-detail-card"><div class="panel-heading"><div><span class="eyebrow">FEUILLE DE MATCH · ${escapeHTML(roomId)}</span><h2>Statistiques détaillées</h2></div><button class="small-action" data-action="close-result">FERMER</button></div><div class="result-team-grid">${teamPanel('blue','ÉQUIPE BLEUE')}${teamPanel('red','ÉQUIPE ROUGE')}</div><div class="table-scroll"><table class="standings-table result-player-table"><thead><tr><th>JOUEUR</th><th>ÉQUIPE</th><th>TYPE</th><th>BUTS</th><th>PD</th><th>TIRS</th><th>PASSES</th><th>TACLES</th><th>INT.</th><th>ARRÊTS</th></tr></thead><tbody>${playerRows || '<tr><td colspan="10">Aucune statistique individuelle disponible.</td></tr>'}</tbody></table></div></section>`;
  } catch (error) {
    if (requestId === resultsRequestSequence && host.isConnected) host.innerHTML = `<p class="notice">${escapeHTML(error?.message || 'Erreur de chargement de la feuille de match.')}</p>`;
  }
}

async function refreshOnlineRooms() {
  const list = document.getElementById('online-room-list');
  const status = document.getElementById('online-status');
  if (!list) return;
  list.innerHTML = '<p class="notice">Recherche des salons…</p>';
  try {
    const rooms = await onlineClient.listRooms();
    if (!document.getElementById('online-room-list')) return;
    list.innerHTML = rooms.length ? rooms.map(room => `<div class="fixture-row"><span><b>${escapeHTML(room.name)}</b><small>${room.phase === 'playing' ? 'EN COURS' : 'EN ATTENTE'} · ${room.durationMinutes} min · ${room.humanCounts.blue + room.humanCounts.red}/10 humains</small></span><button class="small-action" data-action="join-listed-room" data-room="${room.id}">REJOINDRE</button></div>`).join('') : '<p class="notice">Aucun salon actif. Crée le premier.</p>';
    if (status) status.textContent = `${rooms.length} salon(s) disponible(s).`;
  } catch (error) {
    list.innerHTML = '<p class="notice">Impossible de contacter le serveur de match.</p>';
    if (status) status.textContent = `Connexion indisponible : ${String(error.message || error).slice(0, 80)}`;
  }
}

async function createOnlineRoom() {
  const status = document.getElementById('online-status');
  if (status) status.textContent = 'Création du salon…';
  try {
    const homeClub = clubs.getClub(selectedMatchup.home);
    const awayClub = clubs.getClub(selectedMatchup.away);
    const clubMatch = homeClub && awayClub && homeClub.id !== awayClub.id
      ? { blueClubId: homeClub.id, redClubId: awayClub.id }
      : {};
    const room = await onlineClient.createRoom({ name: `${profileStore.profile.identity.displayName} · Match`, durationMinutes: preferences.duration, ...clubMatch });
    const id = room.id;
    const field = document.getElementById('online-room-id'); if (field) field.value = id;
    if (status) status.textContent = `Salon créé : ${id}. Connexion en cours…`;
    await joinOnlineRoom(id);
  } catch (error) { if (status) status.textContent = `Création impossible : ${String(error.message || error).slice(0, 80)}`; }
}

async function joinOnlineRoom(roomId) {
  const status = document.getElementById('online-status');
  const id = String(roomId).trim().toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(id)) { if (status) status.textContent = 'Code invalide : 12 caractères hexadécimaux attendus.'; return; }
  if (status) status.textContent = 'Connexion au salon…';
  try {
    const displayName = String(document.getElementById('online-name')?.value || profileStore.profile.identity.displayName).slice(0, 20);
    const joinResult = await onlineClient.joinRoom(id, { displayName, role: profileStore.profile.identity.role });
    pendingOnlineMatch = { client: onlineClient, joinResult };
    if (status) status.textContent = `Connecté · équipe ${joinResult.team === 'blue' ? 'bleue' : 'rouge'} · lancement du match…`;
    await startMatch(pendingOnlineMatch);
  } catch (error) { if (status) status.textContent = `Impossible de rejoindre : ${String(error.message || error).slice(0, 80)}`; }
}

function showMainMenu() {
  if (game) { game.dispose(); game = null; }
  if (pendingOnlineMatch) { onlineClient.leave().catch(() => {}); pendingOnlineMatch = null; }
  if (container) container.innerHTML = '';
  shell.classList.add('hidden');
  menu.classList.remove('hidden');
  renderPage('home');
}

async function startMatch(online = null) {
  menu.classList.add('hidden');
  shell.classList.remove('hidden');
  try {
    if (!container) throw new Error('Conteneur de jeu introuvable.');
    const probe = document.createElement('canvas');
    const gl2 = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl2) throw new Error('WebGL 2 est indisponible. Essaie un navigateur récent et active l’accélération matérielle.');
    gl2.getExtension('WEBGL_lose_context')?.loseContext();
    const { Game } = await import('./game.js');
    const onlineTeams = online?.joinResult?.state?.teams || null;
    const homeClub = onlineTeams?.blue?.id ? clubs.getClub(onlineTeams.blue.id) : clubs.getClub(selectedMatchup.home);
    const awayClub = onlineTeams?.red?.id ? clubs.getClub(onlineTeams.red.id) : clubs.getClub(selectedMatchup.away);
    const kitPalette = (club) => club?.colors?.length >= 3
      ? { primary: club.colors[0], secondary: club.colors[1], accent: club.colors[2] }
      : null;
    game = new Game(container, {
      careerPlayerId: 'career-player',
      playerRole: profileStore.profile.identity.role,
      playerName: profileStore.profile.identity.displayName,
      playerNumber: profileStore.profile.identity.number,
      playerAppearance: profileStore.profile.appearance,
      playerAttributes: profileStore.profile.progression.attributes,
      onlineClient: online?.client || null,
      onlineJoinResult: online?.joinResult || null,
      preferredFoot: profileStore.profile.identity.preferredFoot,
      homeRoster: homeClub?.roster,
      awayRoster: awayClub?.roster,
      homeKitColors: kitPalette(homeClub),
      awayKitColors: kitPalette(awayClub),
      cameraMode: preferences.cameraMode,
      cameraZoom: preferences.cameraZoom,
      onCameraMode: (mode) => { preferences.cameraMode = mode; try { localStorage.setItem('fpro-menu-preferences', JSON.stringify(preferences)); } catch (_) {} },
      onCameraZoom: (zoom) => { preferences.cameraZoom = zoom; try { localStorage.setItem('fpro-menu-preferences', JSON.stringify(preferences)); } catch (_) {} },
      onExitMatch: showMainMenu,
      onMatchEnd: (result) => {
        if (online) {
          // Online career rewards and season statistics must come from the authoritative
          // server report, never from the local presentation simulation.
          void (async () => {
            try {
              const serverResult = await online.client.request(`/api/rooms/${encodeURIComponent(online.client.roomId)}/result`);
              const performance = resolveOnlinePlayerPerformance(serverResult, online.joinResult?.playerId);
              if (!performance) throw new Error('ONLINE_PLAYER_RESULT_UNAVAILABLE');
              const matchId = online.client.roomId;
              const reward = career.recordMatch({
                matchId,
                result: performance.result,
                goals: performance.stats.goals,
                assists: performance.stats.assists,
                cleanSheet: performance.cleanSheet
              });
              reward.matchId = matchId;
              profileStore.grantMatchRewards(reward);
              seasonStats.recordMatch({ matchId, result: performance.result, stats: { ...performance.stats, cleanSheet: performance.cleanSheet }, minutesPlayedMs: performance.minutesPlayedMs, role: performance.role, rating: performance.rating, playerOfMatch: performance.playerOfMatch, opponent: performance.opponent });
            } catch (error) {
              console.warn('[Football RP Online] Statistiques de carrière en ligne non synchronisées :', error);
            }
          })();
          return;
        }
        const outcome = !result.winner ? 'draw' : result.winner === 'blue' ? 'win' : 'loss';
        const cleanSheet = outcome === 'win' && (result.winner === 'blue' ? result.redScore === 0 : result.blueScore === 0);
        const matchId = result.matchId || game.match.matchId;
        const reward = career.recordMatch({ matchId, result: outcome, goals: result.playerStats?.goals, assists: result.playerStats?.assists, cleanSheet });
        reward.matchId = matchId;
              profileStore.grantMatchRewards(reward);
        seasonStats.recordMatch({ matchId, result: outcome, stats: { ...result.playerStats, cleanSheet }, minutesPlayedMs: result.playerStats?.minutesPlayedMs, role: profileStore.profile.identity.role });
      }
    });
    document.getElementById('blue-name').textContent = homeClub?.name || 'ÉQUIPE DOMICILE';
    document.getElementById('red-name').textContent = awayClub?.name || 'ÉQUIPE EXTÉRIEURE';
    const blueCrest = document.querySelector('#board .team.blue .crest');
    const redCrest = document.querySelector('#board .team.red .crest');
    if (blueCrest && homeClub) blueCrest.outerHTML = renderClubCrest({ id: homeClub.id, name: homeClub.name, size: 27, compact: true, colors: homeClub.colors });
    if (redCrest && awayClub) redCrest.outerHTML = renderClubCrest({ id: awayClub.id, name: awayClub.name, size: 27, compact: true, colors: awayClub.colors });
    const qualityControl = document.getElementById('quality');
    if (qualityControl) qualityControl.value = preferences.quality;
    game.match.setDurationMinutes(preferences.duration);
    game.sceneMgr.setQuality(preferences.quality);
    game.start();
  } catch (error) {
    if (online) onlineClient.leave().catch(() => {});
    console.error('[Football RP Online] Échec du démarrage :', error);
    shell.classList.add('hidden'); menu.classList.remove('hidden');
    const content = document.getElementById('menu-content');
    content.innerHTML = `<div class="error-card"><b>Impossible de lancer le match</b><p>${escapeHTML(error?.message || 'Erreur inconnue')}</p><button class="secondary-cta" data-page="home">RETOUR</button></div>`;
  }
}

async function submitAccountTraining(action, attribute) {
  const status = document.getElementById('account-status');
  if (status) status.textContent = 'Entraînement envoyé au serveur…';
  try {
    const result = action === 'account-train' ? await accountClient.trainAttribute(attribute, 1) : await accountClient.practiceAttribute(attribute, 1);
    await loadAccountProgressionSummary();
    if (status) status.textContent = result.ok === false ? 'Entraînement refusé : ressources insuffisantes ou attribut au plafond.' : 'Attribut amélioré et progression enregistrée sur le serveur.';
  } catch (error) {
    if (status) status.textContent = `Entraînement impossible : ${String(error?.message || error).slice(0, 90)}`;
  }
}

async function loadAccountProgressionSummary() {
  const host = document.getElementById('account-progression-stats');
  if (!host || !accountClient.hasSession) return;
  try {
    const payload = await accountClient.getProgression();
    if (!host.isConnected) return;
    const p = payload?.progression || {};
    const attrs = p.attributes || {};
    const names = { pace:'Vitesse', shooting:'Tir', passing:'Passe', defense:'Défense', stamina:'Endurance', control:'Contrôle' };
    const attributeRows = Object.entries(names).map(([key,label]) => `<div class="list-row"><b>${label}</b><span>${Math.max(1,Math.min(99,Number(attrs[key])||1))}/99</span><span class="training-controls"><button class="small-action" data-action="account-train" data-attribute="${key}" ${Number(p.trainingPoints)<1?'disabled':''}>+1 PT</button><button class="small-action" data-action="account-practice" data-attribute="${key}" ${Number(p.coins)<80?'disabled':''}>+1 · 80 CR</button></span></div>`).join('');
    host.innerHTML = `<section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">PROGRESSION SERVEUR</span><h3>Niveau ${Math.max(1,Math.min(99,Number(p.level)||1))}</h3></div><span class="local-tag">${Math.max(0,Number(p.coins)||0)} CRÉDITS</span></div><div class="quick-grid"><div class="quick-card"><b>${Math.max(0,Number(p.experience)||0)}</b><small>EXPÉRIENCE</small></div><div class="quick-card"><b>${Math.max(0,Number(p.trainingPoints)||0)}</b><small>POINTS D'ENTRAÎNEMENT</small></div></div><h4>Attributs officiels</h4>${attributeRows}</section>`;
  } catch (error) {
    if (host.isConnected) host.innerHTML = `<p class="notice">Progression serveur indisponible : ${escapeHTML(String(error?.message || error).slice(0,80))}</p>`;
  }
}

async function loadAccountCareerSummary() {
  const host = document.getElementById('account-career-stats');
  if (!host || !accountClient.token) return;
  try {
    const payload = await accountClient.getCareer();
    if (!host.isConnected) return;
    const totals = payload?.career?.totals || {};
    const count = key => Number.isFinite(Number(totals[key])) ? Math.max(0, Math.floor(Number(totals[key]))) : 0;
    const matches = Array.isArray(payload?.career?.matches) ? payload.career.matches.slice(-5).reverse() : [];
        const resultLabel = result => result === 'win' ? 'Victoire' : result === 'draw' ? 'Nul' : result === 'loss' ? 'Défaite' : 'Match';
        const recent = matches.length ? matches.map(match => `<div class="list-row"><div><b>${escapeHTML(resultLabel(match.result))}</b><small> vs ${escapeHTML(match.opponent || 'Adversaire')}</small></div><div><b>${Number.isFinite(Number(match.rating)) ? Number(match.rating).toFixed(1) : '—'}</b><small>Note · ${Number(match.stats?.goals) || 0} but(s)</small></div></div>`).join('') : '<p class="notice">Aucun match en ligne enregistré pour le moment.</p>';
        host.innerHTML = `<div class="quick-card"><b>${count('matches')}</b><small>MATCHS EN LIGNE</small></div><div class="quick-card"><b>${count('wins')}</b><small>VICTOIRES</small></div><div class="quick-card"><b>${count('goals')}</b><small>BUTS</small></div><div class="quick-card"><b>${count('assists')}</b><small>PASSES DÉCISIVES</small></div><div class="quick-card"><b>${count('playerOfMatch')}</b><small>HOMMES DU MATCH</small></div><div class="quick-card"><b>${(Number(totals.minutesPlayedMs) / 60000 || 0).toFixed(0)}</b><small>MINUTES JOUÉES</small></div><section class="competition-panel"><div class="panel-heading"><div><span class="eyebrow">FORME RÉCENTE</span><h3>Derniers matchs</h3></div><span class="local-tag">${payload?.career?.averageRating == null ? '—' : Number(payload.career.averageRating).toFixed(1)} MOY.</span></div>${recent}</section>`;
  } catch (error) {
    if (host.isConnected) host.innerHTML = `<p class="notice">Carrière serveur indisponible : ${escapeHTML(String(error?.message || error).slice(0, 80))}</p>`;
  }
}

function hasStoredRecoveryData(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return true;
  try { return Boolean(storage.getItem(key) || storage.getItem(`${key}.backup`)); }
  catch (_) { return true; }
}

function readAccountRecoveryLocalState() {
  return {
    profile: hasStoredRecoveryData(profileStore.storage, profileStore.key),
    career: hasStoredRecoveryData(career.storage, career.storageKey),
    progression: hasStoredRecoveryData(profileStore.storage, profileStore.key),
    seasonStats: hasStoredRecoveryData(seasonStats.storage, seasonStats.key),
    archives: hasAccountRecoveryData(profileStore.storage)
  };
}

async function previewAccountRecoveryFromUi() {
  const status = document.getElementById('account-recovery-status');
  const button = document.querySelector('[data-action="account-recovery-preview"]');
  if (!accountClient.hasSession) {
    if (status) status.textContent = 'Connectez le compte associé à votre joueur avant toute vérification.';
    return;
  }
  if (button) button.disabled = true;
  if (status) status.textContent = 'Vérification de la sauvegarde serveur et des données locales…';
  try {
    const localState = readAccountRecoveryLocalState();
    const preview = await accountClient.previewAccountRecovery({
      outbox: profileSyncOutbox,
      localIdentity: localPlayerIdentity || null,
      localState
    });
    if (!status?.isConnected) return;
    if (!preview.ready) {
      pendingAccountRecoveryPreview = null;
      const restoreButton = document.querySelector('[data-action="account-recovery-restore"]');
      if (restoreButton) restoreButton.disabled = true;
      const reasons = {
        ACCOUNT_PLAYER_ID_MISMATCH: 'Le compte connecté ne correspond pas à l’identifiant joueur de la sauvegarde.',
        LOCAL_IDENTITY_MISSING: 'L’identité locale sécurisée n’est pas encore disponible sur cet appareil. Réessayez après la connexion au compte associé.',
        LOCAL_IDENTITY_MISMATCH: 'L’identité locale ne correspond pas à ce compte. Aucune donnée n’a été modifiée.',
        LOCAL_OUTBOX_NOT_ASSESSED: 'La file de synchronisation locale ne peut pas être vérifiée.',
        LOCAL_CHANGES_PENDING: 'Des changements locaux attendent leur synchronisation. La récupération est bloquée pour les préserver.',
        LOCAL_STATE_NOT_ASSESSED: 'L’état des données locales ne peut pas être vérifié.',
        LOCAL_DATA_PRESENT: 'Des données de carrière existent déjà sur cet appareil. Aucun remplacement automatique n’est autorisé.',
        LOCAL_OUTBOX_INVALID: 'La file de synchronisation locale est invalide.',
        SNAPSHOT_INCOMPLETE: 'La sauvegarde cloud est partielle. Les sections manquantes doivent être synchronisées avant toute récupération.'
      };
      status.textContent = reasons[preview.reason] || 'La récupération est bloquée par une vérification de sécurité.';
      return;
    }
    pendingAccountRecoveryPreview = preview;
    const restoreButton = document.querySelector('[data-action="account-recovery-restore"]');
    if (restoreButton) restoreButton.disabled = false;
    const matches = Number(preview.snapshot.career?.totals?.matches) || 0;
    const level = Number(preview.snapshot.progression?.level) || 1;
    status.textContent = 'Sauvegarde serveur vérifiée pour ' + preview.playerId + ' · Niveau ' + level + ' · ' + matches + ' match(s) en carrière. Aperçu uniquement : aucune donnée n’a été importée. Révision ' + preview.revision.slice(0, 12) + '.';
  } catch (error) {
    if (status?.isConnected) status.textContent = 'Vérification impossible : ' + String(error?.message || error).slice(0, 100);
  } finally {
    if (button?.isConnected) button.disabled = !accountClient.hasSession;
  }
}

async function restoreAccountRecoveryFromUi() {
  const status = document.getElementById('account-recovery-status');
  const button = document.querySelector('[data-action="account-recovery-restore"]');
  const preview = pendingAccountRecoveryPreview;
  if (!preview?.ready || !accountClient.hasSession) {
    if (status) status.textContent = 'Effectuez d’abord une analyse valide de la sauvegarde.';
    return;
  }
  if (!window.confirm('Restaurer cette sauvegarde serveur sur cet appareil ? Cette opération remplacera les données locales de profil, progression, statistiques et mercato après une dernière vérification.')) return;
  if (button) button.disabled = true;
  if (status) status.textContent = 'Nouvelle vérification de sécurité avant restauration…';
  try {
    const fresh = await accountClient.getAccountSnapshot();
    if (fresh.revision !== preview.revision) throw new Error('SNAPSHOT_REVISION_CHANGED');
    if (fresh.snapshot.player?.playerId !== preview.playerId || accountClient.account?.playerId !== preview.playerId) {
      throw new Error('ACCOUNT_PLAYER_ID_MISMATCH');
    }
    accountClient.assertLocalIdentity(localPlayerIdentity);
    const outboxStatus = profileSyncOutbox.status();
    if (outboxStatus.pending !== 0) throw new Error('LOCAL_CHANGES_PENDING');
    const localState = readAccountRecoveryLocalState();
    if (Object.values(localState).some(Boolean)) throw new Error('LOCAL_DATA_PRESENT');
    const adapters = createAccountRecoveryAdapters({ profileStore, seasonStatsStore: seasonStats, careerManager: career });
    const result = await restoreAccountSnapshot({
      preview: { ...preview, snapshot: fresh.snapshot },
      currentRevision: fresh.revision,
      confirmed: true,
      adapters
    });
    if (!result.ok) throw new Error(result.reason || 'RESTORE_FAILED');
    const displayName = fresh.snapshot.profile.identity.displayName;
    let identityMetadataUpdated = true;
    try {
      if (localPlayerProfileStore && localPlayerIdentity?.displayName !== displayName) {
        localPlayerIdentity = localPlayerProfileStore.update({ displayName });
      }
    } catch (_) { identityMetadataUpdated = false; }
    try { syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile }); } catch (_) {}
    pendingAccountRecoveryPreview = null;
    renderPage('account');
    const restoredStatus = document.getElementById('account-recovery-status');
    if (restoredStatus) restoredStatus.textContent = identityMetadataUpdated
      ? 'Restauration terminée : profil, progression, statistiques de saison et carrière mercato importés. Les historiques détaillés restent conservés dans les archives locales.'
      : 'Restauration des données terminée. La mise à jour du nom dans les métadonnées locales reste à effectuer.';
  } catch (error) {
    if (status?.isConnected) {
      const messages = {
        SNAPSHOT_REVISION_CHANGED: 'La sauvegarde a changé depuis l’analyse. Relancez une vérification avant de réessayer.',
        ACCOUNT_PLAYER_ID_MISMATCH: 'Le compte ne correspond plus à cette identité joueur.',
        LOCAL_IDENTITY_MISMATCH: 'L’identité locale ne correspond pas au compte connecté.',
        LOCAL_CHANGES_PENDING: 'Des changements locaux sont en attente. Synchronisez-les avant la restauration.',
        LOCAL_DATA_PRESENT: 'Des données locales existent désormais. La restauration est bloquée pour éviter leur écrasement.'
      };
      status.textContent = messages[error.message] || 'Restauration impossible : ' + String(error?.message || error).slice(0, 100);
    }
    if (button?.isConnected) button.disabled = false;
  }
}

async function submitAccountForm(action) {
  const status = document.getElementById('account-status');
  const username = String(document.getElementById('account-username')?.value || '').trim().toLowerCase();
  const password = String(document.getElementById('account-password')?.value || '');
  const displayName = String(document.getElementById('account-display-name')?.value || profileStore.profile.identity.displayName).trim();
  if (status) status.textContent = 'Traitement de la demande…';
  try {
    if (action === 'login') await accountClient.login({ username, password });
    else if (action === 'register') await accountClient.register({ username, password, displayName });
    else if (action === 'refresh') await accountClient.refresh();
    else if (action === 'sync-profile') {
      await queueAndSyncCurrentProfile();
      renderPage('account');
      const refreshedStatus = document.getElementById('account-status');
      if (refreshedStatus) refreshedStatus.textContent = 'Identité et apparence enregistrées sur le compte. Progression et attributs locaux inchangés.';
      return;
    } else if (action === 'migrate-legacy') {
      const backup = createLegacyProfileBackup(profileStore.storage, profileStore.profile);
      const payload = buildLegacyProfileMigrationPayload(profileStore.profile);
      profileSyncCoordinator.enqueueProfile(payload);
      const syncResult = await profileSyncCoordinator.flush();
      renderPage('account');
      const refreshedStatus = document.getElementById('account-status');
      if (refreshedStatus) refreshedStatus.textContent = syncResult.uploaded > 0
        ? (backup.created
          ? 'Migration terminée : sauvegarde locale intégrale créée ; identité et apparence confirmées sur le compte. Progression locale préservée.'
          : 'Migration actualisée : sauvegarde locale existante conservée ; identité et apparence confirmées sur le compte. Progression locale préservée.')
        : 'Sauvegarde locale conservée ; synchronisation cloud en attente du compte correspondant.';
      return;
    } else if (action === 'restore-profile') {
      const result = await accountClient.getProfile();
      if (!result?.profile) throw new Error('NO_CLOUD_PROFILE');
      profileStore.save({ ...profileStore.profile, identity: result.profile.identity, appearance: result.profile.appearance });
      renderPage('account');
      const refreshedStatus = document.getElementById('account-status');
      if (refreshedStatus) refreshedStatus.textContent = 'Identité et apparence restaurées depuis le compte. Progression, attributs et monnaie locaux préservés.';
      return;
    }
    else if (action === 'logout') await accountClient.logout();
    if (['login', 'register', 'refresh'].includes(action)) await profileSyncCoordinator.flush();
    renderPage('account');
  } catch (error) {
    if (status) status.textContent = `Opération impossible : ${String(error?.message || error).slice(0, 100)}`;
  }
}

menu.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) { renderPage(pageButton.dataset.page); return; }
  const playerCard = event.target.closest('[data-player-profile]');
  if (playerCard && event.target.closest('.player-card-details')) return;
  if (playerCard) { const index = Number(playerCard.dataset.playerProfile); selectedPlayerProfile = Number.isInteger(index) ? playerLibraryProfiles[index] || null : null; playerProfileReturnPage = playerCard.dataset.profileOrigin || 'players'; renderPage('player-detail'); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'players-load-more') { playerLibraryLimit += 24; filterPlayerLibrary(); }
  else if (action === 'open-player-profile') { const index = Number(event.target.closest('[data-player-profile]')?.dataset.playerProfile); selectedPlayerProfile = Number.isInteger(index) ? playerLibraryProfiles[index] || null : null; renderPage('player-detail'); }
  else if (action === 'back-player-library') { selectedPlayerProfile = null; renderPage(playerProfileReturnPage); }
  else if (action === 'view-roster') { selectedClubId = event.target.closest('[data-club]')?.dataset.club || null; renderPage('clubs'); }
  else if (action === 'back-clubs') { selectedClubId = null; renderPage('clubs'); }
  else if (action === 'results-page') { renderResultsPage(Number(event.target.closest('[data-offset]')?.dataset.offset || 0)); }
  else if (action === 'show-result') { const roomId = event.target.closest('[data-room]')?.dataset.room; if (roomId) renderResultDetail(roomId); }
  else if (action === 'close-result') { document.getElementById('result-detail')?.replaceChildren(); }
  else if (action === 'retry-results') { renderResultsPage(0); }
  else if (action === 'account-login') {
    submitAccountForm('login');
  } else if (action === 'account-register') {
    submitAccountForm('register');
  } else if (action === 'account-refresh') {
    submitAccountForm('refresh');
  } else if (action === 'account-sync-profile') {
    submitAccountForm('sync-profile');
  } else if (action === 'account-migrate-legacy') {
    submitAccountForm('migrate-legacy');
  } else if (action === 'account-restore-profile') {
    submitAccountForm('restore-profile');
  } else if (action === 'google-link' || action === 'google-login') {
    const googleStatus = document.getElementById('account-recovery-status');
    if (googleStatus) googleStatus.textContent = 'Connexion sécurisée en cours…';
    void (async () => {
      try {
        let response;
        if (action === 'google-login') response = await fetch('/api/auth/google/login/start', { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
        else {
          const identity = localPlayerProfileStore && localPlayerProfileStore.load();
          if (!identity || identity.identityStatus !== 'reserved') throw new Error('LOCAL_IDENTITY_NOT_SERVER_RESERVED');
          response = await fetch('/api/auth/google/link/start', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ localProfileKey: identity.localProfileKey, localProofSecret: identity.localProofSecret }) });
        }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'GOOGLE_AUTH_START_FAILED');
        if (!payload.authorizationUrl || !payload.authorizationUrl.startsWith('https://accounts.google.com/')) throw new Error('INVALID_GOOGLE_AUTHORIZATION_URL');
        window.location.assign(payload.authorizationUrl);
      } catch (error) {
        if (googleStatus && googleStatus.isConnected) googleStatus.textContent = error.message === 'GOOGLE_OIDC_NOT_CONFIGURED' ? 'Google OAuth doit encore être configuré sur le serveur.' : 'Google indisponible : ' + String(error.message || error).slice(0, 90);
      }
    })();
  } else if (action === 'account-recovery-preview') {
    void previewAccountRecoveryFromUi();
  } else if (action === 'account-recovery-restore') {
    void restoreAccountRecoveryFromUi();
  } else if (action === 'account-logout') {
    submitAccountForm('logout');
  } else if (action === 'account-train' || action === 'account-practice') {
    submitAccountTraining(action, event.target.closest('[data-attribute]')?.dataset.attribute || '');
  } else if (action === 'online-menu') {
    document.getElementById('menu-content').innerHTML = `<div class="mode-card"><span class="eyebrow">MULTIJOUEUR · SERVEUR AUTORITAIRE</span><h2>Rejoindre un match en ligne</h2><p>Crée un salon ou rejoins un salon actif. Les déplacements, actions et le ballon sont validés par le serveur.</p><label>Nom affiché<input id="online-name" maxlength="20" value="${escapeHTML(profileStore.profile.identity.displayName)}"></label><div class="training-controls"><button class="primary-cta" data-action="create-online">CRÉER UN SALON</button><button class="small-action" data-action="refresh-online">ACTUALISER LES SALONS</button></div><label>Code du salon<input id="online-room-id" maxlength="12" placeholder="Code à 12 caractères" autocapitalize="characters"></label><button class="primary-cta" data-action="join-online">REJOINDRE CE SALON</button><div id="online-room-list" class="fixture-list"><p class="notice">Chargement des salons…</p></div><p class="notice" id="online-status" aria-live="polite">Le serveur doit être démarré et accessible sur cette adresse.</p><button class="text-cta" data-page="home">Retour</button></div>`;
    refreshOnlineRooms();
  }
  else if (action === 'create-online') {
    createOnlineRoom();
  } else if (action === 'refresh-online') {
    refreshOnlineRooms();
  } else if (action === 'join-online') {
    joinOnlineRoom(document.getElementById('online-room-id')?.value || '');
  } else if (action === 'join-listed-room') {
    const id = event.target.closest('[data-room]')?.dataset.room || '';
    const field = document.getElementById('online-room-id'); if (field) field.value = id;
    joinOnlineRoom(id);
  } else if (action === 'choose-match') {
    const options = clubs.listClubs().map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
    document.getElementById('menu-content').innerHTML = `<div class="mode-card"><span class="eyebrow">MODE DISPONIBLE · MATCH RAPIDE</span><h2>Préparez votre entrée sur le terrain</h2><p>Match local de démonstration en 5 contre 5 face à une équipe contrôlée par le système. Chaque commande reste limitée à votre propre footballeur.</p><div class="matchup-selectors"><label>Équipe domicile<select id="match-home">${options}</select></label><div class="versus-mark">VS</div><label>Équipe extérieure<select id="match-away">${options}</select></label></div><div class="match-centre">
      <div class="match-centre-heading"><span class="eyebrow">AVANT-MATCH · CENTRE DE PRÉPARATION</span><b>CHOISISSEZ VOTRE AFFiche</b></div>
      <div class="matchup-selectors"><label>ÉQUIPE DOMICILE<select id="match-home">${options}</select></label><div class="versus-mark">VS</div><label>ÉQUIPE EXTÉRIEURE<select id="match-away">${options}</select></label></div>
      <div class="match-preview-grid">
        <article class="match-preview-card home"><div id="home-match-identity" class="match-preview-identity"></div><div class="match-preview-stadium" id="home-match-stadium"></div><div class="match-preview-rating"><span>NOTE GLOBALE</span><b id="home-match-rating">—</b><small id="home-match-squad">— joueurs</small></div><div class="match-preview-stars" id="home-match-stars"></div></article>
        <div class="match-pitch-preview" aria-label="Schéma tactique cinq contre cinq"><div class="pitch-half-line"></div><div class="pitch-circle"></div><div class="pitch-box top"></div><div class="pitch-box bottom"></div><div class="pitch-formation-label">2 — 2</div><div class="pitch-dots home-dots"><i></i><i></i><i></i><i></i><i></i></div><div class="pitch-dots away-dots"><i></i><i></i><i></i><i></i><i></i></div></div>
        <article class="match-preview-card away"><div id="away-match-identity" class="match-preview-identity"></div><div class="match-preview-stadium" id="away-match-stadium"></div><div class="match-preview-rating"><span>NOTE GLOBALE</span><b id="away-match-rating">—</b><small id="away-match-squad">— joueurs</small></div><div class="match-preview-stars" id="away-match-stars"></div></article>
      </div>
      <div class="match-centre-foot"><span>FORMAT 5 CONTRE 5</span><span>CONTRÔLE INDIVIDUEL</span><span>ÉQUIPE DU SYSTÈME</span><span>${preferences.duration} MINUTES</span></div>
      <button class="primary-cta" data-action="show-lineup">PRÉSENTER LES ÉQUIPES <span>→</span></button><button class="text-cta" data-page="home">Retour</button>
    </div><div class="mode-details"><span>5 contre 5</span><span>${preferences.duration} minutes</span><span>Présentation des équipes</span><span>Équipe du système</span></div><button class="primary-cta" data-action="show-lineup">PRÉSENTER LES ÉQUIPES <span>→</span></button><button class="text-cta" data-page="home">Retour</button></div>`;
    const homeSelect=document.getElementById('match-home'), awaySelect=document.getElementById('match-away');
    homeSelect.value=selectedMatchup.home; awaySelect.value=selectedMatchup.away;
    const updateMatchup=()=>{
      if(homeSelect.value===awaySelect.value) awaySelect.value=clubs.listClubs().find(c=>c.id!==homeSelect.value)?.id||awaySelect.value;
      selectedMatchup={home:homeSelect.value,away:awaySelect.value};
      const renderSide=(side,club)=>{
        if(!club) return;
        const average=club.roster.length?Math.round(club.roster.reduce((sum,p)=>sum+p.rating,0)/club.roster.length):0;
        const leaders=club.roster.slice().sort((a,b)=>b.rating-a.rating).slice(0,3);
        document.getElementById(side+'-match-identity').innerHTML=`${crest(club)}<div><b>${escapeHTML(club.name)}</b><small>${escapeHTML(club.city)} · ${escapeHTML(club.country)}</small></div>`;
        document.getElementById(side+'-match-stadium').textContent=club.stadium;
        document.getElementById(side+'-match-rating').textContent=average||club.rating;
        document.getElementById(side+'-match-squad').textContent=club.roster.length+' joueurs · Niveau club '+club.rating;
        document.getElementById(side+'-match-stars').innerHTML=leaders.map((p,i)=>`<span><i>${i+1}</i><b>${escapeHTML(p.name)}</b><small>${p.role} · ${p.rating}</small></span>`).join('');
      };
      renderSide('home',clubs.getClub(selectedMatchup.home));
      renderSide('away',clubs.getClub(selectedMatchup.away));
    };
    homeSelect.addEventListener('change',updateMatchup); awaySelect.addEventListener('change',updateMatchup); updateMatchup();
  } else if (action === 'show-lineup') {
    const content=document.getElementById('menu-content');
    const home=clubs.getClub(selectedMatchup.home), away=clubs.getClub(selectedMatchup.away);
    const homeSquad = createMatchSquad('blue','2-2',home.roster,'career-player');
    const awaySquad = createMatchSquad('red','2-2',away.roster);
    const roleLabels = { GK:'Gardien', DEF:'Défenseur', MID:'Milieu', FWD:'Attaquant' };
    const renderPlayers = (players) => players.map(player=>`<div class="pre-match-player"><span class="pre-match-number">${player.number}</span><b>${escapeHTML(player.name)}</b><small>${roleLabels[player.role]||player.role}</small><strong>${player.rating}</strong></div>`).join('');
    const renderLineup = (team, squad) => `<section class="pre-match-team ${team}"><div class="pre-match-team-heading"><span class="eyebrow">${team==='blue'?'ÉQUIPE DOMICILE':'ÉQUIPE EXTÉRIEURE'}</span><b>${team==='blue'?'BLEU':'ROUGE'} · ${squad.starters.length}/5</b></div><div class="pre-match-player-list">${renderPlayers(squad.starters)}</div><div class="pre-match-bench-heading"><span>REMPLAÇANTS</span><b>${squad.substitutes.length}</b></div><div class="pre-match-player-list pre-match-bench-list">${squad.substitutes.length ? renderPlayers(squad.substitutes) : '<p class="pre-match-no-bench">Aucun remplaçant enregistré</p>'}</div><small class="pre-match-squad-total">Effectif disponible : ${squad.squadSize} joueur(s)</small></section>`;
    content.innerHTML=`<div class="match-intro"><span class="eyebrow">PRÉSENTATION DU MATCH</span><h2>LE TERRAIN VOUS ATTEND</h2><p>5 contre 5 · ${preferences.duration} minutes · Stade de démonstration</p><div class="intro-versus"><div>${crest(home)}<b>${escapeHTML(home.name)}</b><small>${escapeHTML(home.city)}</small></div><strong>VS</strong><div>${crest(away)}<b>${escapeHTML(away.name)}</b><small>${escapeHTML(away.city)}</small></div></div><div class="intro-lineup"><span>FORMATION 2–2</span><span>10 TITULAIRES · RÉSERVES AFFICHÉES</span><span>CONTRÔLE INDIVIDUEL</span></div><div class="pre-match-lineups">${renderLineup('blue',homeSquad)}${renderLineup('red',awaySquad)}</div><button class="primary-cta" data-action="start-match">ENTRER SUR LE TERRAIN <span>→</span></button><button class="text-cta" data-action="choose-match">Modifier les équipes</button></div>`;
  } else if (action === 'start-match') startMatch();
  else if (action === 'take-club') {
    const result=clubs.takeOver(event.target.closest('[data-club]')?.dataset.club,'local-player');
    renderPage('clubs');
    if(!result.ok) document.querySelector('.menu-main .menu-heading p').textContent='Ce club ne peut pas être repris dans cette session.';
  } else if (action === 'create-schedule') {
    if (!clubs.fixtures.length) {
      let round=0;
      for(const division of clubs.listDivisions()) {
        const list=division.clubs;
        for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {
          const date=new Date(Date.now()+(round+1)*86400000);
          clubs.createFixture({id:`local-season-${division.id}-${i}-${j}`,homeClubId:list[i].id,awayClubId:list[j].id,scheduledAt:date.toISOString()}); round++;
        }
      }
    }
    renderPage('competitions');
  }
  else if (action === 'practice-player') {
    const amount = Number(document.getElementById('practice-amount')?.value || 1);
    const attribute = document.getElementById('practice-attribute')?.value;
    const method = document.getElementById('training-method')?.value || 'practice';
    const result = method === 'train' ? profileStore.train(attribute, amount) : profileStore.practice(attribute, amount);
    renderPage('player');
    const status = document.querySelector('.training-panel .notice');
    if (status) status.textContent = result.ok
      ? (method === 'train' ? `Entraînement encadré réussi : +${amount} point(s), ${amount} point(s) d’entraînement et ${result.spentCoins} crédits dépensés.` : `Séance individuelle réussie : +${amount} point(s), +${amount * 25} XP et ${result.spentCoins} crédits dépensés.`)
      : result.reason === 'insufficient-coins' ? 'Crédits insuffisants : une séance individuelle coûte 80 crédits par point.'
      : result.reason === 'insufficient-resources' ? 'Ressources insuffisantes : il faut 1 point d’entraînement et 40 crédits par point.'
      : result.reason === 'attribute-cap' ? 'Cette capacité a atteint son maximum de 99.'
      : 'Séance impossible.';
  } else if (action === 'sign-contract') {
    const clubId = document.getElementById('contract-club')?.value;
    const targetClub = clubs.getClub(clubId);
    const alreadyRegistered = clubs.listClubs().some(club => club.roster.some(player => player.id === 'career-player'));
    const canRegister = targetClub && (alreadyRegistered || targetClub.roster.length < targetClub.capacity);
    const result = canRegister
      ? career.signContract({ clubId, salary: Number(document.getElementById('contract-salary')?.value || 0), durationDays: 180 })
      : { ok: false, reason: targetClub ? 'roster-full' : 'invalid-club' };
    renderPage('mercato');
    if (!result.ok) document.getElementById('menu-page-subtitle').textContent = result.reason === 'active-contract' ? 'Vous avez déjà un contrat actif.' : result.reason === 'roster-full' ? 'Effectif complet : ce club ne peut pas inscrire votre footballeur.' : 'Impossible de signer ce contrat.';
  } else if (action === 'renew-contract') {
    const result = career.renewContract({ salary: Number(document.getElementById('renew-contract-salary')?.value), durationDays: 180 });
    renderPage('mercato');
    if (!result.ok) document.getElementById('menu-page-subtitle').textContent = result.reason === 'contract-expired' ? 'Contrat expiré : signez un nouveau contrat.' : 'Renouvellement impossible : vérifiez le salaire.';
  } else if (action === 'terminate-contract') {
    const result = career.terminateContract();
    renderPage('mercato');
    if (!result.ok) document.getElementById('menu-page-subtitle').textContent = 'Aucun contrat actif à résilier.';
  } else if (action === 'generate-offers') {
    if (career.contract && !career.getContractStatus()?.expired) {
      clubs.listClubs().filter(club => club.id !== career.clubId).forEach(club => {
        const duplicate = [...career.offers.values()].some(offer => offer.fromClubId === club.id && offer.status === 'pending');
        if (!duplicate) {
          const nextWindow = career.transferWindows.find(window => window.end >= Date.now());
          career.makeOffer({ fromClubId: club.id, salary: Math.max(40, club.rating * 4), fee: club.rating * 8, expiresAt: new Date(nextWindow?.end || Date.now() + 30 * 86400000).toISOString() });
        }
      });
    }
    renderPage('mercato');
  } else if (action === 'negotiate-offer') {
    const id = event.target.closest('[data-offer]')?.dataset.offer;
    const result = career.negotiate(id, { salary: Number(document.getElementById(`salary-${id}`)?.value), fee: Number(document.getElementById(`fee-${id}`)?.value) });
    renderPage('mercato');
    if (!result.ok) document.getElementById('menu-page-subtitle').textContent = 'Cette offre ne peut plus être négociée.';
  } else if (action === 'accept-offer') {
    const id = event.target.closest('[data-offer]')?.dataset.offer;
    const offer = career.offers.get(id);
    const targetClub = clubs.getClub(offer?.fromClubId);
    const alreadyRegistered = targetClub?.roster.some(player => player.id === 'career-player');
    const canRegister = targetClub && (alreadyRegistered || targetClub.roster.length < targetClub.capacity);
    const result = canRegister
      ? career.acceptOffer(id)
      : { ok: false, reason: targetClub ? 'roster-full' : 'invalid-club' };
    renderPage('mercato');
    if (!result.ok) document.getElementById('menu-page-subtitle').textContent = result.reason === 'window-closed' ? 'Transfert impossible : la fenêtre officielle est fermée.' : result.reason === 'insufficient-funds' ? 'Budget de transfert insuffisant.' : result.reason === 'roster-full' ? 'Transfert refusé : l’effectif du club cible est complet.' : 'Cette offre ne peut pas être acceptée.';
  } else if (action === 'reject-offer') {
    career.rejectOffer(event.target.closest('[data-offer]')?.dataset.offer);
    renderPage('mercato');
  } else if (action === 'save-settings') {
    preferences.duration = Number(document.getElementById('pref-duration').value) === 3 ? 3 : 5;
    preferences.quality = document.getElementById('pref-quality').value;
    preferences.cameraMode = document.getElementById('pref-camera')?.value || 'broadcast';
    preferences.cameraZoom = Number(document.getElementById('pref-zoom')?.value ?? 55);
    preferences.nameDisplay = 'standard';
    try { localStorage.setItem('fpro-menu-preferences', JSON.stringify(preferences)); } catch (_) {}
    renderPage('settings');
    document.getElementById('menu-page-subtitle').textContent = 'Préférences enregistrées pour votre prochain match.';
  }
});

menu.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-player-profile]');
  if (!card || event.target.closest('summary,button,a,input,select,textarea')) return;
  event.preventDefault();
  const index = Number(card.dataset.playerProfile);
  selectedPlayerProfile = Number.isInteger(index) ? playerLibraryProfiles[index] || null : null;
  playerProfileReturnPage = card.dataset.profileOrigin || 'players';
  renderPage('player-detail');
});

menu.addEventListener('submit', event => {
  if (event.target.id === 'player-onboarding-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    const displayName = String(data.get('displayName') || '').trim();
    try {
      profileStore.updateIdentity({ displayName });
      localPlayerIdentity = localPlayerIdentity
        ? localPlayerProfileStore?.update({ displayName }) || localPlayerIdentity
        : localPlayerProfileStore?.create({ displayName }) || null;
      if (!localPlayerIdentity) throw new Error('LOCAL_PLAYER_ID_UNAVAILABLE');
      hasSavedPlayerProfile = true;
      profileSyncCoordinator.enqueueCurrentProfile();
      void profileSyncCoordinator.flush().catch(() => {});
      void reserveLocalPlayerIdentity();
      syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile });
      renderPage('home');
    } catch (error) {
      const status = event.target.querySelector('.onboarding-status');
      if (status) status.textContent = `Création impossible : ${String(error?.message || error)}`;
    }
    return;
  }
  if (event.target.id !== 'profile-editor') return;
  event.preventDefault();
  const data = new FormData(event.target);
  profileStore.updateIdentity({displayName:data.get('displayName'),number:data.get('number'),role:data.get('role'),preferredFoot:data.get('preferredFoot')});
  profileStore.updateAppearance({kit:data.get('kit'),skinTone:data.get('skinTone'),hairStyle:data.get('hairStyle'),hairColor:data.get('hairColor'),bodyBuild:data.get('bodyBuild')});
  try { localPlayerIdentity = localPlayerProfileStore?.update({ displayName: profileStore.profile.identity.displayName }) || localPlayerIdentity; } catch (_) {}
  syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile });
  renderPage('player');
  const status=document.getElementById('profile-save-status');
  if(status) status.textContent='Profil enregistré localement. Synchronisation cloud en attente ou en cours…';
  void queueAndSyncCurrentProfile().then(result => {
    const currentStatus = document.getElementById('profile-save-status');
    if (currentStatus && result.uploaded > 0) currentStatus.textContent = 'Profil enregistré sur cet appareil et synchronisé avec le compte.';
  }).catch(() => {});
});

renderPage(hasSavedPlayerProfile ? 'home' : 'onboarding');
void reserveLocalPlayerIdentity();
window.addEventListener('pagehide', () => game?.dispose?.(), { once: true });

const filterPlayerLibrary = () => {
  const root=document.getElementById('player-library-grid');
  if(!root) return;
  const query=(document.getElementById('library-search')?.value||'').trim().toLocaleLowerCase('fr');
  const club=document.getElementById('library-club')?.value||'all';
  const role=document.getElementById('library-role')?.value||'all';
  const minRating=Number(document.getElementById('library-min-rating')?.value||0);
  const sort=document.getElementById('library-sort')?.value||'rating';
  const cards=[...root.querySelectorAll('[data-library-card]')];
  cards.sort((a,b)=>{
    if(sort==='name') return a.dataset.name.localeCompare(b.dataset.name,'fr');
    const key=sort==='potential'?'potential':sort==='age'?'age':'rating';
    return sort==='age'?Number(a.dataset.age)-Number(b.dataset.age):Number(b.dataset[key])-Number(a.dataset[key]);
  });
  let matched=0,visible=0;
  for(const card of cards){
    const match=(card.dataset.name.includes(query)||card.dataset.archetype.includes(query))
      &&(club==='all'||card.dataset.club===club)&&(role==='all'||card.dataset.role===role)
      &&Number(card.dataset.rating)>=minRating;
    card.classList.toggle('hidden',!match);
    if(match){matched++; if(visible<playerLibraryLimit){card.classList.remove('hidden');visible++;} else card.classList.add('hidden');}
    root.appendChild(card);
  }
  const count=document.getElementById('library-count');
  const shown=document.getElementById('library-visible-count');
  const more=document.getElementById('library-load-more');
  if(count) count.textContent=matched+' joueur'+(matched>1?'s':'')+' trouvé'+(matched>1?'s':'');
  if(shown) shown.textContent=visible+' / '+matched+' affichés';
  if(more) more.hidden=visible>=matched;
};
const onPlayerLibraryFilter = event => {
  if(['library-search','library-club','library-role','library-sort','library-min-rating'].includes(event.target.id)){
    playerLibraryLimit=24; filterPlayerLibrary();
  }
};
menu.addEventListener('input',onPlayerLibraryFilter);
menu.addEventListener('change',onPlayerLibraryFilter);

const filterClubDiscovery = event => {
  if (!['club-search','club-division-filter','club-conference-filter','club-country-filter','club-sort'].includes(event.target.id)) return;
  const query=(document.getElementById('club-search')?.value||'').trim().toLocaleLowerCase('fr');
  const division=document.getElementById('club-division-filter')?.value||'all';
  const conference=document.getElementById('club-conference-filter')?.value||'all';
  const country=document.getElementById('club-country-filter')?.value||'all';
  const sort=document.getElementById('club-sort')?.value||'rating';
  const groups=[...document.querySelectorAll('.club-division')];
  let visible=0;
  for(const group of groups){
    const cards=[...group.querySelectorAll('[data-club-card]')];
    cards.sort((a,b)=>{
      if(sort==='name') return a.dataset.name.localeCompare(b.dataset.name,'fr');
      const key=sort==='roster'?'roster':sort==='reputation'?'reputation':'rating';
      return Number(b.dataset[key])-Number(a.dataset[key]);
    });
    for(const card of cards){
      const match=(card.dataset.name.includes(query)||card.dataset.location.includes(query))
        && (division==='all'||card.dataset.division===division)
        && (conference==='all'||card.dataset.conference===conference)
        && (country==='all'||card.dataset.country===country);
      card.classList.toggle('hidden',!match);
      if(match) visible++;
      group.querySelector('.club-grid')?.appendChild(card);
    }
    group.classList.toggle('hidden',!cards.some(card=>!card.classList.contains('hidden')));
  }
  const counter=document.getElementById('club-filter-count');
  if(counter) counter.textContent=visible+' club'+(visible>1?'s':'')+' affiché'+(visible>1?'s':'');
};
menu.addEventListener('input', filterClubDiscovery);
menu.addEventListener('change', filterClubDiscovery);

const filterClubRoster = event => {
  if (event.target.id !== 'roster-search' && event.target.id !== 'roster-role') return;
  const query = (document.getElementById('roster-search')?.value || '').trim().toLocaleLowerCase('fr');
  const role = document.getElementById('roster-role')?.value || 'all';
  let visible = 0;
  document.querySelectorAll('[data-player-row]').forEach(row => {
    const match = row.dataset.name.includes(query) && (role === 'all' || row.dataset.role === role);
    row.classList.toggle('hidden', !match); if (match) visible++;
  });
  document.getElementById('roster-empty')?.classList.toggle('hidden', visible > 0);
};
menu.addEventListener('input', filterClubRoster);
menu.addEventListener('change', filterClubRoster);
