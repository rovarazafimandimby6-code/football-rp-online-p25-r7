# P27 — Portage des salons de match vers Cloudflare Durable Objects

## Décision d'architecture

Un salon de match doit être détenu par un Durable Object unique, adressé par un identifiant de salon de 12 caractères hexadécimaux. Le Worker reste la porte d'entrée HTTP et vérifie les sessions de compte avant les opérations qui exigent une identité. D1 conserve les identités et données de carrière ; le Durable Object détient l'état autoritaire à court terme du match.

Le portage ne doit pas instancier un `RoomManager` global dans le Worker : les instances Worker ne constituent pas un stockage partagé et peuvent être arrêtées à tout moment. Il ne faut pas non plus exposer directement les méthodes du gestionnaire sans conserver les règles d'authentification, les validations de séquence et les protections des jetons.

## Constat du runtime existant

- `server/index.js` lance `manager.tick(0.05)` toutes les 50 ms.
- Le client `OnlineMatchBridge` envoie les commandes toutes les 50 ms et interroge l'état toutes les 80 ms.
- `RoomManager` est synchrone et conserve tous les salons dans une `Map` locale.
- Les checkpoints retirent le jeton brut et conservent son SHA-256 ; la reprise transforme les joueurs humains restaurés en joueurs contrôlés par le système jusqu'à reconnexion.
- La finalisation actuelle écrit synchroniquement dans plusieurs services locaux : résultat, carrière, progression et compétition. Ces écritures ne peuvent pas être simplement remplacées par des appels D1 asynchrones sans concevoir un protocole transactionnel et idempotent.

## Contrat HTTP à préserver

| Route | Opération | Contrôle requis |
|---|---|---|
| `GET /api/rooms` | Liste des salons actifs | État public seulement |
| `POST /api/rooms` | Créer un salon | Validation du nom, durée et clubs |
| `POST /api/rooms/:id/join` | Entrer dans un salon | Session si le match l'exige ; jeton de joueur privé |
| `POST /api/rooms/:id/input` | Commander son avatar | Jeton de joueur, séquence strictement croissante |
| `POST /api/rooms/:id/heartbeat` | Maintenir la session de match | Jeton de joueur |
| `POST /api/rooms/:id/reconnect` | Reprendre le contrôle humain | Jeton de joueur |
| `POST /api/rooms/:id/leave` | Abandonner la connexion | Jeton de joueur ; contrôle système ensuite |
| `POST /api/rooms/:id/rotation` | Remplacement | Jeton, consentement et fenêtre de jeu autorisée |
| `POST /api/rooms/:id/entry-request` | Demander à entrer depuis le banc | Jeton et règles de rotation |
| `GET /api/rooms/:id` | État complet ou delta | Ne jamais exposer jeton, compte, entrée privée ou séquence privée |
| `GET /api/rooms/:id/result` | Résultat final | Résultat finalisé uniquement |

Les erreurs métier et codes HTTP du serveur Node doivent rester compatibles avec le client mobile. Les réponses d'état et de jetons doivent rester `no-store`.

## Exigences du Durable Object

1. Un objet par salon ; aucun état de match partagé en mémoire entre objets.
2. Stocker un checkpoint versionné dans le stockage durable de l'objet après les mutations importantes et à intervalle contrôlé.
3. Conserver uniquement le hash des jetons de reconnexion dans le checkpoint.
4. Sérialiser les mutations par salon afin que deux commandes simultanées ne puissent pas écraser une séquence plus récente.
5. Utiliser une horloge serveur monotone/logique pour le temps de match, la mi-temps, les délais de déconnexion et les cooldowns.
6. Définir la reprise d'un match après éviction ou redémarrage, y compris les salons en mi-temps et les résultats en attente.
7. Prévoir un registre de salons pour l'énumération et le matchmaking ; ne pas parcourir les identifiants de Durable Objects.
8. Ajouter des limites de débit et une validation stricte de toutes les entrées.
9. Finaliser le résultat par une outbox persistante avec identifiant d'événement stable ; D1 doit accepter les répétitions sans doubler carrière, progression ou statistiques.
10. Ne jamais annoncer un résultat comme finalisé tant que les écritures obligatoires ne sont pas confirmées.

## Cadence de simulation et réseau

Le runtime actuel vise 20 pas de simulation par seconde, le client envoie les commandes à 20 Hz et interroge l'état à 12,5 Hz. Un simple `alarm()` à 1 Hz ne remplace donc pas le tick de 50 ms.

**Décision de transport : WebSocket hibernable pour les matchs actifs, HTTP conservé pour la création/liste et les opérations hors temps réel.** Le client Android devra recevoir une adaptation explicite : connexion WebSocket, authentification initiale, messages d'entrée séquencés, snapshots/deltas et reprise après reconnexion. Les commandes doivent être regroupées par fenêtres de 50 à 100 ms pour limiter le coût des changements de contexte ; les snapshots ne doivent pas être diffusés à chaque pas de simulation si aucun état visible n'a changé.

Un Durable Object peut maintenir une boucle de simulation à 50 ms tant que le match est actif, puis arrêter ses timers quand le match se termine et laisser les connexions WebSocket hibernables au repos. Attention : `setTimeout`/`setInterval` empêchent l'hibernation tant qu'ils sont planifiés ; ils entraînent donc une durée facturée et doivent exister uniquement pendant un match en cours. L'état doit être checkpointé dans le stockage durable avant toute période où l'objet peut être évincé. Les messages entrants réveillent ensuite l'objet sans fermer les WebSockets hibernables.

Le tick doit utiliser un accumulateur basé sur le temps écoulé, plafonner le rattrapage après une pause d'exécution et exécuter des sous-pas déterministes de 50 ms. Il faut mesurer la dérive, le temps CPU et les coûts sur des matchs de 3 à 5 minutes, avec plusieurs salons simultanés. Le mode HTTP polling actuel ne doit pas être présenté comme du temps réel fiable sur Cloudflare sans ces mesures.

## État d'implémentation au 28 novembre 2026

- La classe `P27MatchRoomDurableObject` est ajoutée et utilise le `RoomManager` existant comme moteur autoritaire d'un salon.
- Le binding Wrangler `P27_MATCH_ROOMS` et la migration de classe SQLite sont déclarés ; le Worker exporte la classe.
- Le Worker route les routes HTTP de salons vers l'objet : création, liste D1, entrée invitée, commandes, heartbeat, reconnexion, abandon, rotation, état/delta et résultat.
- Le checkpoint du salon est écrit dans le stockage du Durable Object ; les jetons bruts sont retirés par le sérialiseur existant et leur hash est conservé. Les résultats en attente sont réessayés après reprise.
- Le registre D1 autorise jusqu'à 7 humains par équipe (14 au total) et l'archive de résultat est idempotente.
- La simulation active tourne par timer de 50 ms ; une alarme sert de mécanisme de reprise. Le point d'accès WebSocket n'est pas encore implémenté : le client reste sur HTTP polling.
- Les matchs liés à un compte sont désormais acceptés : un outbox persistant conserve les événements carrière/récompenses, puis les dépôts D1 idempotents sont exécutés avant l'archive finale du résultat. Les répétitions après panne ne doivent pas doubler les matchs ni les récompenses. Les matchs compétition/RP ne sont pas activés.
- Les tests CI doivent encore valider l'ensemble de cette tranche. Aucun déploiement Worker, aucune application distante de 0013 et aucun basculement de production n'ont été effectués.

## Séquence de réalisation

### Étape A — extraction testable
- Extraire la logique pure de simulation et les validateurs du runtime Node.
- Définir un format de checkpoint versionné et des fonctions de sérialisation/désérialisation testées.
- Ajouter un générateur d'identifiant injectable afin que le nom du Durable Object et l'identifiant de salon soient identiques.

### Étape B — Durable Object isolé
- [x] Ajouter la classe de salon, son binding Wrangler et le routage HTTP Worker.
- [x] Couvrir la création, l'entrée invitée, l'authentification par jeton de match, les commandes, l'état/delta, heartbeat, reconnexion, abandon et rotation.
- [x] Ajouter le WebSocket hibernable côté Durable Object et le relais Worker.
- [ ] Finaliser l'intégration du transport WebSocket dans le bridge de match et les tests multi-clients.
- [ ] Tester les courses concurrentes, l'expiration et la reprise après éviction sur l'émulateur Durable Objects.

### Étape C — résultats et monde
- Ajouter une outbox persistante de finalisation.
- Implémenter l'ingestion idempotente des résultats dans D1 pour carrière et progression.
- Définir les intégrations compétition et défis RP avant d'activer ces types de match.
- Ajouter un registre de salons et le matchmaking.

### Étape D — validation et activation
- Tests unitaires, tests d'intégration sur émulateur Durable Objects et tests multi-clients.
- Comparaison des mêmes scénarios entre RoomManager Node et Durable Object.
- Tests de charge, de dérive temporelle, de coupure réseau et de reprise.
- Déploiement progressif uniquement après validation et approbation explicite ; aucun basculement automatique de la production.

## Critères bloquants avant activation

- Parité des routes et des codes d'erreur.
- Simulation stable à la cadence cible.
- Jetons et données privées absents des réponses publiques et checkpoints en clair.
- Résultats, carrière et progression idempotents et récupérables.
- Aucun salon actif perdu lors d'une éviction/redémarrage.
- Aucun changement de l'URL utilisée par l'APK avant que le Worker déployé soit prêt.
