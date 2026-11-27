let rendererModulePromise = null;
async function renderSystemPlayerPortrait3D(player) {
  rendererModulePromise ||= import('./p27-system-player-portrait-3d.js');
  const module = await rendererModulePromise;
  return module.renderSystemPlayerPortrait3D(player);
}
const SKIN = Object.freeze({ light:'#efc6a1', tan:'#d99d70', medium:'#b97850', brown:'#8b543a', dark:'#623b2d', deep:'#45291f', olive:'#c69a70' });
const HAIR = Object.freeze({ dark:'#211b1a', black:'#171515', brown:'#493027', blond:'#b58a4d' });
const SAFE_HEX = /^#[0-9a-f]{6}$/i;
const pick = (value, fallback) => value ?? fallback;
function hash(value) { let h=2166136261; for (const c of String(value||'system-player')) { h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function tone(value) { return SKIN[String(value||'').toLowerCase()] || SKIN.tan; }
function color(value, fallback) { return SAFE_HEX.test(String(value||'')) ? value : fallback; }
function portraitSvg(player) {
  const a=player.appearance||{}, seed=hash(player.id||player.name), hair=HAIR[a.hairColor]||HAIR.dark;
  const skin=tone(a.skinTone), kit=color(a.kitColors?.primary,'#2865a8'), trim=color(a.kitColors?.secondary,'#f4f6fb');
  const beard=a.facialHair==='beard'?`<path d="M86 100 Q93 112 112 112 Q131 112 138 100 L135 119 Q126 137 112 139 Q98 137 89 119Z" fill="${hair}"/>`:'';
  const face=a.faceShape||(['oval','round','angular','long','square'][seed%5]);
  const hairStyle=a.hairStyle||(['short','fade','curly','afro','wavy','shaved'][seed%6]);
  const facePath=face==='round'?'M80 70 Q80 43 112 43 Q144 43 144 75 Q143 119 112 132 Q81 119 80 70Z':face==='square'?'M80 62 Q83 43 112 43 Q141 43 144 62 L139 112 Q128 133 112 135 Q96 133 85 112Z':face==='long'?'M84 62 Q87 40 112 40 Q137 40 140 62 L132 121 Q121 139 112 140 Q103 139 92 121Z':face==='angular'?'M80 64 Q84 42 112 42 Q140 42 144 64 L137 108 L112 137 L87 108Z':'M81 65 Q84 42 112 42 Q140 42 143 65 L137 113 Q126 134 112 137 Q98 134 87 113Z';
  const hairShape=hairStyle==='shaved'?'M82 67 Q82 42 112 42 Q142 42 142 67 L135 59 Q112 50 89 60Z':hairStyle==='afro'?'M73 73 Q65 30 91 28 Q98 12 117 22 Q144 15 151 48 Q160 59 148 79 L140 67 Q112 48 84 69Z':hairStyle==='curly'?'M78 69 Q65 44 85 35 Q89 17 108 27 Q125 12 139 33 Q158 42 146 72 L137 60 Q112 46 86 63Z':hairStyle==='braids'||hairStyle==='twists'?'M78 66 Q72 35 96 31 Q120 18 142 39 L145 74 L137 66 Q112 49 86 68Z':hairStyle==='wavy'?'M80 69 Q74 46 91 39 Q104 23 120 34 Q139 27 145 53 L140 71 Q128 55 113 57 Q96 53 84 72Z': 'M81 68 Q78 39 103 34 Q129 26 144 50 L142 70 Q112 50 83 72Z';
  const eyes=a.eyeShape==='round'?'<ellipse cx="99" cy="83" rx="4" ry="3.2"/><ellipse cx="125" cy="83" rx="4" ry="3.2"/>':'<path d="M94 83 Q99 78 104 83 Q99 87 94 83Z"/><path d="M120 83 Q125 78 130 83 Q125 87 120 83Z"/>';
  const role=String(player.position||player.role||'').toUpperCase();
  const number=Number.isFinite(Number(player.number))?String(player.number):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 250"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#243c58"/><stop offset="1" stop-color="#101b2b"/></linearGradient><linearGradient id="light" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="224" height="250" rx="14" fill="url(#bg)"/><circle cx="112" cy="93" r="82" fill="#8fb8dc" opacity=".08"/><path d="M27 250 Q34 181 80 164 L112 154 L145 164 Q190 181 197 250Z" fill="${kit}"/><path d="M76 169 L112 190 L148 169 L160 250 L64 250Z" fill="${trim}" opacity=".72"/><path d="M96 151 L112 172 L128 151 L136 250 L88 250Z" fill="${kit}"/><path d="M94 130 L130 130 L132 165 Q112 183 92 165Z" fill="${skin}"/><path d="${facePath}" fill="${skin}"/>${beard}<path d="${hairShape}" fill="${hair}"/><g fill="#34231e">${eyes}</g><path d="M110 86 Q106 101 112 105" fill="none" stroke="#85583f" stroke-width="2" stroke-linecap="round"/><path d="M101 116 Q112 122 123 116" fill="none" stroke="#713f36" stroke-width="2.5" stroke-linecap="round"/><path d="M89 75 Q99 69 107 74 M117 74 Q126 69 135 75" fill="none" stroke="${hair}" stroke-width="3" stroke-linecap="round"/><path d="M28 250 Q38 203 77 181 L92 250 M196 250 Q186 203 147 181 L132 250" fill="url(#light)"/><text x="112" y="226" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="900" fill="#fff" opacity=".82">${number}</text><path d="M0 0H224V250H0Z" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/></svg>`;
}
export function systemPlayerPortraitDataUri(player) { return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(portraitSvg(player||{}))}`; }
export function renderSystemPlayerPortrait(player, variant='card') {
  const p=player||{}, role=String(p.position||p.role||'').toUpperCase();
  const label=String(p.name||'Joueur du système').replace(/[<>&"']/g,'');
  const cls=variant==='detail'?'player-career-avatar player-career-avatar-portrait':variant==='roster'?'roster-player-portrait':'player-card-portrait player-card-portrait-system';
  const config=encodeURIComponent(JSON.stringify({id:p.id||'',role:p.role||'',position:p.position||'',number:p.number||0,appearance:p.appearance||{}}));
  return `<span class="${cls}" aria-label="Portrait 3D du joueur ${label}"><img loading="lazy" decoding="async" data-p27-system-portrait data-p27-portrait-config="${config}" src="${systemPlayerPortraitDataUri(p)}" alt="Portrait du joueur ${label}"/><small>${role}</small></span>`;
}

let portraitObserver = null;
let mutationObserver = null;
function queuePortrait(img) {
  if (!(img instanceof HTMLImageElement) || img.dataset.p27PortraitQueued || img.dataset.p27PortraitDone) return;
  if (!img.dataset.p27PortraitConfig) return;
  img.dataset.p27PortraitQueued = '1';
  const render = async () => {
    img.dataset.p27PortraitAttempted = '1';
    try {
      const player = JSON.parse(decodeURIComponent(img.dataset.p27PortraitConfig));
      const uri = await renderSystemPlayerPortrait3D(player);
      if (img.isConnected && uri) {
        img.src = uri;
        img.dataset.p27PortraitDone = '1';
      }
    } catch {
      // The SVG fallback remains visible when WebGL or the 3D assets are unavailable.
    }
  };
  if (portraitObserver) portraitObserver.observe(img);
  else render();
}
function scanPortraits(root) {
  if (!root) return;
  if (root.matches?.('img[data-p27-system-portrait]')) queuePortrait(root);
  root.querySelectorAll?.('img[data-p27-system-portrait]').forEach(queuePortrait);
}
export function observeSystemPlayerPortraits() {
  if (typeof document === 'undefined' || !document.body || mutationObserver) return;
  if (typeof IntersectionObserver === 'function') {
    portraitObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        portraitObserver.unobserve(entry.target);
        const img = entry.target;
        const config = img.dataset.p27PortraitConfig;
        if (!config || img.dataset.p27PortraitAttempted) continue;
        img.dataset.p27PortraitAttempted = '1';
        (async () => {
          try {
            const player = JSON.parse(decodeURIComponent(config));
            const uri = await renderSystemPlayerPortrait3D(player);
            if (img.isConnected && uri) {
              img.src = uri;
              img.dataset.p27PortraitDone = '1';
            }
          } catch {
            // Keep the local SVG fallback.
          }
        })();
      }
    }, { rootMargin: '100px' });
  }
  scanPortraits(document.body);
  mutationObserver = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scanPortraits(node);
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}
if (typeof document !== 'undefined') {
  if (document.body) observeSystemPlayerPortraits();
  else document.addEventListener('DOMContentLoaded', observeSystemPlayerPortraits, { once: true });
}
