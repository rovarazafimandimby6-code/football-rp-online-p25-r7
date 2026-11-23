const PALETTES = Object.freeze({
  'antananarivo-fc': ['#1769aa', '#092e55', '#f3d36a'],
  'toamasina-united': ['#c33c45', '#641d2a', '#f4e7d0'],
  'mahajanga-city': ['#d8aa45', '#76501a', '#fff0b8'],
  'fianarantsoa-athletic': ['#7856b8', '#34215e', '#e6d8ff'],
  'antsirabe-sport': ['#32945b', '#145332', '#d6f4df']
});

export function clubInitials(name = 'FC') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2) : [String(name).slice(0, 2)])
    .map(part => Array.from(part)[0] || '').join('').toUpperCase().slice(0, 3) || 'FC';
}

export function clubPalette(clubId, fallback = 'antananarivo-fc', customColors = null) {
  if (Array.isArray(customColors) && customColors.length >= 3 && customColors.slice(0,3).every(color => /^#[0-9a-f]{6}$/i.test(color))) return customColors.slice(0,3);
  return [...(PALETTES[clubId] || PALETTES[fallback])];
}

export function renderClubCrest({ id = 'antananarivo-fc', name = 'Football Club', size = 56, compact = false, colors = null } = {}) {
  const [primary, dark, accent] = clubPalette(id, 'antananarivo-fc', colors);
  const initials = clubInitials(name).replace(/[&<>"']/g, '');
  const label = String(name).replace(/[&<>"']/g, '');
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0,48) || 'club';
  const fontSize = initials.length > 2 ? 13 : 17;
  return `<span class="club-crest-svg${compact ? ' compact' : ''}" role="img" aria-label="Écusson ${label}" style="--crest-primary:${primary};--crest-dark:${dark};--crest-accent:${accent};--crest-size:${size}px"><svg viewBox="0 0 100 112" aria-hidden="true" focusable="false"><defs><linearGradient id="crest-${safeId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--crest-primary)"/><stop offset="1" stop-color="var(--crest-dark)"/></linearGradient></defs><path d="M8 7H92L86 72Q82 91 50 106Q18 91 14 72Z" fill="url(#crest-${safeId})" stroke="var(--crest-accent)" stroke-width="5"/><path d="M17 16H83L78 69Q75 84 50 96Q25 84 22 69Z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/><path d="M24 23H76L72 62H28Z" fill="rgba(0,0,0,.16)"/><path d="M31 73H69" stroke="var(--crest-accent)" stroke-width="3" stroke-linecap="round"/><text x="50" y="57" text-anchor="middle" fill="#fff" font-size="${fontSize}" font-weight="900" font-family="Arial,sans-serif">${initials}</text><circle cx="50" cy="82" r="5" fill="var(--crest-accent)"/></svg></span>`;
}
