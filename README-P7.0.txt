FOOTBALL RP ONLINE — P7.0

OBJECTIF
Prototype local de match 5 contre 5 en 3D, jouable au clavier ou sur écran tactile. P7 regroupe plusieurs lots d’amélioration du moteur de match, de l’IA, de la physique, de la caméra et de la stabilité mobile.

LOTS P7 INTÉGRÉS
1. Gameplay et physique : conduite de balle avec touches moins rigides, amorti à la réception, contrôle du ballon ajusté selon l’approche et collisions joueurs mieux amorties.
2. IA et endurance : gestion de l’endurance des joueurs IA, vitesse modulée selon la fatigue, temporisation des décisions offensives pour réduire les changements de décision à chaque frame.
3. Caméra et rendu : cadrage broadcast 2.5D plus ample, limites de cadrage, réglage du pixel ratio adapté aux appareils modestes et gestion de perte/restauration du contexte WebGL.
4. Commandes mobiles : neutralisation des répétitions clavier involontaires et annulation des actions maintenues en cas de perte de focus.
5. Match officiel : changement de côté à la mi-temps, directions d’attaque, placements des gardiens, passes et tirs recalculés en fonction du côté de chaque équipe.
6. Interface et performances : actualisation des statistiques quand le panneau est ouvert et rafraîchissement moins fréquent des étiquettes/minicarte.

RÈGLES CONSERVÉES
- 5 joueurs par équipe sur le terrain.
- Deux périodes de 2 min 30, soit 5 minutes maximum.
- Pas de prolongation ni de match de plus de 5 minutes.
- Version locale contre IA : aucun multijoueur réseau ni système de comptes/clubs persistants n’est inclus.

LANCEMENT
- Servir ce dossier via HTTP/HTTPS (ne pas ouvrir index.html en file://).
- Ouvrir index.html dans un navigateur récent compatible WebGL 2.
- Three.js 0.170.0 est chargé depuis jsDelivr : une connexion Internet est requise au démarrage.
- Sur téléphone, utiliser le mode paysage.

CONTRÔLES
- Clavier : WASD/flèches pour bouger, E pour passer, Maj+E pour passe lobée, Espace pour tirer, Q pour tacler, Tab/C pour changer de joueur, Maj pour sprinter.
- Tactile : joystick, sprint, tacle, passe (appui long = lob), tir (appui long = puissance), changement de joueur.

VALIDATION EFFECTUÉE
- Contrôle syntaxique Node.js de tous les modules JavaScript.
- Vérification des chemins d’importation relatifs.
- Test unitaire du chronomètre et des changements de période.
- Vérification statique de la présence des 10 joueurs et de la durée maximale de 300 secondes.

LIMITES CONNUES
Le rendu et les sensations de jeu doivent encore être validés sur de vrais appareils Android. Les modèles sont des personnages procéduraux, pas encore des modèles de capture de mouvement. L’arbitrage avancé, le hors-jeu, les fautes détaillées, les compétitions, le mercato, les comptes et le multijoueur réseau restent à développer.
