/**
 * Curated P27 expansion: 140 additional fictional clubs.
 * The 48 national-tier clubs extend D1-D3; the 92 regional clubs fill
 * D4/D5 with explicit conference assignments. Names and identities are original.
 */
const WORLD_CLUB_CITIES = [
  ['Glasgow','Royaume-Uni','GB'],['Liverpool','Royaume-Uni','GB'],['Bristol','Royaume-Uni','GB'],['Leeds','Royaume-Uni','GB'],
  ['Birmingham','Royaume-Uni','GB'],['Cardiff','Royaume-Uni','GB'],['Dublin','Irlande','IE'],['Edimbourg','Royaume-Uni','GB'],
  ['Lyon','France','FR'],['Marseille','France','FR'],['Bordeaux','France','FR'],['Lille','France','FR'],
  ['Nantes','France','FR'],['Toulouse','France','FR'],['Nice','France','FR'],['Strasbourg','France','FR'],
  ['Naples','Italie','IT'],['Turin','Italie','IT'],['Bologne','Italie','IT'],['Florence','Italie','IT'],
  ['Seville','Espagne','ES'],['Bilbao','Espagne','ES'],['Malaga','Espagne','ES'],['Saragosse','Espagne','ES'],
  ['Porto','Portugal','PT'],['Braga','Portugal','PT'],['Coimbra','Portugal','PT'],['Faro','Portugal','PT'],
  ['Sao Paulo','Bresil','BR'],['Salvador','Bresil','BR'],['Recife','Bresil','BR'],['Curitiba','Bresil','BR'],
  ['Yokohama','Japon','JP'],['Nagoya','Japon','JP'],['Kobe','Japon','JP'],['Fukuoka','Japon','JP'],
  ['Dakar','Senegal','SN'],['Saint-Louis','Senegal','SN'],['Thies','Senegal','SN'],['Kaolack','Senegal','SN'],
  ['Lagos','Nigeria','NG'],['Abuja','Nigeria','NG'],['Kano','Nigeria','NG'],['Ibadan','Nigeria','NG'],
  ['Nairobi','Kenya','KE'],['Mombasa','Kenya','KE'],['Kisumu','Kenya','KE'],['Nakuru','Kenya','KE']
];
const D4_CITIES = {
  A: [
    'Ambilobe','Ambanja','Nosy Be','Sambava','Antalaha','Andapa','Vohemar','Bealanana',
    'Befandriana Nord','Port-Berge','Mampikony','Mandritsara','Marovoay','Mitsinjo','Soalala','Antsohihy'
  ],
  B: [
    'Antananarivo','Antsirabe','Fianarantsoa','Ambositra','Manakara','Mananjary','Farafangana','Vangaindrano',
    'Ihosy','Betroka','Taolagnaro','Toliara','Sakaraha','Morondava','Miandrivazo','Belo sur Tsiribihina'
  ]
};
const D5_CITIES = {
  A: [
    'Ambilobe','Ambanja','Nosy Be','Sambava','Antalaha','Andapa','Vohemar','Bealanana',
    'Befandriana Nord','Port-Berge','Mampikony','Mandritsara','Marovoay','Soalala','Antsohihy'
  ],
  B: [
    'Toamasina','Fenerive-Est','Vatomandry','Mahanoro','Brickaville','Moramanga','Andasibe','Anosibe Anala',
    'Ambatondrazaka','Amparafaravola','Manakara','Mananjary','Farafangana','Vangaindrano','Nosy Varika'
  ],
  C: [
    'Antsirabe','Fianarantsoa','Ambositra','Ihosy','Betroka','Taolagnaro','Sakaraha','Ampanihy',
    'Betioky','Bekily','Ambovombe','Amboasary','Tsihombe','Beloha','Ejeda'
  ],
  D: [
    'Mahajanga','Ambato-Boeny','Ambatomainty','Ankavandra','Maintirano','Morafenobe','Besalampy','Antsalova',
    'Belo sur Tsiribihina','Tsiroanomandidy','Miarinarivo','Arivonimamo','Ankazobe','Maevatanana','Kandreho'
  ]
};
const BRAND_FIRST = ['Kintana','Ravinala','Atsimo','Avaratra','Manga','Vato','Onja','Tsiry','Volana','Sahondra','Lakana','Tselatra','Tandroka','Masoandro','Rija','Anjara','Soa','Horizon','Nofy','Andry'];
const BRAND_SECOND = ['Atlas','Comets','Rovers','Dynasty','Voyagers','Phoenix','Waves','Falcons','Pioneers','Legends','United','Athletic','Storm','Lions','Stars','Rangers','Guardians','Wanderers'];
const REGIONAL_FOREIGN_LOCATIONS = [
  ['Berlin','Allemagne','DE'],['Hambourg','Allemagne','DE'],['Munich','Allemagne','DE'],['Dortmund','Allemagne','DE'],['Leipzig','Allemagne','DE'],
  ['Rotterdam','Pays-Bas','NL'],['Utrecht','Pays-Bas','NL'],['Eindhoven','Pays-Bas','NL'],
  ['Bruxelles','Belgique','BE'],['Anvers','Belgique','BE'],['Zagreb','Croatie','HR'],['Split','Croatie','HR'],
  ['Belgrade','Serbie','RS'],['Novi Sad','Serbie','RS'],['Istanbul','Turquie','TR'],['Izmir','Turquie','TR'],['Ankara','Turquie','TR'],
  ['Athènes','Grèce','GR'],['Thessalonique','Grèce','GR'],
  ['New York','États-Unis','US'],['Los Angeles','États-Unis','US'],['Miami','États-Unis','US'],
  ['Toronto','Canada','CA'],['Montréal','Canada','CA'],
  ['Mexico','Mexique','MX'],['Guadalajara','Mexique','MX'],['Monterrey','Mexique','MX'],
  ['Bogota','Colombie','CO'],['Medellin','Colombie','CO'],['Lima','Pérou','PE'],['Arequipa','Pérou','PE'],
  ['Montevideo','Uruguay','UY'],['Salto','Uruguay','UY'],['Santiago','Chili','CL'],['Valparaiso','Chili','CL'],
  ['Tokyo','Japon','JP'],['Osaka','Japon','JP'],['Seoul','Corée du Sud','KR'],['Busan','Corée du Sud','KR'],
  ['Sydney','Australie','AU'],['Melbourne','Australie','AU'],['Casablanca','Maroc','MA'],['Rabat','Maroc','MA'],
  ['Abidjan','Côte d’Ivoire','CI'],['Yamoussoukro','Côte d’Ivoire','CI'],['Accra','Ghana','GH'],['Kumasi','Ghana','GH'],
  ['Lagos','Nigeria','NG'],['Abuja','Nigeria','NG'],['Dakar','Sénégal','SN'],['Thiès','Sénégal','SN'],
  ['Le Caire','Égypte','EG'],['Oran','Algérie','DZ']
];
const CLUB_SUFFIXES = ['', ' Sporting', ' United', ' Athletic', ' SC', ' AC', ' City', ' Rovers', ' Wanderers', ' Olympique', ' Racing', ' Deportivo', ' FC', ' Town', ' Albion', ' Phoenix'];
const STADIUM_SUFFIXES = ['Park','Ground','Stadium','Arena','Field','Park'];
const INTERNATIONAL_BRAND_FIRST = ['Silver','Golden','Royal','Iron','Crimson','Azure','Emerald','Cobalt','Scarlet','Velvet','Pacific','Atlantic','Summit','Meridian','Titan','Nova','Solar','Vanguard','Liberty','Victory','Orion','Imperial','Metro','Ocean','Thunder','Valiant','Aurora','Northern','Western','Eastern'];
const CLUB_NAME_STYLES = Object.freeze({
  GB:['suffix:United','suffix:City','suffix:Rovers','suffix:Athletic','suffix:Wanderers','suffix:FC','suffix:Town','suffix:Albion'],
  FR:['prefix:Olympique','prefix:Racing','prefix:Stade','prefix:AS','prefix:FC','prefix:Sporting'],
  DE:['prefix:SV','prefix:TSV','prefix:FC','prefix:SC','prefix:Sportfreunde','prefix:VfB'],
  IT:['prefix:AC','prefix:US','prefix:Calcio','prefix:Sporting','prefix:FC'],
  ES:['prefix:Deportivo','prefix:Atlético','prefix:Unión Deportiva','prefix:Racing','prefix:Club'],
  PT:['prefix:Sporting','prefix:Vitória','prefix:União','prefix:SC','prefix:FC'],
  BR:['prefix:Atlético','prefix:Esporte Clube','prefix:Associação','prefix:União','prefix:Sport Club'],
  JP:['suffix:SC','suffix:United','suffix:FC','suffix:Athletic'],
  SN:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile','prefix:Sporting'],
  NG:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile','prefix:Sporting'],
  KE:['prefix:AS','prefix:United','prefix:Athletic','prefix:Sporting'],
  MA:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile'],
  DZ:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile'],
  TN:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile'],
  CI:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile'],
  GH:['prefix:AS','prefix:United','prefix:Athletic','prefix:Sporting'],
  CM:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Étoile'],
  EG:['prefix:AS','prefix:Olympique','prefix:Racing','prefix:Sporting'],
  ZA:['prefix:United','prefix:City','prefix:Athletic','prefix:FC'],
  IE:['suffix:Athletic','suffix:United','suffix:Rovers','suffix:Town','suffix:FC'],
  NL:['prefix:Sportvereniging','prefix:FC','prefix:SC','suffix:United','suffix:Athletic'],
  BE:['prefix:Royal','prefix:K','prefix:Sporting','prefix:Union','suffix:FC'],
  HR:['prefix:NK','prefix:FK','prefix:Sporting','suffix:United'],
  RS:['prefix:FK','prefix:SC','prefix:Sporting','suffix:United'],
  TR:['suffix:SK','suffix:FK','prefix:Anadolu','prefix:Sporting'],
  GR:['prefix:AO','prefix:PAE','prefix:Athletic','suffix:FC'],
  US:['suffix:United','suffix:City','suffix:SC','suffix:Athletic','suffix:FC'],
  CA:['suffix:United','suffix:City','suffix:SC','suffix:Athletic','suffix:FC'],
  MX:['prefix:Deportivo','prefix:Atlético','prefix:Club','prefix:Unión'],
  CO:['prefix:Deportivo','prefix:Atlético','prefix:Club','prefix:Unión'],
  PE:['prefix:Deportivo','prefix:Atlético','prefix:Club','prefix:Unión'],
  UY:['prefix:Deportivo','prefix:Atlético','prefix:Club','prefix:Unión'],
  CL:['prefix:Deportivo','prefix:Atlético','prefix:Club','prefix:Unión'],
  KR:['suffix:FC','suffix:United','suffix:SC','suffix:Athletic'],
  AU:['suffix:United','suffix:City','suffix:Athletic','suffix:FC','suffix:SC']
});
const DEFAULT_CLUB_NAME_STYLES = ['suffix:AC','suffix:FC','suffix:United','suffix:Sporting','suffix:Athletic','suffix:City','suffix:Rovers','suffix:SC'];
const makeClubName = (brand, countryCode, index) => {
  const styles = CLUB_NAME_STYLES[countryCode] || DEFAULT_CLUB_NAME_STYLES;
  const style = styles[index % styles.length];
  const [kind, label] = style.split(':');
  return kind === 'prefix' ? label + ' ' + brand : brand + ' ' + label;
};
const PALETTE = [
  ['#1f6f78','#123c50','#e8c66a'],['#7b3f8c','#39204d','#f1d5a5'],['#b54b3a','#632b2a','#f2d58a'],
  ['#34764d','#194a38','#e6d58b'],['#345c9c','#1d315f','#e4c76b'],['#9a642e','#57391e','#f0d9a2'],
  ['#397f8b','#174650','#e7d59b'],['#86524b','#4b292d','#e8c7a0'],['#6b6a36','#34351f','#e8d58d'],
  ['#5c5b9b','#302b5b','#e9d79a']
];
const KIT_DESIGNS = ['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels'];
const OFFSETS = [-4,-2,-1,0,1,2,3,4,0,1,-1,2,3,-3,1,0];
const makeClub = (division, city, country, countryCode, conference, index, tierIndex, stableCity = city) => {
  const malagasyBrand = countryCode === 'MG';
  const brandFirst = malagasyBrand ? BRAND_FIRST[index % BRAND_FIRST.length] : INTERNATIONAL_BRAND_FIRST[index % INTERNATIONAL_BRAND_FIRST.length];
  const brandSecond = BRAND_SECOND[Math.floor(index / (malagasyBrand ? BRAND_FIRST.length : INTERNATIONAL_BRAND_FIRST.length)) % BRAND_SECOND.length];
  const brand = brandFirst + ' ' + brandSecond;
  const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const id = 'p27-' + division.toLowerCase() + '-' + slug(stableCity) + '-' + String(index + 1).padStart(3,'0');
  const baseline = ({D1:75,D2:68,D3:61.5,D4:55.5,D5:49})[division];
  const range = ({D1:[70,82],D2:[63,76],D3:[57,71],D4:[50,64],D5:[43,58]})[division];
  const rating = Math.max(range[0],Math.min(range[1],Math.round(baseline + OFFSETS[(index + tierIndex * 3) % OFFSETS.length])));
  const palette = PALETTE[Math.floor(index / KIT_DESIGNS.length) % PALETTE.length];
  const kitDesign = KIT_DESIGNS[index % KIT_DESIGNS.length];
  const systemOnly = division === 'D4' ? index % 8 === 0 : (index + tierIndex) % 9 === 0;
  const initialRosterSize = division === 'D1' ? 10 + (index % 3) : division === 'D2' ? 9 + (index % 3) : division === 'D3' ? 9 + (index % 3) : 8 + (index % 3);
  const budgetBase = ({D1:3600000,D2:1900000,D3:950000,D4:480000,D5:240000})[division];
  return {
    id, name: makeClubName(brand,countryCode,index), city, location:{city,country,countryCode}, country, countryCode,
    division, ...(conference ? {conference} : {}),
    rating, control:systemOnly ? 'ai' : 'open', humanAdmission:systemOnly ? 'system-only' : 'open',
    colors:palette, kitDesign, stadium:brand + ' ' + STADIUM_SUFFIXES[index % STADIUM_SUFFIXES.length], reputation:Math.max(28,Math.min(94,Math.round(rating + 7 + OFFSETS[(index+4)%OFFSETS.length]))),
    budget:Math.round(budgetBase * (0.78 + ((index*7)%9)*0.075)), capacity:12, initialRosterSize
  };
};
const clubs = [];
let index = 0;
for (const [division, start, count] of [['D1',0,12],['D2',12,16],['D3',28,20]]) {
  for (let i=0;i<count;i++) {
    const [city,country,code] = WORLD_CLUB_CITIES[start+i];
    clubs.push(makeClub(division,city,country,code,null,index++,division.charCodeAt(1)));
  }
}
let foreignLocationIndex = 0;
for (const conference of ['A','B']) {
  for (let cityIndex = 0; cityIndex < D4_CITIES[conference].length; cityIndex++) {
    const originalCity = D4_CITIES[conference][cityIndex];
    const isMalagasy = cityIndex < 8;
    const [city,country,code] = isMalagasy ? [originalCity,'Madagascar','MG'] : REGIONAL_FOREIGN_LOCATIONS[foreignLocationIndex++];
    clubs.push(makeClub('D4',city,country,code,conference,index++,conference==='A'?4:5,originalCity));
  }
}
for (const conference of ['A','B','C','D']) {
  const malagasyLimit = conference === 'D' ? 5 : 6;
  for (let cityIndex = 0; cityIndex < D5_CITIES[conference].length; cityIndex++) {
    const originalCity = D5_CITIES[conference][cityIndex];
    const isMalagasy = cityIndex < malagasyLimit;
    const [city,country,code] = isMalagasy ? [originalCity,'Madagascar','MG'] : REGIONAL_FOREIGN_LOCATIONS[foreignLocationIndex++];
    clubs.push(makeClub('D5',city,country,code,conference,index++,({A:6,B:7,C:8,D:9})[conference],originalCity));
  }
}
export const P27_EXPANSION_CLUBS = Object.freeze(clubs.map(club => Object.freeze(club)));
export const P27_EXPANSION_COUNTS = Object.freeze({
  total:P27_EXPANSION_CLUBS.length,
  D1:P27_EXPANSION_CLUBS.filter(club=>club.division==='D1').length,
  D2:P27_EXPANSION_CLUBS.filter(club=>club.division==='D2').length,
  D3:P27_EXPANSION_CLUBS.filter(club=>club.division==='D3').length,
  D4:P27_EXPANSION_CLUBS.filter(club=>club.division==='D4').length,
  D5:P27_EXPANSION_CLUBS.filter(club=>club.division==='D5').length,
  Malagasy:P27_EXPANSION_CLUBS.filter(club=>club.countryCode==='MG').length,
  international:P27_EXPANSION_CLUBS.filter(club=>club.countryCode!=='MG').length
});
