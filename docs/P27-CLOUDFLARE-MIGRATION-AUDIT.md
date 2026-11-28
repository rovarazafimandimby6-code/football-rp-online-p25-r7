# P27 — audit initial et plan de migration Cloudflare

**Date :** 25 novembre 2026  
**Branche auditée :** `p27-dev`  
**HEAD vérifié avant audit :** `29be2f5d667930de23f21ebd6af41b922452f1b9`  
**Statut :** audit initial terminé ; aucune migration ni aucun déploiement exécuté.

## 1. Objectif

Préparer une migration progressive du backend P27 vers une infrastructure Cloudflare pouvant commencer sur les offres gratuites, sans rendre le jeu dépendant irréversiblement d'un fournisseur.

Exigences produit à préserver :

- profil et carrière locaux utilisables immédiatement, y compris hors ligne ;
- association Google facultative, qui rattache la carrière existante sans recommencer ;
- synchronisation cloud contrôlée, avec révisions, outbox locale et protection contre les écrasements ;
- comptes, profils, progression, contrats, transferts, clubs, finances et compétitions persistants ;
- matchs 5v5 autoritaires côté serveur, reconnexion et contrôle IA temporaire d'un joueur déconnecté ;
- sauvegardes restaurables et exportables ;
- aucun secret OAuth ou jeton d'administration dans le dépôt.

## 2. État réel du backend actuel

Le backend est un serveur Node.js classique démarré par `npm start` (`node server/index.js`). Le dépôt est en ESM et le script de test est `node --test`.

### 2.1 Stockages persistants actuels

Le serveur instancie plusieurs stores JSON fondés sur le système de fichiers :

- comptes et sessions ;
- identités de joueurs et association Google OIDC ;
- transactions OIDC à durée limitée ;
- profils, carrières et progression ;
- compétitions, calendrier et archives ;
- contrats, prêts, offres et transferts ;
- effectifs et affectations des clubs ;
- finances des clubs et journal comptable ;
- transferts des joueurs du système ;
- résultats terminés et checkpoints des salons.

Plusieurs stores utilisent des écritures atomiques par fichier temporaire puis renommage. Les services métiers sont actuellement synchrones et lisent souvent un état complet en mémoire.

### 2.2 Cycle des matchs

`RoomManager` contient la logique autoritaire de simulation 5v5, l'IA, les actions des joueurs, la reconnexion, les remplacements, les résultats et la progression.

Le serveur appelle actuellement `manager.tick(0.05)` avec un `setInterval` de 50 ms. Les salons actifs sont checkpointés environ toutes les secondes. Les clients utilisent des routes HTTP de création, entrée, input, heartbeat, reconnexion, sortie et lecture d'état/delta. L'état est donc actuellement distribué par polling HTTP, pas par WebSocket.

Les routes d'entrée de match permettent aussi une entrée sans compte ; ne pas rendre Google obligatoire pendant la migration.

### 2.3 Cycle de vie et tâches périodiques

Le processus Node démarre également des tâches périodiques pour les sauvegardes, la reprise des synchronisations d'effectifs, les affectations de clubs et le monde économique. Ces tâches ne peuvent pas être supposées fonctionner en continu dans un Worker éphémère.

### 2.4 Tests existants

Le dépôt possède une suite Node.js importante couvrant notamment les comptes, OIDC, récupération, sauvegardes, progression, carrières, compétitions, transferts, finances, intégrité du monde, salons, simulation, rotation et reconnexion.

Le workflow `.github/workflows/p27-validation.yml` exécute actuellement :

1. `npm test` ;
2. `npm run preflight` ;
3. `node --check` sur les fichiers JavaScript de `src`, `server` et `tests`.

Cette suite doit rester verte pendant la migration. Elle devra être complétée par des tests exécutés dans le runtime Workers et contre D1/SQLite local.

## 3. Compatibilité Cloudflare : points vérifiés

Cloudflare fournit désormais une compatibilité Node.js étendue. `node:http` peut être intégré avec `httpServerHandler` de `cloudflare:node`. Il n'est donc pas exact de dire que tout le code HTTP Node est automatiquement incompatible.

En revanche, la compatibilité Node ne rend pas le système de fichiers persistant : `node:fs` dans Workers utilise un système de fichiers virtuel temporaire en mémoire. Les données de comptes et de carrière ne doivent jamais dépendre de ce stockage.

Le serveur actuel devra donc être séparé en :
- adaptateur HTTP/runtime ;
- services métiers ;
- interfaces de persistance asynchrones ;
- services temps réel et cycle de vie spécifiques à l'environnement.

Un Worker ne doit pas compter sur le processus global et ses intervalles pour assurer une simulation permanente. Les salons et leurs connexions doivent être gérés par des Durable Objects, avec une boucle de simulation adaptée aux événements et aux connexions actives.

Références officielles :
- Node.js compatibility : https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Node HTTP server integration : https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- Node fs virtual filesystem : https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/

## 4. Architecture cible proposée

### Workers — API et orchestration

- point d'entrée HTTP du backend ;
- authentification, sessions, limites de requêtes et validation ;
- routes de compte, profil, progression, carrière, club et compétition ;
- coordination des opérations de sauvegarde et de synchronisation ;
- accès à D1 via binding, jamais via fichiers locaux.

### D1 — données persistantes du monde

D1 stockera les données relationnelles durables : comptes, identités, liens Google, profils, progression, carrières, contrats, transferts, clubs, compétitions, résultats et journaux nécessaires à l'intégrité.

Les tables devront avoir des clés et contraintes explicites, index, horodatages, révisions et identifiants d'opération idempotents. Les opérations liées devront être atomiques autant que possible. Les services actuels synchrones devront devenir asynchrones ; il ne faut pas masquer cette différence derrière des appels synchrones artificiels.

Ne pas stocker une base métier entière dans une seule ligne JSON. Décomposer les données par agrégat et entité, et garder les gros historiques paginés.

### Durable Objects — salons et matchs

- un objet durable par salon/match ;
- état vivant du match et séquence d'événements ;
- WebSockets pour pousser les mises à jour et recevoir les inputs ;
- validation serveur des inputs et des résultats ;
- reprise/reconnexion et contrôle IA en cas de déconnexion ;
- persistance des checkpoints et état final, avec écriture du résultat officiel dans D1.

La simulation actuelle à 20 ticks/s est une exigence de performance à mesurer, pas une fréquence garantie sur le plan gratuit. Il faut comparer une simulation temporelle à pas fixe déclenchée par les événements/connexions actives et une stratégie de diffusion moins fréquente que le tick interne. Ne jamais ralentir la simulation de façon silencieuse sans test de gameplay.

### WebRTC

WebRTC reste facultatif et expérimental. Il ne sera pas l'autorité du match et ne pourra pas certifier seul un score. Les connexions P2P peuvent échouer selon les réseaux mobiles et nécessiter un relais TURN. Le MVP doit pouvoir fonctionner avec les WebSockets et Durable Objects seuls ; aucun coût TURN ne doit être introduit sans décision explicite.

## 5. Quotas gratuits à prendre en compte

Les limites publiées sont des plafonds, pas une promesse de capacité pour un nombre donné de joueurs :

- D1 Free : 500 Mo maximum par base, 5 Go de stockage cumulé par compte, 5 millions de lignes lues/jour, 100 000 lignes écrites/jour et 7 jours de Time Travel. Une invocation Worker Free est limitée à 50 sous-requêtes de lecture D1.
- Durable Objects SQLite sur Workers Free : 5 Go de stockage cumulé, 100 000 requêtes/jour et 13 000 GB-secondes/jour ; les messages WebSocket entrants ont une règle de comptabilisation spécifique.
- En cas de dépassement des limites gratuites, les opérations concernées échouent jusqu'à la réinitialisation du quota ; elles ne doivent pas être considérées comme une sauvegarde réussie.

Sources officielles :
- D1 limits : https://developers.cloudflare.com/d1/platform/limits/
- D1 FAQ : https://developers.cloudflare.com/d1/reference/faq/
- Durable Objects limits : https://developers.cloudflare.com/durable-objects/platform/limits/
- Durable Objects pricing : https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects WebSockets : https://developers.cloudflare.com/durable-objects/best-practices/websockets/

Aucune garantie de gratuité pendant 5 à 10 ans ne peut être donnée : les offres, les quotas et les conditions peuvent changer. L'architecture doit donc rester portable et les quotas doivent être mesurés en charge réelle.

## 6. Plan de migration par étapes

### Étape A — Contrats et tests de référence
- inventorier les méthodes et invariants de chaque store ;
- documenter les contrats des routes API existantes ;
- conserver le serveur Node comme référence locale ;
- définir des jeux de données de test anonymisés et des résultats attendus.

### Étape B — Socle Workers non destructif
- ajouter une entrée Worker distincte ;
- ajouter la configuration Wrangler avec bindings déclaratifs et identifiants locaux/placeholder uniquement ;
- exposer health/readiness et quelques routes publiques sans déplacer les données réelles ;
- tester dans le runtime Workers local.

### Étape C — D1 et identité
- écrire les migrations SQL versionnées ;
- créer les repositories asynchrones et contraintes d'unicité ;
- migrer comptes, sessions, identités locales et liaisons Google ;
- tester l'idempotence, les collisions, les sessions et les récupérations.

### Étape D — Carrière et monde persistant
- migrer profils, progression, carrières, contrats, transferts, effectifs, finances, compétitions et résultats ;
- ajouter versions, transactions, outbox et contrôle de concurrence ;
- créer un import/export vérifié avec comparaison de volumes et empreintes ;
- tester les restaurations et les conflits local/cloud.

### Étape E — Matchs temps réel
- extraire la simulation du cycle de vie Node ;
- créer le Durable Object de salon ;
- remplacer le polling par WebSockets progressivement, avec compatibilité temporaire des routes HTTP si utile ;
- tester 10 humains, bots de complément, latence, perte réseau, reconnexion, redémarrage, résultats et anti-triche ;
- mesurer le coût réel en requêtes, GB-secondes et stockage.

### Étape F — Bascule contrôlée
- tests de parité entre serveur Node et Worker ;
- import à blanc, sauvegarde préalable et procédure de rollback ;
- tests Android réels et tests de charge ;
- déploiement uniquement après validation explicite du propriétaire.

## 7. Conditions de sécurité et de livraison

- Développement exclusivement sur `p27-dev` ; ne jamais modifier `main`.
- Ne pas supprimer `render.yaml` ou le serveur Node tant que la migration n'a pas passé les tests de parité et de restauration.
- Ne pas créer de base ou de service Cloudflare dans le compte du propriétaire sans son action/accord.
- Ne jamais versionner les secrets, tokens, IDs de compte ou données réelles des joueurs.
- Chaque migration doit être réversible ou accompagnée d'un export vérifié.
- Vérifier la branche HEAD avant chaque commit ; créer le commit avec ce HEAD comme parent ; mettre à jour la référence avec `force: false` et `expected_sha` égal au HEAD vérifié.
- Vérifier les exécutions GitHub Actions après chaque commit.
- Distinguer tests automatisés, tests locaux Workers, tests Android et validation de production.

## 8. Conclusion de l'audit

Le backend P27 possède déjà une logique métier et une simulation serveur importantes. La migration n'est pas un simple changement d'hébergeur : le principal chantier est le remplacement des stores JSON synchrones par des repositories persistants asynchrones, puis l'adaptation du cycle de vie des matchs à Durable Objects.

La trajectoire recommandée est une migration parallèle, incrémentale et testée, en gardant le serveur Node comme référence jusqu'à ce que la version Cloudflare soit démontrée équivalente. Aucun déploiement n'a été effectué pendant cet audit.
