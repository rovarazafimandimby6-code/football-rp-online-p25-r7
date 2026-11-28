# P27 — Lot 3 : raccordement officiel et limites de récupération

## État constaté après les lots 1 et 2

Les lots précédents ajoutent les fondations D1 suivantes :
- `0007_player_season_stats.sql` et `D1PlayerSeasonStatsRepository` : événements de match par saison, agrégats déclenchés par insertion, unicité par joueur/saison/match et historique paginé.
- `0008_player_contracts.sql` et `D1PlayerContractRepository` : état courant, journal immuable, révision compare-and-swap et historique paginé.

Ces repositories ne sont pas encore raccordés à une route publique ou à un endpoint d'écriture client. Cette séparation est intentionnelle : ils sont des composants internes d'autorité.

## Audit du point de finalisation des matchs

`RoomManager.finalizeResult()` est le point serveur qui calcule le résultat final. Il enregistre actuellement le résultat de compétition, les lignes de carrière via `careerStore.recordFinalizedMatch()`, les récompenses via `progressionStore.grantMatchReward()`, puis l'archive du résultat.

La reprise `fulltime` et le checkpoint durable protègent cette séquence contre les pannes. Il n'existe cependant pas encore de dépendance `seasonStatsStore` dans le constructeur de `RoomManager`. Le repository D1 saisonnier ne doit donc pas être appelé artificiellement depuis le gestionnaire Node synchrone.

## Identifiant de saison : prérequis bloquant

L'audit de `ClubManager` ne révèle pas de propriété canonique `seasonId` ou `activeSeason` dans ce module. Le validateur de chronologie des archives existe, mais il ne constitue pas à lui seul une autorité runtime pour attribuer un match à une saison.

Avant d'activer l'ingestion saisonnière, le système doit exposer une source serveur unique qui retourne l'identifiant de saison actif et sa période. Aucun identifiant ne doit être déduit côté client, de la date locale du téléphone ou d'une valeur par défaut.

## Contrats : source actuelle et raccordement restant

Les contrats humains sont actuellement gérés par `JsonTransferStore` : état courant, portefeuille, signature, transfert, renouvellement, résiliation, prêts, historique et outbox durable de synchronisation vers les effectifs.

`processPendingRosterSync()` applique les changements au `ClubManager` et acquitte l'outbox après persistance de l'effectif. Ce flux est serveur local et ne constitue pas encore une copie cloud D1 du contrat.

Le nouveau repository D1 des contrats n'est pas branché à cette outbox. La prochaine intégration doit envoyer les événements signés par le serveur, avec un identifiant stable, le joueur authentifié et la révision attendue. Une répétition doit être idempotente ; une révision périmée doit être rejetée. Les clients ne doivent jamais pouvoir poster un état contractuel complet.

## Ordre de raccordement restant

1. Définir et persister le calendrier et l'identifiant de saison canonique côté serveur.
2. Ajouter un adaptateur fiable depuis les résultats finalisés vers le ledger D1 saisonnier.
3. Étendre l'outbox contractuelle humaine pour transmettre les événements à une route interne authentifiée, puis acquitter uniquement après confirmation D1.
4. Ajouter les routes de lecture authentifiées des saisons et contrats, avec pagination.
5. Composer la récupération de compte seulement lorsque profil, progression, carrière complète, saisons et contrats ont tous une source cloud autoritaire.
6. Tester les pannes entre écriture D1, réponse réseau et acquittement local.

## Critères de sécurité

- Pas de route client d'écriture directe sur les tables saisonnières ou contractuelles.
- Pas de remplacement de snapshot de progression ou de contrat.
- Pas de mélange des statistiques de carrière et de saison.
- Pas de double comptabilisation après rejeu d'un match ou d'un événement contractuel.
- Pas de récupération déclarée complète si un domaine est local uniquement ou si l'historique paginé n'est pas épuisé.

## Validation

Les tests unitaires des repositories saisonniers et contractuels sont ajoutés dans :
- `tests/cloudflare-player-season-stats-repository.test.mjs`
- `tests/cloudflare-player-contract-repository.test.mjs`

Ils couvrent l'idempotence, les identités, les révisions, les agrégats et la pagination. Ils n'ont pas été exécutés dans cette session et aucun workflow CI associé n'a encore été observé. Aucun APK n'a été produit.
