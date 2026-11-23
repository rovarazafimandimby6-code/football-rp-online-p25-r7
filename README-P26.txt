FOOTBALL RP ONLINE — P26.0.0

P26 est la nouvelle version majeure, construite à partir de la base P25 R20.

NOUVEAUTÉS P26.0
- Nouvelle identité de version P26 dans le menu et les métadonnées de l’application.
- Nouvelle entrée « Résultats » dans le menu principal.
- Historique des matchs finalisés récupéré depuis GET /api/results.
- Pagination de l’historique via les métadonnées serveur (limit, offset, total, hasMore, nextOffset).
- Feuille de match détaillée par rencontre : statistiques collectives et individuelles (buts, passes décisives, tirs, passes, tacles, interceptions et arrêts).
- Affichage adapté aux petits écrans et tables statistiques défilantes horizontalement.
- Protection contre les réponses réseau obsolètes lors du changement de page.

SOCLE CONSERVÉ
- Simulation multijoueur autoritaire côté serveur.
- Chaque humain contrôle uniquement son propre avatar ; les autres joueurs restent pilotés par l’IA.
- Résultats finaux persistés côté serveur selon la configuration RESULTS_DIR.
- Joueurs, clubs et identités fictifs ; modèles humanoïdes masculins uniquement pour cette version.

DÉMARRAGE
- npm test
- npm start
- Ouvrir le serveur sur le port configuré (8080 par défaut).
- L’historique partagé nécessite le serveur multijoueur actif. Les matchs locaux hors ligne ne sont pas présentés comme des résultats serveur.

LIMITES CONNUES
- Aucune validation physique Android ni test multi-appareils réel effectué dans cet audit.
- La persistance après redéploiement dépend d’un volume persistant configuré avec RESULTS_DIR.
- Les salons et matchs en cours restent en mémoire.
- Les noms d’équipes des archives sont encore affichés comme Équipe bleue / Équipe rouge, car les résultats archivés ne contiennent pas encore de métadonnées de clubs.

Voir AUDIT-P26.txt pour les contrôles de cette livraison.
