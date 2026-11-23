FOOTBALL RP ONLINE — P25 R19
Version : 25.19.0

Cette version ajoute l'archivage atomique des résultats de match finalisés dans un fichier JSON local, la relecture d'un résultat par identifiant après reconstruction du gestionnaire, et une route d'historique public limitée : GET /api/results?limit=20.

Configuration :
- RESULTS_DIR permet de choisir le dossier de stockage des résultats.
- À défaut, le serveur utilise data/results à la racine du projet.
- Le dossier doit être inscriptible par le processus Node.
- Pour conserver les résultats après redéploiement, RESULTS_DIR doit pointer vers un volume persistant fourni par l'hébergeur. Le disque éphémère d'un hébergement gratuit ne garantit pas cette conservation.
- Seuls les bilans terminés sont archivés ; les jetons d'accès, secrets et sessions ne sont jamais stockés.
- Le fichier est limité aux 500 derniers matchs par défaut ; la route publique retourne au maximum 100 résultats.

Contrôles locaux :
- npm test : 215 tests réussis.
- node --check : tous les fichiers JavaScript/MJS vérifiés.
- unzip -t : intégrité de l'archive vérifiée après création.

Démarrage : npm start
Tests : npm test

Le serveur reste autoritaire : chaque jeton humain contrôle uniquement son propre avatar ; les autres joueurs sont pilotés par l'IA serveur.

Limites : aucune recette réelle sur Render/Android ni mesure FPS WebGL n'a été effectuée. La persistance après redéploiement dépend impérativement d'un volume persistant configuré sur l'hébergement.
