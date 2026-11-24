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
  C: [
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
  Sud: [
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
const PALETTE = [
  ['#1f6f78','#123c50','#e8c66a'],['#7b3f8c','#39204d','#f1d5a5'],['#b54b3a','#632b2a','#f2d58a'],
  ['#34764d','#194a38','#e6d58b'],['#345c9c','#1d315f','#e4c76b'],['#9a642e','#57391e','#f0d9a2'],
  ['#397f8b','#174650','#e7d59b'],['#86524b','#4b292d','#e8c7a0'],['#6b6a36','#34351f','#e8d58d'],
  ['#5c5b9b','#302b5b','#e9d79a']
];
const KIT_DESIGNS = ['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels'];
const OFFSETS = [-4,-2,-1,0,1,2,3,4,0,1,-1,2,3,-3,1,0];
const makeClub = (division, city, country, countryCode, conference, index, tierIndex) => {
  const brand = BRAND_FIRST[index % BRAND_FIRST.length] + ' ' + BRAND_SECOND[Math.floor(index / BRAND_FIRST.length) % BRAND_SECOND.length];
  const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const id = 'p27-' + division.toLowerCase() + '-' + slug(city) + '-' + String(index + 1).padStart(3,'0');
  const baseline = ({D1:75,D2:68,D3:61.5,D4:55.5,D5:49})[division];
  const range = ({D1:[70,82],D2:[63,76],D3:[57,71],D4:[50,64],D5:[43,58]})[division];
  const rating = Math.max(range[0],Math.min(range[1],Math.round(baseline + OFFSETS[(index + tierIndex * 3) % OFFSETS.length])));
  const palette = PALETTE[Math.floor(index / KIT_DESIGNS.length) % PALETTE.length];
  const kitDesign = KIT_DESIGNS[index % KIT_DESIGNS.length];
  const systemOnly = division === 'D4' ? index % 8 === 0 : (index + tierIndex) % 9 === 0;
  const initialRosterSize = division === 'D1' ? 10 + (index % 3) : division === 'D2' ? 9 + (index % 3) : division === 'D3' ? 9 + (index % 3) : 8 + (index % 3);
  const budgetBase = ({D1:3600000,D2:1900000,D3:950000,D4:480000,D5:240000})[division];
  return {
    id, name: brand + ' FC', city, location:{city,country,countryCode}, country, countryCode,
    division, ...(conference ? {conference} : {}),
    rating, control:systemOnly ? 'ai' : 'open', humanAdmission:systemOnly ? 'system-only' : 'open',
    colors:palette, kitDesign, stadium:brand + ' Arena', reputation:Math.max(28,Math.min(94,Math.round(rating + 7 + OFFSETS[(index+4)%OFFSETS.length]))),
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
for (const conference of ['A','B']) {
  for (const city of D4_CITIES[conference]) clubs.push(makeClub('D4',city,'Madagascar','MG',conference,index++,conference==='A'?4:5));
}
for (const conference of ['A','B','C','D']) {
  for (const city of D5_CITIES[conference]) clubs.push(makeClub('D5',city,'Madagascar','MG',conference,index++,({A:6,B:7,C:8,D:9})[conference]));
}
export const P27_EXPANSION_CLUBS = Object.freeze(clubs.map(club => Object.freeze(club)));
export const P27_EXPANSION_COUNTS = Object.freeze({
  total:P27_EXPANSION_CLUBS.length,
  D1:P27_EXPANSION_CLUBS.filter(club=>club.division==='D1').length,
  D2:P27_EXPANSION_CLUBS.filter(club=>club.division==='D2').length,
  D3:P27_EXPANSION_CLUBS.filter(club=>club.division==='D3').length,
  D4:P27_EXPANSION_CLUBS.filter(club=>club.division==='D4').length,
  D5:P27_EXPANSION_CLUBS.filter(club=>club.division==='D5').length
});
