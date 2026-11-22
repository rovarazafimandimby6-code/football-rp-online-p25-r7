FOOTBALL RP ONLINE — P9

BASE DE DÉVELOPPEMENT
- Évolution directe de football-rp-online-p8.2.1.zip.
- Conservation du moteur Three.js, de la caméra broadcast, des animations, du stade, des clubs, de la carrière et de la progression existants.

PRINCIPES RP
- Un joueur humain contrôle un seul footballeur et conserve cet avatar pendant tout le match.
- Une passe, une interception ou une remise en jeu ne transfère jamais le contrôle humain à un autre personnage.
- Les autres personnages sont pilotés par l'IA dans ce prototype local.
- Cette archive reste un prototype local : elle ne fournit pas encore de serveur multijoueur ni de synchronisation réseau.

AMÉLIORATIONS P9
- Noms de joueurs en texte simple, petit, sans fond ni encadrement ; affichage limité au joueur contrôlé et aux joueurs proches du ballon.
- Tableau de terrain / mini-carte à points repositionné au centre inférieur, avec opacité réduite.
- Score compact en haut, chronomètre conservé.
- Commandes simplifiées : A = tir / tacle contextuel ; B = passe courte ; C = lob ; joystick = déplacement. Sprint conservé comme commande secondaire.
- IA dotée de profils de spécialité : gardien réflexe, défenseur stoppeur/couverture, meneur de jeu, finisseur et coureur. Les profils modifient les décisions et le positionnement.
- Les systèmes de touche, corner et six mètres déjà présents dans la physique sont conservés.

CONTRAINTES CONSERVÉES
- Match 5 contre 5.
- Durée totale comprise entre 3 et 5 minutes, plafond absolu de 300 secondes.
- Format standard : deux périodes de 2 min 30.

TESTS
- npm test
- Ouvrir via HTTP/HTTPS dans un navigateur compatible WebGL 2, en mode paysage.
- Vérifier les contrôles tactiles, la visibilité du terrain, la mini-carte et la fluidité sur Android réel.
