FOOTBALL RP ONLINE — P16
=======================

BASE
- Source P15 réelle inspectée et extraite depuis l'archive P15 fournie dans cette conversation.
- Les systèmes précédents sont conservés : menus, contrôle individuel, matchs locaux 5v5 contre IA, clubs, calendrier local, profil, entraînement, carrière, contrats et mercato local.
- Durées de match conservées : 3 ou 5 minutes réelles maximum, en deux périodes.

P16 — STATISTIQUES INDIVIDUELLES ET CARRIÈRE
1. Suivi des actions du personnage contrôlé : buts attribués lorsque le personnage est le dernier toucher identifié, tirs, passes exécutées, tacles réussis et interceptions.
2. Transmission du bilan individuel dans le résultat final du match, en plus des statistiques collectives existantes.
3. Nouveau PlayerSeasonStats : agrégation locale persistante, historique des 100 derniers matchs, bilan victoires/nuls/défaites et clean sheets.
4. Note individuelle de match sur 10, calculée à partir des actions observées et du résultat collectif, bornée entre 1 et 10.
5. Écran Mon footballeur : affichage des statistiques de saison et des cinq derniers résultats.
6. Les compteurs du personnage sont réinitialisés au lancement du match suivant.

PRÉCISIONS DE FIABILITÉ
- Le contrôle reste strictement limité au footballeur du joueur humain.
- Les passes décisives ne sont pas encore attribuées : le système ne doit pas inventer un crédit individuel.
- Les actions IA ne sont pas ajoutées aux statistiques du personnage humain.
- Les statistiques et résultats sont locaux à l'appareil ; aucun serveur multijoueur n'est connecté.
- Les tests sont automatisés sous Node.js ; aucun test physique Android/WebGL n'a été réalisé dans cet environnement.

VALIDATION TECHNIQUE
- 77 tests automatisés réussis, 0 échec.
- node --check sur tous les modules JavaScript de src : réussi.
- Intégrité de l'archive ZIP vérifiée après empaquetage.
