# P27 — Boutique des clubs : propriété et transactions

## État fonctionnel

La boutique des clubs est opérationnelle sur le serveur principal. Elle est distincte de la boutique personnelle et repose sur trois identifiants différents :

- **Compte authentifié** : l'identité résolue depuis la session serveur.
- **Club** : la clé de propriété de l'inventaire et du compte financier.
- **Propriétaire actuel** : le `managerId` du club dans `serverClubManager`.

Le client peut transmettre un `clubId`, mais il ne choisit jamais son identité d'acteur ni son rôle. Les routes relisent le propriétaire actuel depuis le gestionnaire serveur avant d'afficher l'inventaire ou d'exécuter une action.

## Parcours et règles

1. **Lister les clubs** — `GET /api/shop/clubs` ne retourne que les clubs dont le `managerId` correspond au compte connecté.
2. **Consulter la boutique** — `GET /api/shop?shop=club&clubId=...` vérifie à nouveau cette correspondance avant de retourner le solde, le catalogue et l'inventaire.
3. **Acheter** — `POST /api/shop/purchase` débite le compte financier du club et attribue l'article à l'identifiant du club.
4. **Équiper** — `POST /api/shop/equip` exige la propriété actuelle et un article détenu.
5. **Revendre** — `POST /api/shop/resale` crédite la trésorerie du club ; l'article doit être détenu, non équipé et revendable.
6. **Historique** — `GET /api/shop/history?shop=club&clubId=...` est protégé par le même contrôle de propriété.

Les identifiants de transaction sont contrôlés et les journaux de boutique et de finance utilisent des références déterministes pour permettre la reprise idempotente après une interruption. Les achats et reventes ne peuvent donc pas être rejoués pour déplacer une somme ou créer un second article.

## Changement de propriétaire

L'inventaire et le compte financier sont rattachés au club, jamais au compte personnel du gestionnaire. Quand le `managerId` change :

- l'ancien propriétaire perd immédiatement l'accès à la consultation, l'achat, l'équipement et la revente ;
- le nouveau propriétaire accède au même inventaire et au même solde collectif ;
- les articles déjà achetés et les extensions du stade restent attachés au club ;
- aucun transfert d'article vers l'inventaire personnel n'est effectué.

Le contrôle est effectué à chaque requête, pas uniquement lors de l'ouverture de la boutique.

## Séparation des monnaies

- Boutique personnelle : pièces du joueur, progression personnelle et inventaire du compte.
- Boutique du club : trésorerie collective, journal financier du club et inventaire du club.

Un achat ou une revente du club ne modifie pas le solde personnel. Le test HTTP vérifie maintenant ce point sur un parcours complet.

## Revente et restrictions

- Cosmétiques de club revendables : retour de **50 % du prix réellement payé**.
- Article actuellement équipé : revente refusée jusqu'à son retrait.
- Extension de capacité du stade : **jamais revendable**.
- Aucun marché entre joueurs ni vente entre clubs : les reventes passent uniquement par le rachat de la boutique du jeu.

## Extensions du stade

La capacité est indépendante de la taille de l'effectif :

| Niveau | Capacité |
|---|---:|
| Base | 5 000 |
| 1 | 7 500 |
| 2 | 10 000 |
| 3 | 12 500 |
| 4 | 15 000 |

Les extensions sont achetées dans l'ordre et restent des actifs permanents du club. La capacité est recalculée côté serveur depuis les niveaux possédés ; elle ne peut pas être imposée par le client.

Voir aussi [P27-STADIUM-CAPACITY.md](P27-STADIUM-CAPACITY.md).

## Frontière de stockage : serveur principal et D1

La boutique personnelle est déjà raccordée à D1. La boutique des clubs reste volontairement sur le serveur principal parce que les deux autorités indispensables — propriété canonique des clubs et trésorerie/journal financier — y sont encore gérées.

Le Worker Cloudflare refuse donc les opérations de boutique `club` au lieu d'accepter une identité ou un solde fourni par le client. Cette séparation est intentionnelle et évite deux écritures concurrentes ou une trésorerie déconnectée de la propriété réelle.

### Conditions obligatoires avant migration de la boutique des clubs vers D1

- Migrer la propriété canonique du club avec une référence au compte authentifié D1.
- Migrer les soldes d'ouverture et l'intégralité du journal financier, avec contrôle de réconciliation.
- Garantir que le transfert de propriété et les autorisations de gestion utilisent la même source de vérité.
- Exécuter débit/crédit, journal de transaction et mutation d'inventaire dans une transaction D1 atomique.
- Prévoir une reprise idempotente et une bascule à écrivain unique ; ne jamais laisser le serveur principal et le Worker modifier simultanément la même trésorerie.

Tant que ces conditions ne sont pas réunies, le stockage serveur principal demeure l'autorité pour la boutique des clubs. Ce n'est pas une fonctionnalité de boutique manquante : c'est une limite de déploiement explicite à respecter jusqu'à la migration complète de la propriété et des finances.

## Vérification automatisée

`tests/p27-shop-clubs-route.test.mjs` couvre maintenant les routes authentifiées de bout en bout : achat avec débit de trésorerie, absence de débit des pièces personnelles, transfert de propriété, accès du nouveau propriétaire à l'inventaire existant, refus d'accès de l'ancien propriétaire et revente avec crédit du bon compte collectif.
