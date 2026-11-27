let rendererModulePromise = null;
async function renderSystemPlayerPortrait3D(player) {
  rendererModulePromise ||= import('./p27-system-player-portrait-3d.js');
  const module = await rendererModulePromise;
  return module.renderSystemPlayerPortrait3D(player);
}
const SKIN = Object.freeze({ light:'#efc6a1', tan:'#d99d70', medium:'#b97850', brown:'#8b543a', dark:'#623b2d', deep:'#45291f', olive:'#c69a70' });
const HAIR = Object.freeze({ dark:'#211b1a', black:'#171515', brown:'#493027', blond:'#b58a4d', auburn:'#8b3f26', grey:'#777b82' });
const SAFE_HEX = /^#[0-9a-f]{6}$/i;
const pick = (value, fallback) => value ?? fallback;
function hash(value) { let h=2166136261; for (const c of String(value||'system-player')) { h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function tone(value) { return SKIN[String(value||'').toLowerCase()] || SKIN.tan; }
function color(value, fallback) { return SAFE_HEX.test(String(value||'')) ? value : fallback; }
function kitPattern(design, trim, accent) {
  const patterns = {
    vertical: `<path d="M108 158 L116 158 L123 250 L101 250Z" fill="${trim}"/>`,
    sash: `<path d="M65 178 L78 166 L163 244 L151 250Z" fill="${trim}"/>`,
    hoops: `<path d="M48 194 H176 V204 H48Z M39 220 H185 V230 H39Z" fill="${trim}"/>`,
    wave: `<path d="M45 192 Q82 174 112 194 T180 192 L180 204 Q145 214 112 204 T45 206Z" fill="${trim}"/>`,
    pinstripes: `<path d="M82 174 L87 174 L79 250 L74 250Z M99 166 L103 166 L100 250 L96 250Z M121 166 L125 166 L128 250 L124 250Z M139 174 L144 174 L150 250 L145 250Z" fill="${trim}"/>`,
    quartered: `<path d="M112 158 L145 164 Q190 181 197 250 H112Z" fill="${trim}" opacity=".82"/>`,
    chevron: `<path d="M54 180 L112 211 L170 180 L177 190 L112 226 L47 190Z" fill="${trim}"/>`,
    sunburst: `<path d="M112 160 L117 250 H107Z M78 166 L99 250 H91Z M146 166 L133 250 H125Z" fill="${trim}"/>`,
    horizontal: `<path d="M38 188 H186 V199 H38Z M31 220 H193 V231 H31Z" fill="${trim}"/>`,
    diagonal: `<path d="M44 235 L112 160 L126 160 L58 250 H44Z" fill="${trim}"/>`,
    split: `<path d="M112 158 H145 Q190 181 197 250 H112Z" fill="${trim}" opacity=".8"/>`,
    shoulder: `<path d="M42 176 L77 164 L91 181 L63 196Z M182 176 L147 164 L133 181 L161 196Z" fill="${trim}"/>`,
    ripple: `<path d="M34 198 Q70 181 105 198 T190 198 V208 Q150 191 112 208 T34 208Z M34 225 Q70 208 105 225 T190 225 V235 Q150 218 112 235 T34 235Z" fill="${trim}"/>`,
    cross: `<path d="M103 158 H121 V250 H103Z M39 202 H185 V214 H39Z" fill="${trim}"/>`,
    sidepanels: `<path d="M36 190 L61 180 L75 250 H51Z M188 190 L163 180 L149 250 H173Z" fill="${trim}"/>`,
    central: `<path d="M96 158 H128 L139 250 H85Z" fill="${trim}" opacity=".75"/>`
  };
  return `<g clip-path="url(#shirtClip)">${patterns[design] || patterns.central}<path d="M78 165 L88 168 L78 250 H68Z M146 165 L136 168 L146 250 H156Z" fill="${accent}" opacity=".3"/></g>`;
}
function portraitSvg(player) {
  const a=player.appearance||{}, seed=hash(player.id||player.name), hair=HAIR[a.hairColor]||HAIR.dark;
  const skin=tone(a.skinTone), kit=color(a.kitColors?.primary,'#2865a8'), trim=color(a.kitColors?.secondary,'#f4f6fb'), accent=color(a.kitColors?.accent,'#d7aa37');
  const design=String(a.kitDesign||'central').toLowerCase();
  const jersey=kitPattern(design,trim,accent);
  const beard=a.facialHair==='beard'?`<path d="M86 100 Q93 112 112 112 Q131 112 138 100 L135 119 Q126 137 112 139 Q98 137 89 119Z" fill="${hair}"/>`:'';
  const face=a.faceShape||(['oval','round','angular','long','square'][seed%5]);
  const hairStyle=a.hairStyle||(['short','fade','curly','afro','wavy','shaved'][seed%6]);
  const facePath=face==='round'?'M80 70 Q80 43 112 43 Q144 43 144 75 Q143 119 112 132 Q81 119 80 70Z':face==='square'?'M80 62 Q83 43 112 43 Q141 43 144 62 L139 112 Q128 133 112 135 Q96 133 85 112Z':face==='long'?'M84 62 Q87 40 112 40 Q137 40 140 62 L132 121 Q121 139 112 140 Q103 139 92 121Z':face==='angular'?'M80 64 Q84 42 112 42 Q140 42 144 64 L137 108 L112 137 L87 108Z':'M81 65 Q84 42 112 42 Q140 42 143 65 L137 113 Q126 134 112 137 Q98 134 87 113Z';
  const hairShape=hairStyle==='shaved'?'M82 67 Q82 42 112 42 Q142 42 142 67 L135 59 Q112 50 89 60Z':hairStyle==='afro'?'M73 73 Q65 30 91 28 Q98 12 117 22 Q144 15 151 48 Q160 59 148 79 L140 67 Q112 48 84 69Z':hairStyle==='curly'?'M78 69 Q65 44 85 35 Q89 17 108 27 Q125 12 139 33 Q158 42 146 72 L137 60 Q112 46 86 63Z':hairStyle==='braids'||hairStyle==='twists'?'M78 66 Q72 35 96 31 Q120 18 142 39 L145 74 L137 66 Q112 49 86 68Z':hairStyle==='wavy'?'M80 69 Q74 46 91 39 Q104 23 120 34 Q139 27 145 53 L140 71 Q128 55 113 57 Q96 53 84 72Z': 'M81 68 Q78 39 103 34 Q129 26 144 50 L142 70 Q112 50 83 72Z';
  const eyes=a.eyeShape==='round'?'<ellipse cx="99" cy="83" rx="4" ry="3.2"/><ellipse cx="125" cy="83" rx="4" ry="3.2"/>':'<path d="M94 83 Q99 78 104 83 Q99 87 94 83Z"/><path d="M120 83 Q125 78 130 83 Q125 87 120 83Z"/>';
  const role=String(player.position||player.role||'').toUpperCase();
  const number=Number.isFinite(Number(player.number))?String(player.number):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 250"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${accent}" stop-opacity=".42"/><stop offset=".48" stop-color="#243c58"/><stop offset="1" stop-color="#101b2b"/></linearGradient><linearGradient id="light" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="shirtClip"><path d="M27 250 Q34 181 80 164 L112 154 L145 164 Q190 181 197 250Z"/></clipPath></defs><rect width="224" height="250" rx="14" fill="url(#bg)"/><circle cx="112" cy="93" r="82" fill="${accent}" opacity=".1"/><path d="M27 250 Q34 181 80 164 L112 154 L145 164 Q190 181 197 250Z" fill="${kit}"/>${jersey}<path d="M94 130 L130 130 L132 165 Q112 183 92 165Z" fill="${skin}"/><path d="${facePath}" fill="${skin}"/>${beard}<path d="${hairShape}" fill="${hair}"/><g fill="#34231e">${eyes}</g><path d="M110 86 Q106 101 112 105" fill="none" stroke="#85583f" stroke-width="2" stroke-linecap="round"/><path d="M101 116 Q112 122 123 116" fill="none" stroke="#713f36" stroke-width="2.5" stroke-linecap="round"/><path d="M89 75 Q99 69 107 74 M117 74 Q126 69 135 75" fill="none" stroke="${hair}" stroke-width="3" stroke-linecap="round"/><path d="M28 250 Q38 203 77 181 L92 250 M196 250 Q186 203 147 181 L132 250" fill="url(#light)"/><circle cx="157" cy="181" r="5" fill="${accent}" stroke="#fff" stroke-opacity=".65"/><text x="112" y="226" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="900" fill="#fff" opacity=".82">${number}</text><path d="M0 0H224V250H0Z" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/></svg>`;
}
export function systemPlayerPortraitDataUri(player) { return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(portraitSvg(player||{}))}`; }
export function renderSystemPlayerPortrait(player, variant='card') {
  const p=player||{}, role=String(p.position||p.role||'').toUpperCase();
  const label=String(p.name||'Joueur du système').replace(/[<>&"']/g,'');
  const cls=variant==='detail'?'player-career-avatar player-career-avatar-portrait':variant==='roster'?'roster-player-portrait':'player-card-portrait player-card-portrait-system';
  const number=Number.isInteger(Number(p.number)) && Number(p.number)>=1 && Number(p.number)<=99 ? Number(p.number) : null;
  const config=encodeURIComponent(JSON.stringify({id:p.id||'',role:p.role||'',position:p.position||'',number:number||0,appearance:p.appearance||{}}));
  return `<span class="${cls}" style="position:relative;display:inline-block" aria-label="Portrait 3D du joueur ${label}${number ? `, numéro ${number}` : ''}"><img loading="lazy" decoding="async" data-p27-system-portrait data-p27-portrait-config="${config}" src="${systemPlayerPortraitDataUri(p)}" alt="Portrait du joueur ${label}"/>${number ? `<b aria-hidden="true" style="position:absolute;left:50%;bottom:17%;transform:translateX(-50%);font:900 1.15em Arial,sans-serif;color:#fff;text-shadow:0 1px 3px #101820,0 0 5px #101820">${number}</b>` : ''}<small>${role}${number ? ` · N° ${number}` : ''} </small></span>`;
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
