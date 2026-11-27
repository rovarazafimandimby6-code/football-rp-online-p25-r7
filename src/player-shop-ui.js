const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number(value || 0).toLocaleString('fr-FR');
const categories = {
  crampons:['CRAMPONS','⚽'], accessories:['ACCESSOIRES','✦'], hair:['COIFFURES','✂'],
  beard:['BARBES','▰'], celebrations:['CÉLÉBRATIONS','★'],
  'profile-frames':['CADRES DE PROFIL','▣'], 'profile-backgrounds':['FONDS DE PROFIL','◈']
};
const rarities = {standard:'STANDARD',rare:'RARE',premium:'PREMIUM'};
function renderItemArt(category, rarity='standard') { const color=({standard:'#aeb9c8',rare:'#63b7ff',premium:'#d8ad55'})[rarity]||'#aeb9c8'; const shapes={crampons:'<path d="M18 44L34 14l15 4 2 17 12 9-5 8H23z"/>',accessories:'<path d="M18 30Q40 8 62 30v15H18z"/>',hair:'<path d="M19 49V31Q19 11 40 11t21 20v18l-9-8-2-12-10 5-13-4z"/>',beard:'<path d="M22 18Q40 6 58 18l-3 25-15 13-15-13z"/>',celebrations:'<path d="M40 12l6 18 18-7-12 15 15 8-20-1-7 18-6-18-19 1 15-9-11-14 17 7z"/>','profile-frames':'<rect x="18" y="11" width="44" height="52" rx="9" fill="none" stroke="currentColor" stroke-width="7"/><circle cx="40" cy="31" r="9"/>','profile-backgrounds':'<rect x="13" y="12" width="54" height="50" rx="8"/><path d="M13 46l18-17 10 9 9-12 17 20v16H13z"/>'}; return '<svg class="p27-shop-art-svg" viewBox="0 0 80 76" aria-hidden="true"><g fill="'+color+'" stroke="#f4f7fb" stroke-width="1.5">'+(shapes[category]||'<circle cx="40" cy="37" r="19"/>')+'</g></svg>'; }

const messages = {
  NOT_AUTHENTICATED:'Connectez votre compte joueur pour accéder à la boutique en ligne.',
  SESSION_EXPIRED:'Votre session a expiré. Reconnectez votre compte joueur.',
  INSUFFICIENT_COINS:'Vous ne possédez pas assez de pièces.',
  'already-owned':'Cet article est déjà dans votre inventaire.',
  'item-not-owned':'Cet article ne se trouve pas dans votre inventaire.',
  'item-active':'Retirez cet article avant de le revendre.',
  'item-not-resellable':'Cet article ne peut pas être revendu.',
  'resale-value-zero':'La valeur de revente est trop faible.'
};
function syncEquippedCosmetics(inventory) { const equipped={}; for (const entry of inventory.filter(item=>item.status==='owned'&&item.equipped)) { if (entry.category==='hair') equipped.hair=entry.itemId; } try { globalThis.localStorage?.setItem('fpro.player-shop-equipped.v1',JSON.stringify(equipped)); } catch {} }
export function mountPlayerShop(root, accountClient, onNavigate) {
  const state = {catalog:[],inventory:[],balance:0,view:'catalog',category:'all',busy:false};
  const status = message => { const node=root.querySelector('#player-shop-status'); if(node) node.textContent=message; };
  const renderItems = () => {
    const host=root.querySelector('#player-shop-items');
    if(!host)return;
    const owned=new Map(state.inventory.filter(item=>item.status==='owned').map(item=>[item.itemId,item]));
    if(state.view==='inventory'){
      const entries=state.inventory.filter(item=>item.status==='owned');
      host.innerHTML=entries.length?entries.map(entry=>{
        const item=state.catalog.find(value=>value.id===entry.itemId);
        const category=item?.category||entry.category||'accessories';
        const [label,icon]=categories[category]||['ARTICLE','✦'];
        return `<article class="p27-shop-item p27-shop-owned">
          <div class="p27-shop-item-art">${renderItemArt(category,entry.rarity)}<small>${rarities[entry.rarity]||'STANDARD'}</small></div>
          <div class="p27-shop-item-copy"><span class="p27-shop-category">${label}</span><h3>${escapeHtml(item?.name||entry.itemId)}</h3><p>Acheté : ${money(entry.paidPrice)} pièces</p>${entry.resellable?'<small class="p27-shop-refund">Revente estimée : '+money(Math.floor(Number(entry.paidPrice||0)*Number(entry.resaleRate||0)))+' pièces</small>':''}<small>${entry.equipped?'ÉQUIPÉ':'DANS L’INVENTAIRE'}</small></div>
          <div class="p27-shop-item-actions"><button class="small-action" data-shop-action="equip" data-item="${escapeHtml(entry.itemId)}" data-equipped="${entry.equipped?'false':'true'}">${entry.equipped?'RETIRER':'ÉQUIPER'}</button><button class="text-cta" data-shop-action="resale" data-item="${escapeHtml(entry.itemId)}" ${entry.resellable&&!entry.equipped?'':'disabled'}>REVENDRE</button></div>
        </article>`;
      }).join(''):'<div class="p27-shop-empty"><b>Votre inventaire est vide</b><p>Vos achats apparaîtront ici.</p></div>';
      return;
    }
    const items=state.catalog.filter(item=>state.category==='all'||item.category===state.category);
    host.innerHTML=items.map(item=>{
      const [label,icon]=categories[item.category]||['ARTICLE','✦'];
      const isOwned=owned.has(item.id);
      return `<article class="p27-shop-item ${isOwned?'is-owned':''}">
        <div class="p27-shop-item-art">${renderItemArt(item.category,item.rarity)}<small>${rarities[item.rarity]||'STANDARD'}</small></div>
        <div class="p27-shop-item-copy"><span class="p27-shop-category">${label}</span><h3>${escapeHtml(item.name)}</h3>
          <p>${item.discountPercent>0?'<del>'+money(item.basePrice)+'</del> ':''}<strong>${money(item.price)} pièces</strong></p>
          ${item.discountPercent>0?'<small class="p27-shop-discount">−'+item.discountPercent+' % · '+escapeHtml(item.promotionLabel||'PROMOTION')+'</small>':''}
          ${isOwned?'<small>DÉJÀ POSSÉDÉ</small>':''}
        </div><div class="p27-shop-item-actions"><button class="small-action" data-shop-action="purchase" data-item="${escapeHtml(item.id)}" ${isOwned?'disabled':''}>${isOwned?'POSSÉDÉ':'ACHETER'}</button></div>
      </article>`;
    }).join('')||'<div class="p27-shop-empty">Aucun article dans cette catégorie.</div>';
  };
  const refresh = async () => {
    if(!accountClient.hasSession){
      status('Compte joueur requis. Votre carrière locale reste accessible, mais la boutique nécessite une session sécurisée.');
      root.querySelector('#player-shop-items').innerHTML='<div class="p27-shop-empty"><b>Connectez votre compte joueur</b><p>La boutique utilise le portefeuille serveur et protège les transactions.</p><button class="small-action" data-shop-action="account">GÉRER MON COMPTE</button></div>';
      root.querySelector('#player-shop-count').textContent='Session requise';
      return;
    }
    status('Chargement du catalogue et du portefeuille…');
    try{
      const [catalog,inventory,progression]=await Promise.all([
        accountClient.getPlayerShopCatalog(),accountClient.getPlayerShopInventory(),accountClient.getProgression()
      ]);
      if(!root.isConnected)return;
      state.catalog=catalog;state.inventory=inventory;syncEquippedCosmetics(inventory);state.balance=progression.progression.coins;
      root.querySelector('#player-shop-balance').textContent=money(state.balance);
      root.querySelector('#player-shop-count').textContent=catalog.length+' articles';
      renderItems();status('Catalogue, inventaire et solde synchronisés avec le serveur.');
    }catch(error){
      status(messages[error.message]||error.message||'Boutique indisponible.');
      root.querySelector('#player-shop-items').innerHTML='<div class="p27-shop-empty"><b>Boutique indisponible</b><p>'+escapeHtml(messages[error.message]||error.message)+'</p><button class="small-action" data-shop-action="refresh">RÉESSAYER</button><button class="text-cta" data-shop-action="account">COMPTE JOUEUR</button></div>';
    }
  };
  root.innerHTML=`<section class="p27-shop-screen">
    <div class="p27-shop-hero"><div><span class="p27-shop-eyebrow">BOUTIQUE PERSONNELLE</span><h2>ÉQUIPEZ VOTRE JOUEUR</h2><p>Articles permanents · achats sécurisés · revente au jeu uniquement</p></div><div class="p27-shop-wallet"><small>VOS PIÈCES</small><strong id="player-shop-balance">—</strong><span>Solde serveur</span></div></div>
    <div class="p27-shop-toolbar"><div class="p27-shop-views"><button class="active" data-shop-view="catalog">BOUTIQUE</button><button data-shop-view="inventory">MON INVENTAIRE</button></div><span id="player-shop-count">Chargement…</span></div>
    <nav class="p27-shop-categories" aria-label="Catégories de la boutique"><button class="active" data-shop-category="all">TOUT</button>${Object.entries(categories).map(([key,value])=>'<button data-shop-category="'+key+'">'+value[0]+'</button>').join('')}</nav>
    <div id="player-shop-items" class="p27-shop-grid"><div class="p27-shop-empty">Chargement…</div></div>
    <p class="p27-shop-status" id="player-shop-status" role="status" aria-live="polite">Connexion au catalogue sécurisé…</p>
    <p class="notice">La revente crédite uniquement votre portefeuille de joueur. Aucun échange entre joueurs ni vente entre clubs. Les prix et remboursements sont contrôlés par le serveur.</p>
  </section>`;
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
    if(action==='purchase'&&(!item||!window.confirm('Acheter « '+item.name+' » pour '+money(item.price)+' pièces ?')))return;
    if(action==='resale'){const owned=state.inventory.find(entry=>entry.itemId===itemId&&entry.status==='owned');const estimate=owned?Math.floor(Number(owned.paidPrice||0)*Number(owned.resaleRate||0)):0;if(!owned||!owned.resellable||estimate<1||!window.confirm('Revendre cet article au jeu pour '+money(estimate)+' pièces ?\nLe montant définitif est recalculé par le serveur sur le prix réellement payé.'))return;}
    state.busy=true;button.disabled=true;status('Transaction sécurisée en cours…');
    try{
      if(action==='purchase')await accountClient.purchasePlayerShopItem(itemId,'p27-buy-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12));
      else if(action==='resale')await accountClient.resellPlayerShopItem(itemId,'p27-sell-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12));
      else if(action==='equip')await accountClient.equipPlayerShopItem(itemId,button.dataset.equipped==='true');
      const [inventory,progression]=await Promise.all([accountClient.getPlayerShopInventory(),accountClient.getProgression()]);
      state.inventory=inventory;syncEquippedCosmetics(inventory);state.balance=progression.progression.coins;
      root.querySelector('#player-shop-balance').textContent=money(state.balance);
      renderItems();
      status(action==='purchase'?'Achat confirmé. Article ajouté à votre inventaire.':action==='resale'?'Revente confirmée. Pièces créditées sur votre compte.':'Équipement mis à jour.');
    }catch(error){status(messages[error.message]||error.message||'Transaction refusée.');}
    finally{state.busy=false;root.querySelectorAll('button').forEach(node=>{if(node.dataset.shopAction==='purchase'||node.dataset.shopAction==='resale'||node.dataset.shopAction==='equip')node.disabled=false;});renderItems();}
  });
  void refresh();
}
