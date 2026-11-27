const KIT_DESIGNS = new Set(['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels']);
const CLUB_KIT_PROFILES = Object.freeze({
  'antananarivo-fc': { design:'vertical', inspiration:'maillot à bandes verticales, identité originale' },
  'manparis-sporting': { design:'central', inspiration:'inspiration parisienne : base bleu profond, bande rouge centrale et détails blancs' },
  'dakar-milan-union': { design:'hoops', inspiration:'inspiration milanaise : bandes horizontales contrastées' },
  'toamasina-united': { design:'wave', inspiration:'création côtière à lignes ondulées' },
  'londaka-city': { design:'pinstripes', inspiration:'inspiration britannique : fines rayures verticales' },
  'lisboa-nova-athletic': { design:'quartered', inspiration:'inspiration portugaise : maillot partagé en quartiers' },
  'fianarantsoa-athletic': { design:'chevron', inspiration:'création des Hautes-Terres à chevron' },
  'osaka-antsirabe-fc': { design:'sunburst', inspiration:'création japonaise à rayons' },
  'mahajanga-city': { design:'horizontal', inspiration:'création maritime à bandes horizontales' },
  'rio-tana-creative': { design:'diagonal', inspiration:'inspiration brésilienne à diagonale dynamique' },
  'antsirabe-sport': { design:'central', inspiration:'maillot sobre à axe central' },
  'valencia-northbridge': { design:'split', inspiration:'inspiration ibérique : panneaux bicolores' },
  'tulear-sunrise': { design:'shoulder', inspiration:'création du Sud à empiècements d’épaules' },
  'morondava-lagoon': { design:'ripple', inspiration:'création lagunaire à doubles vagues' },
  'nairobi-tana-academy': { design:'cross', inspiration:'inspiration est-africaine à croix graphique' },
  'antsiranana-north-fc': { design:'sidepanels', inspiration:'création du Nord à panneaux latéraux' }
});
const DESIGN_LIST = [...KIT_DESIGNS];
function stableClubDesign(club = {}) {
  const key = String(club.id || club.name || 'p27-club');
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return DESIGN_LIST[(hash >>> 0) % DESIGN_LIST.length];
}
const validColor = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
export function getP27ClubKit(club = {}, role = 'MID') {
  const profile = CLUB_KIT_PROFILES[club.id] || null;
  const source = Array.isArray(club.colors) && club.colors.length >= 3 && club.colors.slice(0,3).every(validColor)
    ? club.colors.slice(0,3) : ['#2865a8','#17365d','#f4f6fb'];
  const colors = profile?.colors || source;
  const design = profile?.design || (KIT_DESIGNS.has(club.kitDesign) ? club.kitDesign : stableClubDesign(club));
  const goalkeeper = role === 'GK';
  return {
    kitColors: goalkeeper
      ? { primary:colors[2], secondary:colors[0], accent:colors[1] }
      : { primary:colors[0], secondary:colors[1], accent:colors[2] },
    kitDesign:design,
    kitVariant:goalkeeper ? 'goalkeeper' : 'outfield',
    kitInspiration:profile?.inspiration || `identité originale ${design}`
  };
}
export function getP27ClubShopKit(club = {}, inventory = [], kitType = 'home', role = 'MID') {
  const base = getP27ClubKit(club, role);
  const owned = Array.isArray(inventory)
    ? inventory.filter(item => item && item.status === 'owned' && item.equipped === true)
    : [];
  const has = itemId => owned.some(item => item.itemId === itemId);
  const selected = role === 'GK' && has('club-kit-goalkeeper')
    ? 'goalkeeper'
    : kitType === 'away' && has('club-kit-away')
      ? 'away'
      : kitType === 'third' && has('club-kit-third')
        ? 'third'
        : kitType !== 'away' && kitType !== 'third' && has('club-kit-home')
          ? 'home' : null;
  if (!selected) return base;

  const colors = base.kitColors;
  const palettes = {
    home: { primary:colors.primary, secondary:colors.secondary, accent:colors.accent },
    away: { primary:colors.accent, secondary:colors.primary, accent:colors.secondary },
    third: { primary:colors.secondary, secondary:colors.accent, accent:colors.primary },
    goalkeeper: { primary:colors.primary, secondary:colors.secondary, accent:colors.accent }
  };
  const designs = { home:base.kitDesign, away:'diagonal', third:'hoops', goalkeeper:'central' };
  return {
    ...base,
    kitColors:palettes[selected],
    kitDesign:designs[selected],
    kitVariant:selected === 'goalkeeper' ? 'goalkeeper' : selected,
    kitInspiration:'tenue '+selected+' équipée depuis la boutique du club'
  };
}

export function applyP27ClubKit(player = {}, club = {}) {
  const appearance = player.appearance && typeof player.appearance === 'object' ? player.appearance : {};
  return { ...player, appearance:{ ...appearance, ...getP27ClubKit(club, player.role) } };
}
