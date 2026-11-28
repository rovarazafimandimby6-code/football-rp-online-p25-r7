# Football RP Online — continuité P26

## Référence de développement
- Version actuelle : **P26.0.0**.
- Base : P25 R20.
- Archive de livraison : `Football-RP-Online-P26.zip`.
- Package version : `26.0.0`.

## Changements P26.0
- Nouvelle entrée Résultats dans le menu principal.
- Historique des résultats finaux serveur, pagination par lot de 10.
- Feuille de match détaillée avec statistiques collectives et individuelles.
- Interface responsive et gestion des erreurs réseau.
- Invalidation des requêtes d’historique obsolètes lorsque l’utilisateur change de page.

## Socle et décisions à préserver
- Un humain contrôle exclusivement son propre avatar.
- L’IA pilote tous les autres joueurs, y compris les gardiens.
- Pas de commande d’équipe globale ni de changement automatique d’avatar humain.
- Clubs et joueurs fictifs et originaux ; aucune identité protégée sans licence.
- Modèles humanoïdes masculins uniquement pour le moment.
- Priorité aux appareils Android modestes et aux ressources gratuites.

## Vérifications P26.0
- 220 tests réussis.
- 71 fichiers JavaScript/MJS syntaxiquement valides.
- Archive ZIP contrôlée.
- Aucun test Android physique ni test multi-appareils réel effectué.

## Limites techniques à traiter ensuite
- Ajouter les noms des clubs aux résultats archivés pour remplacer les libellés Bleue/Rouge.
- Ajouter des filtres globaux et une recherche sur l’historique.
- Durcir la persistance multi-instance avec une base transactionnelle si plusieurs instances serveur sont déployées.
- Persister les salons et matchs en cours si la continuité après redémarrage devient nécessaire.
- Réaliser des essais Android et réseau réel.

## Règle de livraison
Repartir de la dernière archive vérifiée P26, regrouper les évolutions en une seule version majeure, exécuter toute la suite de tests, contrôler le ZIP et son SHA-256, puis archiver le ZIP dans `/Football RP Online/Versions finales/` dès que la limite de chargement de la Bibliothèque est levée.
