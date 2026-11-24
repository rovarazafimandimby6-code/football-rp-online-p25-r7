const hash = value => {
  let result = 2166136261;
  for (const char of String(value)) { result ^= char.codePointAt(0); result = Math.imul(result, 16777619); }
  return result >>> 0;
};
const ARCHETYPES = Object.freeze([
  { id:'community', label:'Club communautaire', philosophy:'Construire une équipe soudée autour de son territoire', supporters:'proximité et fidélité locale' },
  { id:'academy', label:'Club formateur', philosophy:'Faire progresser les jeunes et révéler les talents', supporters:'fierté de la formation et patience' },
  { id:'technical', label:'Club technique', philosophy:'Privilégier la maîtrise du ballon et le jeu collectif', supporters:'culture du beau jeu et exigence' },
  { id:'intense', label:'Club intense', philosophy:'Miser sur le rythme, le pressing et la solidarité', supporters:'ferveur et engagement' },
  { id:'ambitious', label:'Projet ambitieux', philosophy:'Développer un projet sportif capable de franchir les paliers', supporters:'ambition et attentes élevées' },
  { id:'heritage', label:'Club de tradition', philosophy:'Préserver une identité forte et transmettre ses valeurs', supporters:'mémoire collective et attachement' }
]);
const ORIGINS = Object.freeze(['community-founded','academy-founded','regional-project','fictional-merger']);
export function generateClubLore(club = {}) {
  const id = String(club.id || club.name || 'club');
  const seed = hash('fpro-p27-lore:' + id);
  const archetype = ARCHETYPES[seed % ARCHETYPES.length];
  const originType = ORIGINS[(seed >>> 5) % ORIGINS.length];
  const location = club.location?.city || club.city || 'son territoire';
  const foundedYear = 1972 + ((seed >>> 9) % 49);
  const foundingContext = ({
    'community-founded':'un projet porté par des passionnés de la région',
    'academy-founded':'une structure de formation devenue club de compétition',
    'regional-project':'une initiative sportive destinée à représenter son territoire',
    'fictional-merger':'un rapprochement fictif de deux collectifs sportifs locaux'
  })[originType];
  return Object.freeze({
    contentStatus:'generated-draft', originType, foundedYear,
    originSummary:`Projet fictif créé à ${location} en ${foundedYear}, à partir de ${foundingContext}.`,
    identityArchetype:archetype.id, identityLabel:archetype.label,
    sportingPhilosophy:archetype.philosophy, supporterCulture:archetype.supporters,
    rivalryStatus:'unassigned', rivalries:Object.freeze([])
  });
}
export const P27_CLUB_LORE_ARCHETYPES = ARCHETYPES;
export const P27_CLUB_LORE_ORIGINS = ORIGINS;
