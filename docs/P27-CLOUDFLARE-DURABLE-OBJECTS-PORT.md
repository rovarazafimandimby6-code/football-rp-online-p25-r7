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

Le runtime actuel vise 20 pas de simulation par seconde, alors que le client fait des polls d'état à 12,5 Hz. Un simple `alarm()` à 1 Hz ne remplace pas le tick de 50 ms. Le portage doit donc utiliser un accumulateur temporel et des sous-pas déterministes, puis pousser/servir des snapshots cohérents. Le chemin HTTP peut être conservé pour une première intégration, mais il faut mesurer la dérive de simulation et le coût des lectures. Une évolution WebSocket pourra réduire le polling, mais ne doit pas être introduite sans adapter et tester le client Android.

## Séquence de réalisation

### Étape A — extraction testable
- Extraire la logique pure de simulation et les validateurs du runtime Node.
- Définir un format de checkpoint versionné et des fonctions de sérialisation/désérialisation testées.
- Ajouter un générateur d'identifiant injectable afin que le nom du Durable Object et l'identifiant de salon soient identiques.

### Étape B — Durable Object isolé
- Ajouter la classe de salon, son binding Wrangler et le routage Worker.
- Couvrir création, entrée, authentification, commande, état/delta, heartbeat, reconnexion, abandon et rotation.
- Tester les courses entre commandes, la reprise, l'expiration et l'absence de fuite de secrets.

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
