FOOTBALL RP ONLINE — P9.1
Correctifs issus du retour de test P9

BASE
- Continuité directe de P9, elle-même construite depuis P8.2.1.
- Les systèmes de carrière, clubs, calendrier, progression, météo, terrain et match sont conservés.

CORRECTIFS
- Bouton B : passe lorsque le personnage contrôlé possède le ballon ; pression vers le porteur adverse (ou l'adversaire le plus proche du ballon si celui-ci est libre) lorsqu'il défend.
- La pression n'effectue pas de changement de joueur et ne commande jamais un coéquipier humain. À reste le tir en possession et le tacle en défense.
- Libellé B clarifié : « PASSE / PRESSION ».
- Noms des joueurs : taille réduite, graisse normale, aucun fond/cadre/badge, casse non forcée. Les noms de démonstration des effectifs IA sont présentés en casse naturelle.
- Caméra de retransmission légèrement plus immersive, champ de vision élargi et cadrage ajusté.
- Limitation du pixel ratio en qualité moyenne pour limiter la charge GPU sur les appareils modestes.

LIMITES À CONNAÎTRE
- Le jeu reste un prototype 3D WebGL/Three.js avec personnages procéduraux. Cette version améliore la présentation et le cadrage 3D, mais n'intègre pas encore de modèles de joueurs réalistes (GLB/GLTF), de motion capture ou de véritable backend multijoueur.
- Les noms présents dans les effectifs de démonstration sont des identités fictives de test. L'affichage d'identités de comptes humains nécessite le futur système de profils/réseau.
- Le rendu et le comportement tactile doivent encore être validés sur un téléphone Android réel.
