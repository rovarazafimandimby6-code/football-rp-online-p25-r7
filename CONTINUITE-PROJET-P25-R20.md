# Football RP Online P25 — Continuité du projet

## Version de référence
- Version livrée : **P25 R20 (25.20.0)**.
- Archive source : P25 R19, SHA-256 `8c13207890cb25db14ed2c4f126d1343f3eceb7269d39ed7a0993c5b9c6ec38c`.
- Archive R20 : `Football-RP-Online-P25-R20.zip`.
- SHA-256 R20 : `36eda187bfc2e72e61312441349d69d75c9fa790f1c97c4a2d70effa0158fa75`.

## État fonctionnel conservé
- Match multijoueur autoritaire côté serveur.
- Chaque humain contrôle uniquement son propre avatar ; les bots restent pilotés par l'IA serveur.
- Les résultats de match finalisés sont archivés localement au format JSON.
- Les statistiques de match comprennent passes, tirs, tacles, buts, passes décisives, arrêts et interceptions.
- La conservation après redéploiement dépend toujours d'un volume persistant et de `RESULTS_DIR`.

## Changements R20
- Validation renforcée des identifiants, scores et horodatages avant archivage.
- Fichiers temporaires uniques pour les écritures atomiques.
- Pagination serveur de l'historique via `GET /api/results?limit=20&offset=0`.
- Métadonnées de pagination : `limit`, `offset`, `total`, `hasMore`, `nextOffset`.
- Paramètres invalides rejetés avec `400 INVALID_PAGINATION`.
- Méthode `RoomManager.pageResults()` ajoutée sans retirer les méthodes historiques.

## Vérifications effectuées
- `npm test` : **217/217** réussis.
- `node --check` : **70 fichiers JS/MJS** validés.
- `unzip -t` : archive valide.
- Tests exécutés une seconde fois après extraction du ZIP final.

## Limites à ne pas masquer
- Aucun test Android physique ou multijoueur entre appareils n'a été exécuté.
- Aucun test réel sur Render, aucun test multi-instance et aucune mesure FPS WebGL n'ont été exécutés.
- Le JSON local n'offre pas de transaction multi-processus ; plusieurs instances écrivant dans le même dossier peuvent encore perdre une mise à jour.
- Les salons et matchs en cours restent en mémoire ; seuls les résultats finalisés sont persistés.

## Prochaine étape recommandée
Étendre l'historique à une vraie interface de consultation côté client (liste paginée, fiche détaillée d'un match, statistiques par joueur et par équipe), puis prévoir une stratégie de stockage transactionnelle si le serveur doit fonctionner sur plusieurs instances.

## Règle de livraison
Toujours repartir de la dernière archive vérifiée, exécuter les tests, contrôler le ZIP final, noter son SHA-256 et ne déclarer l'archivage Bibliothèque qu'après confirmation effective de son dépôt.
