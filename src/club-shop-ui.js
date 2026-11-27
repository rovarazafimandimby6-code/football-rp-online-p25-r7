const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number(value || 0).toLocaleString('fr-FR');
const categories = {
  identity:'IDENTITÉ DU CLUB', kits:'MAILLOTS', stadium:'STADE & PELOUSE',
  capacity:'EXTENSIONS', supporters:'SUPPORTERS'
};
const rarities = {standard:'STANDARD',rare:'RARE',premium:'PREMIUM'};
const messages = {
  NOT_AUTHENTICATED:'Connectez votre compte joueur pour gérer la boutique du club.',
  SESSION_EXPIRED:'Votre session a expiré. Reconnectez votre compte.',
  CLUB_OWNER_REQUIRED:'Seul le propriétaire actuel du club peut effectuer cette opération.',
  INSUFFICIENT_CLUB_FUNDS:'La trésorerie du club est insuffisante.',
  'already-owned':'Cet article est déjà possédé par le club.',
  'item-not-owned':'Cet article ne se trouve pas dans l’inventaire du club.',
  'item-active':'Retirez cet élément avant de le revendre.',
  'item-not-resellable':'Cette amélioration ne peut pas être revendue.',
  'stadium-upgrade-order':'Achetez les niveaux d’extension dans l’ordre.'
};
function renderArt(category, itemId) {
  const glyph = category === 'kits' ? '▤' : category === 'identity' ? '◈'
    : category === 'stadium' ? '▥' : category === 'capacity' ? '▦' : '⚑';
  const variant = itemId.includes('premium') ? 'premium' : 'standard';
  return '<div class="p27-shop-item-art p27-club-shop-art '+variant+'"><span>'+glyph+'</span><small>'+escapeHtml(categories[category]||'CLUB')+'</small></div>';
}
export function mountClubShop(root, accountClient, onNavigate) {
  const state = {clubs:[],clubId:'',catalog:[],inventory:[],balance:0,view:'catalog',category:'all',busy:false};
  const status = message => { const node=root.querySelector('#club-shop-status'); if(node) node.textContent=message; };
  const currentClub = () => state.clubs.find(club=>club.id===state.clubId) || null;
  const renderItems = () => {
    const host=root.querySelector('#club-shop-items');
    if(!host)return;
    const owned=new Map(state.inventory.filter(item=>item.status==='owned').map(item=>[item.itemId,item]));
    if(state.view==='inventory'){
      const entries=state.inventory.filter(item=>item.status==='owned');
      host.innerHTML=entries.length?entries.map(entry=>{
        const item=state.catalog.find(value=>value.id===entry.itemId);
        const category=item?.category||entry.category||'identity';
        const equipSlot=item?.equipSlot||entry.equipSlot||null;
        const refund=entry.resellable?Math.floor(Number(entry.paidPrice||0)*Number(entry.resaleRate||0)):0;
        return '<article class="p27-shop-item p27-shop-owned">'+renderArt(category,entry.itemId)+
          '<div class="p27-shop-item-copy"><span class="p27-shop-category">'+(categories[category]||'ARTICLE CLUB')+'</span>'+
          '<h3>'+escapeHtml(item?.name||entry.itemId)+'</h3><p>Acheté : '+money(entry.paidPrice)+' pièces club</p>'+
          (refund>0?'<small class="p27-shop-refund">Revente estimée : '+money(refund)+' pièces</small>':'')+
          '<small>'+(equipSlot?(entry.equipped?'ACTIF':'DANS L’INVENTAIRE'):'AMÉLIORATION PERMANENTE')+'</small></div>'+
          '<div class="p27-shop-item-actions">'+(equipSlot?'<button class="small-action" data-shop-action="equip" data-item="'+escapeHtml(entry.itemId)+'" data-equipped="'+(entry.equipped?'false':'true')+'">'+(entry.equipped?'RETIRER':'APPLIQUER')+'</button>':'')+
          '<button class="text-cta" data-shop-action="resale" data-item="'+escapeHtml(entry.itemId)+'" '+(entry.resellable&&!entry.equipped?'':'disabled')+'>REVENDRE</button></div></article>';
      }).join(''):'<div class="p27-shop-empty"><b>Inventaire du club vide</b><p>Les achats du club apparaîtront ici.</p></div>';
      return;
    }
    const items=state.catalog.filter(item=>state.category==='all'||item.category===state.category);
    host.innerHTML=items.map(item=>{
      const isOwned=owned.has(item.id);
      return '<article class="p27-shop-item '+(isOwned?'is-owned':'')+'">'+renderArt(item.category,item.id)+
        '<div class="p27-shop-item-copy"><span class="p27-shop-category">'+(categories[item.category]||'ARTICLE CLUB')+'</span>'+
        '<h3>'+escapeHtml(item.name)+'</h3><p>'+(item.discountPercent>0?'<del>'+money(item.basePrice)+'</del> ':'')+
        '<strong>'+money(item.price)+' pièces club</strong></p>'+
        (item.discountPercent>0?'<small class="p27-shop-discount">−'+item.discountPercent+' % · '+escapeHtml(item.promotionLabel||'PROMOTION')+'</small>':'')+
        (isOwned?'<small>DÉJÀ POSSÉDÉ</small>':'')+'</div>'+
        '<div class="p27-shop-item-actions"><button class="small-action" data-shop-action="purchase" data-item="'+escapeHtml(item.id)+'" '+(isOwned?'disabled':'')+'>'+(isOwned?'POSSÉDÉ':'ACHETER')+'</button></div></article>';
    }).join('')||'<div class="p27-shop-empty">Aucun article dans cette catégorie.</div>';
  };
  const loadSnapshot = async () => {
    const snapshot=await accountClient.getShopSnapshot('club',state.clubId);
    state.catalog=snapshot.catalog;state.inventory=snapshot.inventory;state.balance=snapshot.balance;
    root.querySelector('#club-shop-balance').textContent=money(state.balance);
    root.querySelector('#club-shop-count').textContent=state.catalog.length+' articles';
    renderItems();
  };
  const refresh = async () => {
    if(!accountClient.hasSession){
      root.querySelector('#club-shop-items').innerHTML='<div class="p27-shop-empty"><b>Compte joueur requis</b><p>Connectez-vous pour accéder aux fonctions de gestion.</p><button class="small-action" data-shop-action="account">GÉRER MON COMPTE</button></div>';
      status('La boutique du club est réservée à son propriétaire connecté.');
      return;
    }
    status('Recherche des clubs dont vous êtes propriétaire…');
    try{
      state.clubs=await accountClient.getOwnedShopClubs();
      if(!root.isConnected)return;
      const select=root.querySelector('#club-shop-select');
      select.innerHTML=state.clubs.map(club=>'<option value="'+escapeHtml(club.id)+'">'+escapeHtml(club.name)+' · '+escapeHtml(club.division||'CLUB')+'</option>').join('');
      if(!state.clubs.length){
        state.clubId='';
        root.querySelector('#club-shop-balance').textContent='—';
        root.querySelector('#club-shop-count').textContent='Aucun club';
        root.querySelector('#club-shop-items').innerHTML='<div class="p27-shop-empty"><b>Aucun club sous votre direction</b><p>La boutique du club est accessible uniquement au propriétaire. Prenez la direction d’un club depuis l’espace Clubs pour débloquer ses achats et sa trésorerie.</p><button class="small-action" data-page="clubs">VOIR LES CLUBS</button></div>';
        status('Aucun club propriétaire associé à votre compte.');
        return;
      }
      if(!state.clubs.some(club=>club.id===state.clubId))state.clubId=state.clubs[0].id;
      select.value=state.clubId;
      await loadSnapshot();
      status('Catalogue, inventaire et trésorerie du club synchronisés.');
    }catch(error){
      status(messages[error.message]||error.message||'Boutique du club indisponible.');
      root.querySelector('#club-shop-items').innerHTML='<div class="p27-shop-empty"><b>Boutique indisponible</b><p>'+escapeHtml(messages[error.message]||error.message)+'</p><button class="small-action" data-shop-action="refresh">RÉESSAYER</button></div>';
    }
  };
  root.innerHTML='<section class="p27-shop-screen p27-club-shop-screen">'+
    '<div class="p27-shop-hero"><div><span class="p27-shop-eyebrow">BOUTIQUE DU CLUB</span><h2>ÉQUIPEZ VOTRE CLUB</h2><p>Achats du propriétaire · trésorerie collective · revente au jeu uniquement</p></div>'+
    '<div class="p27-shop-wallet"><small>TRÉSORERIE DU CLUB</small><strong id="club-shop-balance">—</strong><span>Pièces club</span></div></div>'+
    '<div class="p27-shop-switch"><button class="text-cta" data-page="boutique">← BOUTIQUE PERSONNELLE</button><span>ACHATS RÉSERVÉS AU PROPRIÉTAIRE</span></div>'+
    '<div class="p27-shop-toolbar"><label class="p27-club-shop-select">CLUB <select id="club-shop-select" aria-label="Choisir un club"></select></label>'+
    '<div class="p27-shop-views"><button class="active" data-shop-view="catalog">BOUTIQUE</button><button data-shop-view="inventory">INVENTAIRE</button></div><span id="club-shop-count">Chargement…</span></div>'+
    '<nav class="p27-shop-categories" aria-label="Catégories de la boutique du club"><button class="active" data-shop-category="all">TOUT</button>'+
    Object.entries(categories).map(([key,label])=>'<button data-shop-category="'+key+'">'+label+'</button>').join('')+'</nav>'+
    '<div id="club-shop-items" class="p27-shop-grid"><div class="p27-shop-empty">Chargement…</div></div>'+
    '<p class="p27-shop-status" id="club-shop-status" role="status" aria-live="polite">Connexion à la boutique du club…</p>'+
    '<p class="notice">Les achats et reventes débitent ou créditent uniquement la trésorerie du club. Les extensions de tribunes sont permanentes et non revendables. Aucun échange entre joueurs ou entre clubs.</p></section>';
  root.addEventListener('change',async event=>{
    if(event.target.matches('#club-shop-select')){
      state.clubId=event.target.value;state.view='catalog';state.category='all';
      root.querySelectorAll('[data-shop-view]').forEach(node=>node.classList.toggle('active',node.dataset.shopView==='catalog'));
      root.querySelectorAll('[data-shop-category]').forEach(node=>node.classList.toggle('active',node.dataset.shopCategory==='all'));
      root.querySelector('.p27-shop-categories').classList.remove('is-hidden');
      try{await loadSnapshot();status('Club sélectionné. Trésorerie et inventaire actualisés.');}
      catch(error){status(messages[error.message]||error.message||'Impossible de charger ce club.');}
    }
  });
  root.addEventListener('click',async event=>{
    const page=event.target.closest('[data-page]');
    if(page){event.preventDefault();event.stopPropagation();onNavigate(page.dataset.page);return;}
    const view=event.target.closest('[data-shop-view]');
    if(view){state.view=view.dataset.shopView;root.querySelectorAll('[data-shop-view]').forEach(node=>node.classList.toggle('active',node===view));root.querySelector('.p27-shop-categories').classList.toggle('is-hidden',state.view==='inventory');renderItems();return;}
    const category=event.target.closest('[data-shop-category]');
    if(category){state.category=category.dataset.shopCategory;root.querySelectorAll('[data-shop-category]').forEach(node=>node.classList.toggle('active',node===category));renderItems();return;}
    const button=event.target.closest('[data-shop-action]');
    if(!button||state.busy)return;
    const action=button.dataset.shopAction,itemId=button.dataset.item;
    if(action==='account'){onNavigate('account');return;}
    if(action==='refresh'){await refresh();return;}
    const item=state.catalog.find(value=>value.id===itemId);
    if(action==='purchase'&&(!item||!window.confirm('Acheter « '+item.name+' » pour '+money(item.price)+' pièces de la trésorerie du club ?')))return;
    if(action==='resale'){
      const owned=state.inventory.find(entry=>entry.itemId===itemId&&entry.status==='owned');
      const estimate=owned?Math.floor(Number(owned.paidPrice||0)*Number(owned.resaleRate||0)):0;
      if(!owned||!owned.resellable||estimate<1||!window.confirm('Revendre cet article au jeu pour '+money(estimate)+' pièces club ?\nLe montant définitif est recalculé par le serveur sur le prix réellement payé.'))return;
    }
    state.busy=true;button.disabled=true;status('Transaction sécurisée en cours…');
    try{
      if(action==='purchase')await accountClient.purchaseShopItem('club',itemId,'p27-club-buy-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12),state.clubId);
      else if(action==='resale')await accountClient.resellShopItem('club',itemId,'p27-club-sell-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12),state.clubId);
      else if(action==='equip')await accountClient.equipShopItem('club',itemId,button.dataset.equipped==='true',state.clubId);
      await refresh();
      status(action==='purchase'?'Achat confirmé. Article ajouté à l’inventaire du club.':action==='resale'?'Revente confirmée. Pièces créditées à la trésorerie du club.':'Équipement du club mis à jour.');
    }catch(error){status(messages[error.message]||error.message||'Transaction refusée.');}
    finally{state.busy=false;renderItems();}
  });
  void refresh();
}
