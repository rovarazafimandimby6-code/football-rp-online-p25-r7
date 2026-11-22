FOOTBALL RP ONLINE — P8.2
REFONTE HUD & ERGONOMIE MOBILE

BASE
- Dérivé de P8.1 R1 corrigé.
- Les modules de match, physique, ballon, joueurs, IA, progression, clubs et carrière sont conservés.

AMÉLIORATIONS P8.2 LIVRÉES
1. Hiérarchie du tableau de score retravaillée : équipes, score et période/chronomètre plus compacts.
2. Réglages tactiques repliés par défaut et accessibles via un bouton dédié, pour libérer le terrain.
3. Notifications de match présentées comme des messages temporaires discrets.
4. Étiquettes des joueurs limitées au joueur contrôlé et aux joueurs proches du ballon afin de réduire les chevauchements.
5. Commandes tactiles redimensionnées et réorganisées pour réduire leur emprise visuelle.
6. Joystick et jauge d'endurance ajustés pour préserver la visibilité de la pelouse.
7. Mini-carte et badge FPS rendus plus discrets.
8. Panneau de statistiques contraint à la hauteur disponible sur mobile.
9. Adaptations CSS spécifiques aux petits écrans en paysage.

RÈGLES DE MATCH CONSERVÉES
- Football 5 contre 5.
- Deux périodes de 2 min 30 au format standard.
- Durée totale comprise entre 3 et 5 minutes, plafond absolu de 300 secondes.

VALIDATION EFFECTUÉE
- Tests automatisés Node.js : 28 réussis, 0 échec.
- Contrôle syntaxique JavaScript et vérification des références DOM effectués lors de la préparation de l'archive.

LIMITES ET TESTS RESTANTS
- Le rendu WebGL n'a pas été exécuté dans un vrai navigateur pendant cette livraison.
- Les tests tactiles, la lisibilité et les performances doivent être vérifiés sur le téléphone Android cible.
- Les améliorations de caméra avancée, d'animations de contact, de gardien, de ballon et de tribunes constituent un lot 3D séparé : elles ne sont pas déclarées terminées dans cette version.
- Aucun multijoueur en ligne ni backend n'est ajouté.

LANCEMENT
Servir le dossier via HTTP/HTTPS, ouvrir dans un navigateur compatible WebGL 2 et jouer en mode paysage.
Exécuter les tests avec : npm test
