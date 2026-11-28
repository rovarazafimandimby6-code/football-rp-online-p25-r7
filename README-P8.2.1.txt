FOOTBALL RP ONLINE — P8.2.1
LOT 3D : CAMÉRA BROADCAST, ANIMATIONS ET STADE

BASE
- Continuité directe de P8.2, lui-même dérivé de P8.1 R1 corrigé.
- Le HUD, les contrôles, les systèmes de match, la physique, l'IA, les clubs, la carrière et la progression sont conservés.

AMÉLIORATIONS P8.2.1
1. Caméra broadcast retravaillée : suivi amorti du ballon, légère anticipation du déplacement et pondération du joueur actif.
2. Cadrage adaptatif aux écrans étroits : recul supplémentaire pour préserver la lecture du terrain en paysage sur mobile.
3. Zoom contextuel modéré à proximité des zones de but.
4. Rotation des joueurs amortie pour réduire les changements de direction instantanés.
5. Inclinaison corporelle légère selon la vitesse et le déplacement latéral.
6. Ajustements d'animation sur les courses, frappes et tacles sans ajout de géométrie coûteuse.
7. Densité de spectateurs augmentée et présence renforcée dans les tribunes latérales.
8. Ajout de bandeaux architecturaux sur les tribunes pour améliorer la silhouette du stade.

OPTIMISATION
- Les spectateurs restent regroupés dans un InstancedMesh pour limiter les draw calls.
- Les animations réutilisent les modèles articulés existants.
- Aucun asset 3D externe ni texture lourde ajouté.

CONTRAINTES CONSERVÉES
- Match 5 contre 5.
- Durée totale comprise entre 3 et 5 minutes, plafond absolu de 300 secondes.
- Format standard : deux périodes de 2 min 30.

VALIDATION LOCALE
- 28 tests automatisés Node.js réussis.
- Syntaxe contrôlée pour les modules JavaScript du projet.
- Vérification statique des références DOM et de l'archive.

À TESTER SUR APPAREIL
- Le rendu WebGL doit être vérifié dans un navigateur Android réel.
- La fluidité, le cadrage, les commandes tactiles et la lisibilité doivent être confirmés sur le téléphone cible.
- Les animations de contact avancées, les collisions physiques de membres, les gestes spécifiques du gardien et les célébrations plus riches restent des améliorations ultérieures.

LANCEMENT
- Décompresser l'archive.
- Servir le dossier par HTTP/HTTPS.
- Ouvrir dans un navigateur compatible WebGL 2 en mode paysage.
- Exécuter les tests avec : npm test

Cette version reste un prototype local. Elle n'ajoute pas de multijoueur en ligne ni de backend.
